import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const NOTIFICATION_MATRIX_SETTING_KEY = 'NOTIFICATION_POLICY_MATRIX';

export type NotificationCategoryKey = 'FINANCE' | 'TREASURY' | 'HR_ATTENDANCE' | 'OPS_SECURITY';
export type NotificationChannelKey = 'inApp' | 'email' | 'bridge';
export type MatrixRoleKey = 'STAFF' | 'GMD' | 'SUPER_ADMIN';

export interface NotificationChannelConfig {
  inApp: boolean;
  email: boolean;
  bridge: boolean;
}

export interface NotificationEventDef {
  key: string;
  category: NotificationCategoryKey;
  label: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'STANDARD';
  supportsBridge: boolean;
  defaults: Record<MatrixRoleKey, NotificationChannelConfig> & {
    CUSTOM_ADMIN: NotificationChannelConfig;
  };
}

export const NOTIFICATION_CATEGORIES: Array<{
  key: NotificationCategoryKey;
  label: string;
  description: string;
}> = [
  {
    key: 'FINANCE',
    label: 'Finance & Requisitions',
    description: 'Fund requests, approvals, payout holds, disbursements, 72h SLA & intercompany notes',
  },
  {
    key: 'TREASURY',
    label: 'Treasury, Monnify & Wallets',
    description: 'Monnify wallet funding, GMD fund releases, staff withdrawals, bank changes & kill-switches',
  },
  {
    key: 'HR_ATTENDANCE',
    label: 'Attendance, HR & Payroll',
    description: 'Clock-ins, absence sweeps, daily/weekly digests, leave, onboarding & payroll runs',
  },
  {
    key: 'OPS_SECURITY',
    label: 'Operations, Projects & Security',
    description: 'Field work orders, project tasks, approval PIN recovery & admin policy changes',
  },
];

