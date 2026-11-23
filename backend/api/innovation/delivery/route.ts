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

export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const entityType = String(body.entityType || 'EXPERIMENT').toUpperCase();

    const prod = await prisma.product.findUnique({ where: { id: String(body.productId || '') } });
    if (!prod) return NextResponse.json({ error: 'Select a valid Product.' }, { status: 400 });

    // 1. Create Experiment / MVP Pilot (Sections 20, 21, 48)
    if (entityType === 'EXPERIMENT') {
      const experimentCode = await generateInnovationCode('EXP', 'productExperiment', 'experimentCode');
      const exp = await prisma.productExperiment.create({
        data: {
          experimentCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          featureId: body.featureId || null,
          opportunityId: body.opportunityId || null,
          title: String(body.title || '').trim(),
          experimentType: body.experimentType || 'PILOT',
          hypothesis: String(body.hypothesis || '').trim(),
          targetAudience: String(body.targetAudience || 'Pilot User Cohort').trim(),
          intervention: body.intervention || null,
          targetMetric: String(body.targetMetric || 'Adoption & Task Completion Rate').trim(),
          baselineValue: body.baselineValue || '0%',
          successCriterion: String(body.successCriterion || '>= 90% completion').trim(),
          sampleSize: body.sampleSize || '20 participants',
          procedureNotes: body.procedureNotes || null,
          resultsSummary: body.resultsSummary || null,
          limitationsNote: body.limitationsNote || 'Document sample constraints before graduation',
          status: body.status || 'PILOT',
          outcomeDecision: body.outcomeDecision || 'PENDING',
          pilotGraduation: body.pilotGraduation || 'IN_PILOT',
          ownerId: ctx.actor.id,
          ownerName: ctx.actor.legalName,
          startDate: new Date(),
        },
      });
      return NextResponse.json({ experiment: exp }, { status: 201 });
    }

    // 2. Create Product Release (Section 23)
    if (entityType === 'RELEASE') {
      const releaseCode = await generateInnovationCode('REL', 'productRelease', 'releaseCode');
      const rel = await prisma.productRelease.create({
        data: {
          releaseCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          versionTag: String(body.versionTag || 'v1.0.0').trim(),
          title: String(body.title || '').trim(),
          rolloutAudience: body.rolloutAudience || 'General Availability',
          includedFeaturesJson: body.includedFeatures ? JSON.stringify(body.includedFeatures) : null,
          defectsFixedJson: body.defectsFixed ? JSON.stringify(body.defectsFixed) : null,
          knownIssues: body.knownIssues || null,
          internalNotes: body.internalNotes || null,
          externalReleaseNotes: body.externalReleaseNotes || null,
          qaStatus: body.qaStatus || 'IN_QA',
          rollbackPlan: body.rollbackPlan || 'Automated rollback to previous stable tag',
          workflowStage: body.workflowStage || 'TESTING',
          ownerId: ctx.actor.id,
          ownerName: ctx.actor.legalName,
          targetDate: body.targetDate ? new Date(body.targetDate) : new Date(Date.now() + 14 * 86400000),
        },
      });
      return NextResponse.json({ release: rel }, { status: 201 });
    }

    // 3. Create Launch Go/No-Go Checklist (Section 24)
    if (entityType === 'LAUNCH') {
      const launchCode = await generateInnovationCode('LCH', 'productLaunchChecklist', 'launchCode');
      const launch = await prisma.productLaunchChecklist.create({
        data: {
          launchCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          releaseId: body.releaseId || null,
          title: String(body.title || '').trim(),
          targetAudience: String(body.targetAudience || 'All Authorized Users').trim(),
          targetLaunchDate: body.targetLaunchDate ? new Date(body.targetLaunchDate) : new Date(Date.now() + 7 * 86400000),
          productReadinessOk: Boolean(body.productReadinessOk ?? true),
          docsTrainingOk: Boolean(body.docsTrainingOk ?? true),
          supportOpsOk: Boolean(body.supportOpsOk ?? true),
          marketingSalesOk: Boolean(body.marketingSalesOk ?? false),
          legalPrivacyOk: Boolean(body.legalPrivacyOk ?? true),
          technicalSecurityOk: Boolean(body.technicalSecurityOk ?? true),
          goNoGoDecision: 'PENDING',
        },
      });
      return NextResponse.json({ launchChecklist: launch }, { status: 201 });
    }

    // 4. Record Adoption / Performance Metric Snapshot (Section 25)
    if (entityType === 'METRIC') {
      const metric = await prisma.productMetricSnapshot.create({
        data: {
          organizationId: prod.organizationId,
          productId: prod.id,
          metricName: String(body.metricName || '').trim(),
          category: body.category || 'ADOPTION',
          formula: String(body.formula || 'Measured / Target').trim(),
          unit: body.unit || '%',
          sourceSystem: body.sourceSystem || 'BEMS Product Telemetry',
          periodLabel: body.periodLabel || 'Nov 2026',
          actualValue: Number(body.actualValue ?? 0),
          priorPeriodValue: Number(body.priorPeriodValue ?? 0),
          targetValue: body.targetValue !== undefined ? Number(body.targetValue) : null,
          verificationState: body.verificationState || 'VERIFIED',
          confidence: Number(body.confidence ?? 95),
          caveats: body.caveats || null,
          linkedFeatureCode: body.linkedFeatureCode || null,
        },
      });
      return NextResponse.json({ metric }, { status: 201 });
    }

    // 5. Propose Product Budget Plan (Section 27 — strictly separated from payment disbursement!)
    if (entityType === 'BUDGET') {
      if (ctx.isStaff) {
        return NextResponse.json({ error: 'Forbidden: Product Budget proposals require Product Owner or Executive authority.' }, { status: 403 });
      }
      const budgetCode = await generateInnovationCode('PBD', 'productBudgetPlan', 'budgetCode');
      const propMinor = BigInt(Math.round(Number(body.proposedInvestmentNaira || 0) * 100));
      const capexMinor = BigInt(Math.round(Number(body.approvedCapexNaira || 0) * 100));
      const opexMinor = BigInt(Math.round(Number(body.approvedOpexNaira || 0) * 100));
      const revMinor = BigInt(Math.round(Number(body.attributableRevNaira || 0) * 100));

      const plan = await prisma.productBudgetPlan.create({
        data: {
          budgetCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          fiscalPeriod: body.fiscalPeriod || 'FY 2026 / Q4',
          proposedInvestmentMinor: propMinor,
          approvedCapexMinor: capexMinor,
          approvedOpexMinor: opexMinor,
          attributableRevMinor: revMinor,
          allocationMethodology: body.allocationMethodology || 'Direct Requisition + 15% Shared Infrastructure',
          status: 'FINANCE_REVIEW',
          notes: body.notes || 'Proposed funding is not available cash; disbursements remain strictly governed by Finance.',
        },
      });

      // Automatically enqueue an INVESTMENT_GATE approval request
      const approvalCode = await generateInnovationCode('APR', 'productApprovalRequest', 'approvalCode');
      await prisma.productApprovalRequest.create({
        data: {
          approvalCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          gateType: 'INVESTMENT_GATE',
          targetRecordType: 'BUDGET',
          targetRecordId: plan.id,
          targetRecordCode: plan.budgetCode,
          targetVersion: 1,
          title: `Product Budget Proposal: ${prod.name} (${plan.fiscalPeriod})`,
          summary: `Proposed investment ₦${Number(propMinor) / 100}. Note: Approval authorizes budget plan only, not bank disbursement.`,
          requesterId: ctx.actor.id,
          requesterName: ctx.actor.legalName,
          assignedRole: 'GMD',
          status: 'PENDING',
        },
      });

      return NextResponse.json({
        budget: {
          ...plan,
          proposedInvestmentMinor: plan.proposedInvestmentMinor.toString(),
          approvedCapexMinor: plan.approvedCapexMinor.toString(),
          approvedOpexMinor: plan.approvedOpexMinor.toString(),
          committedSpendMinor: plan.committedSpendMinor.toString(),
          actualSpendMinor: plan.actualSpendMinor.toString(),
          attributableRevMinor: plan.attributableRevMinor.toString(),
        },
      }, { status: 201 });
    }

    // 6. Log Product Risk / Privacy / Security Item (Section 29)
    if (entityType === 'RISK') {
      const riskCode = await generateInnovationCode('RSK', 'productRiskItem', 'riskCode');
      const risk = await prisma.productRiskItem.create({
        data: {
          riskCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          category: body.category || 'SECURITY',
          title: String(body.title || '').trim(),
          description: String(body.description || '').trim(),
          likelihood: body.likelihood || 'MEDIUM',
          impact: body.impact || 'HIGH',
          mitigationPlan: String(body.mitigationPlan || '').trim(),
          isLaunchBlocker: Boolean(body.isLaunchBlocker),
          status: 'OPEN',
          ownerId: ctx.actor.id,
          ownerName: ctx.actor.legalName,
          dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 14 * 86400000),
        },
      });
      return NextResponse.json({ risk }, { status: 201 });
    }

    // 7. Log Formal Decision in Decision Register (Section 31)
    if (entityType === 'DECISION') {
      const decisionCode = await generateInnovationCode('DEC', 'productDecisionLog', 'decisionCode');
      const dec = await prisma.productDecisionLog.create({
        data: {
          decisionCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          targetRecordType: body.targetRecordType || 'FEATURE',
          targetRecordCode: body.targetRecordCode || prod.productCode,
          title: String(body.title || '').trim(),
          alternativesConsidered: body.alternativesConsidered || null,
          rationale: String(body.rationale || '').trim(),
          outcome: body.outcome || 'APPROVED',
          recordVersion: Number(body.recordVersion ?? 1),
          decidedById: ctx.actor.id,
          decidedByName: ctx.actor.legalName,
        },
      });
      return NextResponse.json({ decision: dec }, { status: 201 });
    }

    // 8. Submit Approval Request (Section 32)
    if (entityType === 'APPROVAL_REQUEST') {
      const approvalCode = await generateInnovationCode('APR', 'productApprovalRequest', 'approvalCode');
      const apr = await prisma.productApprovalRequest.create({
        data: {
          approvalCode,
          organizationId: prod.organizationId,
          productId: prod.id,
          gateType: body.gateType || 'PRD_APPROVAL',
          targetRecordType: body.targetRecordType || 'PRD',
          targetRecordId: body.targetRecordId || prod.id,
          targetRecordCode: body.targetRecordCode || prod.productCode,
          targetVersion: Number(body.targetVersion ?? 1),
          title: String(body.title || '').trim(),
          summary: String(body.summary || '').trim(),
          requesterId: ctx.actor.id,
          requesterName: ctx.actor.legalName,
          assignedApproverId: body.assignedApproverId || null,
          assignedRole: body.assignedRole || 'GMD',
          status: 'PENDING',
          dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 5 * 86400000),
        },
      });
      return NextResponse.json({ approval: apr }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported delivery entityType.' }, { status: 400 });
  } catch (error: any) {
    console.error('[Innovation Delivery POST] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not create delivery record.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const entityType = String(body.entityType || 'APPROVAL').toUpperCase();

    // 1. Version-Bound Approval Decision Engine (Sections 32, 51, 55)
    if (entityType === 'APPROVAL') {
      const aprId = String(body.id || body.approvalId || '');
      const apr = await prisma.productApprovalRequest.findUnique({ where: { id: aprId } });
      if (!apr) return NextResponse.json({ error: 'Approval request not found.' }, { status: 404 });

      // Section 55: Approver cannot approve their own restricted proposal unless they are the GMD
      if (apr.requesterId === ctx.actor.id && String(ctx.actor.role).toUpperCase() !== 'GMD') {
        return NextResponse.json(
          { error: 'Conflict of Interest Control: You cannot self-approve your own restricted product proposal.' },
          { status: 403 }
        );
      }

      const isDesignatedApprover = apr.assignedApproverId === ctx.actor.id;
      const hasGateAuthority = await canApproveProductGate(ctx.actor, apr.productId, apr.gateType);
      if (!isDesignatedApprover && !hasGateAuthority) {
        return NextResponse.json(
          { error: 'Forbidden: You do not hold delegated approval authority for this product gate.' },
          { status: 403 }
        );
      }

      const decisionStatus = String(body.status || 'APPROVED').toUpperCase(); // APPROVED | CHANGES_REQUESTED | REJECTED
      if ((decisionStatus === 'REJECTED' || decisionStatus === 'CHANGES_REQUESTED') && !String(body.decisionNote || '').trim()) {
        return NextResponse.json({ error: 'A clear decision reason is required when rejecting or requesting changes.' }, { status: 400 });
      }

      const updatedApr = await prisma.productApprovalRequest.update({
        where: { id: apr.id },
        data: {
          status: decisionStatus,
          decisionNote: body.decisionNote || `Decided (${decisionStatus}) by ${ctx.actor.legalName}`,
          decidedById: ctx.actor.id,
          decidedByName: ctx.actor.legalName,
          decidedAt: new Date(),
        },
      });

      // Automatically record in the canonical Decision Register (Section 31)
      const decisionCode = await generateInnovationCode('DEC', 'productDecisionLog', 'decisionCode');
      await prisma.productDecisionLog.create({
        data: {
          decisionCode,
          organizationId: apr.organizationId,
          productId: apr.productId,
          targetRecordType: apr.targetRecordType,
          targetRecordCode: apr.targetRecordCode,
          title: `${apr.gateType}: ${apr.title}`,
          rationale: updatedApr.decisionNote || 'Approved through Product Governance Gate.',
          outcome: decisionStatus === 'APPROVED' ? 'APPROVED' : decisionStatus === 'REJECTED' ? 'REJECTED' : 'DEFERRED',
          recordVersion: apr.targetVersion,
          decidedById: ctx.actor.id,
          decidedByName: ctx.actor.legalName,
        },
      });

      // Propagate approved status to underlying target record
      if (decisionStatus === 'APPROVED') {
        if (apr.targetRecordType === 'FEATURE') {
          await prisma.productFeature.update({
            where: { id: apr.targetRecordId },
            data: { workflowStage: 'APPROVED', reviewerId: ctx.actor.id },
          }).catch(() => {});
        } else if (apr.targetRecordType === 'BUDGET') {
          await prisma.productBudgetPlan.update({
            where: { id: apr.targetRecordId },
            data: { status: 'APPROVED' },
          }).catch(() => {});
        } else if (apr.targetRecordType === 'RELEASE') {
          await prisma.productRelease.update({
            where: { id: apr.targetRecordId },
            data: { workflowStage: 'APPROVED', approvedById: ctx.actor.id, approvedByName: ctx.actor.legalName },
          }).catch(() => {});
        }
      }

      await logInnovationAudit({
        actor: ctx.actor,
        action: `PRODUCT_GATE_${decisionStatus}`,
        targetType: 'ProductApprovalRequest',
        targetId: apr.id,
        subsidiaryId: apr.organizationId,
        metadata: { approvalCode: apr.approvalCode, gateType: apr.gateType, targetRecordCode: apr.targetRecordCode },
      });

      return NextResponse.json({ approval: updatedApr });
    }

    // 2. Update Experiment Results & Pilot Graduation (Sections 20, 21, 48)
    if (entityType === 'EXPERIMENT') {
      const exp = await prisma.productExperiment.update({
        where: { id: String(body.id || body.experimentId) },
        data: {
          resultsSummary: body.resultsSummary !== undefined ? body.resultsSummary : undefined,
          limitationsNote: body.limitationsNote !== undefined ? body.limitationsNote : undefined,
          status: body.status || undefined,
          outcomeDecision: body.outcomeDecision || undefined,
          pilotGraduation: body.pilotGraduation || undefined,
          endDate: body.status === 'COMPLETED' ? new Date() : undefined,
        },
      });
      return NextResponse.json({ experiment: exp });
    }

    // 3. Update Release Workflow Stage (Section 23)
    if (entityType === 'RELEASE') {
      const rel = await prisma.productRelease.update({
        where: { id: String(body.id || body.releaseId) },
        data: {
          workflowStage: body.workflowStage || undefined,
          qaStatus: body.qaStatus || undefined,
          externalReleaseNotes: body.externalReleaseNotes !== undefined ? body.externalReleaseNotes : undefined,
          releasedAt: body.workflowStage === 'RELEASED' ? new Date() : undefined,
        },
      });
      return NextResponse.json({ release: rel });
    }

    // 4. Update Launch Go/No-Go Checklist (Section 24)
    if (entityType === 'LAUNCH') {
      const lch = await prisma.productLaunchChecklist.update({
        where: { id: String(body.id || body.launchId) },
        data: {
          productReadinessOk: body.productReadinessOk !== undefined ? Boolean(body.productReadinessOk) : undefined,
          docsTrainingOk: body.docsTrainingOk !== undefined ? Boolean(body.docsTrainingOk) : undefined,
          supportOpsOk: body.supportOpsOk !== undefined ? Boolean(body.supportOpsOk) : undefined,
          marketingSalesOk: body.marketingSalesOk !== undefined ? Boolean(body.marketingSalesOk) : undefined,
          legalPrivacyOk: body.legalPrivacyOk !== undefined ? Boolean(body.legalPrivacyOk) : undefined,
          technicalSecurityOk: body.technicalSecurityOk !== undefined ? Boolean(body.technicalSecurityOk) : undefined,
          goNoGoDecision: body.goNoGoDecision || undefined,
          decidedById: body.goNoGoDecision ? ctx.actor.id : undefined,
          decidedByName: body.goNoGoDecision ? ctx.actor.legalName : undefined,
          decisionNotes: body.decisionNotes !== undefined ? body.decisionNotes : undefined,
          decidedAt: body.goNoGoDecision ? new Date() : undefined,
        },
      });
      return NextResponse.json({ launchChecklist: lch });
    }

    // 5. Update Risk Status / Residual Risk Acknowledgment (Section 29)
    if (entityType === 'RISK') {
      const risk = await prisma.productRiskItem.update({
        where: { id: String(body.id || body.riskId) },
        data: {
          status: body.status || undefined,
          mitigationPlan: body.mitigationPlan !== undefined ? body.mitigationPlan : undefined,
          isLaunchBlocker: body.isLaunchBlocker !== undefined ? Boolean(body.isLaunchBlocker) : undefined,
          residualRiskAcceptedBy: body.status === 'RESIDUAL_ACCEPTED' ? ctx.actor.legalName : undefined,
        },
      });
      return NextResponse.json({ risk });
    }

    return NextResponse.json({ error: 'Unsupported delivery PATCH entityType.' }, { status: 400 });
  } catch (error: any) {
    console.error('[Innovation Delivery PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not update delivery record.' }, { status: 500 });
  }
}
