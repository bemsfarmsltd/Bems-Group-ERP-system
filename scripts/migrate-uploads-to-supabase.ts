import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { isSupabaseStorageConfigured, uploadToSupabaseStorage } from '../src/lib/supabase-storage';
import { optimizeAvatarImage } from '../src/lib/image-optimizer';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipOptimize = process.argv.includes('--no-optimize');

  if (!dryRun && !isSupabaseStorageConfigured()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    process.exit(1);
  }

  const storedFiles = await prisma.storedFile.findMany({
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      data: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${storedFiles.length} StoredFile rows${dryRun ? ' (DRY RUN)' : ''}.`);

  let uploadedCount = 0;
  let updatedEmployees = 0;
  let updatedAttachments = 0;
  let totalBytesBefore = 0;
  let totalBytesAfter = 0;

  for (const file of storedFiles) {
    const isPdf = file.mimeType === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf');
    const subDir = isPdf ? 'documents' : 'avatars';
    const storagePath = `${subDir}/${file.filename}`;
    const rawBuffer = Buffer.from(file.data);
    totalBytesBefore += rawBuffer.length;

    let uploadBuffer: Buffer = rawBuffer;
    let uploadMime = file.mimeType;

    if (!isPdf && !skipOptimize) {
      const ext = file.filename.split('.').pop()?.toLowerCase() || 'jpg';
      const optimized = await optimizeAvatarImage(rawBuffer, ext, file.mimeType);
      uploadBuffer = optimized.buffer;
      uploadMime = optimized.mimeType;
    }
    totalBytesAfter += uploadBuffer.length;

    if (dryRun) {
      console.log(`[DRY RUN] ${storagePath}: ${rawBuffer.length} -> ${uploadBuffer.length} bytes (${uploadMime})`);
      uploadedCount++;
      continue;
    }

    const { publicUrl } = await uploadToSupabaseStorage({
      storagePath,
      data: uploadBuffer,
      contentType: uploadMime,
    });
    uploadedCount++;

    const legacyPaths = [
      `/uploads/${storagePath}`,
      `/uploads/${file.filename}`,
      `https://bemserp.work/uploads/${storagePath}`,
      `https://api.bemserp.work/uploads/${storagePath}`,
    ];

    const empResult = await prisma.employee.updateMany({
      where: {
        OR: legacyPaths.map((p) => ({ avatarUrl: p })),
      },
      data: { avatarUrl: publicUrl },
    });
    updatedEmployees += empResult.count;

    const attResult = await prisma.attachment.updateMany({
      where: {
        OR: legacyPaths.map((p) => ({ fileUrl: p })),
      },
      data: { fileUrl: publicUrl },
    });
    updatedAttachments += attResult.count;

    if (uploadedCount % 10 === 0 || uploadedCount === storedFiles.length) {
      console.log(`Progress: ${uploadedCount}/${storedFiles.length} uploaded...`);
    }
  }

  console.log('--- Migration Summary ---');
  console.log(`Files processed: ${uploadedCount}`);
  console.log(`Total size: ${(totalBytesBefore / (1024 * 1024)).toFixed(2)} MB -> ${(totalBytesAfter / (1024 * 1024)).toFixed(2)} MB`);
  if (!dryRun) {
    console.log(`Employee.avatarUrl rows updated: ${updatedEmployees}`);
    console.log(`Attachment.fileUrl rows updated: ${updatedAttachments}`);
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
