import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext } from '@/lib/projectRouteHelper';

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { allowedSubIds, useSubFilter } = ctx;
    const orgFilter = useSubFilter ? { organizationId: { in: allowedSubIds } } : {};

    const views = await prisma.projectSavedView.findMany({
      where: orgFilter,
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ success: true, views });
  } catch (error) {
    console.error('GET /api/projects/views error:', error);
    return NextResponse.json({ error: 'Failed to load saved views.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, defaultOrgId } = ctx;

    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'View name is required.' }, { status: 400 });

    const view = await prisma.projectSavedView.create({
      data: {
        organizationId: String(body.organizationId || defaultOrgId),
        teamId: body.teamId ? String(body.teamId) : null,
        ownerId: actor.id,
        name,
        description: body.description ? String(body.description).trim() : null,
        visibility: String(body.visibility || 'WORKSPACE'),
        filtersJson: typeof body.filtersJson === 'string' ? body.filtersJson : JSON.stringify(body.filtersJson || {}),
        displayJson: typeof body.displayJson === 'string' ? body.displayJson : JSON.stringify(body.displayJson || {}),
      },
    });
    return NextResponse.json({ success: true, view });
  } catch (error) {
    console.error('POST /api/projects/views error:', error);
    return NextResponse.json({ error: 'Failed to save view.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'View id is required.' }, { status: 400 });

    await prisma.projectSavedView.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/views error:', error);
    return NextResponse.json({ error: 'Failed to delete view.' }, { status: 500 });
  }
}

