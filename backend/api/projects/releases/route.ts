import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext } from '@/lib/projectRouteHelper';

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { allowedSubIds, useSubFilter } = ctx;
    const orgFilter = useSubFilter ? { organizationId: { in: allowedSubIds } } : {};

    const [releases, testCases] = await Promise.all([
      prisma.projectRelease.findMany({
        where: { project: orgFilter },
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, projectCode: true, title: true } } },
      }),
      prisma.projectTestCase.findMany({
        where: { project: orgFilter },
        orderBy: { updatedAt: 'desc' },
        include: {
          project: { select: { id: true, projectCode: true, title: true } },
          workItem: { select: { id: true, itemKey: true, title: true } },
        },
      }),
    ]);

    return NextResponse.json({ success: true, releases, testCases });
  } catch (error) {
    console.error('GET /api/projects/releases error:', error);
    return NextResponse.json({ error: 'Failed to load releases and QA data.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor } = ctx;

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'CREATE_RELEASE') {
      const projectId = String(body.projectId || '');
      const versionTag = String(body.versionTag || '').trim();
      const title = String(body.title || '').trim();
      if (!projectId || !versionTag || !title) {
        return NextResponse.json({ error: 'Project, version tag, and title are required.' }, { status: 400 });
      }
      const release = await prisma.projectRelease.create({
        data: {
          projectId,
          versionTag,
          title,
          environment: String(body.environment || 'PRODUCTION'),
          plannedDate: body.plannedDate ? String(body.plannedDate) : null,
          status: String(body.status || 'PLANNED'),
          rollbackPlan: body.rollbackPlan ? String(body.rollbackPlan).trim() : null,
          releaseNotes: body.releaseNotes ? String(body.releaseNotes).trim() : null,
          ownerId: actor.id,
        },
      });
      return NextResponse.json({ success: true, release });
    }

    if (action === 'CREATE_TEST_CASE') {
      const projectId = String(body.projectId || '');
      const title = String(body.title || '').trim();
      if (!projectId || !title) {
        return NextResponse.json({ error: 'Project and test case title are required.' }, { status: 400 });
      }
      const testCase = await prisma.projectTestCase.create({
        data: {
          projectId,
          workItemId: body.workItemId ? String(body.workItemId) : null,
          title,
          suiteName: String(body.suiteName || 'Regression'),
          steps: String(body.steps || '1. Execute test scenario'),
          expectedResult: String(body.expectedResult || 'Expected behavior passes without errors'),
          lastRunStatus: String(body.lastRunStatus || 'NOT_RUN'),
          executedById: actor.id,
        },
      });
      return NextResponse.json({ success: true, testCase });
    }

    return NextResponse.json({ error: 'Unsupported release action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/projects/releases error:', error);
    return NextResponse.json({ error: 'Failed to create release/test case.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor } = ctx;

    const body = await req.json();
    const kind = String(body.kind || 'release');
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    if (kind === 'testCase') {
      const testCase = await prisma.projectTestCase.update({
        where: { id },
        data: {
          lastRunStatus: body.lastRunStatus ? String(body.lastRunStatus) : undefined,
          suiteName: body.suiteName ? String(body.suiteName) : undefined,
          executedById: actor.id,
        },
      });
      return NextResponse.json({ success: true, testCase });
    }

    const nextStatus = body.status ? String(body.status) : undefined;
    const release = await prisma.projectRelease.update({
      where: { id },
      data: {
        status: nextStatus,
        environment: body.environment ? String(body.environment) : undefined,
        plannedDate: body.plannedDate !== undefined ? (body.plannedDate ? String(body.plannedDate) : null) : undefined,
        deployedAt: nextStatus === 'DEPLOYED' ? new Date() : undefined,
      },
    });
    return NextResponse.json({ success: true, release });
  } catch (error) {
    console.error('PATCH /api/projects/releases error:', error);
    return NextResponse.json({ error: 'Failed to update release/test case.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(req.url);
    const kind = String(searchParams.get('kind') || 'release');
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    if (kind === 'testCase') {
      await prisma.projectTestCase.delete({ where: { id } });
    } else {
      await prisma.projectRelease.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/releases error:', error);
    return NextResponse.json({ error: 'Failed to delete item.' }, { status: 500 });
  }
}

