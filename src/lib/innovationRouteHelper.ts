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
import { invalidateDistributedCache } from '@/lib/server-cache';
import { publishRealtimeEvent } from '@/lib/realtime';

export type FeatureWorkflowStage =
  | 'IDEA'
  | 'DISCOVERY'
  | 'VALIDATED'
  | 'PRIORITIZED'
  | 'APPROVED'
  | 'DEVELOPMENT_READY'
  | 'IN_DEVELOPMENT'
  | 'VERIFIED'
  | 'RELEASED'
  | 'IMPACT_REVIEW';

export const FEATURE_STAGE_ORDER: FeatureWorkflowStage[] = [
  'IDEA',
  'DISCOVERY',
  'VALIDATED',
  'PRIORITIZED',
  'APPROVED',
  'DEVELOPMENT_READY',
  'IN_DEVELOPMENT',
  'VERIFIED',
  'RELEASED',
  'IMPACT_REVIEW',
];

// Stages that require GMD / Executive or explicit Product Owner approval authority (Sections 5 & 43)
export const APPROVAL_GATED_FEATURE_STAGES = new Set<string>([
  'APPROVED',
  'RELEASED',
]);

export interface InnovationContext {
  actor: AuthenticatedEmployee;
  isExecutive: boolean;
  isStaff: boolean;
  allowedSubIds: string[];
  useSubFilter: boolean;
}

export async function resolveInnovationContext(
  req: Request,
  options: { allowStaffApp?: boolean } = { allowStaffApp: true }
): Promise<{ error: NextResponse } | InnovationContext> {
  const actor = await getAuthenticatedEmployee(req);
  if (!actor) {
    return {
      error: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    };
  }

  const roleUpper = String(actor.role || 'STAFF').toUpperCase();
  const isStaff = roleUpper === 'STAFF' || (roleUpper === 'CUSTOM_ADMIN' && !hasEmployeePermission(actor, 'innovation'));

  if (isStaff) {
    if (options.allowStaffApp === false) {
      return {
        error: NextResponse.json(
          { error: 'Forbidden: This Product Management administration endpoint requires executive or product manager authority.' },
          { status: 403 }
        ),
      };
    }

    // Check if staff has either 'innovation' module enabled OR an active ProductMembership
    const hasMod = hasStaffAppModuleAccess(actor, 'innovation');
    const membershipCount = await prisma.productMembership.count({
      where: { employeeId: actor.id, status: 'ACTIVE' },
    }).catch(() => 0);

    if (!hasMod && membershipCount === 0) {
      return {
        error: NextResponse.json(
          { error: 'Forbidden: Product Management & Innovation module is not enabled for your Staff App account.' },
          { status: 403 }
        ),
      };
    }

    const [assignments, memberships] = await Promise.all([
      prisma.employeeAssignment.findMany({
        where: { employeeId: actor.id, status: 'ACTIVE' },
        select: { subsidiaryId: true },
      }),
      prisma.productMembership.findMany({
        where: { employeeId: actor.id, status: 'ACTIVE' },
        include: { product: { select: { organizationId: true } } },
      }).catch(() => []),
    ]);

    const allowedSubIds = Array.from(
      new Set([
        ...assignments.map((a) => a.subsidiaryId),
        ...memberships.map((m) => m.product?.organizationId).filter((id): id is string => Boolean(id)),
      ])
    );

    return {
      actor,
      isExecutive: false,
      isStaff: true,
      allowedSubIds,
      useSubFilter: allowedSubIds.length > 0,
    };
  }

  const isExecutive = ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(roleUpper);
  if (!isExecutive && roleUpper === 'CUSTOM_ADMIN' && !hasEmployeePermission(actor, 'innovation')) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: Product Management & Innovation module permission is required.' },
        { status: 403 }
      ),
    };
  }

  const subScope = getAllowedSubsidiariesForModule(
    actor.role,
    actor.customAdminPermissions,
    'innovation',
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

/**
 * Evaluates whether the actor can approve high-impact product gates (Section 60:
 * SYSTEM_ADMIN technical control does not automatically imply business authority to approve product investments;
 * GMD or designated Product Owner / Executive Sponsor holds approval authority).
 */
export async function canApproveProductGate(
  actor: AuthenticatedEmployee,
  productId?: string | null,
  gateType?: string
): Promise<boolean> {
  const roleUpper = String(actor.role || '').toUpperCase();
  if (roleUpper === 'GMD') return true;

  // Investment & Launch Go/No-Go gates require GMD or explicit Executive Sponsor
  if (gateType === 'INVESTMENT_GATE' || gateType === 'LAUNCH_GO_NO_GO') {
    if (!productId) return roleUpper === 'GMD';
    const prod = await prisma.product.findUnique({
      where: { id: productId },
      select: { sponsorId: true, ownerId: true },
    });
    if (prod?.sponsorId === actor.id) return true;
    return roleUpper === 'GMD';
  }

  if (['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(roleUpper)) return true;

  if (productId) {
    const membership = await prisma.productMembership.findUnique({
      where: { productId_employeeId: { productId, employeeId: actor.id } },
    });
    if (
      membership &&
      membership.status === 'ACTIVE' &&
      (['APPROVE', 'MANAGE'].includes(membership.accessScope) ||
        ['PRODUCT_OWNER', 'PRODUCT_MANAGER', 'EXECUTIVE_SPONSOR'].includes(membership.productRole))
    ) {
      return true;
    }
  }

  return false;
}

export function computeRiceScore(reach: number, impact: number, confidencePct: number, effort: number): number {
  const safeEffort = effort > 0 ? effort : 1;
  const confRatio = Math.max(0, Math.min(100, confidencePct)) / 100;
  return Math.round(((reach * impact * confRatio) / safeEffort) * 10) / 10;
}

export async function generateInnovationCode(prefix: string, modelName: string, fieldName: string): Promise<string> {
  const year = new Date().getFullYear();
  const fullPrefix = `${prefix}-${year}-`;
  const delegate = (prisma as any)[modelName];
  const count = delegate
    ? await delegate.count({
        where: { [fieldName]: { startsWith: fullPrefix } },
      }).catch(() => 0)
    : 0;
  return `${fullPrefix}${String(count + 1).padStart(3, '0')}`;
}

export async function logInnovationAudit(params: {
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
        module: 'PRODUCT_INNOVATION',
        correlationId: `pm-${params.targetId}-${Date.now()}`,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
    await invalidateDistributedCache('innovation-overview:');
    await publishRealtimeEvent('innovation', params.action, {
      targetType: params.targetType,
      targetId: params.targetId,
      actorName: params.actor.legalName,
      subsidiaryId: params.subsidiaryId || null,
    });
  } catch (err) {
    console.warn('Could not write product innovation audit event:', err);
  }
}
