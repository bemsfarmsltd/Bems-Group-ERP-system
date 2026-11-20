import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { fundApprovalOrganization } from '@/lib/gmd-access';
import { verifyPassword } from '@/lib/auth';
import { hash, WalletError, type WalletActor } from './core';

type Tx = Prisma.TransactionClient;
type Credential = { pinHash: string; failedAttempts: number; lockedAt: Date | null; recoveryUntil: Date | null };
export const otpPolicyKey = 'WALLET_RELEASE_EMAIL_OTP_REQUIRED';

export async function approvalCredential(tx: Tx, employeeId: string) {
  const [record] = await tx.$queryRaw<Credential[]>`SELECT * FROM "WalletApprovalCredential" WHERE "employeeId"=${employeeId} FOR UPDATE`;
  return record;
}

export async function approvalOtpRequired(tx: Tx) {
  const org = await fundApprovalOrganization(tx);
  if (!org) return true;
  const policy = await tx.workspaceSetting.findUnique({
    where: { organizationId_key: { organizationId: org.id, key: otpPolicyKey } },
  });
  return policy?.value !== 'false';
}

export async function invalidateApprovalChallenges(tx: Tx, employeeId: string | null) {
  await tx.$executeRaw`
    UPDATE "WalletChallenge" SET "usedAt"=now()
    WHERE "purpose"='RELEASE' AND "usedAt" IS NULL AND (${employeeId}::text IS NULL OR "actorId"=${employeeId})
  `;
}

export async function approvalSecurityAudit(tx: Tx, actor: WalletActor, targetId: string, action: string, metadata = {}) {
  const org = await fundApprovalOrganization(tx);
  if (!org) throw new WalletError('APPROVAL_CONFIGURATION_REQUIRED', 'Configure the active group before changing approval security.', 503);
  await tx.auditEvent.create({ data: {
    actorId: actor.id, actorName: actor.legalName, actorRole: actor.role, groupId: org.id, subsidiaryId: org.id,
    targetType: 'WALLET_APPROVAL_SECURITY', targetId, action, correlationId: randomUUID(), metadata: JSON.stringify(metadata),
  } });
}

export async function checkApprovalPin(tx: Tx, actor: WalletActor, pin: unknown) {
  const credential = await approvalCredential(tx, actor.id);
  if (!credential) return new WalletError('APPROVAL_PIN_REQUIRED', 'Set your approval PIN in Control Center before approving funds.', 403);
  if (credential.lockedAt) return new WalletError('APPROVAL_PIN_LOCKED', 'Financial approval is locked. Ask a Super Admin to authorize PIN recovery.', 423);
  if (typeof pin === 'string' && /^\d{8}$/.test(pin) && await verifyPassword(pin, credential.pinHash)) {
    if (credential.failedAttempts) await tx.$executeRaw`UPDATE "WalletApprovalCredential" SET "failedAttempts"=0 WHERE "employeeId"=${actor.id}`;
    return hash(credential.pinHash);
  }
  const attempts = credential.failedAttempts + 1;
  await tx.$executeRaw`UPDATE "WalletApprovalCredential" SET "failedAttempts"=${attempts},"lockedAt"=CASE WHEN ${attempts} >= 3 THEN now() ELSE NULL END WHERE "employeeId"=${actor.id}`;
  if (attempts < 3) return new WalletError('APPROVAL_PIN_INVALID', `Incorrect approval PIN. ${3 - attempts} attempt(s) remaining.`, 403);

  if (actor.role === 'GMD') {
    await tx.authSession.deleteMany({ where: { employeeId: actor.id } });
  }
  await invalidateApprovalChallenges(tx, actor.id);
  await approvalSecurityAudit(tx, actor, actor.id, 'APPROVAL_PIN_LOCKED');
  const recipients = await tx.employee.findMany({
    where: { approvalStatus: 'APPROVED', status: 'ACTIVE', OR: [
      { id: actor.id }, { id: process.env.BEMS_FINANCIAL_GMD_ID || '' }, { role: { in: ['SYSTEM_ADMIN', 'SUPER_ADMIN'] } },
    ] },
    select: { id: true },
  });
  await tx.systemNotification.createMany({ data: recipients.map(({ id }) => ({
    employeeId: id, category: 'SECURITY', priority: 'CRITICAL', kind: 'APPROVAL_PIN_LOCKED', title: 'Wallet approval PIN locked',
    body: `${actor.legalName} entered an incorrect approval PIN three times. ${actor.role === 'GMD' ? 'Sign-in and financial approvals are' : 'Financial approvals are'} locked until recovery is authorized.`,
    linkUrl: '/control-center?section=wallet-approval',
  })) });
  void import('@/lib/notifications/policy-matrix').then(m => m.dispatchMatrixNotifications({
    eventKey: 'SECURITY_PIN_RECOVERY',
    title: 'Wallet Approval PIN Locked',
    body: `${actor.legalName} entered an incorrect approval PIN three times and is locked pending recovery.`,
    category: 'SECURITY',
    priority: 'CRITICAL',
    actionLabel: 'Open Wallet Security',
    actionUrl: '/control-center?section=wallet-approval',
    targetEmployeeId: actor.id,
    skipTargetInApp: true,
  })).catch(() => {});
  return new WalletError('APPROVAL_PIN_LOCKED', actor.role === 'GMD' ? 'Sign-in and financial approval locked after three incorrect PIN entries. Contact your System Admin.' : 'Financial approval locked after three incorrect PIN entries.', 423);
}

export function releaseOtpDigest(challengeId: string, otp: string) {
  const secret = process.env.MONNIFY_SECRET_KEY;
  if (!secret) throw new WalletError('APPROVAL_CONFIGURATION_REQUIRED', 'Approval verification is unavailable.', 503);
  return createHmac('sha256', secret).update(`bems-wallet-release-otp:${challengeId}:${otp}`).digest('hex');
}

export function matchesReleaseOtp(challengeId: string, otp: unknown, digest: string) {
  return typeof otp === 'string' && /^\d{6}$/.test(otp)
    && timingSafeEqual(Buffer.from(releaseOtpDigest(challengeId, otp), 'hex'), Buffer.from(digest, 'hex'));
}
