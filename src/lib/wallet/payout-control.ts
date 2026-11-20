import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { WalletError } from './errors';

export const GLOBAL_PAYOUT_SETTING_KEY = 'GLOBAL_PAYOUTS_DISABLED';

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface GlobalPayoutControlState {
  disabled: boolean;
  updatedAt: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  reason: string | null;
}

async function resolveRootOrganizationId(db: DbClient = prisma): Promise<string | null> {
  const root = await db.organization.findFirst({
    where: { parentGroupId: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (root?.id) return root.id;
  const fallback = await db.organization.findFirst({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  return fallback?.id || null;
}

export async function getGlobalPayoutControl(db: DbClient = prisma): Promise<GlobalPayoutControlState> {
  const orgId = await resolveRootOrganizationId(db);
  if (!orgId) {
    return {
      disabled: false,
      updatedAt: null,
      updatedById: null,
      updatedByName: null,
      reason: null,
    };
  }

  const setting = await db.workspaceSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId: orgId,
        key: GLOBAL_PAYOUT_SETTING_KEY,
      },
    },
  });

  if (!setting?.value) {
    return {
      disabled: false,
      updatedAt: null,
      updatedById: null,
      updatedByName: null,
      reason: null,
    };
  }

  try {
    const parsed = JSON.parse(setting.value);
    return {
      disabled: Boolean(parsed.disabled),
      updatedAt: parsed.updatedAt || setting.updatedAt.toISOString(),
      updatedById: parsed.updatedById || setting.updatedById || null,
      updatedByName: parsed.updatedByName || null,
      reason: parsed.reason || null,
    };
  } catch {
    return {
      disabled: setting.value === 'true',
      updatedAt: setting.updatedAt.toISOString(),
      updatedById: setting.updatedById || null,
      updatedByName: null,
      reason: null,
    };
  }
}

export async function isGlobalPayoutPaused(db: DbClient = prisma): Promise<boolean> {
  const state = await getGlobalPayoutControl(db);
  return state.disabled;
}

export async function assertPayoutsEnabled(db: DbClient = prisma): Promise<void> {
  const state = await getGlobalPayoutControl(db);
  if (state.disabled) {
    const detail = state.reason
      ? `All payouts are currently disabled in the Enterprise Control Center (${state.reason}).`
      : 'All payouts (including approval payouts and wallet withdrawals) are currently disabled in the Enterprise Control Center.';
    throw new WalletError('GLOBAL_PAYOUTS_DISABLED', detail, 409);
  }
}

export async function setGlobalPayoutControl(
  actor: { id: string; legalName: string; role: string },
  disabled: boolean,
  reason?: string | null
): Promise<GlobalPayoutControlState> {
  const orgId = await resolveRootOrganizationId(prisma);
  if (!orgId) {
    throw new WalletError('ORG_NOT_FOUND', 'No root organization configured.', 400);
  }

  const nowIso = new Date().toISOString();
  const cleanReason = reason ? String(reason).trim().slice(0, 280) : null;
  const state: GlobalPayoutControlState = {
    disabled: Boolean(disabled),
    updatedAt: nowIso,
    updatedById: actor.id,
    updatedByName: actor.legalName,
    reason: cleanReason,
  };

  const serialized = JSON.stringify(state);

  await prisma.$transaction(async (tx) => {
    await tx.workspaceSetting.upsert({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: GLOBAL_PAYOUT_SETTING_KEY,
        },
      },
      update: {
        value: serialized,
        updatedById: actor.id,
      },
      create: {
        organizationId: orgId,
        key: GLOBAL_PAYOUT_SETTING_KEY,
        value: serialized,
        updatedById: actor.id,
      },
    });

    await tx.$executeRaw`UPDATE "WalletFundingPool" SET "paused" = ${Boolean(disabled)} WHERE "id" = 'MONNIFY_NGN'`;

    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: orgId,
        subsidiaryId: orgId,
        targetType: 'PAYOUT_CONTROL',
        targetId: GLOBAL_PAYOUT_SETTING_KEY,
        action: disabled ? 'GLOBAL_PAYOUTS_PAUSED' : 'GLOBAL_PAYOUTS_RESUMED',
        metadata: serialized,
        correlationId: `cc-payout-${Date.now()}`,
      },
    });
  });

  return state;
}
