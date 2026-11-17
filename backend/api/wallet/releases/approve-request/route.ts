import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/auth';
import { verifyWalletPassword, sessionBinding } from '@/lib/wallet/security';
import { canActorApproveFunds } from '@/lib/gmd-access';
import { prisma } from '@/lib/prisma';
import { sendApprovalDecisionEmail } from '@/lib/email';
import { fundingState, hash, liveWalletActor, requireCommitments, walletTransaction, WalletError } from '@/lib/wallet/core';
import { requiredFeeReserve } from '@/lib/wallet/fees';
import { ensureWalletFundingFresh } from '@/lib/wallet/monnify-balance';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true });
    if (!actor) {
      return NextResponse.json({ error: 'Sign in to authorize wallet fund release.' }, { status: 401 });
    }

    if (!(await canActorApproveFunds(actor))) {
      return NextResponse.json(
        { error: 'Only the designated Group Managing Director (GMD) can release funds unless explicitly permitted in Control Center.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestId = String(body.requestId || '').trim();
    const password = body.password;
    const note = String(body.note || '').trim();

    if (!requestId) {
      return NextResponse.json({ error: 'Requisition ID is required.' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json(
        { error: 'Enter your current executive password to authorize release.' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin');
    const bearer = /^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '');
    if ((origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_APP_URL) || (!origin && !bearer)) {
      throw new WalletError('ORIGIN_NOT_ALLOWED', 'A same-origin browser or native session is required.', 403);
    }
    await sessionBinding(request, actor.id);
    const credentialHash = await verifyWalletPassword(actor, password, true);

    requireCommitments();
    await ensureWalletFundingFresh(actor);
    const result = await walletTransaction(async (tx) => {
      const approver = await liveWalletActor(tx, actor, true);
      if (credentialHash !== hash(approver.passwordHash)) {
        throw new WalletError('CREDENTIAL_CHANGED', 'Your credentials changed. Confirm again.', 403);
      }
      await tx.$queryRaw`SELECT "id" FROM "ExpenditureRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const req = await tx.expenditureRequest.findUnique({
        where: { id: requestId },
        include: { requester: true, subsidiary: true, disbursements: { select: { id: true } } },
      });
      if (!req) throw new WalletError('NOT_FOUND', 'Requisition not found.', 404);
      if (!['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(req.approvalStatus) || req.paymentStatus !== 'UNPAID'
        || req.currency !== 'NGN' || req.amountMinor <= BigInt(0) || req.disbursements.length
        || req.vendorId || req.requestedById === actor.id || req.requester.role !== 'STAFF'
        || req.requester.approvalStatus !== 'APPROVED' || !['ACTIVE', 'ON_LEAVE'].includes(req.requester.status)) {
        throw new WalletError('SOURCE_NOT_ELIGIBLE', 'Select an eligible unpaid NGN staff requisition. Vendor payments require the verified vendor release flow.', 409);
      }
      const poolState = await fundingState(tx, true);
      if (poolState.availableMinor < req.amountMinor) {
        throw new WalletError('INSUFFICIENT_MONNIFY_BALANCE', 'Verified Monnify funds cannot cover this release.', 409);
      }

      const sourceKey = 'REQUEST:' + req.id;
      const [existingPaid] = await tx.$queryRaw<Array<{ key: string }>>`SELECT "key" FROM "WalletPaidSource" WHERE "key" = ${sourceKey}`;
      if (existingPaid) throw new WalletError('ALREADY_RELEASED', 'This requisition was already released.', 409);

      // 1. Resolve active subsidiary funded budget envelope
      const [envelope] = await tx.$queryRaw<any[]>`
        SELECT * FROM "WalletBudgetEnvelope"
        WHERE "organizationId" = ${req.subsidiaryId}
          AND "status" = 'ACTIVE'
        ORDER BY "remainingMinor" DESC, "createdAt" ASC
        LIMIT 1
      `;

      if (!envelope) {
        throw new Error(
          `NO_BUDGET_ENVELOPE:No active funded budget envelope exists for ${req.subsidiary.legalName || 'this subsidiary'}. An executive must allocate a funded budget envelope before releasing funds.`
        );
      }

      if (BigInt(envelope.remainingMinor) < req.amountMinor) {
        const availableFormatted = '₦' + (Number(envelope.remainingMinor) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
        const requiredFormatted = '₦' + (Number(req.amountMinor) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
        throw new Error(
          `INSUFFICIENT_BUDGET_BUFFER:Insufficient funded budget in envelope "${envelope.label}". Available: ${availableFormatted}, Required: ${requiredFormatted}. Please top up or allocate additional funded budget before releasing funds.`
        );
      }

      const fees = await requiredFeeReserve(tx, [{ employeeId: req.requestedById, amountMinor: req.amountMinor }]);
      if (fees > poolState.feeReserveMinor) {
        if (fees - poolState.feeReserveMinor > poolState.freeMinor) {
          throw new WalletError('FEE_RESERVE_INSUFFICIENT', 'Fund company transfer fees before releasing this requisition.', 409);
        }
        await tx.$executeRaw`UPDATE "WalletFundingPool" SET "feeReserveMinor" = ${fees} WHERE "id" = 'MONNIFY_NGN'`;
      }

      // 2. Decrement envelope capacity
      const deducted = await tx.$executeRaw`
        UPDATE "WalletBudgetEnvelope"
        SET "remainingMinor" = "remainingMinor" - ${req.amountMinor},
            "version" = "version" + 1
        WHERE "id" = ${envelope.id} AND "remainingMinor" >= ${req.amountMinor}
      `;

      if (deducted !== 1) throw new WalletError('BUDGET_CHANGED', 'The funded budget changed. Refresh and try again.', 409);

      const creditId = randomUUID();
      const proposalId = randomUUID();
      const category = req.requestType === 'REIMBURSEMENT' ? 'REIMBURSEMENT' : 'REQUEST';

      // 3. Record WalletReleaseProposal
      await tx.$executeRaw`
        INSERT INTO "WalletReleaseProposal" (
          "id", "createdById", "sourceType", "sourceId", "envelopeId", "employeeId",
          "amountMinor", "category", "sourceHash", "confirmationHash", "expiresAt",
          "status", "approvedById", "approvedAt"
        ) VALUES (
          ${proposalId}, ${actor.id}, 'REQUEST', ${req.id}, ${envelope.id}, ${req.requestedById},
          ${req.amountMinor}, ${category}, ${'REQUEST:' + req.id}, ${'executed'}, now(),
          'EXECUTED', ${actor.id}, now()
        )
      `;

      await tx.$executeRaw`
        INSERT INTO "WalletCreditLot" (
          "id", "proposalId", "requestId", "sourceType", "sourceId",
          "employeeId", "organizationId", "category", "amountMinor", "availableMinor"
        ) VALUES (
          ${creditId}, ${proposalId}, ${req.id}, 'REQUEST', ${req.id},
          ${req.requestedById}, ${req.subsidiaryId}, ${category}, ${req.amountMinor}, ${req.amountMinor}
        )
      `;

      // 4. Mark Paid Source to prevent duplicate releases
      await tx.$executeRaw`
        INSERT INTO "WalletPaidSource" ("key", "proposalId")
        VALUES (${sourceKey}, ${proposalId})
      `;

      // 6. Record Double-Entry Journal
      const journalId = randomUUID();
      const journalRef = `WLT-REL-${req.requestNumber}-${Date.now().toString().slice(-6)}`;
      await tx.$executeRaw`
        INSERT INTO "WalletJournal" ("id", "kind", "reference", "actorId")
        VALUES (${journalId}, 'WALLET_CREDITED', ${journalRef}, ${actor.id})
      `;
      await tx.$executeRaw`
        INSERT INTO "WalletJournalEntry" ("id", "journalId", "accountKey", "amountMinor")
        VALUES
          (${randomUUID()}, ${journalId}, ${'ENVELOPE:' + envelope.id}, ${-req.amountMinor}),
          (${randomUUID()}, ${journalId}, ${'STAFF:' + req.requestedById + ':' + category}, ${req.amountMinor})
      `;

      // 7. Update ExpenditureRequest Status (Accountability starts ONLY after complete withdrawal to personal bank)
      await tx.expenditureRequest.update({
        where: { id: req.id },
        data: {
          approvalStatus: 'APPROVED',
          paymentStatus: 'WALLET_CREDITED',
          accountabilityStatus: req.requestType === 'REIMBURSEMENT' ? 'NOT_REQUIRED' : 'AWAITING_WITHDRAWAL',
          requestVersion: { increment: 1 },
        },
      });

      // 8. Update Pending ApprovalSteps
      await tx.approvalStep.updateMany({
        where: { requestId: req.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          approverId: actor.id,
          approverName: `${actor.legalName} (${actor.role})`,
          decisionReason: note || 'Authorized and released to staff internal wallet.',
          decidedAt: new Date(),
        },
      });

      // 9. Remove any premature AccountabilityCase while funds are still in BEMS Wallet awaiting bank withdrawal
      await tx.accountabilityCase.deleteMany({
        where: { requestId: req.id, status: 'OPEN' },
      });

      // 10. In-App Notification for Beneficiary Staff
      const formattedAmount = (Number(req.amountMinor) / 100).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN',
      });
      await tx.systemNotification.create({
        data: {
          employeeId: req.requestedById,
          kind: 'WALLET_CREDITED',
          title: 'Approved funds added to your wallet',
          body: `${formattedAmount} has been credited to your internal wallet for "${req.title}". You can withdraw to your verified bank account at any time.`,
          linkUrl: '/wallet',
        },
      });

      // 11. Audit Event
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          actorName: actor.legalName,
          actorRole: actor.role,
          groupId: req.subsidiary.parentGroupId || req.subsidiary.id,
          subsidiaryId: req.subsidiary.id,
          targetType: 'WALLET_CREDIT',
          targetId: creditId,
          action: 'GMD_WALLET_RELEASED',
          correlationId: proposalId,
          metadata: JSON.stringify({
            requestId: req.id,
            requestNumber: req.requestNumber,
            amountMinor: req.amountMinor.toString(),
            staffName: req.requester.legalName,
            staffNumber: req.requester.employeeNumber,
            staffWalletNumber: `WLT-${req.requester.employeeNumber}`,
            envelopeId: envelope.id,
            note,
          }),
        },
      });

      return {
        req,
        creditId,
        envelopeLabel: envelope.label,
        remainingEnvelopeMinor: (BigInt(envelope.remainingMinor) - req.amountMinor).toString(),
      };
    });

    const { req } = result;
    const formattedAmount = (Number(req.amountMinor) / 100).toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN',
    });

    // Real-time email notification to requester
    if (req.requester?.workEmail) {
      sendApprovalDecisionEmail({
        to: req.requester.workEmail,
        recipientName: req.requester.legalName,
        decision: 'APPROVED',
        decidedBy: actor.legalName,
        decidedByRole: actor.role,
        requestNumber: req.requestNumber,
        title: req.title,
        amountMinor: Number(req.amountMinor),
        reason: note || 'Authorized and credited to internal wallet for disbursement.',
      }).catch((emailErr) => console.error(`[Wallet Release Email Error] Requisition ${req.requestNumber}:`, emailErr));
    }

    return NextResponse.json({
      success: true,
      message: `Funds successfully credited to ${req.requester.legalName}'s internal wallet.`,
      creditId: result.creditId,
      requestNumber: req.requestNumber,
      title: req.title,
      amountFormatted: formattedAmount,
      amountMinor: req.amountMinor.toString(),
      staff: {
        id: req.requester.id,
        name: req.requester.legalName,
        employeeNumber: req.requester.employeeNumber,
        walletNumber: `WLT-${req.requester.employeeNumber}`,
        role: req.requester.role,
      },
      subsidiary: {
        id: req.subsidiary.id,
        name: req.subsidiary.legalName,
        envelopeLabel: result.envelopeLabel,
      },
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    });
  } catch (error: any) {
    console.error('Wallet release approval error:', error);
    if (error instanceof WalletError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const msg = error?.message || 'Failed to release funds to staff wallet.';
    if (msg.startsWith('NO_BUDGET_ENVELOPE:')) {
      return NextResponse.json(
        {
          error: msg.replace('NO_BUDGET_ENVELOPE:', ''),
          code: 'NO_BUDGET_ENVELOPE',
          allocateUrl: '/finance?tab=Wallets+%26+funded+budgets',
        },
        { status: 422 }
      );
    }
    if (msg.startsWith('INSUFFICIENT_BUDGET_BUFFER:')) {
      return NextResponse.json(
        {
          error: msg.replace('INSUFFICIENT_BUDGET_BUFFER:', ''),
          code: 'INSUFFICIENT_BUDGET_BUFFER',
          allocateUrl: '/finance?tab=Wallets+%26+funded+budgets',
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to release funds to staff wallet.' },
      { status: 500 }
    );
  }
}