export const NOTIFICATION_EVENT_CATALOG: NotificationEventDef[] = [
  // 1. FINANCE & REQUISITIONS
  {
    key: 'REQUEST_SUBMITTED',
    category: 'FINANCE',
    label: 'New Fund Request Submitted',
    description: 'Real-time alert whenever staff submit a new expenditure requisition for approval.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'REQUEST_DECISION',
    category: 'FINANCE',
    label: 'Request Approved / Declined / Clarified',
    description: 'Sent when an executive approves, declines, or requests clarification on a requisition.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: false, bridge: false },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'REQUEST_PAYOUT_PAUSED',
    category: 'FINANCE',
    label: 'Approved Payout Paused / Resumed',
    description: 'Triggered when Finance overrides and places an approved requisition payout on hold or resumes it.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'DISBURSEMENT_RECORDED',
    category: 'FINANCE',
    label: 'Bank Disbursement Recorded',
    description: 'Notifies requester and finance auditors when an off-platform bank transfer receipt is logged.',
    severity: 'HIGH',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: false, bridge: false },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'RECIPIENT_CONFIRMATION',
    category: 'FINANCE',
    label: 'Staff Payment Receipt Confirmed / Disputed',
    description: 'Alerts executives when a staff member confirms funds received or flags a payment issue.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'ACCOUNTABILITY_72H_SLA',
    category: 'FINANCE',
    label: '72-Hour Accountability SLA Warning & Overdue',
    description: 'Escalates overdue receipt retirement or unverified expenditure deliverables.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: true },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'RECURRING_COMMITMENT_DUE',
    category: 'FINANCE',
    label: 'Recurring Commitment Due / Auto-Pay Executed',
    description: 'Reminder and confirmation when scheduled recurring bills reach due date or auto-pay runs.',
    severity: 'STANDARD',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'INTERCOMPANY_NOTE',
    category: 'FINANCE',
    label: 'Intercompany Debit / Credit Note Generated',
    description: 'Visibility when cross-subsidiary settlement notes are issued or reconciled.',
    severity: 'STANDARD',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: false, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: false },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'BUDGET_THRESHOLD',
    category: 'FINANCE',
    label: 'Budget Envelope Threshold / Overspend Alert',
    description: 'Warns when a subsidiary budget envelope drops below 15% remaining capacity.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: false, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },

  // 2. TREASURY, MONNIFY & WALLETS
  {
    key: 'MONNIFY_WALLET_FUNDED',
    category: 'TREASURY',
    label: 'Monnify Pool Funded / Balance Increased',
    description: 'Immediate alert when funds land in the corporate Monnify wallet pool.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: false, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: false, email: false, bridge: false },
    },
  },
  {
    key: 'WALLET_RELEASE_EXECUTED',
    category: 'TREASURY',
    label: 'GMD Wallet Fund Release / Vendor Payout Queued',
    description: 'Notifies staff when approved funds hit their wallet and executives when vendor transfers queue.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: false },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: false, email: false, bridge: false },
    },
  },
  {
    key: 'WALLET_WITHDRAWAL_STATUS',
    category: 'TREASURY',
    label: 'Staff Withdrawal Settled / Failed / Reversed',
    description: 'Real-time settlement confirmation or failure/refund alert from Monnify.',
    severity: 'HIGH',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: false, bridge: false },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: false, email: false, bridge: false },
    },
  },
  {
    key: 'WALLET_BANK_CHANGED',
    category: 'TREASURY',
    label: 'Withdrawal Beneficiary Bank Verified / Added',
    description: 'Security audit alert when a staff member links a verified withdrawal bank account.',
    severity: 'HIGH',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: false, bridge: false },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: false, email: false, bridge: false },
    },
  },
  {
    key: 'GLOBAL_PAYOUT_KILLSWITCH',
    category: 'TREASURY',
    label: 'Global Payout Kill-Switch Toggled',
    description: 'Critical governance alert whenever all system payouts are paused or re-enabled in Control Center.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: false, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'WALLET_RECONCILIATION_ISSUE',
    category: 'TREASURY',
    label: 'Monnify Reconciliation / Fee Reserve Alert',
    description: 'Triggers when a transfer mismatch occurs or the Monnify transfer-fee reserve runs low.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: false, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: false, email: false, bridge: false },
    },
  },

  // 3. ATTENDANCE, HR & PAYROLL
  {
    key: 'ATTENDANCE_CLOCK_IN',
    category: 'HR_ATTENDANCE',
    label: 'Staff Clock-In & Late Arrival Alert',
    description: 'Notifies staff on late arrival (>30m grace) and gives HR/GMD live attendance visibility.',
    severity: 'STANDARD',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: false, bridge: false },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'ATTENDANCE_ABSENCE_SWEEP',
    category: 'HR_ATTENDANCE',
    label: '6:00 PM Automated Absence & 5% Deduction',
    description: 'Dispatched when the end-of-day sweeper marks unclocked non-exempt staff as absent.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: false },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'ATTENDANCE_DAILY_DIGEST',
    category: 'HR_ATTENDANCE',
    label: '12:00 PM WAT Executive Daily Attendance Digest',
    description: 'Daily group-wide roll call summary showing present, late, and unclocked staff.',
    severity: 'STANDARD',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: false, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'ATTENDANCE_WEEKLY_SUMMARY',
    category: 'HR_ATTENDANCE',
    label: 'Sunday 12:00 PM Weekly Deduction Summary',
    description: 'Weekly staff pop-up & email detailing month-to-date late/absent deductions and remaining pay.',
    severity: 'STANDARD',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: false },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'ATTENDANCE_OVERRIDE',
    category: 'HR_ATTENDANCE',
    label: 'Attendance Override / Excuse Approved',
    description: 'Notifies staff when HR/GMD overrides an attendance status or approves a lateness excuse.',
    severity: 'STANDARD',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: false, email: false, bridge: false },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },
  {
    key: 'LEAVE_REQUEST',
    category: 'HR_ATTENDANCE',
    label: 'Leave Request Submitted / Decided',
    description: 'Alerts HR & executives on new leave applications and notifies staff on approval/rejection.',
    severity: 'STANDARD',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: false },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'STAFF_ONBOARDING',
    category: 'HR_ATTENDANCE',
    label: 'New Staff Self-Registration & Approval',
    description: 'Alerts GMD & Super Admin when a new staff member registers and notifies staff on approval.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'PAYROLL_LIFECYCLE',
    category: 'HR_ATTENDANCE',
    label: 'Payroll Batch Submitted / Approved / Paid',
    description: 'End-to-end payroll notifications from batch submission to GMD sign-off and payslip release.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'SALARY_COMPENSATION_CHANGE',
    category: 'HR_ATTENDANCE',
    label: 'Salary / Compensation Adjustment',
    description: 'Notifies staff and executives whenever an employee salary agreement is updated.',
    severity: 'CRITICAL',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: false },
      SUPER_ADMIN: { inApp: true, email: true, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: false, bridge: false },
    },
  },

  // 4. OPERATIONS, PROJECTS & SECURITY
  {
    key: 'OPS_DISPATCH_WORK_ORDER',
    category: 'OPS_SECURITY',
    label: 'Operations Work Order, Dispatch & Incident Alert',
    description: 'Real-time visibility for field dispatches, SOP breaches, fleet/stock alerts & incidents.',
    severity: 'HIGH',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'PROJECT_TASK_ASSIGNED',
    category: 'OPS_SECURITY',
    label: 'Project Task Assigned & Milestone Due',
    description: 'Keeps assignees and project leads updated on new tasks, handovers, and deadlines.',
    severity: 'STANDARD',
    supportsBridge: false,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: false, bridge: false },
      SUPER_ADMIN: { inApp: false, email: false, bridge: false },
      CUSTOM_ADMIN: { inApp: true, email: true, bridge: false },
    },
  },
  {
    key: 'SECURITY_PIN_RECOVERY',
    category: 'OPS_SECURITY',
    label: 'Approval PIN Lockout, OTP & Password Recovery',
    description: 'Immediate security alerts for 3x failed PIN lockouts, recovery grants, and credential resets.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: true, email: true, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: false, email: false, bridge: false },
    },
  },
  {
    key: 'ADMIN_ROLE_POLICY_CHANGE',
    category: 'OPS_SECURITY',
    label: 'Admin Invitation, Role & Governance Policy Change',
    description: 'Audit visibility when executive invites are sent, custom profiles edited, or policies changed.',
    severity: 'CRITICAL',
    supportsBridge: true,
    defaults: {
      STAFF: { inApp: false, email: false, bridge: false },
      GMD: { inApp: true, email: true, bridge: true },
      SUPER_ADMIN: { inApp: true, email: true, bridge: true },
      CUSTOM_ADMIN: { inApp: false, email: false, bridge: false },
    },
  },
];

