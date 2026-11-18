import { hashPassword } from '@/lib/auth';
import { canActorApproveFunds, canApproveWalletRelease, fundApprovalOrganization } from '@/lib/gmd-access';
import { prisma } from '@/lib/prisma';
import { approvalCredential, approvalOtpRequired, approvalSecurityAudit, checkApprovalPin, invalidateApprovalChallenges, otpPolicyKey } from '@/lib/wallet/approval-security';
import { hash, liveWalletActor, WalletError, walletTransaction } from '@/lib/wallet/core';
import { walletHttp } from '@/lib/wallet/http';
import { sessionBinding, verifyWalletPassword } from '@/lib/wallet/security';

export async function GET(request: Request) {
  return walletHttp(request, async actor => {
    const canApprove = await canActorApproveFunds(actor);
    const canRecover = actor.role === 'SUPER_ADMIN' || actor.role === 'SYSTEM_ADMIN';
    if (!canApprove && !canRecover) throw new WalletError('NOT_PERMITTED', 'Wallet approval authority is required.', 403);
    return prisma.$transaction(async tx => {
      await liveWalletActor(tx, actor);
      const credential = canApprove && await approvalCredential(tx, actor.id);
      const lockedAccounts = canRecover ? await tx.$queryRaw<Array<{ id: string; legalName: string; recoveryUntil: Date | null }>>`
        SELECT e."id",e."legalName",c."recoveryUntil" FROM "WalletApprovalCredential" c
        JOIN "Employee" e ON e."id"=c."employeeId"
        WHERE c."lockedAt" IS NOT NULL AND e."id"<>${actor.id} AND e."status"='ACTIVE'
        ORDER BY e."legalName"
      ` : [];
      return {
        canApprove, canChangeOtp: canApproveWalletRelease(actor), canRecover, lockedAccounts,
        pinSet: Boolean(credential), locked: Boolean(credential && credential.lockedAt),
        recoveryAuthorized: Boolean(credential && credential.recoveryUntil && credential.recoveryUntil > new Date()),
        otpRequired: await approvalOtpRequired(tx),
      };
    });
  });
}

export async function POST(request: Request) {
  return walletHttp(request, async actor => {
    await sessionBinding(request, actor.id);
    const body = await request.json().catch(() => null);
    if (!body || !['SET_PIN', 'AUTHORIZE_RECOVERY', 'SET_OTP_POLICY'].includes(body.action)) {
      throw new WalletError('INVALID_ACTION', 'Choose an approval security action.', 400);
    }
    const isRecovery = body.action === 'AUTHORIZE_RECOVERY';
    if (isRecovery && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SYSTEM_ADMIN') throw new WalletError('NOT_PERMITTED', 'Only a Super Admin can authorize recovery.', 403);
    const credentialHash = await verifyWalletPassword(actor, body.password, isRecovery ? false : body.action === 'SET_OTP_POLICY' ? 'GMD' : true);
    if (body.action === 'SET_PIN' && (typeof body.pin !== 'string' || !/^\d{8}$/.test(body.pin) ||
      /^(\d)\1{7}$/.test(body.pin) || ['01234567', '12345678', '23456789', '98765432', '87654321'].includes(body.pin) || body.pin === body.password)) {
      throw new WalletError('INVALID_PIN', 'Choose a separate eight-digit PIN. Avoid repeated digits and common sequences.', 400);
    }
    const pinHash = body.action === 'SET_PIN' ? await hashPassword(body.pin) : null;
    const result = await walletTransaction(async tx => {
      if (body.action === 'SET_PIN') {
        await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id"=${actor.id} FOR UPDATE`;
      }
      const employee = await liveWalletActor(tx, actor, isRecovery ? false : body.action === 'SET_OTP_POLICY' ? 'GMD' : true);
      if (hash(employee.passwordHash) !== credentialHash) throw new WalletError('CREDENTIAL_CHANGED', 'Sign in again and retry.', 403);
      if (isRecovery) {
        if (typeof body.targetId !== 'string' || body.targetId === actor.id) {
          throw new WalletError('INVALID_RECOVERY_TARGET', 'Select a different account for recovery.', 400);
        }
        const target = await tx.employee.findUnique({ where: { id: body.targetId } });
        const credential = target && await approvalCredential(tx, target.id);
        if (!target || !credential?.lockedAt || target.status !== 'ACTIVE' || target.approvalStatus !== 'APPROVED' || !(await canActorApproveFunds(target, tx))) {
          throw new WalletError('RECOVERY_NOT_AVAILABLE', 'The selected account is not eligible for approval recovery.', 409);
        }
        await tx.$executeRaw`UPDATE "WalletApprovalCredential" SET "recoveryUntil"=now()+interval '30 minutes' WHERE "employeeId"=${target.id}`;
        await invalidateApprovalChallenges(tx, target.id);
        await approvalSecurityAudit(tx, actor, target.id, 'APPROVAL_PIN_RECOVERY_AUTHORIZED');
        await tx.systemNotification.create({ data: { employeeId: target.id, kind: 'APPROVAL_PIN_RECOVERY_AUTHORIZED',
          title: 'Approval PIN recovery authorized', body: 'Set a new approval PIN in Control Center within 30 minutes.',
          linkUrl: '/control-center?section=wallet-approval' } });
        return { success: true };
      }

      if (body.action === 'SET_OTP_POLICY') {
        if (typeof body.required !== 'boolean') throw new WalletError('INVALID_OTP_POLICY', 'Choose whether email OTP is required.', 400);
        if (!body.required) {
          const confirmation = await checkApprovalPin(tx, actor, body.pin);
          if (confirmation instanceof WalletError) return confirmation;
        }
        const org = await fundApprovalOrganization(tx);
        if (!org) throw new WalletError('APPROVAL_CONFIGURATION_REQUIRED', 'Configure the active group first.', 503);
        const setting = { value: String(body.required), updatedById: actor.id };
        await tx.workspaceSetting.upsert({ where: { organizationId_key: { organizationId: org.id, key: otpPolicyKey } },
          create: { organizationId: org.id, key: otpPolicyKey, ...setting }, update: setting });
        await invalidateApprovalChallenges(tx, null);
        await approvalSecurityAudit(tx, actor, org.id, 'APPROVAL_OTP_POLICY_UPDATED', { required: body.required });
        return { success: true };
      }

      const previous = await approvalCredential(tx, actor.id);
      if (previous?.lockedAt && (!previous.recoveryUntil || previous.recoveryUntil <= new Date())) {
        throw new WalletError('APPROVAL_PIN_LOCKED', 'A Super Admin must authorize your PIN recovery.', 423);
      }
      if (previous && !previous.lockedAt) {
        const confirmation = await checkApprovalPin(tx, actor, body.currentPin);
        if (confirmation instanceof WalletError) return confirmation;
      }
      await tx.$executeRaw`
        INSERT INTO "WalletApprovalCredential" ("employeeId","pinHash") VALUES (${actor.id},${pinHash})
        ON CONFLICT ("employeeId") DO UPDATE SET "pinHash"=EXCLUDED."pinHash","failedAttempts"=0,"lockedAt"=NULL,"recoveryUntil"=NULL
      `;
      await invalidateApprovalChallenges(tx, actor.id);
      await approvalSecurityAudit(tx, actor, actor.id, previous ? 'APPROVAL_PIN_REPLACED' : 'APPROVAL_PIN_ENROLLED');
      return { success: true };
    });
    if (result instanceof WalletError) throw result;
    return result;
  });
}
