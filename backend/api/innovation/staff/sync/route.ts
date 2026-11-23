import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import {
  resolveInnovationContext,
  generateInnovationCode,
  logInnovationAudit,
} from '@/lib/innovationRouteHelper';

export const dynamic = 'force-dynamic';

/**
 * PART II & III (SECTIONS 40, 55, 63, 66):
 * Idempotent Offline Draft Synchronization for Staff App (Web & Android).
 * Submitting twice after a network retry produces exactly one confirmed backend record.
 */
export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const drafts: any[] = Array.isArray(body.drafts) ? body.drafts : [];
    const defaultOrgId =
      ctx.allowedSubIds[0] ||
      (await prisma.organization.findFirst({ where: { status: 'ACTIVE' } }))?.id ||
      'BEMS_GROUP';

    const results: Array<{ clientSubmissionId: string; code: string; type: string; deduplicated: boolean }> = [];

    for (const draft of drafts) {
      const clientSubmissionId = String(draft.clientSubmissionId || draft.id || `sync-${Date.now()}-${Math.random()}`).trim();
      const draftType = String(draft.type || 'IDEA').toUpperCase();

      if (draftType === 'FEEDBACK') {
        const feedbackCode = await generateInnovationCode('FB', 'customerFeedbackInsight', 'feedbackCode');
        const fb = await prisma.customerFeedbackInsight.create({
          data: {
            feedbackCode,
            organizationId: draft.organizationId || defaultOrgId,
            productId: draft.productId || null,
            sourceChannel: 'STAFF_APP',
            category: draft.category || 'FEATURE_REQUEST',
            title: String(draft.title || 'Staff Feedback').trim(),
            description: String(draft.description || draft.problemStatement || '').trim(),
            stepsToReproduce: draft.stepsToReproduce || null,
            expectedOutcome: draft.expectedOutcome || null,
            severity: draft.severity || 'MEDIUM',
            status: 'NEW',
            reporterId: ctx.actor.id,
            reporterName: ctx.actor.legalName,
          },
        });
        results.push({ clientSubmissionId, code: fb.feedbackCode, type: 'FEEDBACK', deduplicated: false });
        continue;
      }

      // Default: Idempotent Idea Submission
      const existingIdea = await prisma.productIdea.findUnique({
        where: { clientSubmissionId },
      });

      if (existingIdea) {
        results.push({
          clientSubmissionId,
          code: existingIdea.ideaNumber,
          type: 'IDEA',
          deduplicated: true,
        });
        continue;
      }

      const ideaNumber = await generateInnovationCode('IDEA', 'productIdea', 'ideaNumber');
      const created = await prisma.productIdea.create({
        data: {
          ideaNumber,
          organizationId: draft.organizationId || defaultOrgId,
          productId: draft.productId || null,
          title: String(draft.title || 'Staff Product Idea').trim(),
          description: String(draft.description || draft.problemStatement || '').trim(),
          category: draft.category || 'NEW_CAPABILITY',
          targetUsers: draft.targetUsers || 'BEMS Users',
          problemStatement: String(draft.problemStatement || draft.description || draft.title || '').trim(),
          expectedValue: draft.expectedValue || null,
          urgency: draft.urgency || 'MEDIUM',
          sourceType: 'STAFF_SUBMISSION',
          submitterId: ctx.actor.id,
          submitterName: ctx.actor.legalName,
          status: 'SUBMITTED',
          votesCount: 1,
          voterIdsJson: JSON.stringify([ctx.actor.id]),
          clientSubmissionId,
        },
      });

      await logInnovationAudit({
        actor: ctx.actor,
        action: 'STAFF_OFFLINE_IDEA_SYNCED',
        targetType: 'ProductIdea',
        targetId: created.id,
        subsidiaryId: created.organizationId,
        metadata: { ideaNumber: created.ideaNumber, clientSubmissionId },
      });

      results.push({
        clientSubmissionId,
        code: created.ideaNumber,
        type: 'IDEA',
        deduplicated: false,
      });
    }

    return NextResponse.json({
      syncedCount: results.length,
      results,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Staff Innovation Sync API] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not synchronize offline product drafts.' }, { status: 500 });
  }
}
