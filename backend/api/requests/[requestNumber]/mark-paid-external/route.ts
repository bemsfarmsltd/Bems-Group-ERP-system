import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedEmployee, verifyPassword } from '@/lib/auth';
import { sendApprovalDecisionEmail } from '@/lib/email';
import { dispatchMatrixNotifications } from '@/lib/notifications/policy-matrix';
import { prisma } from '@/lib/prisma';
import { requestIdentifierWhere } from '@/lib/request-id';
import { accountabilityDeadline } from '@/lib/services/accountability-deadline';
import { extractRequestForensics } from '@/lib/audit-forensics';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestNumber: string }> }
) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(actor.role)) {
      return NextResponse.json(
        { error: 'Only the GMD or Super Admin can record an external off-system payment.' },
        { status: 403 }
      );
    }

    const { requestNumber } = await params;
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const rawNote = typeof body.note === 'string' ? body.note.trim() : '';
    const note = rawNote || 'This payment was made already (not paid via the system).';
    const rawRef = typeof body.reference === 'string' ? body.reference.trim() : '';

    if (!password) {
      return NextResponse.json({ error: 'Enter your account password to confirm external settlement.' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: actor.id },
      select: { id: true, passwordHash: true, legalName: true, role: true },
    });
    if (!employee?.passwordHash || !(await verifyPassword(password, employee.passwordHash))) {
      return NextResponse.json({ error: 'Invalid password. External settlement was not recorded.' }, { status: 403 });
    }

    const req = await prisma.expenditureRequest.findUnique({
      where: requestIdentifierWhere(requestNumber),
      include: {
        requester: true,
        vendor: true,
        channel: true,
        approvalSteps: true,
        disbursements: true,
        accountabilityCase: true,
      },
    });
    if (!req) {
      return NextResponse.json({ error: `Fund request '${requestNumber}' not found.` }, { status: 404 });
    }
    if (req.paymentStatus !== 'UNPAID' || req.disbursements.length > 0) {
      return NextResponse.json(
        { error: `Requisition ${req.requestNumber} already has payment status '${req.paymentStatus}'.` },
        { status: 409 }
      );
    }

    const now = new Date();
    const externalReference = rawRef || `EXT-${req.requestNumber}-${Date.now()}`;
    const beneficiaryName = req.vendor?.accountName || req.vendor?.name || req.requester.accountName || req.requester.legalName;
    const beneficiaryBank = req.vendor?.bankName || req.requester.bankName || 'External Bank / Off-System';
    const beneficiaryAccount = req.vendor?.accountNumber || req.requester.accountNumber || 'OFF-SYSTEM';
    const accountabilityStatus = req.requestType === 'REIMBURSEMENT' ? 'NOT_REQUIRED' : 'PENDING';
    const forensics = extractRequestForensics(request);

    await prisma.$transaction(async (tx) => {
      await tx.approvalStep.updateMany({
        where: { requestId: req.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          approverId: actor.id,
          approverName: actor.legalName,
          decisionReason: note,
          decidedAt: now,
        },
      });

      await tx.expenditureRequest.update({
        where: { id: req.id },
        data: {
          approvalStatus: 'APPROVED',
          paymentStatus: 'PAID',
          accountabilityStatus,
          requestVersion: { increment: 1 },
        },
      });

      await tx.disbursement.create({
        data: {
          requestId: req.id,
          payerOrgId: req.subsidiaryId,
          beneficiaryName,
          beneficiaryBank,
          beneficiaryAccount,
          amountMinor: req.amountMinor,
          currency: req.currency,
          externalReference,
          bankName: 'External / Off-System Payment',
          paidAt: now,
          recordedById: actor.id,
          status: 'PAID',
          idempotencyKey: `ext-${req.id}-${randomUUID()}`,
        },
      });

      if (req.requestType !== 'REIMBURSEMENT' && !req.accountabilityCase) {
        const dueAt = await accountabilityDeadline(req.subsidiaryId, false, now, tx);
        await tx.accountabilityCase.create({
          data: {
            requestId: req.id,
            ownerUserId: req.requestedById,
            requiredDeliverables: req.deliverable,
            dueAt,
            status: 'OPEN',
          },
        });
      }

      if (req.channel) {
        await tx.channelMessage.create({
          data: {
            channelId: req.channel.id,
            authorId: actor.id,
            authorName: actor.legalName,
            authorRole: actor.role,
            body: `External Payment Recorded (Off-System): ${note} [Ref: ${externalReference}]`,
            visibility: 'GROUP',
            messageType: 'SYSTEM',
          },
        });
      }

      await tx.systemNotification.create({
        data: {
          employeeId: req.requestedById,
          category: 'REQUESTS_APPROVALS',
          kind: 'PAYMENT_RECORDED',
          title: `Payment Recorded: ${req.requestNumber}`,
          body: `${req.title} (₦${(Number(req.amountMinor) / 100).toLocaleString('en-NG')}) was marked as paid. Note: ${note}`,
          linkUrl: `/requests/${req.requestNumber}`,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          actorName: actor.legalName,
          actorRole: actor.role,
          groupId: req.groupId,
          subsidiaryId: req.subsidiaryId,
          targetType: 'REQUEST',
          targetId: req.id,
          action: 'EXTERNAL_PAYMENT_RECORDED',
          correlationId: req.requestNumber,
          metadata: JSON.stringify({
            requestNumber: req.requestNumber,
            amountMinor: Number(req.amountMinor),
            externalReference,
            note,
            paidViaSystem: false,
            recordedAt: now.toISOString(),
          }),
          ...forensics,
        },
      });
    });

    if (req.requester?.workEmail) {
      void sendApprovalDecisionEmail({
        to: req.requester.workEmail,
        recipientName: req.requester.legalName,
        decision: 'APPROVED',
        decidedBy: actor.legalName,
        decidedByRole: actor.role,
        requestNumber: req.requestNumber,
        title: req.title,
        amountMinor: Number(req.amountMinor),
        reason: note,
      }).catch((err) => console.error('[External Paid Email Error]', err));
    }

    const amountFormatted = `₦${(Number(req.amountMinor) / 100).toLocaleString('en-NG')}`;
    void dispatchMatrixNotifications({
      eventKey: 'REQUEST_DECISION',
      title: `Request Paid (External): ${req.requestNumber}`,
      body: `${actor.legalName} recorded ${req.requestNumber} (${req.title}, ${amountFormatted}) as paid externally. Note: ${note}`,
      category: 'REQUESTS_APPROVALS',
      priority: 'IMPORTANT',
      actionLabel: 'Open Request',
      actionUrl: `/requests/${req.requestNumber}`,
      targetEmployeeId: req.requestedById,
      skipTargetInApp: true,
    }).catch(() => {});

    void dispatchMatrixNotifications({
      eventKey: 'DISBURSEMENT_RECORDED',
      title: `External Payment Recorded: ${req.requestNumber} (${amountFormatted})`,
      body: `${actor.legalName} recorded off-system payment (${externalReference}) for ${req.requester.legalName}. Note: ${note}`,
      category: 'FINANCE',
      priority: 'IMPORTANT',
      actionLabel: 'Open Request',
      actionUrl: `/requests/${req.requestNumber}`,
      targetEmployeeId: req.requestedById,
      skipTargetInApp: true,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      requestNumber: req.requestNumber,
      externalReference,
      message: `${req.requestNumber} marked as paid (external record saved).`,
    });
  } catch (error: any) {
    console.error('[Mark Paid External Error]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to record external payment.' },
      { status: 500 }
    );
  }
}
