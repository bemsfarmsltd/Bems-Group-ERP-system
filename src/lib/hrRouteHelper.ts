import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee, getHrAuthorizationScope, hasEmployeePermission, type AuthenticatedEmployee } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function resolveHrContext(req: Request) {
  const actor = await getAuthenticatedEmployee(req);
  if (!actor) {
    return {
      error: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    };
  }

  const hrScope = await getHrAuthorizationScope(actor);
  if (!hrScope.authorized) {
    return {
      error: NextResponse.json({ error: 'Forbidden. HR workspace access required.' }, { status: 403 }),
    };
  }

  const { searchParams } = new URL(req.url);
  const requestedSubId = searchParams.get('subsidiaryId') || '';

  const allowedSubIds = requestedSubId
    ? hrScope.isGlobal || hrScope.subsidiaryIds.includes(requestedSubId)
      ? [requestedSubId]
      : []
    : hrScope.subsidiaryIds;

  if (requestedSubId && allowedSubIds.length === 0) {
    return { error: NextResponse.json({ error: 'Subsidiary is outside your HR scope.' }, { status: 403 }) };
  }

  const useSubFilter = Boolean(requestedSubId) || !hrScope.isGlobal;
  const orgWhere = useSubFilter ? { organizationId: { in: allowedSubIds } } : {};

  const defaultOrg = await prisma.organization.findFirst({
    where: requestedSubId
      ? { id: requestedSubId }
      : { status: 'ACTIVE', ...(hrScope.isGlobal ? {} : { id: { in: allowedSubIds } }) },
    orderBy: { type: 'asc' },
    select: { id: true },
  });

  return {
    actor,
    hrScope,
    requestedSubId,
    allowedSubIds,
    useSubFilter,
    orgWhere,
    defaultOrgId: requestedSubId || defaultOrg?.id || allowedSubIds[0] || '',
  };
}

export function requireCustomAdminHrAction(actor: AuthenticatedEmployee, category: string, action: string) {
  if (actor.role === 'CUSTOM_ADMIN' && !hasEmployeePermission(actor, 'hr', category, action)) {
    return NextResponse.json({ error: 'This action is outside your HR permissions.' }, { status: 403 });
  }
}

export function canUseSubFilter(hrScope: { isGlobal: boolean; subsidiaryIds: string[] }, orgId: string) {
  if (!orgId) return hrScope.isGlobal;
  return hrScope.isGlobal || hrScope.subsidiaryIds.includes(orgId);
}

export async function logHrAudit(params: {
  actorId: string;
  actorName: string;
  actorRole: string;
  groupId: string;
  subsidiaryId?: string;
  targetType: string;
  targetId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        groupId: params.groupId,
        subsidiaryId: params.subsidiaryId || null,
        targetType: params.targetType,
        targetId: params.targetId,
        action: params.action,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        correlationId: `hr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
  } catch (e) {
    console.error('Failed to write HR audit event:', e);
  }
}

export function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T;
}

