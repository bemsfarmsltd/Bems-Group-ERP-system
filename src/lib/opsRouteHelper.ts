import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  type AuthenticatedEmployee,
  getAuthenticatedEmployee,
  hasAnyRole,
  hasEmployeePermission,
} from '@/lib/auth';
import { getAllowedSubsidiariesForModule } from '@/lib/admin-permissions';
import { hasStaffAppModuleAccess } from '@/lib/staff-modules';

export type OpsWorkOrderStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'ASSIGNED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'AWAITING_INPUT'
  | 'BLOCKED'
  | 'REVIEW'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export const OPS_WORK_ORDER_TRANSITIONS: Record<OpsWorkOrderStatus, OpsWorkOrderStatus[]> = {
  NEW: ['TRIAGED', 'ASSIGNED', 'CANCELLED'],
  TRIAGED: ['ASSIGNED', 'SCHEDULED', 'CANCELLED'],
  ASSIGNED: ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_INPUT', 'BLOCKED', 'REVIEW', 'COMPLETED'],
  AWAITING_INPUT: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  REVIEW: ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

export function isValidOpsTransition(fromStatus: string, toStatus: string): boolean {
  const from = fromStatus.toUpperCase() as OpsWorkOrderStatus;
  const to = toStatus.toUpperCase() as OpsWorkOrderStatus;
  if (from === to) return true;
  const allowed = OPS_WORK_ORDER_TRANSITIONS[from];
  return Array.isArray(allowed) ? allowed.includes(to) : false;
}

export interface OpsContext {
  actor: AuthenticatedEmployee;
  isExecutive: boolean;
  isStaff: boolean;
  allowedSubIds: string[];
  useSubFilter: boolean;
}

export async function resolveOperationsContext(
  req: Request,
  options: { allowStaffApp?: boolean } = {}
): Promise<{ error: NextResponse } | OpsContext> {
  const actor = await getAuthenticatedEmployee(req);
  if (!actor) {
    return {
      error: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    };
  }

  const roleUpper = String(actor.role || 'STAFF').toUpperCase();
  const isStaff = roleUpper === 'STAFF' || (roleUpper === 'CUSTOM_ADMIN' && Boolean(options.allowStaffApp) && !hasEmployeePermission(actor, 'operations'));

  if (isStaff) {
    if (!options.allowStaffApp) {
      return {
        error: NextResponse.json(
          { error: 'Forbidden: Operations Management Console is restricted to Operations Admins and Executives.' },
          { status: 403 }
        ),
      };
    }
    if (!hasStaffAppModuleAccess(actor, 'operations')) {
      return {
        error: NextResponse.json(
          { error: 'Forbidden: Operations Management module is not enabled for your Staff App account.' },
          { status: 403 }
        ),
      };
    }

    const assignments = await prisma.employeeAssignment.findMany({
      where: { employeeId: actor.id, status: 'ACTIVE' },
      select: { subsidiaryId: true },
    });
    const allowedSubIds = Array.from(new Set(assignments.map((a) => a.subsidiaryId)));
    return {
      actor,
      isExecutive: false,
      isStaff: true,
      allowedSubIds,
      useSubFilter: true,
    };
  }

  const isExecutive = ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(roleUpper);
  if (!isExecutive && roleUpper === 'CUSTOM_ADMIN' && !hasEmployeePermission(actor, 'operations')) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: Operations Management module permission is required.' },
        { status: 403 }
      ),
    };
  }

  const subScope = getAllowedSubsidiariesForModule(
    actor.role,
    actor.customAdminPermissions,
    'operations',
    actor.subsidiaryId
  );
  if (subScope === 'ALL') {
    return {
      actor,
      isExecutive,
      isStaff: false,
      allowedSubIds: [],
      useSubFilter: false,
    };
  }

  return {
    actor,
    isExecutive,
    isStaff: false,
    allowedSubIds: subScope,
    useSubFilter: true,
  };
}

export function requireCustomAdminOpsAction(
  actor: AuthenticatedEmployee,
  category: string,
  action: string
): NextResponse | null {
  const roleUpper = String(actor.role || '').toUpperCase();
  if (hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN'])) return null;
  if (roleUpper === 'CUSTOM_ADMIN') {
    if (
      hasEmployeePermission(actor, 'operations', category, action) ||
      hasEmployeePermission(actor, 'operations', 'operations_core', 'manage_records')
    ) {
      return null;
    }
    return NextResponse.json(
      { error: `Forbidden: Custom Admin lacks operations permission (${category}:${action}).` },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function generateWorkOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const count = await prisma.opsWorkOrder.count({
    where: { workOrderNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

export async function logOpsAudit(params: {
  actor: AuthenticatedEmployee;
  action: string;
  targetType: string;
  targetId: string;
  subsidiaryId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: params.actor.id,
        actorName: params.actor.legalName,
        actorRole: params.actor.role,
        groupId: 'BEMS_GROUP',
        subsidiaryId: params.subsidiaryId || null,
        targetType: params.targetType,
        targetId: params.targetId,
        action: params.action,
        module: 'OPERATIONS',
        correlationId: `ops-${params.targetId}-${Date.now()}`,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (err) {
    console.warn('Could not write operations audit event:', err);
  }
}
