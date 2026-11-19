import { prisma } from '@/lib/prisma';

export interface ResolvedStoredFile {
  mimeType: string;
  data: Buffer;
}

/**
 * Resolves an uploaded file by its filename from PostgreSQL (`StoredFile` with `Attachment` fallback).
 */
export async function lookupStoredFileByPath(rawPath: string): Promise<ResolvedStoredFile | null> {
  const segments = rawPath
    .split('?')[0]
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  const filename = segments[segments.length - 1];
  if (!filename || filename === '.' || filename === '..' || filename.includes('\\')) {
    return null;
  }

  const stored = await prisma.storedFile.findUnique({
    where: { filename },
    select: { mimeType: true, data: true },
  });
  if (stored?.data) {
    return {
      mimeType: stored.mimeType || 'application/octet-stream',
      data: Buffer.from(stored.data),
    };
  }

  const attachment = await prisma.attachment.findFirst({
    where: { fileName: filename, fileData: { not: null } },
    select: { contentType: true, fileData: true },
  });
  if (attachment?.fileData) {
    return {
      mimeType: attachment.contentType || 'application/octet-stream',
      data: Buffer.from(attachment.fileData),
    };
  }

  return null;
}
