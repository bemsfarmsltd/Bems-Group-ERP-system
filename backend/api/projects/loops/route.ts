import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext } from '@/lib/projectRouteHelper';

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { allowedSubIds, useSubFilter } = ctx;
    const orgFilter = useSubFilter ? { organizationId: { in: allowedSubIds } } : {};

    const rules = await prisma.projectAutomationRule.findMany({
      where: orgFilter,
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, rules });
  } catch (error) {
    console.error('GET /api/projects/loops error:', error);
    return NextResponse.json({ error: 'Failed to load loops.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { defaultOrgId } = ctx;

    const body = await req.json();
    const action = String(body.action || 'CREATE_LOOP');

    if (action === 'RUN_LOOP') {
      const id = String(body.id || '');
      const rule = await prisma.projectAutomationRule.findUnique({ where: { id } });
      if (!rule) return NextResponse.json({ error: 'Loop rule not found.' }, { status: 404 });

      const todayStr = new Date().toISOString().split('T')[0];
      let affectedCount = 0;
      let summary = 'Loop executed with 0 changes.';

      if (rule.actionType === 'ESCALATE_OVERDUE_PRIORITY') {
        const overdue = await prisma.projectWorkItem.findMany({
          where: {
            organizationId: rule.organizationId,
            dueDate: { lt: todayStr },
            status: { notIn: ['DONE', 'ACCEPTED', 'ARCHIVED'] },
            priority: { not: 'URGENT' },
          },
          select: { id: true },
        });
        if (overdue.length > 0) {
          await prisma.projectWorkItem.updateMany({
            where: { id: { in: overdue.map((o) => o.id) } },
            data: { priority: 'URGENT', version: { increment: 1 } },
          });
        }
        affectedCount = overdue.length;
        summary = `Escalated ${affectedCount} overdue work items to URGENT priority.`;
      } else if (rule.actionType === 'PROJECT_HYGIENE_CHECK') {
        const staleProjects = await prisma.project.findMany({
          where: {
            organizationId: rule.organizationId,
            status: 'ACTIVE',
            targetDate: { lt: todayStr },
            healthStatus: 'ON_TRACK',
          },
          select: { id: true },
        });
        if (staleProjects.length > 0) {
          await prisma.project.updateMany({
            where: { id: { in: staleProjects.map((p) => p.id) } },
            data: { healthStatus: 'AT_RISK', healthUpdateAt: new Date() },
          });
        }
        affectedCount = staleProjects.length;
        summary = `Flagged ${affectedCount} overdue active projects as AT_RISK.`;
      } else if (rule.actionType === 'WEEKLY_WRAP_DIGEST') {
        const doneCount = await prisma.projectWorkItem.count({
          where: { organizationId: rule.organizationId, status: { in: ['DONE', 'ACCEPTED'] } },
        });
        affectedCount = doneCount;
        summary = `Compiled weekly wrap across ${doneCount} completed deliverables.`;
      } else {
        const openCount = await prisma.projectWorkItem.count({
          where: { organizationId: rule.organizationId, status: { in: ['BACKLOG', 'TODO'] } },
        });
        affectedCount = openCount;
        summary = `Evaluated ${openCount} queued items against triage rules.`;
      }

      const updated = await prisma.projectAutomationRule.update({
        where: { id },
        data: { lastTriggeredAt: new Date() },
      });

      return NextResponse.json({ success: true, rule: updated, affectedCount, summary });
    }

    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Loop name is required.' }, { status: 400 });

    const rule = await prisma.projectAutomationRule.create({
      data: {
        organizationId: String(body.organizationId || defaultOrgId),
        projectId: body.projectId ? String(body.projectId) : null,
        name,
        triggerType: String(body.triggerType || 'SCHEDULED_WEEKLY'),
        conditionsJson:
          typeof body.conditionsJson === 'string' ? body.conditionsJson : JSON.stringify(body.conditionsJson || {}),
        actionType: String(body.actionType || 'PROJECT_HYGIENE_CHECK'),
        actionConfigJson:
          typeof body.actionConfigJson === 'string'
            ? body.actionConfigJson
            : JSON.stringify(body.actionConfigJson || {}),
        isActive: body.isActive !== false,
      },
    });

    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('POST /api/projects/loops error:', error);
    return NextResponse.json({ error: 'Failed to process loop.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;

    const body = await req.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Loop id is required.' }, { status: 400 });

    const rule = await prisma.projectAutomationRule.update({
      where: { id },
      data: { isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined },
    });
    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('PATCH /api/projects/loops error:', error);
    return NextResponse.json({ error: 'Failed to update loop.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'Loop id is required.' }, { status: 400 });

    await prisma.projectAutomationRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/loops error:', error);
    return NextResponse.json({ error: 'Failed to delete loop.' }, { status: 500 });
  }
}

