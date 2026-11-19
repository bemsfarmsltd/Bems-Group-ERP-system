import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { prisma } from '@/lib/prisma';
import { computeBufferSha256 } from '@/lib/platform/staged-attachments';
import { isSupabaseStorageConfigured, uploadToSupabaseStorage } from '@/lib/supabase-storage';
import { optimizeAvatarImage } from '@/lib/image-optimizer';

export const dynamic = 'force-dynamic';

async function persistStoredFileWithRetry(
  filename: string,
  mimeType: string,
  bytes: Buffer,
  retries = 3
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.storedFile.upsert({
        where: { filename },
        create: {
          filename,
          mimeType,
          data: bytes as any,
          size: bytes.length,
        },
        update: {
          mimeType,
          data: bytes as any,
          size: bytes.length,
        },
      });
      return true;
    } catch (err) {
      console.error(`[Upload] DB persist attempt ${attempt}/${retries} failed for ${filename}:`, err);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }
  return false;
}

async function saveUploadedAsset(params: {
  actor: Awaited<ReturnType<typeof getAuthenticatedEmployee>>;
  bytes: Buffer;
  ext: string;
  mimeType: string;
  isPdf: boolean;
  prefix: 'doc' | 'file' | 'avatar';
  originalFileName?: string;
  employeeId?: string;
  ownerTypeWhenActor: string;
}) {
  const { actor, isPdf, prefix, employeeId, ownerTypeWhenActor } = params;
  let finalBytes = params.bytes;
  let finalExt = params.ext;
  let finalMimeType = params.mimeType;

  if (!isPdf) {
    const optimized = await optimizeAvatarImage(params.bytes, params.ext, params.mimeType);
    finalBytes = optimized.buffer;
    finalExt = optimized.ext;
    finalMimeType = optimized.mimeType;
  }

  const filename = `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}.${finalExt}`;
  const subDir = isPdf ? 'documents' : 'avatars';
  const storagePath = `${subDir}/${filename}`;
  const checksum = computeBufferSha256(finalBytes);

  let url: string;
  let storedInSupabase = false;

  if (isSupabaseStorageConfigured()) {
    const uploaded = await uploadToSupabaseStorage({
      storagePath,
      data: finalBytes,
      contentType: finalMimeType,
      retries: 3,
    });
    url = uploaded.publicUrl;
    storedInSupabase = true;
  } else {
    if (!(await persistStoredFileWithRetry(filename, finalMimeType, finalBytes, 3))) {
      throw new Error('File persistence failed.');
    }
    url = `/uploads/${storagePath}`;
  }

  if (!isPdf && employeeId) {
    const canUpdate =
      Boolean(actor) &&
      (actor!.id === employeeId || hasAnyRole(actor, ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD']));
    if (canUpdate) {
      await prisma.employee
        .update({
          where: { id: employeeId },
          data: { avatarUrl: url },
        })
        .catch(() => {});
    }
  }

  const attachment = await prisma.attachment.create({
    data: {
      ownerType: actor ? ownerTypeWhenActor : 'PUBLIC_AVATAR',
      ownerId: actor?.id || null,
      fileName: params.originalFileName || filename,
      contentType: finalMimeType,
      fileUrl: url,
      fileData: storedInSupabase ? null : new Uint8Array(finalBytes),
      checksum,
      uploadedById: actor?.id || 'registration',
    },
  });

  return {
    success: true,
    url,
    filename,
    checksum,
    mimeType: finalMimeType,
    sizeBytes: finalBytes.length,
    attachmentId: attachment.id,
  };
}

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);

    // Rate limit uploads by IP to prevent flooding or DoS
    const clientIp = actor?.id || getClientIp(request);
    const rateLimit = await checkRateLimit(`upload:${clientIp}`, {
      windowMs: 60 * 1000,
      maxAttempts: 25,
      blockDurationMs: 5 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Upload rate limit reached. Please wait a moment before trying again.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds || 60) } }
      );
    }

    const contentType = request.headers.get('content-type') || '';

    // Handle Multipart Form Data
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
      const isKnownExtension = validExtensions.includes(ext);
      const isMimeMatch = file.type.startsWith('image/') || file.type === 'application/pdf';

      if (!isMimeMatch || !isKnownExtension || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return NextResponse.json({ error: 'Only image files (JPG, PNG, WebP) and PDF documents are permitted.' }, { status: 400 });
      }

      const cleanExt = isKnownExtension ? ext : 'jpg';
      const isPdf = cleanExt === 'pdf' || file.type === 'application/pdf';

      // Security check: PDF documents require authenticated session; Image avatars are permitted for registration
      if (isPdf && !actor) {
        return NextResponse.json({ error: 'Sign in is required to upload official document files.' }, { status: 401 });
      }

      if (file.size > 12 * 1024 * 1024) {
        return NextResponse.json({ error: 'File size exceeds maximum 12MB limit.' }, { status: 400 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const prefix = isPdf ? 'doc' : 'file';
      const mimeType = isPdf ? 'application/pdf' : cleanExt === 'png' ? 'image/png' : cleanExt === 'webp' ? 'image/webp' : 'image/jpeg';
      const formEmployeeId = formData.get('employeeId')?.toString()?.trim() || request.headers.get('x-employee-id')?.trim();

      const result = await saveUploadedAsset({
        actor,
        bytes,
        ext: cleanExt,
        mimeType,
        isPdf,
        prefix,
        originalFileName: file.name || undefined,
        employeeId: formEmployeeId,
        ownerTypeWhenActor: 'STAGED_EVIDENCE',
      });

      return NextResponse.json(result);
    }

    // Handle JSON Base64 Payload
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const base64Data = body.image || body.base64;
      
      if (!base64Data || typeof base64Data !== 'string') {
        return NextResponse.json({ error: 'No image data provided.' }, { status: 400 });
      }

      const matches = base64Data.match(/^data:image\/([a-zA-Z0-9-+.]+);base64,(.+)$/);
      let buffer: Buffer;
      let rawExt = 'jpg';

      if (matches) {
        rawExt = matches[1].toLowerCase().replace('jpeg', 'jpg');
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(base64Data, 'base64');
      }

      const allowedImageExts = ['jpg', 'png', 'webp'];
      if (!allowedImageExts.includes(rawExt)) {
        return NextResponse.json({ error: 'Only JPG, PNG, and WebP images are permitted for profile avatars.' }, { status: 400 });
      }
      const ext = rawExt;

      if (buffer.length > 8 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image size exceeds maximum 8MB limit.' }, { status: 400 });
      }

      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const bodyEmployeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : request.headers.get('x-employee-id')?.trim();

      const result = await saveUploadedAsset({
        actor,
        bytes: buffer,
        ext,
        mimeType,
        isPdf: false,
        prefix: 'avatar',
        employeeId: bodyEmployeeId,
        ownerTypeWhenActor: 'PROFILE',
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported media type.' }, { status: 415 });
  } catch (error) {
    console.error('Avatar upload failed:', error);
    return NextResponse.json({ error: 'Could not upload profile picture.' }, { status: 500 });
  }
}
