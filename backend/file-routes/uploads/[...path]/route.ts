import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { isSupabaseStorageConfigured, resolveSupabaseRedirectUrl } from '@/lib/supabase-storage';
import { getDistributedCache, setDistributedCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

type CachedFile = {
  data: Buffer;
  mimeType: string;
  etag: string;
  cachedAt: number;
};

const fileMemoryCache = new Map<string, CachedFile>();
const MAX_CACHE_ITEMS = 200;

type FileAccessMeta = {
  isPublicBrandAsset: boolean;
  ownerIds: string[];
};

const DISK_CACHE_DIR = path.join(process.cwd(), 'uploads', '.cache');
let diskCacheDirReady = false;

function computeEtag(buf: Buffer): string {
  return `W/"${createHash('sha1').update(buf).digest('hex').slice(0, 16)}"`;
}

function diskKeyForFilename(filename: string): string {
  return createHash('sha256').update(filename).digest('hex');
}

function getFromMemoryCache(filename: string): CachedFile | null {
  const item = fileMemoryCache.get(filename);
  if (!item) return null;
  // Refresh LRU recency
  fileMemoryCache.delete(filename);
  fileMemoryCache.set(filename, item);
  return item;
}

function setInMemoryCache(filename: string, data: Buffer, mimeType: string, etag: string) {
  if (fileMemoryCache.size >= MAX_CACHE_ITEMS) {
    const oldestKey = fileMemoryCache.keys().next().value;
    if (oldestKey) fileMemoryCache.delete(oldestKey);
  }
  fileMemoryCache.set(filename, { data, mimeType, etag, cachedAt: Date.now() });
}

async function readFromDiskCache(filename: string): Promise<CachedFile | null> {
  const key = diskKeyForFilename(filename);
  const binPath = path.join(DISK_CACHE_DIR, `${key}.bin`);
  const metaPath = path.join(DISK_CACHE_DIR, `${key}.meta.json`);
  try {
    const [data, metaRaw] = await Promise.all([fs.readFile(binPath), fs.readFile(metaPath, 'utf8')]);
    const parsed = JSON.parse(metaRaw) as { mimeType?: string; etag?: string };
    const mimeType = parsed.mimeType || 'application/octet-stream';
    const etag = parsed.etag || computeEtag(data);
    return { data, mimeType, etag, cachedAt: Date.now() };
  } catch {
    return null;
  }
}

async function writeToDiskCache(filename: string, data: Buffer, mimeType: string, etag: string): Promise<void> {
  try {
    if (!diskCacheDirReady) {
      await fs.mkdir(DISK_CACHE_DIR, { recursive: true });
      diskCacheDirReady = true;
    }
    const key = diskKeyForFilename(filename);
    const binPath = path.join(DISK_CACHE_DIR, `${key}.bin`);
    const metaPath = path.join(DISK_CACHE_DIR, `${key}.meta.json`);
    await Promise.all([
      fs.writeFile(binPath, data),
      fs.writeFile(metaPath, JSON.stringify({ mimeType, etag, filename }), 'utf8'),
    ]);
  } catch {
    // Graceful no-op if filesystem is read-only
  }
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

function buildImageResponse(
  request: Request,
  data: Buffer,
  mimeType: string,
  etag: string,
  cacheControl: string,
  source: 'MEMORY' | 'DISK' | 'DB' | 'PUBLIC_DISK'
): NextResponse {
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.trim() === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': cacheControl,
        'X-Bems-Image-Cache': `${source}-304`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      ETag: etag,
      'Cache-Control': cacheControl,
      'X-Bems-Image-Cache': source,
      'X-Content-Type-Options': 'nosniff',
    },
  });
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

    // Short-circuit known missing files via Redis/local cache (60s)
    const missingKey = `filemissing:${filename}`;
    const isMissing = await getDistributedCache<boolean>(missingKey);
    if (isMissing) {
      return new NextResponse('File Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'private, max-age=60' },
      });
    }

    // Fast path: Supabase Storage redirect URL cached in Redis (10 min)
    if (isAvatarPath && isSupabaseStorageConfigured()) {
      const joinedPath = safeSegments.join('/');
      const redirectCacheKey = `supa-url:${joinedPath}`;
      let redirectUrl = await getDistributedCache<string>(redirectCacheKey);
      if (!redirectUrl) {
        redirectUrl = await resolveSupabaseRedirectUrl(joinedPath);
        if (redirectUrl) {
          await setDistributedCache(redirectCacheKey, redirectUrl, 10 * 60 * 1000);
        }
      }
      if (redirectUrl) {
        return NextResponse.redirect(redirectUrl, {
          status: 302,
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Bems-Image-Cache': 'SUPABASE_REDIRECT',
          },
        });
      }
    }

    // Resolve access-control metadata from Redis first (30 min TTL) to avoid 4 DB LIKE queries per image
    const metaCacheKey = `filemeta:${filename}`;
    let meta = await getDistributedCache<FileAccessMeta>(metaCacheKey);
    if (!meta) {
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
      };
      await setDistributedCache(metaCacheKey, meta, 30 * 60 * 1000);
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

    // Smart browser caching headers: private caches only for authenticated assets, immutable for public brand assets
    const cacheControlHeader = isPublicBrandAsset
      ? 'public, max-age=31536000, immutable'
      : isAvatarPath
      ? 'private, max-age=604800, stale-while-revalidate=86400'
      : 'private, max-age=86400';

    // Layer 1: Node RAM LRU cache (< 1ms, zero DB/disk I/O)
    const memCached = getFromMemoryCache(filename);
    if (memCached) {
      return buildImageResponse(
        request,
        memCached.data,
        memCached.mimeType || defaultContentType,
        memCached.etag,
        cacheControlHeader,
        'MEMORY'
      );
    }

    // Layer 2: Persistent VPS SSD disk cache (/app/uploads/.cache — survives container restarts & deploys)
    const diskCached = await readFromDiskCache(filename);
    if (diskCached) {
      setInMemoryCache(filename, diskCached.data, diskCached.mimeType, diskCached.etag);
      return buildImageResponse(
        request,
        diskCached.data,
        diskCached.mimeType || defaultContentType,
        diskCached.etag,
        cacheControlHeader,
        'DISK'
      );
    }

    // Layer 3: Primary durable storage (Supabase PostgreSQL StoredFile -> Attachment.fileData fallback)
    try {
      const dbFile = await findStoredFileWithRetry(filename, 3);
      if (dbFile && dbFile.data) {
        const buf = Buffer.from(dbFile.data);
        const resolvedMime = dbFile.mimeType || defaultContentType;
        const etag = computeEtag(buf);
        setInMemoryCache(filename, buf, resolvedMime, etag);
        void writeToDiskCache(filename, buf, resolvedMime, etag);
        return buildImageResponse(request, buf, resolvedMime, etag, cacheControlHeader, 'DB');
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
        const etag = computeEtag(buf);
        setInMemoryCache(filename, buf, resolvedMime, etag);
        void writeToDiskCache(filename, buf, resolvedMime, etag);
        return buildImageResponse(request, buf, resolvedMime, etag, cacheControlHeader, 'DB');
      }
    } catch (dbErr) {
      console.warn('[Uploads Serve] Database lookup failed after retries, falling back to public/uploads:', dbErr);
    }

    // Layer 4: Static public/uploads fallback
    const filePath = path.join(process.cwd(), 'public', 'uploads', ...safeSegments);
    try {
      const fileBuffer = await fs.readFile(filePath);
      const etag = computeEtag(fileBuffer);
      setInMemoryCache(filename, fileBuffer, defaultContentType, etag);
      void writeToDiskCache(filename, fileBuffer, defaultContentType, etag);
      return buildImageResponse(request, fileBuffer, defaultContentType, etag, cacheControlHeader, 'PUBLIC_DISK');
    } catch {
      await setDistributedCache(missingKey, true, 60_000);
      return new NextResponse('File Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'private, max-age=60',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
  } catch {
    return new NextResponse('Error loading file', {
      status: 500,
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}
