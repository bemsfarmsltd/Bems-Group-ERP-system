import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import { resolveInnovationContext } from '@/lib/innovationRouteHelper';
import { resolveOrganizationBranding } from '@/lib/subsidiary-branding';
import { getDistributedCache, setDistributedCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organizationId') || '';
    const portfolioId = searchParams.get('portfolioId') || '';
    const productId = searchParams.get('productId') || '';
    const lifecycleStage = searchParams.get('lifecycleStage') || '';

    const cacheKey = `innovation-overview:${ctx.actor.id}:${orgId}:${portfolioId}:${productId}:${lifecycleStage}`;
    const cached = await getDistributedCache<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const orgWhere = orgId
      ? { organizationId: orgId }
      : ctx.useSubFilter && ctx.allowedSubIds.length > 0
      ? { organizationId: { in: ctx.allowedSubIds } }
      : {};

    const prodWhere: Record<string, any> = { ...orgWhere };
    if (portfolioId) prodWhere.portfolioId = portfolioId;
    if (productId) prodWhere.id = productId;
    if (lifecycleStage) prodWhere.lifecycleStage = lifecycleStage;

    const childWhere: Record<string, any> = { ...orgWhere };
    if (productId) childWhere.productId = productId;

    const [
      portfolios,
      products,
      memberships,
      goals,
      boards,
      ideas,
      opportunities,
      feedbackItems,
      researchRecords,
      features,
      roadmapItems,
      prds,
      designArtifacts,
      experiments,
      releases,
      launchChecklists,
      metrics,
      budgets,
      risks,
      decisions,
      approvals,
      comments,
      subsidiaries,
      employees,
      linkedWorkItems,
      financeExpenditures,
    ] = await Promise.all([
      prisma.productPortfolio.findMany({
        where: orgWhere,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.product.findMany({
        where: prodWhere,
        orderBy: { createdAt: 'asc' },
        include: {
          portfolio: { select: { id: true, name: true, portfolioCode: true } },
        },
      }),
      prisma.productMembership.findMany({
        where: productId ? { productId } : {},
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.productGoal.findMany({
        where: childWhere,
        include: { keyResults: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.brainstormBoard.findMany({
        where: childWhere,
        include: {
          objects: { orderBy: { zIndex: 'asc' } },
          connectors: true,
          snapshots: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productIdea.findMany({
        where: childWhere,
        orderBy: [{ votesCount: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.productOpportunity.findMany({
        where: childWhere,
        orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.customerFeedbackInsight.findMany({
        where: childWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productResearchRecord.findMany({
        where: childWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productFeature.findMany({
        where: childWhere,
        orderBy: [{ manualOverrideRank: 'asc' }, { computedRiceScore: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.productRoadmapItem.findMany({
        where: childWhere,
        orderBy: { targetDate: 'asc' },
      }),
      prisma.productRequirementDoc.findMany({
        where: childWhere,
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productDesignArtifact.findMany({
        where: childWhere,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productExperiment.findMany({
        where: childWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productRelease.findMany({
        where: childWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productLaunchChecklist.findMany({
        where: childWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productMetricSnapshot.findMany({
        where: childWhere,
        orderBy: { lastProcessedAt: 'desc' },
      }),
      prisma.productBudgetPlan.findMany({
        where: childWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productRiskItem.findMany({
        where: childWhere,
        orderBy: [{ isLaunchBlocker: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.productDecisionLog.findMany({
        where: childWhere,
        orderBy: { decidedAt: 'desc' },
      }),
      prisma.productApprovalRequest.findMany({
        where: childWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productComment.findMany({
        where: productId ? { productId } : orgWhere,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.organization.findMany({
        where: ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { id: { in: ctx.allowedSubIds } } : { status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        include: {
          settings: { where: { key: { in: ['BRAND_COLOR', 'BRAND_LOGO_URL'] } } },
        },
      }),
      prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, employeeNumber: true, jobTitle: true, role: true },
      }),
      prisma.projectWorkItem.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          itemKey: true,
          title: true,
          status: true,
          priority: true,
          itemType: true,
          assigneeId: true,
        },
      }).catch(() => []),
      prisma.expenditureRequest.findMany({
        where: orgId ? { subsidiaryId: orgId } : {},
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          requestNumber: true,
          title: true,
          category: true,
          amountMinor: true,
          approvalStatus: true,
          paymentStatus: true,
          subsidiaryId: true,
        },
      }).catch(() => []),
    ]);

    const empMap = new Map(employees.map((e) => [e.id, e]));
    const orgMap = new Map(subsidiaries.map((o) => [o.id, o]));
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const workItemMap = new Map(linkedWorkItems.map((w) => [w.id, w]));

    // Suppress restricted reviewer notes and privileged financials for ordinary staff (Sections 8, 38, 42, 60)
    const canViewRestricted = ctx.isExecutive || !ctx.isStaff;

    const serializedBudgets = canViewRestricted
      ? budgets.map((b) => ({
          ...b,
          productName: prodMap.get(b.productId)?.name || 'Product',
          organizationName: orgMap.get(b.organizationId)?.legalName || 'BEMS Group',
          proposedInvestmentNaira: Number(b.proposedInvestmentMinor) / 100,
          approvedCapexNaira: Number(b.approvedCapexMinor) / 100,
          approvedOpexNaira: Number(b.approvedOpexMinor) / 100,
          committedSpendNaira: Number(b.committedSpendMinor) / 100,
          actualSpendNaira: Number(b.actualSpendMinor) / 100,
          attributableRevNaira: Number(b.attributableRevMinor) / 100,
          proposedInvestmentMinor: b.proposedInvestmentMinor.toString(),
          approvedCapexMinor: b.approvedCapexMinor.toString(),
          approvedOpexMinor: b.approvedOpexMinor.toString(),
          committedSpendMinor: b.committedSpendMinor.toString(),
          actualSpendMinor: b.actualSpendMinor.toString(),
          attributableRevMinor: b.attributableRevMinor.toString(),
        }))
      : [];

    const enrichedFeatures = features.map((f) => {
      const linkedWi = f.linkedWorkItemId ? workItemMap.get(f.linkedWorkItemId) : null;
      return {
        ...f,
        productName: prodMap.get(f.productId)?.name || 'Product',
        productCode: prodMap.get(f.productId)?.productCode || '',
        organizationName: orgMap.get(f.organizationId)?.legalName || 'BEMS Group',
        liveEngineeringWorkItem: linkedWi || null,
      };
    });

    const activeProductsCount = products.filter((p) => p.status === 'ACTIVE').length;
    const discoveryCount = opportunities.length + ideas.filter((i) => ['SUBMITTED', 'TRIAGE', 'REVIEW', 'RESEARCH_REQUIRED', 'SHORTLISTED'].includes(i.status)).length;
    const validatedOpportunitiesCount = opportunities.filter((o) => o.decision === 'PROCEED' || o.stage === 'VALIDATION' || o.stage === 'DECISION').length;
    const approvedFeaturesCount = features.filter((f) => ['APPROVED', 'DEVELOPMENT_READY', 'IN_DEVELOPMENT', 'VERIFIED', 'RELEASED'].includes(f.workflowStage)).length;
    const pendingApprovalsCount = approvals.filter((a) => a.status === 'PENDING').length;
    const blockersCount = risks.filter((r) => r.isLaunchBlocker && r.status !== 'CLOSED').length;

    const responsePayload = {
      dataAsOf: new Date().toISOString(),
      kpis: {
        activeProductsCount,
        totalPortfoliosCount: portfolios.length,
        discoveryItemsCount: discoveryCount,
        validatedOpportunitiesCount,
        totalIdeasCount: ideas.length,
        totalFeaturesCount: features.length,
        approvedFeaturesCount,
        activeBoardsCount: boards.length,
        activeExperimentsCount: experiments.length,
        releasesCount: releases.length,
        pendingApprovalsCount,
        blockersCount,
      },
      portfolios: portfolios.map((pf) => ({
        ...pf,
        organizationName: orgMap.get(pf.organizationId)?.legalName || 'BEMS Group',
        ownerName: pf.ownerId ? empMap.get(pf.ownerId)?.legalName || 'Product Lead' : 'Product Lead',
        sponsorName: pf.sponsorId ? empMap.get(pf.sponsorId)?.legalName || 'GMD' : 'GMD',
      })),
      products: products.map((p) => ({
        ...p,
        organizationName: orgMap.get(p.organizationId)?.legalName || 'BEMS Group',
        ownerName: p.ownerId ? empMap.get(p.ownerId)?.legalName || 'Product Owner' : 'Product Owner',
        sponsorName: p.sponsorId ? empMap.get(p.sponsorId)?.legalName || 'Executive Sponsor' : 'Executive Sponsor',
      })),
      memberships: memberships.map((m) => ({
        ...m,
        employeeName: empMap.get(m.employeeId)?.legalName || 'Staff Member',
        employeeNumber: empMap.get(m.employeeId)?.employeeNumber || '',
        jobTitle: empMap.get(m.employeeId)?.jobTitle || '',
        productName: prodMap.get(m.productId)?.name || 'Product',
      })),
      goals,
      boards: boards.map((b) => ({
        ...b,
        productName: b.productId ? prodMap.get(b.productId)?.name || 'General Innovation' : 'General Innovation',
        facilitatorName: b.facilitatorId ? empMap.get(b.facilitatorId)?.legalName || 'Facilitator' : 'Facilitator',
      })),
      ideas: ideas.map((i) => ({
        ...i,
        productName: i.productId ? prodMap.get(i.productId)?.name || 'New / Cross-Product' : 'New / Cross-Product',
        organizationName: orgMap.get(i.organizationId)?.legalName || 'BEMS Group',
        restrictedNote: canViewRestricted ? i.restrictedNote : null,
      })),
      opportunities: opportunities.map((o) => ({
        ...o,
        productName: o.productId ? prodMap.get(o.productId)?.name || 'Product' : 'Product',
      })),
      feedbackItems: feedbackItems.map((fb) => ({
        ...fb,
        productName: fb.productId ? prodMap.get(fb.productId)?.name || 'Product' : 'Product',
      })),
      researchRecords: researchRecords
        .filter((r) => canViewRestricted || !r.isConfidential || r.assigneeId === ctx.actor.id)
        .map((r) => ({
          ...r,
          productName: r.productId ? prodMap.get(r.productId)?.name || 'Product' : 'Product',
        })),
      features: enrichedFeatures,
      roadmapItems: roadmapItems.map((rm) => ({
        ...rm,
        productName: prodMap.get(rm.productId)?.name || 'Product',
      })),
      prds: prds.map((prd) => ({
        ...prd,
        productName: prodMap.get(prd.productId)?.name || 'Product',
      })),
      designArtifacts: designArtifacts.map((d) => ({
        ...d,
        productName: prodMap.get(d.productId)?.name || 'Product',
      })),
      experiments: experiments.map((ex) => ({
        ...ex,
        productName: prodMap.get(ex.productId)?.name || 'Product',
      })),
      releases: releases.map((rel) => ({
        ...rel,
        productName: prodMap.get(rel.productId)?.name || 'Product',
      })),
      launchChecklists: launchChecklists.map((lc) => ({
        ...lc,
        productName: prodMap.get(lc.productId)?.name || 'Product',
      })),
      metrics: metrics.map((m) => ({
        ...m,
        productName: prodMap.get(m.productId)?.name || 'Product',
      })),
      budgets: serializedBudgets,
      risks: risks.map((rk) => ({
        ...rk,
        productName: prodMap.get(rk.productId)?.name || 'Product',
      })),
      decisions: decisions.map((dc) => ({
        ...dc,
        productName: prodMap.get(dc.productId)?.name || 'Product',
      })),
      approvals: approvals.map((ap) => ({
        ...ap,
        productName: prodMap.get(ap.productId)?.name || 'Product',
      })),
      comments: comments.filter((c) => canViewRestricted || !c.isRestrictedNote),
      subsidiaries: subsidiaries.map((sub) => {
        const b = resolveOrganizationBranding(sub);
        return {
          id: sub.id,
          legalName: sub.legalName,
          code: sub.code,
          type: sub.type,
          brandColor: b.subsidiaryBrandColor,
          logoUrl: b.subsidiaryLogoUrl,
        };
      }),
      staffOptions: employees,
      linkedFinanceExpenditures: canViewRestricted
        ? financeExpenditures.map((ex) => ({
            ...ex,
            amountNaira: Number(ex.amountMinor) / 100,
            amountMinor: ex.amountMinor.toString(),
          }))
        : [],
    };
    await setDistributedCache(cacheKey, responsePayload, 15_000);
    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('[Innovation Overview API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load Product Management & Innovation Command Center.' },
      { status: 500 }
    );
  }
}
