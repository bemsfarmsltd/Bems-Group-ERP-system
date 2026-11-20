import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { extractRequestForensics } from '@/lib/audit-forensics';
import { dispatchMatrixNotifications } from '@/lib/notifications/policy-matrix';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ requestNumber?: string; id?: string }> }
) {
  try {
    const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true });
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const canOverridePayout =
      hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']) ||
      (hasAnyRole(actor, ['CUSTOM_ADMIN']) &&
        (hasEmployeePermission(actor, 'finance', 'Approvals & payments', 'approve_requests') ||
          hasEmployeePermission(actor, 'finance', 'Wallets & funded budgets', 'release_wallet_funds')));

    if (!canOverridePayout) {
      return NextResponse.json(
        { error: 'Executive authority is required to override or pause payouts.' },
        { status: 403 }
      );
    }

    const resolvedParams = await context.params;
    const identifier = String(resolvedParams.requestNumber || resolvedParams.id || '').trim();
    if (!identifier) {
      return NextResponse.json({ error: 'Request identifier is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const paused = Boolean(body.paused);
    const reason = body.reason ? String(body.reason).trim().slice(0, 280) : null;

    const target = await prisma.expenditureRequest.findFirst({
      where: {
        OR: [
          { id: identifier },
          { requestNumber: identifier },
          { requestNumber: identifier.toUpperCase() },
        ],
      },
      select: {
        id: true,
        requestNumber: true,
        title: true,
        approvalStatus: true,
        paymentStatus: true,
        requestedById: true,
        groupId: true,
        subsidiaryId: true,
      },
    });

    if (!target) {
      return NextResponse.json({ error: `Requisition '${identifier}' not found.` }, { status: 404 });
    }

    if (target.approvalStatus !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Only approved requisitions can have their payout paused or resumed.' },
        { status: 409 }
      );
    }

    if (['PAID', 'RECIPIENT_CONFIRMED', 'MONNIFY_SUCCEEDED', 'AWAITING_RECIPIENT_CONFIRMATION'].includes(target.paymentStatus)) {
      return NextResponse.json(
        { error: `This requisition payout has already been disbursed (${target.paymentStatus}) and cannot be paused.` },
        { status: 409 }
      );
    }

    const forensics = extractRequestForensics(request);

    const updated = await prisma.$transaction(async (tx) => {
      if (paused) {
        // Freeze any already-credited wallet lots for this request so the staff member cannot withdraw
        await tx.$executeRaw`
          UPDATE "WalletCreditLot"
          SET "frozen" = true
          WHERE "sourceType" = 'REQUEST' AND "sourceId" = ${target.id}
        `;

        // Expire any pending release previews for this request
        await tx.$executeRaw`
          UPDATE "WalletReleaseProposal"
          SET "status" = 'EXPIRED'
          WHERE "status" = 'PENDING'
            AND "id" IN (
              SELECT "proposalId" FROM "WalletReleaseItem" WHERE "sourceId" = ${target.id}
            )
        `;

        const reqUpdated = await tx.expenditureRequest.update({
          where: { id: target.id },
          data: {
            paymentStatus: 'PAUSED',
            requestVersion: { increment: 1 },
          },
          select: { id: true, requestNumber: true, paymentStatus: true },
        });

        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            actorName: actor.legalName,
            actorRole: actor.role,
            groupId: target.groupId,
            subsidiaryId: target.subsidiaryId,
            targetType: 'EXPENDITURE_REQUEST',
            targetId: target.id,
            action: 'REQUEST_PAYOUT_PAUSED',
            metadata: JSON.stringify({
              requestNumber: target.requestNumber,
              previousPaymentStatus: target.paymentStatus,
              newPaymentStatus: 'PAUSED',
              reason,
            }),
            correlationId: randomUUID(),
            module: 'FINANCE',
            ...forensics,
          },
        });

        await tx.systemNotification.create({
          data: {
            employeeId: target.requestedById,
            kind: 'REQUEST_PAYOUT_PAUSED',
            title: `Payout Paused: ${target.requestNumber}`,
            body: reason
              ? `Payout for approved requisition "${target.title}" was placed on temporary hold by ${actor.legalName}: ${reason}`
              : `Payout for approved requisition "${target.title}" was placed on temporary hold by ${actor.legalName}.`,
            linkUrl: `/requests/${target.requestNumber}`,
          },
        });

        return reqUpdated;
      } else {
        // Unfreeze any wallet credit lots for this request
        await tx.$executeRaw`
          UPDATE "WalletCreditLot"
          SET "frozen" = false
          WHERE "sourceType" = 'REQUEST' AND "sourceId" = ${target.id}
        `;

        const [credited] = await tx.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::integer AS "count"
          FROM "WalletCreditLot" c
          JOIN "WalletReleaseProposal" p ON p."id" = c."proposalId"
          WHERE c."sourceType" = 'REQUEST'
            AND c."sourceId" = ${target.id}
            AND p."status" = 'EXECUTED'
        `;
        const restoredStatus = Number(credited?.count || 0) > 0 ? 'WALLET_CREDITED' : 'UNPAID';

        const reqUpdated = await tx.expenditureRequest.update({
          where: { id: target.id },
          data: {
            paymentStatus: restoredStatus,
            requestVersion: { increment: 1 },
          },
          select: { id: true, requestNumber: true, paymentStatus: true },
        });

        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            actorName: actor.legalName,
            actorRole: actor.role,
            groupId: target.groupId,
            subsidiaryId: target.subsidiaryId,
            targetType: 'EXPENDITURE_REQUEST',
            targetId: target.id,
            action: 'REQUEST_PAYOUT_RESUMED',
            metadata: JSON.stringify({
              requestNumber: target.requestNumber,
              previousPaymentStatus: target.paymentStatus,
              newPaymentStatus: restoredStatus,
              reason,
            }),
            correlationId: randomUUID(),
            module: 'FINANCE',
            ...forensics,
          },
        });

        await tx.systemNotification.create({
          data: {
            employeeId: target.requestedById,
            kind: 'REQUEST_PAYOUT_RESUMED',
            title: `Payout Resumed: ${target.requestNumber}`,
            body: `Payout hold on approved requisition "${target.title}" has been lifted by ${actor.legalName}.`,
            linkUrl: `/requests/${target.requestNumber}`,
          },
        });

        return reqUpdated;
      }
    });

    void dispatchMatrixNotifications({
      eventKey: 'REQUEST_PAYOUT_PAUSED',
      title: paused ? `Payout Paused: ${target.requestNumber}` : `Payout Resumed: ${target.requestNumber}`,
      body: paused
        ? `Payout for approved requisition "${target.title}" was overridden and placed on hold by ${actor.legalName}${reason ? `: ${reason}` : '.'}`
        : `Payout hold on approved requisition "${target.title}" was lifted by ${actor.legalName}.`,
      category: 'REQUESTS_APPROVALS',
      priority: 'CRITICAL',
      actionLabel: 'View Request',
      actionUrl: `/requests/${target.requestNumber}`,
      targetEmployeeId: target.requestedById,
      skipTargetInApp: true,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      requestId: updated.id,
      requestNumber: updated.requestNumber,
      paymentStatus: updated.paymentStatus,
      paused: updated.paymentStatus === 'PAUSED',
    });
  } catch (error: any) {
    console.error('POST /api/requests/[requestNumber]/payout-hold error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update payout hold status.' },
      { status: 500 }
    );
  }
}
