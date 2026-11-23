import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import {
  resolveInnovationContext,
  generateInnovationCode,
  computeRiceScore,
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
    const status = searchParams.get('status') || '';
    const mineOnly = searchParams.get('mine') === 'true';

    const where: Record<string, any> = {};
    if (ctx.useSubFilter && ctx.allowedSubIds.length > 0) {
      where.organizationId = { in: ctx.allowedSubIds };
    }
    if (productId) where.productId = productId;
    if (status) where.status = status;
    if (mineOnly) where.submitterId = ctx.actor.id;

    const ideas = await prisma.productIdea.findMany({
      where,
      orderBy: [{ votesCount: 'desc' }, { createdAt: 'desc' }],
    });

    // Section 8 & 42: Suppress confidential restricted reviewer notes for ordinary staff
    const canViewRestricted = ctx.isExecutive || !ctx.isStaff;

    return NextResponse.json({
      ideas: ideas.map((i) => ({
        ...i,
        restrictedNote: canViewRestricted ? i.restrictedNote : null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load ideas.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();

    // Section 40 & 55: Idempotent submission — submitting twice after a network retry must not create duplicates
    const clientSubmissionId = body.clientSubmissionId ? String(body.clientSubmissionId).trim() : null;
    if (clientSubmissionId) {
      const existingByClientKey = await prisma.productIdea.findUnique({
        where: { clientSubmissionId },
      });
      if (existingByClientKey) {
        return NextResponse.json({ idea: existingByClientKey, deduplicated: true }, { status: 200 });
      }
    }

    const title = String(body.title || '').trim();
    const problemStatement = String(body.problemStatement || body.problem || body.description || '').trim();
    if (!title || !problemStatement) {
      return NextResponse.json(
        { error: 'Idea title and user problem statement are required.' },
        { status: 400 }
      );
    }

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

    const ideaNumber = await generateInnovationCode('IDEA', 'productIdea', 'ideaNumber');
    const idea = await prisma.productIdea.create({
      data: {
        ideaNumber,
        organizationId: String(orgId),
        productId: body.productId || null,
        title,
        description: String(body.description || problemStatement).trim(),
        category: body.category || 'NEW_CAPABILITY',
        targetUsers: body.targetUsers || 'BEMS Users & Operations',
        problemStatement,
        expectedValue: body.expectedValue || body.proposedOutcome || null,
        strategicTheme: body.strategicTheme || null,
        urgency: body.urgency || 'MEDIUM',
        sourceType: body.sourceType || (ctx.isStaff ? 'STAFF_SUBMISSION' : 'EXECUTIVE'),
        sourceCanvasId: body.sourceCanvasId || null,
        sourceObjectId: body.sourceObjectId || null,
        evidenceLinksJson: body.evidenceLinks ? JSON.stringify(body.evidenceLinks) : null,
        attachmentsJson: body.attachments ? JSON.stringify(body.attachments) : null,
        assumptions: body.assumptions || null,
        submitterId: ctx.actor.id,
        submitterName: ctx.actor.legalName,
        status: body.isDraft ? 'DRAFT' : 'SUBMITTED',
        votesCount: 1,
        voterIdsJson: JSON.stringify([ctx.actor.id]),
        clientSubmissionId,
      },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'IDEA_SUBMITTED',
      targetType: 'ProductIdea',
      targetId: idea.id,
      subsidiaryId: idea.organizationId,
      metadata: { ideaNumber: idea.ideaNumber, title: idea.title, status: idea.status },
    });

    return NextResponse.json({ idea }, { status: 201 });
  } catch (error: any) {
    console.error('[Innovation Ideas POST] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not submit idea.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const ideaId = String(body.id || body.ideaId || '');
    const idea = await prisma.productIdea.findUnique({ where: { id: ideaId } });
    if (!idea) return NextResponse.json({ error: 'Idea record not found.' }, { status: 404 });

    const action = String(body.action || 'UPDATE').toUpperCase();

    // 1. Controlled Voting with Single-Vote-Per-Employee Protection (Section 42)
    if (action === 'VOTE') {
      let voterIds: string[] = [];
      try {
        voterIds = idea.voterIdsJson ? JSON.parse(idea.voterIdsJson) : [];
      } catch {
        voterIds = [];
      }
      const alreadyVoted = voterIds.includes(ctx.actor.id);
      const nextVoters = alreadyVoted
        ? voterIds.filter((id) => id !== ctx.actor.id)
        : [...voterIds, ctx.actor.id];
      const nextCount = Math.max(1, alreadyVoted ? idea.votesCount - 1 : idea.votesCount + 1);

      const updated = await prisma.productIdea.update({
        where: { id: idea.id },
        data: {
          votesCount: nextCount,
          voterIdsJson: JSON.stringify(nextVoters),
        },
      });
      return NextResponse.json({ idea: updated, voted: !alreadyVoted });
    }

    // 2. Submitter Withdrawal of Eligible Idea (Section 40)
    if (action === 'WITHDRAW') {
      if (idea.submitterId !== ctx.actor.id && !ctx.isExecutive) {
        return NextResponse.json({ error: 'Only the submitter or an executive can withdraw this idea.' }, { status: 403 });
      }
      if (['APPROVED', 'CONVERTED'].includes(idea.status)) {
        return NextResponse.json({ error: 'Approved ideas already in product planning cannot be withdrawn.' }, { status: 400 });
      }
      const updated = await prisma.productIdea.update({
        where: { id: idea.id },
        data: {
          status: 'DEFERRED',
          publicDecisionNote: 'Withdrawn by submitter.',
        },
      });
      return NextResponse.json({ idea: updated });
    }

    // 3. Convert Approved Idea to Discovery Opportunity or Feature without destroying originating idea (Section 8)
    if (action === 'CONVERT_TO_OPPORTUNITY') {
      const opportunityCode = await generateInnovationCode('OPP', 'productOpportunity', 'opportunityCode');
      const opp = await prisma.productOpportunity.create({
        data: {
          opportunityCode,
          organizationId: idea.organizationId,
          productId: body.productId || idea.productId,
          sourceIdeaId: idea.id,
          sourceCanvasObjId: idea.sourceObjectId,
          title: idea.title,
          problemStatement: idea.problemStatement,
          targetOutcome: idea.expectedValue || 'Validate problem & quantify impact',
          targetPersona: idea.targetUsers || 'Primary Product Users',
          assumptions: idea.assumptions || 'Initial problem hypothesis from idea intake',
          confidenceScore: Number(body.confidenceScore ?? 75),
          strategicAlignment: 85,
          potentialImpact: idea.urgency === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          feasibility: 'HIGH',
          stage: 'RESEARCH_PLANNED',
          decision: 'PROCEED',
          ownerId: ctx.actor.id,
          ownerName: ctx.actor.legalName,
        },
      });

      const updatedIdea = await prisma.productIdea.update({
        where: { id: idea.id },
        data: {
          status: 'SHORTLISTED',
          convertedOppId: opp.id,
          publicDecisionNote: `Promoted to Discovery Opportunity ${opp.opportunityCode} for validation.`,
          reviewerId: ctx.actor.id,
          reviewerName: ctx.actor.legalName,
          reviewedAt: new Date(),
        },
      });

      await logInnovationAudit({
        actor: ctx.actor,
        action: 'IDEA_CONVERTED_TO_OPPORTUNITY',
        targetType: 'ProductIdea',
        targetId: idea.id,
        subsidiaryId: idea.organizationId,
        metadata: { ideaNumber: idea.ideaNumber, opportunityCode: opp.opportunityCode },
      });

      return NextResponse.json({ idea: updatedIdea, opportunity: opp });
    }

    if (action === 'CONVERT_TO_FEATURE') {
      let targetProductId = body.productId || idea.productId;
      if (!targetProductId) {
        const firstProd = await prisma.product.findFirst({
          where: { organizationId: idea.organizationId, status: 'ACTIVE' },
        });
        targetProductId = firstProd?.id;
      }
      if (!targetProductId) {
        return NextResponse.json({ error: 'Select a target Product before converting an idea to a Feature.' }, { status: 400 });
      }

      const featureCode = await generateInnovationCode('FEAT', 'productFeature', 'featureCode');
      const reach = Number(body.riceReach ?? 500);
      const impact = Number(body.riceImpact ?? 2.0);
      const confidence = Number(body.riceConfidence ?? 80);
      const effort = Number(body.riceEffort ?? 2.0);

      const feature = await prisma.productFeature.create({
        data: {
          featureCode,
          organizationId: idea.organizationId,
          productId: String(targetProductId),
          sourceIdeaId: idea.id,
          sourceCanvasObjId: idea.sourceObjectId,
          title: idea.title,
          problemStatement: idea.problemStatement,
          valueProposition: idea.expectedValue || idea.description,
          intendedUser: idea.targetUsers || 'Product User',
          theme: idea.strategicTheme || idea.category,
          workflowStage: 'DISCOVERY',
          priority: idea.urgency === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          moscowCategory: 'MUST_HAVE',
          roadmapHorizon: 'NEXT',
          riceReach: reach,
          riceImpact: impact,
          riceConfidence: confidence,
          riceEffort: effort,
          computedRiceScore: computeRiceScore(reach, impact, confidence, effort),
          ownerId: ctx.actor.id,
          ownerName: ctx.actor.legalName,
        },
      });

      const updatedIdea = await prisma.productIdea.update({
        where: { id: idea.id },
        data: {
          status: 'APPROVED',
          productId: String(targetProductId),
          convertedFeatureId: feature.id,
          publicDecisionNote: `Approved and converted to Product Feature ${feature.featureCode}.`,
          reviewerId: ctx.actor.id,
          reviewerName: ctx.actor.legalName,
          reviewedAt: new Date(),
        },
      });

      await logInnovationAudit({
        actor: ctx.actor,
        action: 'IDEA_CONVERTED_TO_FEATURE',
        targetType: 'ProductIdea',
        targetId: idea.id,
        subsidiaryId: idea.organizationId,
        metadata: { ideaNumber: idea.ideaNumber, featureCode: feature.featureCode },
      });

      return NextResponse.json({ idea: updatedIdea, feature });
    }

    // 4. Triage / Evaluation / Decision Update
    const updated = await prisma.productIdea.update({
      where: { id: idea.id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : undefined,
        description: body.description !== undefined ? String(body.description).trim() : undefined,
        problemStatement: body.problemStatement !== undefined ? String(body.problemStatement).trim() : undefined,
        expectedValue: body.expectedValue !== undefined ? body.expectedValue : undefined,
        productId: body.productId !== undefined ? body.productId : undefined,
        status: body.status || undefined,
        urgency: body.urgency || undefined,
        rubricScore: body.rubricScore !== undefined ? Number(body.rubricScore) : undefined,
        publicDecisionNote: body.publicDecisionNote !== undefined ? body.publicDecisionNote : undefined,
        restrictedNote: !ctx.isStaff && body.restrictedNote !== undefined ? body.restrictedNote : undefined,
        reviewerId: body.status && body.status !== idea.status ? ctx.actor.id : undefined,
        reviewerName: body.status && body.status !== idea.status ? ctx.actor.legalName : undefined,
        reviewedAt: body.status && body.status !== idea.status ? new Date() : undefined,
      },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'IDEA_UPDATED',
      targetType: 'ProductIdea',
      targetId: updated.id,
      subsidiaryId: updated.organizationId,
      metadata: { ideaNumber: updated.ideaNumber, status: updated.status },
    });

    return NextResponse.json({ idea: updated });
  } catch (error: any) {
    console.error('[Innovation Ideas PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not update idea.' }, { status: 500 });
  }
}
