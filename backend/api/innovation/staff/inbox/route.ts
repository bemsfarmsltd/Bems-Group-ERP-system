import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import { resolveInnovationContext } from '@/lib/innovationRouteHelper';

export const dynamic = 'force-dynamic';

/**
 * PART II (SECTIONS 37–55 & 68):
 * Authoritative Employee-Facing Staff App Product Management Inbox Endpoint
 * Used by both /staff-app/index.html (Flutter Web & Android APK) and /staff/innovation.
 */
export async function GET(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const employeeId = ctx.actor.id;
    const orgFilter =
      ctx.useSubFilter && ctx.allowedSubIds.length > 0
        ? { organizationId: { in: ctx.allowedSubIds } }
        : {};

    const [
      myMemberships,
      accessibleProducts,
      myIdeas,
      allVisibleIdeas,
      boards,
      features,
      myResearch,
      myExperiments,
      myReviews,
      myFeedback,
      prds,
      designArtifacts,
      releases,
      myProjectTasks,
      notifications,
    ] = await Promise.all([
      prisma.productMembership.findMany({
        where: { employeeId },
        include: { product: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.product.findMany({
        where: { ...orgFilter, status: { not: 'ARCHIVED' } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.productIdea.findMany({
        where: { submitterId: employeeId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productIdea.findMany({
        where: orgFilter,
        orderBy: [{ votesCount: 'desc' }, { createdAt: 'desc' }],
        take: 60,
      }),
      prisma.brainstormBoard.findMany({
        where: orgFilter,
        include: {
          objects: { orderBy: { zIndex: 'asc' } },
          connectors: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productFeature.findMany({
        where: orgFilter,
        orderBy: [{ computedRiceScore: 'desc' }, { updatedAt: 'desc' }],
      }),
      prisma.productResearchRecord.findMany({
        where: {
          OR: [{ assigneeId: employeeId }, orgFilter],
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productExperiment.findMany({
        where: orgFilter,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productApprovalRequest.findMany({
        where: ctx.isExecutive
          ? { status: 'PENDING' }
          : {
              OR: [
                { assignedApproverId: employeeId },
                { requesterId: employeeId },
              ],
            },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customerFeedbackInsight.findMany({
        where: {
          OR: [{ reporterId: employeeId }, orgFilter],
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      prisma.productRequirementDoc.findMany({
        where: orgFilter,
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 3 } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productDesignArtifact.findMany({
        where: orgFilter,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productRelease.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.projectWorkItem.findMany({
        where: {
          OR: [
            { assigneeId: employeeId },
            { reporterId: employeeId },
            { itemType: 'EPIC' },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }).catch(() => []),
      prisma.systemNotification.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }).catch(() => []),
    ]);

    const prodMap = new Map(accessibleProducts.map((p) => [p.id, p]));
    const membershipByProd = new Map(myMemberships.map((m) => [m.productId, m]));

    // Section 38: Show compact product progress summaries without privileged portfolio financials
    const myProducts = accessibleProducts.map((p) => {
      const m = membershipByProd.get(p.id);
      const prodFeatures = features.filter((f) => f.productId === p.id);
      const releasedCount = prodFeatures.filter((f) => f.workflowStage === 'RELEASED').length;
      return {
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        category: p.category,
        productType: p.productType,
        summary: p.summary,
        vision: p.vision,
        targetCustomers: p.targetCustomers,
        valueProposition: p.valueProposition,
        lifecycleStage: p.lifecycleStage,
        status: p.status,
        healthScore: p.healthScore,
        nextMilestone: p.nextMilestone,
        nextMilestoneAt: p.nextMilestoneAt,
        myRole: m?.productRole || 'CONTRIBUTOR',
        myAccessScope: m?.accessScope || 'CONTRIBUTE',
        membershipStatus: m?.status || 'ACTIVE',
        isFollowing: m?.isFollowing ?? true,
        featuresCount: prodFeatures.length,
        releasedFeaturesCount: releasedCount,
      };
    });

    // Section 42: Suppress confidential internal evaluations for users without review permission
    const sanitizedIdeas = allVisibleIdeas.map((i) => ({
      ...i,
      productName: i.productId ? prodMap.get(i.productId)?.name || 'Cross-Product' : 'Cross-Product',
      restrictedNote: ctx.isExecutive ? i.restrictedNote : null,
    }));

    // Section 41: Filter out private boards not owned by this staff member
    const visibleBoards = boards
      .filter((b) => b.visibility !== 'PRIVATE' || b.facilitatorId === employeeId || ctx.isExecutive)
      .map((b) => ({
        ...b,
        productName: b.productId ? prodMap.get(b.productId)?.name || 'General Innovation' : 'General Innovation',
      }));

    // Section 53: Personal contributions and learning history (without turning quantity into a crude performance grade)
    const contributions = [
      ...myIdeas.map((i) => ({
        id: `contrib-idea-${i.id}`,
        type: 'IDEA_SUBMISSION',
        code: i.ideaNumber,
        title: i.title,
        status: i.status,
        outcome: i.publicDecisionNote || `Current stage: ${i.status}`,
        createdAt: i.createdAt,
      })),
      ...myResearch
        .filter((r) => r.assigneeId === employeeId)
        .map((r) => ({
          id: `contrib-res-${r.id}`,
          type: 'RESEARCH_STUDY',
          code: r.researchCode,
          title: r.title,
          status: r.status,
          outcome: r.findingsSummary || 'Assigned research investigation',
          createdAt: r.createdAt,
        })),
      ...myFeedback
        .filter((f) => f.reporterId === employeeId)
        .map((f) => ({
          id: `contrib-fb-${f.id}`,
          type: 'PRODUCT_FEEDBACK',
          code: f.feedbackCode,
          title: f.title,
          status: f.status,
          outcome: f.resolutionNote || `Category: ${f.category}`,
          createdAt: f.createdAt,
        })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      employee: {
        id: ctx.actor.id,
        legalName: ctx.actor.legalName,
        employeeNumber: ctx.actor.employeeNumber,
        role: ctx.actor.role,
      },
      summary: {
        myProductsCount: myProducts.length,
        myIdeasCount: myIdeas.length,
        approvedIdeasCount: myIdeas.filter((i) => i.status === 'APPROVED').length,
        assignedReviewsCount: myReviews.filter((r) => r.status === 'PENDING').length,
        activeBoardsCount: visibleBoards.length,
        assignedResearchCount: myResearch.filter((r) => r.assigneeId === employeeId).length,
        myProductActionsCount: myProjectTasks.length,
      },
      myProducts,
      myIdeas: myIdeas.map((i) => ({
        ...i,
        productName: i.productId ? prodMap.get(i.productId)?.name || 'Cross-Product' : 'Cross-Product',
        restrictedNote: null,
      })),
      ideaBoard: sanitizedIdeas,
      boards: visibleBoards,
      features: features.map((f) => ({
        ...f,
        productName: prodMap.get(f.productId)?.name || 'Product',
      })),
      assignedResearch: myResearch.map((r) => ({
        ...r,
        productName: r.productId ? prodMap.get(r.productId)?.name || 'Product' : 'Product',
      })),
      experiments: myExperiments.map((e) => ({
        ...e,
        productName: prodMap.get(e.productId)?.name || 'Product',
      })),
      myReviews: myReviews.map((r) => ({
        ...r,
        productName: prodMap.get(r.productId)?.name || 'Product',
      })),
      feedbackCases: myFeedback.map((fb) => ({
        ...fb,
        productName: fb.productId ? prodMap.get(fb.productId)?.name || 'Product' : 'Product',
      })),
      prds: prds.map((p) => ({
        ...p,
        productName: prodMap.get(p.productId)?.name || 'Product',
      })),
      designArtifacts: designArtifacts.map((d) => ({
        ...d,
        productName: prodMap.get(d.productId)?.name || 'Product',
      })),
      releases: releases.map((rel) => ({
        ...rel,
        productName: prodMap.get(rel.productId)?.name || 'Product',
      })),
      myProductActions: myProjectTasks,
      contributions,
      notifications,
    });
  } catch (error: any) {
    console.error('[Staff Innovation Inbox API] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not load Staff Product Management Workspace.' }, { status: 500 });
  }
}
