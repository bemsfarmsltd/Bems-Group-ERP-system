import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { isSupabaseStorageConfigured, resolveSupabaseRedirectUrl } from '@/lib/supabase-storage';

export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

// In-memory LRU cache to prevent concurrent PgBouncer connection spikes when rendering staff lists
type CachedFile = {
  data: Buffer;
  mimeType: string;
  cachedAt: number;
};

const fileMemoryCache = new Map<string, CachedFile>();
const MAX_CACHE_ITEMS = 120;

type FileAccessMeta = {
  isPublicBrandAsset: boolean;
  ownerIds: string[];
  expiresAt: number;
};
const fileMetaCache = new Map<string, FileAccessMeta>();
const missingFileCache = new Map<string, number>();

function getFromMemoryCache(filename: string): CachedFile | null {
  const item = fileMemoryCache.get(filename);
  if (!item) return null;
  return item;
}

function setInMemoryCache(filename: string, data: Buffer, mimeType: string) {
  if (fileMemoryCache.size >= MAX_CACHE_ITEMS) {
    const oldestKey = fileMemoryCache.keys().next().value;
    if (oldestKey) fileMemoryCache.delete(oldestKey);
  }
  fileMemoryCache.set(filename, { data, mimeType, cachedAt: Date.now() });
}

async function findStoredFileWithRetry(filename: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await prisma.storedFile.findUnique({
        where: { filename },
      });
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 150 * attempt));
    }
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse('Not Found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }

    // Sanitize path segments to prevent directory traversal
    const safeSegments = pathSegments.map((s) => path.basename(s));
    const filename = safeSegments[safeSegments.length - 1];
    const ext = path.extname(filename).toLowerCase();
    const defaultContentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isAvatarPath = safeSegments[0] === 'avatars';

    const missingUntil = missingFileCache.get(filename);
    if (missingUntil && missingUntil > Date.now()) {
      return new NextResponse('File Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'private, max-age=60' },
      });
    }

    if (isAvatarPath && isSupabaseStorageConfigured()) {
      const redirectUrl = await resolveSupabaseRedirectUrl(safeSegments.join('/'));
      if (redirectUrl) {
        return NextResponse.redirect(redirectUrl, {
          status: 302,
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
      }
    }

    let meta = fileMetaCache.get(filename);
    if (!meta || meta.expiresAt <= Date.now()) {
      const [attachment, brand, settingBrand, avatarOwner] = await Promise.all([
        prisma.attachment.findFirst({
          where: {
            OR: [
              { fileUrl: { endsWith: '/' + filename } },
              { fileUrl: { endsWith: filename } },
              { fileName: filename },
            ],
          },
          include: { request: { select: { requestedById: true, disbursementAssigneeId: true } } },
        }),
        prisma.organization.findFirst({ where: { logoUrl: { endsWith: '/' + filename } }, select: { id: true } }),
        prisma.workspaceSetting.findFirst({
          where: {
            key: { in: ['BRAND_LOGO_URL', 'HR_MGMT_SIGNATURE_URL'] },
            value: { contains: filename },
          },
          select: { id: true },
        }),
        prisma.employee.findFirst({
          where: { avatarUrl: { endsWith: '/' + filename } },
          select: { id: true },
        }),
      ]);
      const ownerIds = [
        attachment?.uploadedById,
        attachment?.ownerId,
        attachment?.request?.requestedById,
        attachment?.request?.disbursementAssigneeId,
        avatarOwner?.id,
      ].filter((id): id is string => Boolean(id));
      meta = {
        isPublicBrandAsset: Boolean(brand || settingBrand || attachment?.ownerType === 'PUBLIC_AVATAR'),
        ownerIds,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      if (fileMetaCache.size > 300) fileMetaCache.clear();
      fileMetaCache.set(filename, meta);
    }

    const isPublicBrandAsset = meta.isPublicBrandAsset;
    if (!isPublicBrandAsset) {
      const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true });
      if (!actor) return new NextResponse('Authentication required.', { status: 401 });
      const isAuthorizedViewer =
        hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN', 'CUSTOM_ADMIN']) ||
        isAvatarPath;
      const ownsAttachment = meta.ownerIds.includes(actor.id);
      if (!isAuthorizedViewer && !ownsAttachment) {
        const ownsProfile = await prisma.employee.findFirst({
          where: { id: actor.id, avatarUrl: { endsWith: '/' + filename } },
          select: { id: true },
        });
        if (!ownsProfile) return new NextResponse('File not found.', { status: 404 });
      }
    }

    const cacheControlHeader = isPublicBrandAsset
      ? 'public, max-age=86400'
      : isAvatarPath
      ? 'private, max-age=86400'
      : 'private, no-store, no-cache, must-revalidate';

    // 0. Check fast in-memory cache first (<1ms, zero DB load)
    const memCached = getFromMemoryCache(filename);
    if (memCached) {
      return new NextResponse(new Uint8Array(memCached.data), {
        headers: {
          'Content-Type': memCached.mimeType || defaultContentType,
          'Cache-Control': cacheControlHeader,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // 1. Primary storage check: Durable Supabase PostgreSQL database (StoredFile -> Attachment.fileData fallback)
    try {
      const dbFile = await findStoredFileWithRetry(filename, 3);
      if (dbFile && dbFile.data) {
        const buf = Buffer.from(dbFile.data);
        const resolvedMime = dbFile.mimeType || defaultContentType;
        setInMemoryCache(filename, buf, resolvedMime);

        return new NextResponse(new Uint8Array(buf), {
          headers: {
            'Content-Type': resolvedMime,
            'Cache-Control': cacheControlHeader,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      const attachFallback = await prisma.attachment.findFirst({
        where: {
          OR: [
            { fileUrl: { endsWith: '/' + filename } },
            { fileUrl: { endsWith: filename } },
            { fileName: filename },
          ],
        },
        select: { fileData: true, contentType: true },
      });
      if (attachFallback?.fileData) {
        const buf = Buffer.from(attachFallback.fileData);
        const resolvedMime = attachFallback.contentType || defaultContentType;
        setInMemoryCache(filename, buf, resolvedMime);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            'Content-Type': resolvedMime,
            'Cache-Control': cacheControlHeader,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    } catch (dbErr) {
      console.warn('[Uploads Serve] Database lookup failed after retries, falling back to disk:', dbErr);
    }

    // 2. Secondary fallback: Local filesystem cache
    const filePath = path.join(process.cwd(), 'public', 'uploads', ...safeSegments);
    try {
      const fileBuffer = await fs.readFile(filePath);
      setInMemoryCache(filename, fileBuffer, defaultContentType);
      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          'Content-Type': defaultContentType,
          'Cache-Control': cacheControlHeader,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      missingFileCache.set(filename, Date.now() + 60_000);
      return new NextResponse('File Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'private, max-age=60',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
  } catch (error) {
    return new NextResponse('Error loading file', {
      status: 500,
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}
