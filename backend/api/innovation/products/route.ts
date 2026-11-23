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
    const productId = searchParams.get('productId');

    if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          portfolio: true,
          memberships: true,
          goals: { include: { keyResults: true } },
          features: { orderBy: { computedRiceScore: 'desc' } },
          roadmapItems: { orderBy: { targetDate: 'asc' } },
          prds: { include: { versions: { orderBy: { versionNumber: 'desc' } } } },
          releases: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!product) {
        return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
      }
      if (ctx.useSubFilter && ctx.allowedSubIds.length > 0 && !ctx.allowedSubIds.includes(product.organizationId)) {
        return NextResponse.json({ error: 'Forbidden: Product is outside your company permission scope.' }, { status: 403 });
      }
      return NextResponse.json({ product });
    }

    const where = ctx.useSubFilter && ctx.allowedSubIds.length > 0
      ? { organizationId: { in: ctx.allowedSubIds } }
      : {};

    const products = await prisma.product.findMany({
      where,
      include: { portfolio: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ products });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load products.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const entityType = String(body.entityType || 'PRODUCT').toUpperCase();

    // 1. Create Portfolio
    if (entityType === 'PORTFOLIO') {
      if (ctx.isStaff) {
        return NextResponse.json({ error: 'Forbidden: Creating a Product Portfolio requires executive or Product Manager authority.' }, { status: 403 });
      }
      const orgId = body.organizationId || ctx.allowedSubIds[0] || (await prisma.organization.findFirst({ where: { status: 'ACTIVE' } }))?.id;
      if (!orgId) return NextResponse.json({ error: 'Organization ID is required.' }, { status: 400 });

      const portfolioCode = await generateInnovationCode('PF', 'productPortfolio', 'portfolioCode');
      const portfolio = await prisma.productPortfolio.create({
        data: {
          portfolioCode,
          organizationId: orgId,
          name: String(body.name || '').trim(),
          description: body.description || null,
          strategicTheme: body.strategicTheme || null,
          targetMarket: body.targetMarket || null,
          ownerId: body.ownerId || ctx.actor.id,
          sponsorId: body.sponsorId || ctx.actor.id,
          status: 'ACTIVE',
        },
      });
      await logInnovationAudit({
        actor: ctx.actor,
        action: 'PORTFOLIO_CREATED',
        targetType: 'ProductPortfolio',
        targetId: portfolio.id,
        subsidiaryId: orgId,
        metadata: { portfolioCode, name: portfolio.name },
      });
      return NextResponse.json({ portfolio }, { status: 201 });
    }

    // 2. Create Goal / OKR (Section 13)
    if (entityType === 'GOAL') {
      const productId = String(body.productId || '');
      const prod = await prisma.product.findUnique({ where: { id: productId } });
      if (!prod) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

      const goal = await prisma.productGoal.create({
        data: {
          productId: prod.id,
          organizationId: prod.organizationId,
          objectiveTitle: String(body.objectiveTitle || '').trim(),
          purpose: body.purpose || null,
          measurementCycle: body.measurementCycle || 'Q4 2026',
          ownerId: body.ownerId || ctx.actor.id,
          sponsorId: body.sponsorId || prod.sponsorId || ctx.actor.id,
          status: body.status || 'ON_TRACK',
          confidence: Number(body.confidence ?? 80),
        },
      });

      if (body.metricName) {
        await prisma.productKeyResult.create({
          data: {
            goalId: goal.id,
            metricName: String(body.metricName).trim(),
            unit: body.unit || '%',
            baselineValue: Number(body.baselineValue ?? 0),
            targetValue: Number(body.targetValue ?? 100),
            actualValue: Number(body.actualValue ?? 0),
            dataSource: body.dataSource || 'ERP Telemetry',
            updateSchedule: body.updateSchedule || 'WEEKLY',
            confidence: Number(body.confidence ?? 85),
            ownerId: ctx.actor.id,
            status: 'ON_TRACK',
          },
        });
      }

      const fullGoal = await prisma.productGoal.findUnique({
        where: { id: goal.id },
        include: { keyResults: true },
      });
      return NextResponse.json({ goal: fullGoal }, { status: 201 });
    }

    // 3. Request or Assign Product Membership (Sections 33 & 39)
    if (entityType === 'MEMBERSHIP') {
      const productId = String(body.productId || '');
      const employeeId = String(body.employeeId || ctx.actor.id);
      const isSelfRequest = employeeId === ctx.actor.id && ctx.isStaff;

      const membership = await prisma.productMembership.upsert({
        where: { productId_employeeId: { productId, employeeId } },
        update: {
          productRole: body.productRole || 'CONTRIBUTOR',
          accessScope: isSelfRequest ? 'CONTRIBUTE' : (body.accessScope || 'CONTRIBUTE'),
          status: isSelfRequest && body.requireApproval ? 'PENDING_REQUEST' : 'ACTIVE',
          isFollowing: body.isFollowing !== undefined ? Boolean(body.isFollowing) : true,
        },
        create: {
          productId,
          employeeId,
          productRole: body.productRole || 'CONTRIBUTOR',
          accessScope: isSelfRequest ? 'CONTRIBUTE' : (body.accessScope || 'CONTRIBUTE'),
          status: isSelfRequest && body.requireApproval ? 'PENDING_REQUEST' : 'ACTIVE',
          isFollowing: true,
        },
      });
      await logInnovationAudit({
        actor: ctx.actor,
        action: 'PRODUCT_MEMBERSHIP_UPDATED',
        targetType: 'ProductMembership',
        targetId: membership.id,
        metadata: { productId, employeeId, productRole: membership.productRole },
      });
      return NextResponse.json({ membership }, { status: 201 });
    }

    // 4. Create Canonical Product (Section 2)
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'Product name is required.' }, { status: 400 });
    }

    const orgId =
      body.organizationId ||
      ctx.allowedSubIds[0] ||
      (await prisma.organization.findFirst({ where: { status: 'ACTIVE' } }))?.id;
    if (!orgId) return NextResponse.json({ error: 'Organization ID is required.' }, { status: 400 });

    const productCode = await generateInnovationCode('PROD', 'product', 'productCode');
    const product = await prisma.product.create({
      data: {
        productCode,
        organizationId: orgId,
        portfolioId: body.portfolioId || null,
        name: String(body.name).trim(),
        category: body.category || 'PLATFORM',
        productType: body.productType || 'SAAS',
        summary: String(body.summary || body.description || 'Enterprise product initiative').trim(),
        vision: body.vision || null,
        mission: body.mission || null,
        targetMarket: body.targetMarket || null,
        targetCustomers: body.targetCustomers || null,
        valueProposition: body.valueProposition || null,
        businessModel: body.businessModel || null,
        differentiation: body.differentiation || null,
        lifecycleStage: body.lifecycleStage || 'DISCOVERY',
        status: 'ACTIVE',
        healthScore: Number(body.healthScore ?? 90),
        strategicPriority: body.strategicPriority || 'HIGH',
        ownerId: body.ownerId || ctx.actor.id,
        sponsorId: body.sponsorId || ctx.actor.id,
        nextMilestone: body.nextMilestone || 'Initial Discovery & PRD Sign-off',
        nextMilestoneAt: body.nextMilestoneAt ? new Date(body.nextMilestoneAt) : new Date(Date.now() + 21 * 86400000),
      },
    });

    // Auto-enroll creator in ProductMembership
    await prisma.productMembership.upsert({
      where: { productId_employeeId: { productId: product.id, employeeId: ctx.actor.id } },
      update: {},
      create: {
        productId: product.id,
        employeeId: ctx.actor.id,
        productRole: 'PRODUCT_OWNER',
        accessScope: 'MANAGE',
        status: 'ACTIVE',
        isFollowing: true,
      },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'PRODUCT_CREATED',
      targetType: 'Product',
      targetId: product.id,
      subsidiaryId: orgId,
      metadata: { productCode, name: product.name },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error: any) {
    console.error('[Innovation Products POST] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not create product record.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();

    // Update Key Result actual progress
    if (body.entityType === 'KEY_RESULT' && body.keyResultId) {
      const kr = await prisma.productKeyResult.update({
        where: { id: String(body.keyResultId) },
        data: {
          actualValue: body.actualValue !== undefined ? Number(body.actualValue) : undefined,
          confidence: body.confidence !== undefined ? Number(body.confidence) : undefined,
          status: body.status || undefined,
        },
      });
      return NextResponse.json({ keyResult: kr });
    }

    // Toggle Follow / Membership preference for Staff App (Section 39)
    if (body.entityType === 'FOLLOW_TOGGLE' && body.productId) {
      const membership = await prisma.productMembership.upsert({
        where: { productId_employeeId: { productId: String(body.productId), employeeId: ctx.actor.id } },
        update: { isFollowing: Boolean(body.isFollowing) },
        create: {
          productId: String(body.productId),
          employeeId: ctx.actor.id,
          productRole: 'CONTRIBUTOR',
          accessScope: 'CONTRIBUTE',
          status: 'ACTIVE',
          isFollowing: Boolean(body.isFollowing),
        },
      });
      return NextResponse.json({ membership });
    }

    const productId = String(body.id || body.productId || '');
    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

    // Section 28: Prevent premature launch state changes before mandatory readiness gates are satisfied
    if (body.lifecycleStage === 'LAUNCHED' && existing.lifecycleStage !== 'LAUNCHED') {
      const canApprove = await canApproveProductGate(ctx.actor, existing.id, 'LAUNCH_GO_NO_GO');
      if (!canApprove) {
        return NextResponse.json(
          { error: 'Forbidden: Transitioning a product to LAUNCHED requires GMD or Executive Sponsor Go/No-Go authorization.' },
          { status: 403 }
        );
      }
      const openBlockers = await prisma.productRiskItem.count({
        where: { productId: existing.id, isLaunchBlocker: true, status: { not: 'CLOSED' } },
      });
      if (openBlockers > 0 && !body.acknowledgeResidualRisk) {
        return NextResponse.json(
          { error: `Launch Gate Blocked: ${openBlockers} launch-blocking risk(s) remain open. Resolve or explicitly acknowledge residual risk first.` },
          { status: 400 }
        );
      }
    }

    const strategyChanged =
      body.vision !== undefined ||
      body.mission !== undefined ||
      body.valueProposition !== undefined ||
      body.businessModel !== undefined ||
      body.strategyJson !== undefined;

    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        summary: body.summary !== undefined ? String(body.summary).trim() : undefined,
        category: body.category || undefined,
        productType: body.productType || undefined,
        portfolioId: body.portfolioId !== undefined ? body.portfolioId : undefined,
        vision: body.vision !== undefined ? body.vision : undefined,
        mission: body.mission !== undefined ? body.mission : undefined,
        targetMarket: body.targetMarket !== undefined ? body.targetMarket : undefined,
        targetCustomers: body.targetCustomers !== undefined ? body.targetCustomers : undefined,
        valueProposition: body.valueProposition !== undefined ? body.valueProposition : undefined,
        businessModel: body.businessModel !== undefined ? body.businessModel : undefined,
        differentiation: body.differentiation !== undefined ? body.differentiation : undefined,
        strategyJson: body.strategyJson !== undefined ? (typeof body.strategyJson === 'string' ? body.strategyJson : JSON.stringify(body.strategyJson)) : undefined,
        strategyStatus: body.strategyStatus || undefined,
        strategyVersion: strategyChanged ? existing.strategyVersion + 1 : undefined,
        lifecycleStage: body.lifecycleStage || undefined,
        status: body.status || undefined,
        healthScore: body.healthScore !== undefined ? Number(body.healthScore) : undefined,
        strategicPriority: body.strategicPriority || undefined,
        ownerId: body.ownerId || undefined,
        sponsorId: body.sponsorId || undefined,
        nextMilestone: body.nextMilestone !== undefined ? body.nextMilestone : undefined,
        nextMilestoneAt: body.nextMilestoneAt ? new Date(body.nextMilestoneAt) : undefined,
        archivalReason: body.archivalReason !== undefined ? body.archivalReason : undefined,
        version: existing.version + 1,
      },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: body.status === 'RETIRED' || body.status === 'ARCHIVED' ? 'PRODUCT_ARCHIVED' : 'PRODUCT_UPDATED',
      targetType: 'Product',
      targetId: updated.id,
      subsidiaryId: updated.organizationId,
      metadata: {
        productCode: updated.productCode,
        lifecycleStage: updated.lifecycleStage,
        status: updated.status,
        version: updated.version,
      },
    });

    return NextResponse.json({ product: updated });
  } catch (error: any) {
    console.error('[Innovation Products PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not update product.' }, { status: 500 });
  }
}
