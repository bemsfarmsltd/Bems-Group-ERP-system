import fs from 'fs/promises';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface StoredObjectResult {
  provider: 's3' | 'local';
  key: string;
  url: string;
}

function getBucket(): string {
  return (process.env.S3_BUCKET || process.env.R2_BUCKET || '').trim();
}

export function isObjectStorageConfigured(): boolean {
  return Boolean(
    getBucket() &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

function createS3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_FORCE_PATH_STYLE === 'true'),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<StoredObjectResult> {
  const safeKey = params.key.replace(/^\/+/, '').replace(/\.\./g, '');

  if (isObjectStorageConfigured()) {
    const bucket = getBucket();
    const client = createS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: safeKey,
        Body: params.body,
        ContentType: params.contentType,
      })
    );
    const publicBase = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const url = publicBase ? `${publicBase}/${safeKey}` : `s3://${bucket}/${safeKey}`;
    return { provider: 's3', key: safeKey, url };
  }

  const localPath = path.join(process.cwd(), 'public', 'uploads', safeKey);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, params.body);
  return {
    provider: 'local',
    key: safeKey,
    url: `/uploads/${safeKey}`,
  };
}

export async function deleteObject(key: string): Promise<void> {
  const safeKey = key.replace(/^\/+/, '').replace(/\.\./g, '');
  if (isObjectStorageConfigured()) {
    const client = createS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: safeKey,
      })
    );
    return;
  }

  const localPath = path.join(process.cwd(), 'public', 'uploads', safeKey);
  await fs.unlink(localPath).catch(() => {});
}
