import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext, logProjectAudit } from '@/lib/projectRouteHelper';

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, defaultOrgId } = ctx;

    const formData = await req.formData();
    const projectId = String(formData.get('projectId') || '');
    const titleInput = String(formData.get('title') || '').trim();
    const category = String(formData.get('category') || 'SPECIFICATION');
    const file = formData.get('file');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A valid file is required.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 15 MB limit.' }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = Date.now();
    const relDir = path.join('uploads', 'projects', projectId);
    const absDir = path.join(process.cwd(), 'public', relDir);
    await fs.mkdir(absDir, { recursive: true });

    const storedName = `${stamp}-${safeName}`;
    const absPath = path.join(absDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absPath, buffer);

    const fileUrl = `/${relDir.replace(/\\/g, '/')}/${storedName}`;
    const mimeType = file.type || 'application/octet-stream';
    const isImage = mimeType.startsWith('image/');
    const assetKind = String(formData.get('assetKind') || (isImage ? 'IMAGE' : 'DOCUMENT'));

    const doc = await prisma.projectDocument.create({
      data: {
        projectId,
        title: titleInput || file.name,
        category,
        assetKind,
        mimeType,
        fileSizeBytes: file.size,
        storagePath: absPath,
        fileUrl,
        approvalStatus: 'APPROVED',
        authorId: actor.id,
      },
    });

    await logProjectAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: defaultOrgId,
      targetType: 'PROJECT_DOCUMENT',
      targetId: doc.id,
      action: 'ATTACHMENT_UPLOADED',
      metadata: { projectId, title: doc.title, assetKind, fileSizeBytes: file.size },
    });

    return NextResponse.json({ success: true, document: doc });
  } catch (error) {
    console.error('POST /api/projects/attachments error:', error);
    return NextResponse.json({ error: 'Failed to upload attachment.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    const existing = await prisma.projectDocument.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
    if (!isExecutive && existing.authorId !== actor.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    if (existing.storagePath) {
      await fs.unlink(existing.storagePath).catch(() => {});
    }
    await prisma.projectDocument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/attachments error:', error);
    return NextResponse.json({ error: 'Failed to delete attachment.' }, { status: 500 });
  }
}

