const DEFAULT_BUCKET = 'bems-uploads';

export interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

let bucketVerified = false;
let bucketVerifyPromise: Promise<void> | null = null;
const verifiedPublicPaths = new Set<string>();

export function getSupabaseStorageConfig(): SupabaseStorageConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !serviceRoleKey) {
    return null;
  }
  const url = rawUrl.replace(/\/+$/, '');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_BUCKET;
  return { url, serviceRoleKey, bucket };
}

export function isSupabaseStorageConfigured(): boolean {
  return getSupabaseStorageConfig() !== null;
}

function normalizeStoragePath(storagePath: string): string {
  return storagePath
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

export function getSupabasePublicUrl(storagePath: string): string | null {
  const config = getSupabaseStorageConfig();
  if (!config) return null;
  const cleanPath = normalizeStoragePath(storagePath);
  if (!cleanPath) return null;
  return `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${cleanPath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')}`;
}

export async function ensureSupabaseBucketExists(): Promise<void> {
  const config = getSupabaseStorageConfig();
  if (!config) {
    throw new Error('Supabase Storage is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).');
  }
  if (bucketVerified) return;
  if (bucketVerifyPromise) return bucketVerifyPromise;

  bucketVerifyPromise = (async () => {
    try {
      const headers = {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      };
      const checkRes = await fetch(
        `${config.url}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`,
        { method: 'GET', headers }
      );
      if (checkRes.ok) {
        bucketVerified = true;
        return;
      }

      const createRes = await fetch(`${config.url}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: config.bucket,
          name: config.bucket,
          public: true,
        }),
      });

      if (!createRes.ok && createRes.status !== 409) {
        const errText = await createRes.text().catch(() => '');
        throw new Error(`Failed to ensure Supabase bucket "${config.bucket}": ${createRes.status} ${errText}`);
      }
      bucketVerified = true;
    } finally {
      bucketVerifyPromise = null;
    }
  })();

  return bucketVerifyPromise;
}

export async function uploadToSupabaseStorage(params: {
  storagePath: string;
  data: Buffer;
  contentType: string;
  retries?: number;
}): Promise<{ publicUrl: string; storagePath: string }> {
  const config = getSupabaseStorageConfig();
  if (!config) {
    throw new Error('Supabase Storage is not configured.');
  }

  const cleanPath = normalizeStoragePath(params.storagePath);
  if (!cleanPath) {
    throw new Error('Invalid storage path.');
  }

  await ensureSupabaseBucketExists();

  const encodedPath = cleanPath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  const uploadUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodedPath}`;
  const maxRetries = params.retries ?? 3;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.serviceRoleKey}`,
          apikey: config.serviceRoleKey,
          'Content-Type': params.contentType,
          'Cache-Control': '31536000',
          'x-upsert': 'true',
        },
        body: new Uint8Array(params.data),
      });

      if (res.ok) {
        const publicUrl = getSupabasePublicUrl(cleanPath)!;
        verifiedPublicPaths.add(cleanPath);
        return { publicUrl, storagePath: cleanPath };
      }

      const errText = await res.text().catch(() => '');
      lastError = new Error(`Supabase upload failed (${res.status}): ${errText}`);
      if (res.status < 500 && res.status !== 429) {
        break;
      }
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Supabase upload failed.');
}

export async function resolveSupabaseRedirectUrl(rawPath: string): Promise<string | null> {
  const cleanPath = normalizeStoragePath(rawPath);
  if (!cleanPath) return null;

  const publicUrl = getSupabasePublicUrl(cleanPath);
  if (!publicUrl) return null;

  if (verifiedPublicPaths.has(cleanPath)) {
    return publicUrl;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(publicUrl, {
      method: 'HEAD',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      if (verifiedPublicPaths.size > 2000) {
        verifiedPublicPaths.clear();
      }
      verifiedPublicPaths.add(cleanPath);
      return publicUrl;
    }
  } catch {
    // Fall back to DB lookup on timeout or network error
  }

  return null;
}
