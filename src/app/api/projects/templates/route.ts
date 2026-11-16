import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext } from '@/lib/projectRouteHelper';

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { allowedSubIds, useSubFilter } = ctx;

    const templates = await prisma.projectIssueTemplate.findMany({
      where: useSubFilter ? { organizationId: { in: allowedSubIds } } : {},
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error('GET /api/projects/templates error:', error);
    return NextResponse.json({ error: 'Failed to load templates.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, defaultOrgId } = ctx;

    const body = await req.json();
    const name = String(body.name || '').trim();
    const subtasks = Array.isArray(body.subtasks)
      ? body.subtasks.map((s: any) => String(s).trim()).filter(Boolean)
      : [];
    if (!name) {
      return NextResponse.json({ error: 'Blueprint name is required.' }, { status: 400 });
    }

    const template = await prisma.projectIssueTemplate.create({
      data: {
        organizationId: String(body.organizationId || defaultOrgId),
        teamId: body.teamId ? String(body.teamId) : null,
        name,
        projectType: String(body.projectType || 'SOFTWARE'),
        defaultPriority: String(body.defaultPriority || 'MEDIUM'),
        defaultLabelsJson: Array.isArray(body.labels) ? JSON.stringify(body.labels) : null,
        subtasksJson: JSON.stringify(subtasks),
        createdById: actor.id,
      },
    });
    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error('POST /api/projects/templates error:', error);
    return NextResponse.json({ error: 'Failed to create issue blueprint.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    await prisma.projectIssueTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/templates error:', error);
    return NextResponse.json({ error: 'Failed to delete issue blueprint.' }, { status: 500 });
  }
}

