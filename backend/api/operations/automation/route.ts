import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logOpsAudit, requireCustomAdminOpsAction, resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const where = ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { organizationId: { in: ctx.allowedSubIds } } : {};
    const rules = await prisma.opsAutomationRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Ops automation GET error:', error);
    return NextResponse.json({ error: 'Could not load automation rules.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_governance', 'manage_automation_rules');
    if (denied) return denied;

    const body = await request.json();
    const organizationId = String(body?.organizationId || '').trim();
    const name = String(body?.name || '').trim();
    const triggerEvent = String(body?.triggerEvent || 'WORK_ORDER_OVERDUE').toUpperCase();
    const actionType = String(body?.actionType || 'ESCALATE').toUpperCase();
    const targetRoleOrId = String(body?.targetRoleOrId || 'GMD').trim();
    if (!organizationId || !name) {
      return NextResponse.json({ error: 'organizationId and rule name are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const rule = await prisma.opsAutomationRule.create({
      data: {
        organizationId,
        name,
        triggerEvent,
        actionType,
        targetRoleOrId,
        conditionJson: body?.condition ? JSON.stringify(body.condition) : null,
        createdById: ctx.actor.id,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_AUTOMATION_RULE_CREATED',
      targetType: 'OPS_AUTOMATION_RULE',
      targetId: rule.id,
      subsidiaryId: rule.organizationId,
      metadata: { name: rule.name, triggerEvent: rule.triggerEvent },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error('Ops automation POST error:', error);
    return NextResponse.json({ error: 'Could not create automation rule.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_governance', 'manage_automation_rules');
    if (denied) return denied;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    const existing = id ? await prisma.opsAutomationRule.findUnique({ where: { id } }) : null;
    if (!existing) return NextResponse.json({ error: 'Automation rule not found.' }, { status: 404 });

    const updated = await prisma.opsAutomationRule.update({
      where: { id },
      data: { isActive: body?.isActive !== undefined ? Boolean(body.isActive) : !existing.isActive },
    });
    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error('Ops automation PATCH error:', error);
    return NextResponse.json({ error: 'Could not toggle automation rule.' }, { status: 500 });
  }
}
