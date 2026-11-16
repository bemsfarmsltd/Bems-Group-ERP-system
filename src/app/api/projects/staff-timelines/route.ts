import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext, logProjectAudit, serializeBigInt } from '@/lib/projectRouteHelper';

function computeSlaStatus(targetDate?: string | null, completedAt?: Date | null): string {
  const today = new Date().toISOString().split('T')[0];
  if (completedAt) {
    const doneDay = completedAt.toISOString().split('T')[0];
    if (targetDate && doneDay > targetDate) return 'COMPLETED_LATE';
    return 'COMPLETED_ON_TIME';
  }
  if (!targetDate) return 'ON_TRACK';
  if (today > targetDate) return 'OVERDUE';
  const diffDays = Math.ceil((new Date(targetDate).getTime() - new Date(today).getTime()) / 86400000);
  if (diffDays <= 3) return 'AT_RISK';
  return 'ON_TRACK';
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive, defaultOrgId } = ctx;

    const body = await req.json();
    const projectId = String(body.projectId || '');
    const employeeId = String(body.employeeId || '');
    if (!projectId || !employeeId) {
      return NextResponse.json({ error: 'projectId and employeeId are required.' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { teamLeadId: true } });
    if (!isExecutive && project?.teamLeadId !== actor.id) {
      return NextResponse.json(
        { error: 'Only GMD, Super Admin, or the Project Team Lead can assign staff timelines.' },
        { status: 403 }
      );
    }

    const assignedStartDate = body.assignedStartDate ? String(body.assignedStartDate) : new Date().toISOString().split('T')[0];
    const targetCompletionDate = body.targetCompletionDate ? String(body.targetCompletionDate) : null;
    const slaStatus = computeSlaStatus(targetCompletionDate, null);

    const member = await prisma.projectMember.upsert({
      where: { projectId_employeeId: { projectId, employeeId } },
      update: {
        projectRole: body.projectRole ? String(body.projectRole) : undefined,
        allocationPercent: body.allocationPercent !== undefined ? Number(body.allocationPercent) : undefined,
        assignedStartDate,
        targetCompletionDate,
        slaStatus,
      },
      create: {
        projectId,
        employeeId,
        projectRole: String(body.projectRole || 'PROJECT_MEMBER'),
        raciRole: body.projectRole === 'TEAM_LEAD' ? 'A' : 'R',
        allocationPercent: Math.min(100, Math.max(5, Number(body.allocationPercent || 100))),
        assignedStartDate,
        targetCompletionDate,
        slaStatus,
      },
      include: {
        employee: { select: { id: true, legalName: true, employeeNumber: true, jobTitle: true } },
      },
    });

    if (body.projectRole === 'TEAM_LEAD') {
      await prisma.project.update({
        where: { id: projectId },
        data: { teamLeadId: employeeId },
      });
    }

    await logProjectAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: defaultOrgId,
      targetType: 'PROJECT_MEMBER',
      targetId: member.id,
      action: 'STAFF_TIMELINE_SET',
      metadata: { projectId, employeeId, targetCompletionDate, projectRole: member.projectRole },
    });

    return NextResponse.json(serializeBigInt({ success: true, member }));
  } catch (error) {
    console.error('POST /api/projects/staff-timelines error:', error);
    return NextResponse.json({ error: 'Failed to assign staff timeline.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    const body = await req.json();
    const memberId = String(body.memberId || '');
    const action = String(body.action || 'UPDATE');
    if (!memberId) return NextResponse.json({ error: 'memberId is required.' }, { status: 400 });

    const existing = await prisma.projectMember.findUnique({
      where: { id: memberId },
      include: { project: true, employee: { select: { id: true, legalName: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Staff assignment not found.' }, { status: 404 });

    if (action === 'MARK_COMPLETED') {
      if (!isExecutive && existing.employeeId !== actor.id && existing.project.teamLeadId !== actor.id) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
      }
      const now = new Date();
      const slaStatus = computeSlaStatus(existing.targetCompletionDate, now);
      const updated = await prisma.projectMember.update({
        where: { id: memberId },
        data: { completedAt: now, slaStatus },
      });
      return NextResponse.json(serializeBigInt({ success: true, member: updated }));
    }

    if (action === 'FLAG_DEDUCTION') {
      if (!isExecutive) {
        return NextResponse.json(
          { error: 'Only GMD or Super Admin can flag payroll deductions for missed project timelines.' },
          { status: 403 }
        );
      }
      const amountNgn = Math.max(0, Number(body.deductionAmountNgn || 0));
      const amountMinor = BigInt(Math.round(amountNgn * 100));
      const reason = String(
        body.reason ||
          `Project SLA / deadline breach on ${existing.project.projectCode} (${existing.project.title}). Target: ${existing.targetCompletionDate || 'N/A'}`
      ).trim();

      let deductionAdjustmentId = existing.deductionAdjustmentId;
      if (amountMinor > BigInt(0)) {
        const adj = await prisma.payrollDeductionAdjustment.create({
          data: {
            organizationId: existing.project.organizationId,
            employeeId: existing.employeeId,
            category: 'OTHER',
            direction: 'DEDUCTION',
            amountMinor,
            reason,
            status: 'PROPOSED',
            proposedById: actor.id,
          },
        });
        deductionAdjustmentId = adj.id;
      }

      const updated = await prisma.projectMember.update({
        where: { id: memberId },
        data: {
          salaryDeductionFlagged: true,
          proposedDeductionMinor: amountMinor,
          performanceImpactNote: reason,
          deductionAdjustmentId,
        },
      });

      await logProjectAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: existing.project.organizationId,
        subsidiaryId: existing.project.organizationId,
        targetType: 'PROJECT_MEMBER',
        targetId: memberId,
        action: 'SLA_DEDUCTION_FLAGGED',
        metadata: { employeeId: existing.employeeId, amountNgn, deductionAdjustmentId },
      });

      return NextResponse.json(serializeBigInt({ success: true, member: updated }));
    }

    const nextTarget =
      body.targetCompletionDate !== undefined
        ? body.targetCompletionDate
          ? String(body.targetCompletionDate)
          : null
        : existing.targetCompletionDate;
    const nextStart =
      body.assignedStartDate !== undefined
        ? body.assignedStartDate
          ? String(body.assignedStartDate)
          : null
        : existing.assignedStartDate;
    const slaStatus = computeSlaStatus(nextTarget, existing.completedAt);

    const updated = await prisma.projectMember.update({
      where: { id: memberId },
      data: {
        assignedStartDate: nextStart,
        targetCompletionDate: nextTarget,
        projectRole: body.projectRole !== undefined ? String(body.projectRole) : existing.projectRole,
        performanceImpactNote:
          body.performanceImpactNote !== undefined ? String(body.performanceImpactNote) : existing.performanceImpactNote,
        slaStatus,
      },
    });

    return NextResponse.json(serializeBigInt({ success: true, member: updated }));
  } catch (error) {
    console.error('PATCH /api/projects/staff-timelines error:', error);
    return NextResponse.json({ error: 'Failed to update staff timeline.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { searchParams } = new URL(req.url);
    const memberId = String(searchParams.get('memberId') || '');
    if (!memberId) return NextResponse.json({ error: 'memberId is required.' }, { status: 400 });

    await prisma.projectMember.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/staff-timelines error:', error);
    return NextResponse.json({ error: 'Failed to remove staff assignment.' }, { status: 500 });
  }
}

