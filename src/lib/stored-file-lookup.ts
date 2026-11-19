import { prisma } from '@/lib/prisma';

export interface ResolvedStoredFile {
  mimeType: string;
  data: Buffer;
}

const MAX_CACHE_ENTRIES = 50;
const MAX_SINGLE_FILE_BYTES = 2 * 1024 * 1024; // 2 MB cap per cached item
const fileCache = new Map<string, ResolvedStoredFile>();
const inFlight = new Map<string, Promise<ResolvedStoredFile | null>>();

function getCached(filename: string): ResolvedStoredFile | null {
  const hit = fileCache.get(filename);
  if (!hit) return null;
  // Refresh LRU order
  fileCache.delete(filename);
  fileCache.set(filename, hit);
  return hit;
}

function setCached(filename: string, file: ResolvedStoredFile): void {
  if (file.data.byteLength > MAX_SINGLE_FILE_BYTES) return;
  if (fileCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = fileCache.keys().next().value;
    if (oldestKey) fileCache.delete(oldestKey);
  }
  fileCache.set(filename, file);
}

/**
 * Resolves an uploaded file by its filename from PostgreSQL (`StoredFile` with `Attachment` fallback),
 * using an in-memory LRU cache and in-flight deduplication to avoid bursting DB connections.
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

  const cached = getCached(filename);
  if (cached) return cached;

  const existingPromise = inFlight.get(filename);
  if (existingPromise) return existingPromise;

  const promise = (async (): Promise<ResolvedStoredFile | null> => {
    try {
      const stored = await prisma.storedFile.findUnique({
        where: { filename },
        select: { mimeType: true, data: true },
      });
      if (stored?.data) {
        const resolved = {
          mimeType: stored.mimeType || 'application/octet-stream',
          data: Buffer.from(stored.data),
        };
        setCached(filename, resolved);
        return resolved;
      }

      const attachment = await prisma.attachment.findFirst({
        where: { fileName: filename, fileData: { not: null } },
        select: { contentType: true, fileData: true },
      });
      if (attachment?.fileData) {
        const resolved = {
          mimeType: attachment.contentType || 'application/octet-stream',
          data: Buffer.from(attachment.fileData),
        };
        setCached(filename, resolved);
        return resolved;
      }

      return null;
    } finally {
      inFlight.delete(filename);
    }
  })();

  inFlight.set(filename, promise);
  return promise;
}