export type RoleEventMap = Record<string, NotificationChannelConfig>;

export interface NotificationPolicyMatrix {
  roles: Record<MatrixRoleKey, RoleEventMap>;
  customProfiles: Record<string, RoleEventMap>;
  updatedAt?: string | null;
  updatedByName?: string | null;
}

export function buildDefaultRoleMap(role: MatrixRoleKey | 'CUSTOM_ADMIN'): RoleEventMap {
  const out: RoleEventMap = {};
  for (const evt of NOTIFICATION_EVENT_CATALOG) {
    out[evt.key] = { ...evt.defaults[role] };
  }
  return out;
}

export function buildDefaultMatrix(customProfileIds: string[] = []): NotificationPolicyMatrix {
  const customProfiles: Record<string, RoleEventMap> = {};
  for (const id of customProfileIds) {
    customProfiles[id] = buildDefaultRoleMap('CUSTOM_ADMIN');
  }
  return {
    roles: {
      STAFF: buildDefaultRoleMap('STAFF'),
      GMD: buildDefaultRoleMap('GMD'),
      SUPER_ADMIN: buildDefaultRoleMap('SUPER_ADMIN'),
    },
    customProfiles,
    updatedAt: null,
    updatedByName: null,
  };
}

function mergeRoleMap(
  base: RoleEventMap,
  incoming?: Record<string, Partial<NotificationChannelConfig>> | null
): RoleEventMap {
  const merged: RoleEventMap = {};
  for (const evt of NOTIFICATION_EVENT_CATALOG) {
    const def = base[evt.key];
    const inc = incoming?.[evt.key];
    merged[evt.key] = {
      inApp: typeof inc?.inApp === 'boolean' ? inc.inApp : def.inApp,
      email: typeof inc?.email === 'boolean' ? inc.email : def.email,
      bridge: evt.supportsBridge
        ? typeof inc?.bridge === 'boolean'
          ? inc.bridge
          : def.bridge
        : false,
    };
  }
  return merged;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function resolveRootOrgId(db: DbClient = prisma): Promise<string | null> {
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

export async function getNotificationPolicyMatrix(
  db: DbClient = prisma,
  customProfileIds?: string[]
): Promise<NotificationPolicyMatrix> {
  let profileIds = customProfileIds;
  if (!profileIds) {
    const profiles = await db.customAdminProfile.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    profileIds = profiles.map((p) => p.id);
  }

  const defaults = buildDefaultMatrix(profileIds);
  const orgId = await resolveRootOrgId(db);
  if (!orgId) return defaults;

  const setting = await db.workspaceSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId: orgId,
        key: NOTIFICATION_MATRIX_SETTING_KEY,
      },
    },
  });

  if (!setting?.value) return defaults;

  try {
    const parsed = JSON.parse(setting.value);
    const customProfiles: Record<string, RoleEventMap> = {};
    const allProfileIds = new Set<string>([
      ...profileIds,
      ...Object.keys(parsed?.customProfiles || {}),
    ]);
    for (const id of allProfileIds) {
      customProfiles[id] = mergeRoleMap(
        buildDefaultRoleMap('CUSTOM_ADMIN'),
        parsed?.customProfiles?.[id]
      );
    }
    return {
      roles: {
        STAFF: mergeRoleMap(defaults.roles.STAFF, parsed?.roles?.STAFF),
        GMD: mergeRoleMap(defaults.roles.GMD, parsed?.roles?.GMD),
        SUPER_ADMIN: mergeRoleMap(defaults.roles.SUPER_ADMIN, parsed?.roles?.SUPER_ADMIN),
      },
      customProfiles,
      updatedAt: parsed?.updatedAt || setting.updatedAt.toISOString(),
      updatedByName: parsed?.updatedByName || null,
    };
  } catch {
    return defaults;
  }
}

