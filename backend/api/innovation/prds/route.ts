import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import {
  resolveInnovationContext,
  canApproveProductGate,
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

    const [prds, designArtifacts, comments] = await Promise.all([
      prisma.productRequirementDoc.findMany({
        where,
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productDesignArtifact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productComment.findMany({
        where: productId ? { productId } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return NextResponse.json({ prds, designArtifacts, comments });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load PRDs and designs.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const entityType = String(body.entityType || 'PRD').toUpperCase();

    // 1. Add Threaded Comment / Section Annotation (Sections 17, 31, 46)
    if (entityType === 'COMMENT') {
      const comment = await prisma.productComment.create({
        data: {
          organizationId: body.organizationId || ctx.allowedSubIds[0] || 'BEMS_GROUP',
          productId: body.productId || null,
          targetRecordType: String(body.targetRecordType || 'PRD').toUpperCase(),
          targetRecordId: String(body.targetRecordId || ''),
          sectionKey: body.sectionKey || null,
          authorId: ctx.actor.id,
          authorName: ctx.actor.legalName,
          authorRole: ctx.actor.role,
          body: String(body.body || '').trim(),
          isRestrictedNote: !ctx.isStaff && Boolean(body.isRestrictedNote),
          mentionsJson: body.mentions ? JSON.stringify(body.mentions) : null,
        },
      });
      return NextResponse.json({ comment }, { status: 201 });
    }

    // 2. Create Design Artifact / Prototype Review Item (Sections 18 & 47)
    if (entityType === 'DESIGN') {
      const prod = await prisma.product.findUnique({ where: { id: String(body.productId || '') } });
      if (!prod) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

      const designCode = await generateInnovationCode('DSN', 'productDesignArtifact', 'designCode');
      const artifact = await prisma.productDesignArtifact.create({
        data: {
          designCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          featureId: body.featureId || null,
          prdId: body.prdId || null,
          title: String(body.title || '').trim(),
          artifactType: body.artifactType || 'PROTOTYPE',
          externalUrl: body.externalUrl || null,
          previewImageUrl: body.previewImageUrl || null,
          versionLabel: body.versionLabel || 'v1.0',
          workflowStage: body.workflowStage || 'REVIEW',
          designerId: ctx.actor.id,
          designerName: ctx.actor.legalName,
          reviewerId: body.reviewerId || null,
          reviewerName: body.reviewerName || null,
          feedbackNotes: body.feedbackNotes || null,
          accessibilityOk: body.accessibilityOk !== undefined ? Boolean(body.accessibilityOk) : true,
        },
      });
      return NextResponse.json({ designArtifact: artifact }, { status: 201 });
    }

    // 3. Create 14-Section Version-Controlled PRD (Section 17)
    const prod = await prisma.product.findUnique({ where: { id: String(body.productId || '') } });
    if (!prod) return NextResponse.json({ error: 'Select a valid Product for this PRD.' }, { status: 400 });

    const prdCode = await generateInnovationCode('PRD', 'productRequirementDoc', 'prdCode');
    const prd = await prisma.productRequirementDoc.create({
      data: {
        prdCode,
        organizationId: prod.organizationId,
        productId: prod.id,
        featureId: body.featureId || null,
        title: String(body.title || '').trim(),
        currentVersion: 1,
        status: 'DRAFT',
        overview: String(body.overview || body.title || '').trim(),
        problemStatement: String(body.problemStatement || '').trim(),
        targetOutcomes: body.targetOutcomes || null,
        personas: body.personas || null,
        inScope: String(body.inScope || 'Core functional scope').trim(),
        outOfScope: body.outOfScope || null,
        userStories: body.userStories || null,
        userFlows: body.userFlows || null,
        functionalReqs: String(body.functionalReqs || 'FR-1: Defined capability').trim(),
        nonFunctionalReqs: body.nonFunctionalReqs || null,
        dataModelNotes: body.dataModelNotes || null,
        securityPrivacy: body.securityPrivacy || null,
        dependenciesRisks: body.dependenciesRisks || null,
        acceptanceCriteria: String(body.acceptanceCriteria || '1. Passes end-to-end validation').trim(),
        authorId: ctx.actor.id,
        authorName: ctx.actor.legalName,
      },
    });

    await prisma.productRequirementVersion.create({
      data: {
        prdId: prd.id,
        versionNumber: 1,
        status: 'DRAFT',
        snapshotJson: JSON.stringify(prd),
        changeSummary: 'Initial v1 PRD draft created.',
        createdById: ctx.actor.id,
        createdByName: ctx.actor.legalName,
      },
    });

    const fullPrd = await prisma.productRequirementDoc.findUnique({
      where: { id: prd.id },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'PRD_CREATED',
      targetType: 'ProductRequirementDoc',
      targetId: prd.id,
      subsidiaryId: prod.organizationId,
      metadata: { prdCode, title: prd.title, version: 1 },
    });

    return NextResponse.json({ prd: fullPrd }, { status: 201 });
  } catch (error: any) {
    console.error('[Innovation PRDs POST] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not create PRD.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();

    // 1. Update Design Artifact Review Stage
    if (body.entityType === 'DESIGN') {
      const art = await prisma.productDesignArtifact.update({
        where: { id: String(body.id || body.designId) },
        data: {
          workflowStage: body.workflowStage || undefined,
          feedbackNotes: body.feedbackNotes !== undefined ? body.feedbackNotes : undefined,
          accessibilityOk: body.accessibilityOk !== undefined ? Boolean(body.accessibilityOk) : undefined,
          reviewerId: ctx.actor.id,
          reviewerName: ctx.actor.legalName,
          approvedAt: body.workflowStage === 'APPROVED' ? new Date() : undefined,
        },
      });
      return NextResponse.json({ designArtifact: art });
    }

    // 2. Create New Revision or Approve PRD Snapshot (Section 17, 46, 66 — never overwrites approved snapshot v1!)
    const prdId = String(body.id || body.prdId || '');
    const existing = await prisma.productRequirementDoc.findUnique({
      where: { id: prdId },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!existing) return NextResponse.json({ error: 'PRD not found.' }, { status: 404 });

    const isApproveAction = body.action === 'APPROVE_PRD' || body.status === 'APPROVED';
    if (isApproveAction) {
      const canApprove = await canApproveProductGate(ctx.actor, existing.productId, 'PRD_APPROVAL');
      if (!canApprove) {
        return NextResponse.json({ error: 'Forbidden: Approving a PRD snapshot requires GMD or Product Owner authority.' }, { status: 403 });
      }
    }

    // If the current version was already APPROVED and someone edits content, increment versionNumber so v1 approved snapshot remains immutable!
    const contentEdited =
      body.overview !== undefined ||
      body.problemStatement !== undefined ||
      body.inScope !== undefined ||
      body.functionalReqs !== undefined ||
      body.acceptanceCriteria !== undefined;

    const createNewVersion = Boolean(body.createNewVersion) || (existing.status === 'APPROVED' && contentEdited && !isApproveAction);
    const nextVersionNumber = createNewVersion ? existing.currentVersion + 1 : existing.currentVersion;
    const nextStatus = isApproveAction
      ? 'APPROVED'
      : createNewVersion
      ? 'DRAFT'
      : (body.status || existing.status);

    const updated = await prisma.productRequirementDoc.update({
      where: { id: existing.id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : undefined,
        overview: body.overview !== undefined ? body.overview : undefined,
        problemStatement: body.problemStatement !== undefined ? body.problemStatement : undefined,
        targetOutcomes: body.targetOutcomes !== undefined ? body.targetOutcomes : undefined,
        personas: body.personas !== undefined ? body.personas : undefined,
        inScope: body.inScope !== undefined ? body.inScope : undefined,
        outOfScope: body.outOfScope !== undefined ? body.outOfScope : undefined,
        userStories: body.userStories !== undefined ? body.userStories : undefined,
        userFlows: body.userFlows !== undefined ? body.userFlows : undefined,
        functionalReqs: body.functionalReqs !== undefined ? body.functionalReqs : undefined,
        nonFunctionalReqs: body.nonFunctionalReqs !== undefined ? body.nonFunctionalReqs : undefined,
        dataModelNotes: body.dataModelNotes !== undefined ? body.dataModelNotes : undefined,
        securityPrivacy: body.securityPrivacy !== undefined ? body.securityPrivacy : undefined,
        dependenciesRisks: body.dependenciesRisks !== undefined ? body.dependenciesRisks : undefined,
        acceptanceCriteria: body.acceptanceCriteria !== undefined ? body.acceptanceCriteria : undefined,
        currentVersion: nextVersionNumber,
        approvedVersion: isApproveAction ? nextVersionNumber : existing.approvedVersion,
        status: nextStatus,
        approvedById: isApproveAction ? ctx.actor.id : existing.approvedById,
        approvedByName: isApproveAction ? ctx.actor.legalName : existing.approvedByName,
        approvedAt: isApproveAction ? new Date() : existing.approvedAt,
      },
    });

    await prisma.productRequirementVersion.upsert({
      where: { prdId_versionNumber: { prdId: updated.id, versionNumber: nextVersionNumber } },
      update: {
        status: nextStatus,
        snapshotJson: JSON.stringify(updated),
        changeSummary: body.changeSummary || (isApproveAction ? `Approved v${nextVersionNumber} snapshot` : `Updated v${nextVersionNumber}`),
        approvedById: isApproveAction ? ctx.actor.id : undefined,
        approvedByName: isApproveAction ? ctx.actor.legalName : undefined,
        approvedAt: isApproveAction ? new Date() : undefined,
      },
      create: {
        prdId: updated.id,
        versionNumber: nextVersionNumber,
        status: nextStatus,
        snapshotJson: JSON.stringify(updated),
        changeSummary: body.changeSummary || `Revision v${nextVersionNumber} created from v${existing.currentVersion}`,
        createdById: ctx.actor.id,
        createdByName: ctx.actor.legalName,
        approvedById: isApproveAction ? ctx.actor.id : null,
        approvedByName: isApproveAction ? ctx.actor.legalName : null,
        approvedAt: isApproveAction ? new Date() : null,
      },
    });

    const fullPrd = await prisma.productRequirementDoc.findUnique({
      where: { id: updated.id },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    return NextResponse.json({ prd: fullPrd });
  } catch (error: any) {
    console.error('[Innovation PRDs PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not update PRD.' }, { status: 500 });
  }
}
