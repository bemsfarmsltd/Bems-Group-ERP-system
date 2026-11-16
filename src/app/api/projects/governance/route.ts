import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext, logProjectAudit, serializeBigInt } from '@/lib/projectRouteHelper';

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'CREATE_RISK') {
      const projectId = String(body.projectId || '');
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      if (!projectId || !title || !description) {
        return NextResponse.json({ error: 'Project, title, and description are required.' }, { status: 400 });
      }
      const count = await prisma.projectRisk.count();
      const riskCode = `RSK-${String(count + 1).padStart(4, '0')}`;
      const risk = await prisma.projectRisk.create({
        data: {
          riskCode,
          projectId,
          recordType: String(body.recordType || 'RISK'),
          title,
          description,
          category: String(body.category || 'OPERATIONAL'),
          probability: String(body.probability || 'MEDIUM'),
          impact: String(body.impact || 'MEDIUM'),
          severity: String(body.severity || 'MEDIUM'),
          ownerId: body.ownerId ? String(body.ownerId) : actor.id,
          mitigationPlan: body.mitigationPlan ? String(body.mitigationPlan) : null,
          contingencyPlan: body.contingencyPlan ? String(body.contingencyPlan) : null,
          reviewDate: body.reviewDate ? String(body.reviewDate) : null,
        },
      });
      return NextResponse.json({ success: true, risk });
    }

    if (action === 'DECIDE_APPROVAL') {
      const approvalId = String(body.approvalId || '');
      const decision = String(body.decision || ''); // APPROVED | REJECTED | REVISION_REQUESTED
      const decisionNote = body.decisionNote ? String(body.decisionNote).trim() : null;
      const approval = await prisma.projectApproval.findUnique({
        where: { id: approvalId },
        include: { project: true },
      });
      if (!approval) return NextResponse.json({ error: 'Approval record not found.' }, { status: 404 });

      if (approval.requestedById === actor.id && !isExecutive) {
        return NextResponse.json({ error: 'Requesters cannot approve their own submission.' }, { status: 403 });
      }
      if (!isExecutive && approval.reviewerId !== actor.id) {
        return NextResponse.json({ error: 'Only an executive or assigned reviewer can decide this approval.' }, { status: 403 });
      }

      const updated = await prisma.projectApproval.update({
        where: { id: approvalId },
        data: {
          status: decision,
          reviewerId: actor.id,
          decisionNote,
          decidedAt: new Date(),
        },
      });

      if (approval.category === 'PROJECT_AUTH' && decision === 'APPROVED') {
        await prisma.project.update({
          where: { id: approval.projectId },
          data: {
            status: 'APPROVED_PLANNED',
            approvedBudgetMinor: approval.project.proposedBudgetMinor,
            version: { increment: 1 },
          },
        });
      } else if (approval.category === 'PROJECT_AUTH' && decision === 'REJECTED') {
        await prisma.project.update({
          where: { id: approval.projectId },
          data: { status: 'REJECTED', version: { increment: 1 } },
        });
      }

      await logProjectAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: approval.project.organizationId,
        subsidiaryId: approval.project.organizationId,
        targetType: 'PROJECT_APPROVAL',
        targetId: approvalId,
        action: `APPROVAL_${decision}`,
        metadata: { projectId: approval.projectId, category: approval.category },
      });

      return NextResponse.json(serializeBigInt({ success: true, approval: updated }));
    }

    if (action === 'RESOLVE_RISK') {
      const id = String(body.id || '');
      const status = String(body.status || 'RESOLVED');
      const risk = await prisma.projectRisk.update({
        where: { id },
        data: { status },
      });
      return NextResponse.json({ success: true, risk });
    }

    return NextResponse.json({ error: 'Unsupported governance action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/projects/governance error:', error);
    return NextResponse.json({ error: 'Failed to process governance action.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;

    const body = await req.json();
    const action = String(body.action || 'UPDATE_GOAL');

    if (action === 'UPDATE_GOAL') {
      const id = String(body.id || '');
      if (!id) return NextResponse.json({ error: 'Goal id is required.' }, { status: 400 });
      const goal = await prisma.projectGoal.update({
        where: { id },
        data: {
          currentValue: body.currentValue !== undefined ? Number(body.currentValue) : undefined,
          targetValue: body.targetValue !== undefined ? Number(body.targetValue) : undefined,
        },
      });
      return NextResponse.json({ success: true, goal });
    }

    if (action === 'LINK_PROJECT_GOAL') {
      const projectId = String(body.projectId || '');
      if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
      const project = await prisma.project.update({
        where: { id: projectId },
        data: {
          goalId: body.goalId !== undefined ? (body.goalId ? String(body.goalId) : null) : undefined,
          portfolioId: body.portfolioId !== undefined ? (body.portfolioId ? String(body.portfolioId) : null) : undefined,
        },
      });
      return NextResponse.json(serializeBigInt({ success: true, project }));
    }

    return NextResponse.json({ error: 'Unsupported governance patch.' }, { status: 400 });
  } catch (error) {
    console.error('PATCH /api/projects/governance error:', error);
    return NextResponse.json({ error: 'Failed to update governance record.' }, { status: 500 });
  }
}

