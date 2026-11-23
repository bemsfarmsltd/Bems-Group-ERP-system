import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import {
  resolveInnovationContext,
  generateInnovationCode,
  logInnovationAudit,
} from '@/lib/innovationRouteHelper';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId') || '';

    const where: Record<string, any> = {};
    if (ctx.useSubFilter && ctx.allowedSubIds.length > 0) {
      where.organizationId = { in: ctx.allowedSubIds };
    }
    if (productId) where.productId = productId;

    const [opportunities, feedbackItems, researchRecords] = await Promise.all([
      prisma.productOpportunity.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.customerFeedbackInsight.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.productResearchRecord.findMany({ where, orderBy: { createdAt: 'desc' } }),
    ]);

    return NextResponse.json({ opportunities, feedbackItems, researchRecords });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load discovery records.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const entityType = String(body.entityType || 'OPPORTUNITY').toUpperCase();

    let orgId = body.organizationId;
    if (!orgId && body.productId) {
      const prod = await prisma.product.findUnique({ where: { id: String(body.productId) } });
      orgId = prod?.organizationId;
    }
    if (!orgId) {
      orgId =
        ctx.allowedSubIds[0] ||
        (await prisma.organization.findFirst({ where: { status: 'ACTIVE' } }))?.id;
    }

    // 1. Customer & Staff Product Feedback / Quality Report (Sections 10, 26, 50)
    if (entityType === 'FEEDBACK') {
      const feedbackCode = await generateInnovationCode('FB', 'customerFeedbackInsight', 'feedbackCode');
      const fb = await prisma.customerFeedbackInsight.create({
        data: {
          feedbackCode,
          organizationId: String(orgId),
          productId: body.productId || null,
          sourceChannel: body.sourceChannel || (ctx.isStaff ? 'STAFF_APP' : 'SUPPORT'),
          category: body.category || 'FEATURE_REQUEST', // BUG | USABILITY | FEATURE_REQUEST | PRAISE | PERFORMANCE | COMPLIANCE | PROCESS_IMPROVEMENT
          title: String(body.title || '').trim(),
          description: String(body.description || '').trim(),
          stepsToReproduce: body.stepsToReproduce || null,
          expectedOutcome: body.expectedOutcome || null,
          customerSegment: body.customerSegment || 'Internal Staff & Operators',
          themeTag: body.themeTag || null,
          severity: body.severity || 'MEDIUM',
          status: 'NEW',
          reporterId: ctx.actor.id,
          reporterName: ctx.actor.legalName,
          linkedFeatureId: body.linkedFeatureId || null,
          linkedOppId: body.linkedOppId || null,
        },
      });
      await logInnovationAudit({
        actor: ctx.actor,
        action: 'FEEDBACK_RECORDED',
        targetType: 'CustomerFeedbackInsight',
        targetId: fb.id,
        subsidiaryId: fb.organizationId,
        metadata: { feedbackCode: fb.feedbackCode, category: fb.category },
      });
      return NextResponse.json({ feedback: fb }, { status: 201 });
    }

    // 2. Research, Competitor Analysis, Persona, or Journey Map (Sections 11, 19, 44)
    if (entityType === 'RESEARCH') {
      const researchCode = await generateInnovationCode('RES', 'productResearchRecord', 'researchCode');
      const rec = await prisma.productResearchRecord.create({
        data: {
          researchCode,
          organizationId: String(orgId),
          productId: body.productId || null,
          researchType: body.researchType || 'USER_INTERVIEW', // USER_INTERVIEW | COMPETITOR_ANALYSIS | MARKET_TREND | USABILITY_STUDY | PERSONA | JOURNEY_MAP
          title: String(body.title || '').trim(),
          researchQuestion: String(body.researchQuestion || body.title || '').trim(),
          methodology: body.methodology || null,
          competitorName: body.competitorName || null,
          personaProfileJson: body.personaProfile ? JSON.stringify(body.personaProfile) : null,
          journeyStagesJson: body.journeyStages ? JSON.stringify(body.journeyStages) : null,
          capabilityMatrixJson: body.capabilityMatrix ? JSON.stringify(body.capabilityMatrix) : null,
          findingsSummary: body.findingsSummary || null,
          sourcesVerifiedAt: new Date(),
          consentObtained: body.consentObtained !== undefined ? Boolean(body.consentObtained) : true,
          isConfidential: Boolean(body.isConfidential),
          assigneeId: body.assigneeId || ctx.actor.id,
          assigneeName: body.assigneeName || ctx.actor.legalName,
          reviewerId: body.reviewerId || null,
          status: body.findingsSummary ? 'SUBMITTED' : 'ASSIGNED',
          linkedOppId: body.linkedOppId || null,
          linkedFeatureId: body.linkedFeatureId || null,
          dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 7 * 86400000),
        },
      });
      return NextResponse.json({ research: rec }, { status: 201 });
    }

    // 3. Discovery Opportunity Card (Section 9)
    const opportunityCode = await generateInnovationCode('OPP', 'productOpportunity', 'opportunityCode');
    const opp = await prisma.productOpportunity.create({
      data: {
        opportunityCode,
        organizationId: String(orgId),
        productId: body.productId || null,
        parentOpportunityId: body.parentOpportunityId || null,
        sourceIdeaId: body.sourceIdeaId || null,
        title: String(body.title || '').trim(),
        problemStatement: String(body.problemStatement || body.title || '').trim(),
        targetOutcome: body.targetOutcome || null,
        targetPersona: body.targetPersona || null,
        assumptions: body.assumptions || null,
        hypothesis: body.hypothesis || null,
        investigationPlan: body.investigationPlan || null,
        evidenceSummary: body.evidenceSummary || null,
        confidenceScore: Number(body.confidenceScore ?? 75),
        strategicAlignment: Number(body.strategicAlignment ?? 85),
        addressableUsers: body.addressableUsers || null,
        potentialImpact: body.potentialImpact || 'HIGH',
        feasibility: body.feasibility || 'HIGH',
        stage: body.stage || 'PROBLEM_IDENTIFIED',
        decision: body.decision || 'PENDING',
        decisionRationale: body.decisionRationale || null,
        ownerId: ctx.actor.id,
        ownerName: ctx.actor.legalName,
      },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'OPPORTUNITY_CREATED',
      targetType: 'ProductOpportunity',
      targetId: opp.id,
      subsidiaryId: opp.organizationId,
      metadata: { opportunityCode, title: opp.title },
    });

    return NextResponse.json({ opportunity: opp }, { status: 201 });
  } catch (error: any) {
    console.error('[Innovation Discovery POST] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not create discovery record.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const entityType = String(body.entityType || 'OPPORTUNITY').toUpperCase();

    // 1. Update Research Findings / Supervisor Review (Section 44)
    if (entityType === 'RESEARCH') {
      const rec = await prisma.productResearchRecord.update({
        where: { id: String(body.id || body.researchId) },
        data: {
          findingsSummary: body.findingsSummary !== undefined ? body.findingsSummary : undefined,
          methodology: body.methodology !== undefined ? body.methodology : undefined,
          status: body.status || 'SUBMITTED',
          consentObtained: body.consentObtained !== undefined ? Boolean(body.consentObtained) : undefined,
          sourcesVerifiedAt: new Date(),
        },
      });
      return NextResponse.json({ research: rec });
    }

    // 2. Route Confirmed Feedback Bug to Engineering or Update Status (Section 26 & 50)
    if (entityType === 'FEEDBACK') {
      const fbId = String(body.id || body.feedbackId);
      const existing = await prisma.customerFeedbackInsight.findUnique({ where: { id: fbId } });
      if (!existing) return NextResponse.json({ error: 'Feedback record not found.' }, { status: 404 });

      let linkedWorkItemId = existing.linkedWorkItemId;
      if (body.routeToEngineering && !linkedWorkItemId) {
        const proj = await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
        if (proj) {
          const count = await prisma.projectWorkItem.count({ where: { projectId: proj.id } }).catch(() => 0);
          const itemKey = `${proj.projectCode || 'BUG'}-${count + 201}`;
          const wi = await prisma.projectWorkItem.create({
            data: {
              projectId: proj.id,
              organizationId: proj.organizationId,
              itemKey,
              title: `[Product Feedback ${existing.feedbackCode}] ${existing.title}`,
              description: `${existing.description}\nSteps: ${existing.stepsToReproduce || 'N/A'}`,
              itemType: existing.category === 'BUG' ? 'BUG' : 'TASK',
              status: 'TODO',
              priority: existing.severity === 'CRITICAL' ? 'URGENT' : existing.severity,
              reporterId: ctx.actor.id,
            },
          }).catch(() => null);
          linkedWorkItemId = wi?.itemKey || `BUG-${existing.feedbackCode}`;
        }
      }

      const updated = await prisma.customerFeedbackInsight.update({
        where: { id: existing.id },
        data: {
          status: body.routeToEngineering ? 'ROUTED_TO_ENGINEERING' : (body.status || undefined),
          resolutionNote: body.resolutionNote !== undefined ? body.resolutionNote : undefined,
          linkedFeatureId: body.linkedFeatureId !== undefined ? body.linkedFeatureId : undefined,
          linkedWorkItemId,
        },
      });
      return NextResponse.json({ feedback: updated });
    }

    // 3. Update Opportunity Stage / Decision (Section 9)
    const opp = await prisma.productOpportunity.update({
      where: { id: String(body.id || body.opportunityId) },
      data: {
        stage: body.stage || undefined,
        decision: body.decision || undefined,
        decisionRationale: body.decisionRationale !== undefined ? body.decisionRationale : undefined,
        confidenceScore: body.confidenceScore !== undefined ? Number(body.confidenceScore) : undefined,
        evidenceSummary: body.evidenceSummary !== undefined ? body.evidenceSummary : undefined,
        hypothesis: body.hypothesis !== undefined ? body.hypothesis : undefined,
        reviewDate: new Date(),
      },
    });
    return NextResponse.json({ opportunity: opp });
  } catch (error: any) {
    console.error('[Innovation Discovery PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not update discovery record.' }, { status: 500 });
  }
}
