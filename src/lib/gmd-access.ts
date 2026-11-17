import { prisma } from '@/lib/prisma';

import type { Prisma } from '@prisma/client';

const FUND_APPROVER_KEY = 'DELEGATED_FUND_APPROVER_ID';
type PolicyDb = Pick<Prisma.TransactionClient, 'organization' | 'workspaceSetting'>;

export function superAdminGmdAccessEnabled(): boolean {
  return process.env.BEMS_SUPER_ADMIN_GMD_ACCESS === 'true';
}

export function hasGmdFeatureAccess(role: unknown, allowSuperAdmin = superAdminGmdAccessEnabled()): boolean {
  return role === 'GMD' || (allowSuperAdmin && (role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN'));
}

export function canApproveWalletRelease(actor: { id: string; role: string }): boolean {
  return actor.role === 'GMD' && (!process.env.BEMS_FINANCIAL_GMD_ID || actor.id === process.env.BEMS_FINANCIAL_GMD_ID);
}

export async function fundApprovalOrganization(db: PolicyDb) {
  return db.organization.findFirst({
    where: { parentGroupId: null, status: 'ACTIVE' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
}

export async function getFundApprovalPolicy(db: PolicyDb = prisma) {
  const organization = await fundApprovalOrganization(db);
  const setting = organization && await db.workspaceSetting.findUnique({
    where: { organizationId_key: { organizationId: organization.id, key: FUND_APPROVER_KEY } },
  });
  return {
    delegateId: process.env.BEMS_SUPER_ADMIN_GMD_ACCESS === 'false' ? null : setting?.value || null,
    updatedAt: setting?.updatedAt.toISOString() ?? null,
    updatedById: setting?.updatedById ?? null,
  };
}

export async function setFundApprovalPolicy(db: PolicyDb, organizationId: string, actorId: string, delegateId: string | null) {
  const data = { value: delegateId ?? '', updatedById: actorId };
  await db.workspaceSetting.upsert({
    where: { organizationId_key: { organizationId, key: FUND_APPROVER_KEY } },
    update: data,
    create: { organizationId, key: FUND_APPROVER_KEY, ...data },
  });
}

export async function canActorApproveFunds(actor: { id: string; role: string }, db: PolicyDb = prisma): Promise<boolean> {
  if (canApproveWalletRelease(actor)) return true;
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'SYSTEM_ADMIN') return false;
  return (await getFundApprovalPolicy(db)).delegateId === actor.id;
}

export function financialApproverLabel(): string {
  return 'designated financial approver';
}