export async function saveNotificationPolicyMatrix(
  actor: { id: string; legalName: string; role: string },
  incoming: NotificationPolicyMatrix
): Promise<NotificationPolicyMatrix> {
  const orgId = await resolveRootOrgId(prisma);
  if (!orgId) {
    throw new Error('No root organization configured.');
  }

  const profiles = await prisma.customAdminProfile.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const defaults = buildDefaultMatrix(profiles.map((p) => p.id));

  const customProfiles: Record<string, RoleEventMap> = {};
  const allIds = new Set([
    ...profiles.map((p) => p.id),
    ...Object.keys(incoming.customProfiles || {}),
  ]);
  for (const id of allIds) {
    customProfiles[id] = mergeRoleMap(
      buildDefaultRoleMap('CUSTOM_ADMIN'),
      incoming.customProfiles?.[id]
    );
  }

  const normalized: NotificationPolicyMatrix = {
    roles: {
      STAFF: mergeRoleMap(defaults.roles.STAFF, incoming.roles?.STAFF),
      GMD: mergeRoleMap(defaults.roles.GMD, incoming.roles?.GMD),
      SUPER_ADMIN: mergeRoleMap(defaults.roles.SUPER_ADMIN, incoming.roles?.SUPER_ADMIN),
    },
    customProfiles,
    updatedAt: new Date().toISOString(),
    updatedByName: actor.legalName,
  };

  const serialized = JSON.stringify(normalized);

  await prisma.$transaction(async (tx) => {
    await tx.workspaceSetting.upsert({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: NOTIFICATION_MATRIX_SETTING_KEY,
        },
      },
      update: {
        value: serialized,
        updatedById: actor.id,
      },
      create: {
        organizationId: orgId,
        key: NOTIFICATION_MATRIX_SETTING_KEY,
        value: serialized,
        updatedById: actor.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: orgId,
        subsidiaryId: orgId,
        targetType: 'NOTIFICATION_POLICY',
        targetId: NOTIFICATION_MATRIX_SETTING_KEY,
        action: 'NOTIFICATION_MATRIX_UPDATED',
        metadata: JSON.stringify({ updatedAt: normalized.updatedAt }),
        correlationId: randomUUID(),
      },
    });
  });

  return normalized;
}

export function getChannelConfigFromMatrix(
  matrix: NotificationPolicyMatrix,
  role: string,
  customAdminProfileId: string | null | undefined,
  eventKey: string
): NotificationChannelConfig {
  const evt = NOTIFICATION_EVENT_CATALOG.find((e) => e.key === eventKey);
  const upper = String(role || '').toUpperCase();

  if (customAdminProfileId && matrix.customProfiles[customAdminProfileId]?.[eventKey]) {
    return matrix.customProfiles[customAdminProfileId][eventKey];
  }
  if (upper === 'CUSTOM_ADMIN') {
    return evt?.defaults.CUSTOM_ADMIN ?? { inApp: true, email: false, bridge: false };
  }
  const normalizedRole: MatrixRoleKey =
    upper === 'GMD'
      ? 'GMD'
      : upper === 'SUPER_ADMIN' || upper === 'SYSTEM_ADMIN'
        ? 'SUPER_ADMIN'
        : 'STAFF';
  return (
    matrix.roles[normalizedRole]?.[eventKey] ??
    evt?.defaults[normalizedRole] ?? { inApp: true, email: true, bridge: false }
  );
}

export async function shouldDeliverNotification(params: {
  role: string;
  customAdminProfileId?: string | null;
  eventKey: string;
  channel: NotificationChannelKey;
  matrix?: NotificationPolicyMatrix;
}): Promise<boolean> {
  try {
    const matrix = params.matrix ?? (await getNotificationPolicyMatrix(prisma));
    const cfg = getChannelConfigFromMatrix(
      matrix,
      params.role,
      params.customAdminProfileId,
      params.eventKey
    );
    return Boolean(cfg[params.channel]);
  } catch {
    return true;
  }
}
