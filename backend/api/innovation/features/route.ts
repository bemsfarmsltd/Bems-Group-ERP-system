import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import {
  resolveInnovationContext,
  canApproveProductGate,
  APPROVAL_GATED_FEATURE_STAGES,
  computeRiceScore,
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
    const stage = searchParams.get('stage') || '';
    const horizon = searchParams.get('horizon') || '';

    const where: Record<string, any> = {};
    if (ctx.useSubFilter && ctx.allowedSubIds.length > 0) {
      where.organizationId = { in: ctx.allowedSubIds };
    }
    if (productId) where.productId = productId;
    if (stage) where.workflowStage = stage;
    if (horizon) where.roadmapHorizon = horizon;

    const features = await prisma.productFeature.findMany({
      where,
      orderBy: [{ manualOverrideRank: 'asc' }, { computedRiceScore: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ features });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load features.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();

    // 1. Create Roadmap Item (Section 16)
    if (body.entityType === 'ROADMAP_ITEM') {
      const prod = await prisma.product.findUnique({ where: { id: String(body.productId || '') } });
      if (!prod) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

      const item = await prisma.productRoadmapItem.create({
        data: {
          organizationId: prod.organizationId,
          productId: prod.id,
          featureId: body.featureId || null,
          title: String(body.title || '').trim(),
          horizon: body.horizon || 'NOW',
          quarterLabel: body.quarterLabel || 'Q4 2026',
          commitmentLevel: body.commitmentLevel || 'TENTATIVE',
          startDate: body.startDate ? new Date(body.startDate) : new Date(),
          targetDate: body.targetDate ? new Date(body.targetDate) : new Date(Date.now() + 30 * 86400000),
          baselineDate: body.targetDate ? new Date(body.targetDate) : new Date(Date.now() + 30 * 86400000),
          status: body.status || 'PLANNED',
          dependenciesNote: body.dependenciesNote || null,
          ownerName: body.ownerName || ctx.actor.legalName,
          isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : true,
        },
      });
      return NextResponse.json({ roadmapItem: item }, { status: 201 });
    }

    // 2. Create Feature / Product Board Card (Sections 5, 14, 15, 43)
    const productId = String(body.productId || '');
    const prod = await prisma.product.findUnique({ where: { id: productId } });
    if (!prod) return NextResponse.json({ error: 'Select a valid Product for this feature.' }, { status: 400 });

    const title = String(body.title || '').trim();
    const problemStatement = String(body.problemStatement || body.problem || body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'Feature title is required.' }, { status: 400 });

    const reach = Number(body.riceReach ?? 500);
    const impact = Number(body.riceImpact ?? 2.0);
    const confidence = Number(body.riceConfidence ?? 80);
    const effort = Number(body.riceEffort ?? 2.0);
    const computedRiceScore = computeRiceScore(reach, impact, confidence, effort);

    const requestedStage = String(body.workflowStage || 'IDEA').toUpperCase();
    // Section 5 & 43: Staff cannot create or drag a feature directly into APPROVED or RELEASED without authority
    let initialStage = requestedStage;
    if (APPROVAL_GATED_FEATURE_STAGES.has(requestedStage)) {
      const canApprove = await canApproveProductGate(ctx.actor, prod.id, 'FEATURE_APPROVAL');
      if (!canApprove) initialStage = 'PRIORITIZED';
    }

    const featureCode = await generateInnovationCode('FEAT', 'productFeature', 'featureCode');
    const feature = await prisma.productFeature.create({
      data: {
        featureCode,
        organizationId: prod.organizationId,
        productId: prod.id,
        sourceIdeaId: body.sourceIdeaId || null,
        opportunityId: body.opportunityId || null,
        sourceCanvasObjId: body.sourceCanvasObjId || null,
        title,
        problemStatement,
        valueProposition: body.valueProposition || null,
        intendedUser: body.intendedUser || 'Product Users',
        theme: body.theme || prod.category,
        initiative: body.initiative || null,
        workflowStage: initialStage,
        priority: body.priority || 'HIGH',
        moscowCategory: body.moscowCategory || 'MUST_HAVE',
        mvpBucket: body.mvpBucket || 'MUST_HAVE',
        roadmapHorizon: body.roadmapHorizon || 'NOW',
        isCommitted: Boolean(body.isCommitted),
        targetReleaseCode: body.targetReleaseCode || null,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        acceptanceCriteria: body.acceptanceCriteria || null,
        dependenciesJson: body.dependencies ? JSON.stringify(body.dependencies) : null,
        evidenceSummary: body.evidenceSummary || null,
        riceReach: reach,
        riceImpact: impact,
        riceConfidence: confidence,
        riceEffort: effort,
        computedRiceScore,
        iceScore: Number(body.iceScore ?? 7.8),
        weightedScore: Number(body.weightedScore ?? 82),
        scoredById: ctx.actor.id,
        scoredAt: new Date(),
        ownerId: body.ownerId || ctx.actor.id,
        ownerName: body.ownerName || ctx.actor.legalName,
      },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'FEATURE_CREATED',
      targetType: 'ProductFeature',
      targetId: feature.id,
      subsidiaryId: prod.organizationId,
      metadata: { featureCode, title: feature.title, computedRiceScore },
    });

    return NextResponse.json({ feature }, { status: 201 });
  } catch (error: any) {
    console.error('[Innovation Features POST] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not create feature.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const featureId = String(body.id || body.featureId || '');
    const feature = await prisma.productFeature.findUnique({ where: { id: featureId } });
    if (!feature) return NextResponse.json({ error: 'Feature not found.' }, { status: 404 });

    const action = String(body.action || 'UPDATE').toUpperCase();

    // 1. Idempotent Engineering Handoff to Project Management (Section 22 & 62)
    if (action === 'ENGINEERING_HANDOFF') {
      // If already linked to a ProjectWorkItem, return existing link (Idempotent rule — Section 22)
      if (feature.linkedWorkItemId) {
        const existingWi = await prisma.projectWorkItem.findUnique({
          where: { id: feature.linkedWorkItemId },
        }).catch(() => null);
        if (existingWi) {
          return NextResponse.json({
            feature,
            workItem: existingWi,
            idempotentExisting: true,
            message: `Feature ${feature.featureCode} is already linked to Project Epic ${existingWi.itemKey}.`,
          });
        }
      }

      // Section 17 & 22: Development handoff references a specific approved PRD version
      let prdId = body.prdId || feature.linkedPrdId;
      let prdVersion = body.prdVersion || feature.linkedPrdVersion || 1;
      if (!prdId) {
        const latestApprovedPrd = await prisma.productRequirementDoc.findFirst({
          where: { productId: feature.productId },
          orderBy: { updatedAt: 'desc' },
        });
        if (latestApprovedPrd) {
          prdId = latestApprovedPrd.id;
          prdVersion = latestApprovedPrd.approvedVersion || latestApprovedPrd.currentVersion;
        }
      }

      // Find or create a target Project in Project Management
      let project = await prisma.project.findFirst({
        where: { organizationId: feature.organizationId },
        orderBy: { createdAt: 'asc' },
      }).catch(() => null);
      if (!project) {
        project = await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
      }

      let createdWorkItem: any = null;
      let workItemKey = `EPIC-${feature.featureCode}`;

      if (project) {
        const count = await prisma.projectWorkItem.count({ where: { projectId: project.id } }).catch(() => 0);
        workItemKey = `${project.projectCode || 'PM'}-${count + 101}`;
        createdWorkItem = await prisma.projectWorkItem.create({
          data: {
            projectId: project.id,
            organizationId: project.organizationId,
            itemKey: workItemKey,
            title: `[Product Feature ${feature.featureCode}] ${feature.title}`,
            description: `Problem: ${feature.problemStatement}\nValue Proposition: ${feature.valueProposition || ''}\nAcceptance Criteria: ${feature.acceptanceCriteria || 'See linked PRD v' + prdVersion}`,
            itemType: 'EPIC',
            status: 'TODO',
            priority: feature.priority === 'CRITICAL' ? 'URGENT' : feature.priority,
            assigneeId: feature.ownerId,
            reporterId: ctx.actor.id,
          },
        }).catch(() => null);
      }

      const updatedFeature = await prisma.productFeature.update({
        where: { id: feature.id },
        data: {
          linkedPrdId: prdId || feature.linkedPrdId,
          linkedPrdVersion: Number(prdVersion),
          linkedWorkItemId: createdWorkItem?.id || `pm-epic-${feature.featureCode}`,
          linkedWorkItemCode: createdWorkItem?.itemKey || workItemKey,
          engineeringStatus: 'EPIC_LINKED',
          workflowStage:
            ['IDEA', 'DISCOVERY', 'VALIDATED', 'PRIORITIZED', 'APPROVED'].includes(feature.workflowStage)
              ? 'DEVELOPMENT_READY'
              : feature.workflowStage,
          progressPercent: Math.max(feature.progressPercent, 25),
          version: feature.version + 1,
        },
      });

      await logInnovationAudit({
        actor: ctx.actor,
        action: 'FEATURE_HANDED_OFF_TO_ENGINEERING',
        targetType: 'ProductFeature',
        targetId: feature.id,
        subsidiaryId: feature.organizationId,
        metadata: {
          featureCode: feature.featureCode,
          linkedPrdId: prdId,
          linkedPrdVersion: prdVersion,
          linkedWorkItemCode: updatedFeature.linkedWorkItemCode,
        },
      });

      return NextResponse.json({
        feature: updatedFeature,
        workItem: createdWorkItem,
        idempotentExisting: false,
      });
    }

    // 2. Workflow Stage Transition Validation (Section 5 & 43)
    if (body.workflowStage && body.workflowStage !== feature.workflowStage) {
      const targetStage = String(body.workflowStage).toUpperCase();
      if (APPROVAL_GATED_FEATURE_STAGES.has(targetStage)) {
        const canApprove = await canApproveProductGate(ctx.actor, feature.productId, 'FEATURE_APPROVAL');
        if (!canApprove) {
          return NextResponse.json(
            {
              error: `Workflow Transition Blocked: Moving "${feature.title}" into ${targetStage} requires Product Owner or GMD approval authority.`,
            },
            { status: 403 }
          );
        }
      }
    }

    // 3. Recompute RICE Score Without Overwriting Original Computed Score When Manager Override Is Set (Section 15)
    const nextReach = body.riceReach !== undefined ? Number(body.riceReach) : feature.riceReach;
    const nextImpact = body.riceImpact !== undefined ? Number(body.riceImpact) : feature.riceImpact;
    const nextConf = body.riceConfidence !== undefined ? Number(body.riceConfidence) : feature.riceConfidence;
    const nextEffort = body.riceEffort !== undefined ? Number(body.riceEffort) : feature.riceEffort;
    const nextComputedRice = computeRiceScore(nextReach, nextImpact, nextConf, nextEffort);

    const updated = await prisma.productFeature.update({
      where: { id: feature.id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : undefined,
        problemStatement: body.problemStatement !== undefined ? String(body.problemStatement).trim() : undefined,
        valueProposition: body.valueProposition !== undefined ? body.valueProposition : undefined,
        intendedUser: body.intendedUser !== undefined ? body.intendedUser : undefined,
        theme: body.theme !== undefined ? body.theme : undefined,
        initiative: body.initiative !== undefined ? body.initiative : undefined,
        workflowStage: body.workflowStage ? String(body.workflowStage).toUpperCase() : undefined,
        priority: body.priority || undefined,
        moscowCategory: body.moscowCategory || undefined,
        mvpBucket: body.mvpBucket || undefined,
        roadmapHorizon: body.roadmapHorizon || undefined,
        isCommitted: body.isCommitted !== undefined ? Boolean(body.isCommitted) : undefined,
        targetReleaseCode: body.targetReleaseCode !== undefined ? body.targetReleaseCode : undefined,
        targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
        acceptanceCriteria: body.acceptanceCriteria !== undefined ? body.acceptanceCriteria : undefined,
        riceReach: nextReach,
        riceImpact: nextImpact,
        riceConfidence: nextConf,
        riceEffort: nextEffort,
        computedRiceScore: nextComputedRice,
        iceScore: body.iceScore !== undefined ? Number(body.iceScore) : undefined,
        weightedScore: body.weightedScore !== undefined ? Number(body.weightedScore) : undefined,
        manualOverrideRank: body.manualOverrideRank !== undefined ? (body.manualOverrideRank === null ? null : Number(body.manualOverrideRank)) : undefined,
        overrideReason: body.overrideReason !== undefined ? body.overrideReason : undefined,
        scoredById: body.riceReach !== undefined || body.manualOverrideRank !== undefined ? ctx.actor.id : undefined,
        scoredAt: body.riceReach !== undefined || body.manualOverrideRank !== undefined ? new Date() : undefined,
        engineeringStatus: body.engineeringStatus || undefined,
        progressPercent: body.progressPercent !== undefined ? Number(body.progressPercent) : undefined,
        decisionReason: body.decisionReason !== undefined ? body.decisionReason : undefined,
        version: feature.version + 1,
      },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'FEATURE_UPDATED',
      targetType: 'ProductFeature',
      targetId: updated.id,
      subsidiaryId: updated.organizationId,
      metadata: {
        featureCode: updated.featureCode,
        workflowStage: updated.workflowStage,
        computedRiceScore: updated.computedRiceScore,
        manualOverrideRank: updated.manualOverrideRank,
      },
    });

    return NextResponse.json({ feature: updated });
  } catch (error: any) {
    console.error('[Innovation Features PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not update feature.' }, { status: 500 });
  }
}
