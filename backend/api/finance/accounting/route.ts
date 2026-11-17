import { randomUUID } from 'node:crypto';
import { walletHttp } from '@/lib/wallet/http';
import { liveWalletActor, walletJson } from '@/lib/wallet/core';
import { getAllowedSubsidiariesForModule, hasActionPermission, hasCategoryAccess } from '@/lib/admin-permissions';
import { type AuthenticatedEmployee } from '@/lib/auth';
import { resolveAuthorizedOrganizationScope } from '@/lib/organizations';
import { prisma } from '@/lib/prisma';
import { canActorApproveFunds, canApproveWalletRelease } from '@/lib/gmd-access';
import { executeFinanceAction } from '@/lib/finance/actions';
import { dateField, field, invalid } from '@/lib/finance/ledger';
import { readFinanceWorkspace } from '@/lib/finance/read';

export const dynamic = 'force-dynamic';
const category = 'Accounting';

async function authorizedScope(actor: AuthenticatedEmployee, scope: string | null) {
  if (!hasCategoryAccess(actor.role, actor.customAdminPermissions, 'finance', category)) invalid('Accounting access is required.', 403);
  const requested = await resolveAuthorizedOrganizationScope(actor, scope);
  const granted = getAllowedSubsidiariesForModule(actor.role, actor.customAdminPermissions, 'finance');
  const organizations = await prisma.organization.findMany({
    where: { status: 'ACTIVE', defaultCurrency: 'NGN', id: { in: requested.organizationIds.filter(id => granted === 'ALL' || granted.includes(id)) } },
    select: { id: true, legalName: true, type: true, parentGroupId: true }, orderBy: { legalName: 'asc' },
  });
  if (!organizations.length) invalid('No authorized NGN accounting entity is available.', 403);
  return { organizations, canConsolidate: requested.isGroup && organizations.length === requested.organizationIds.length
    && organizations.filter(org => org.type === 'GROUP').length === 1 };
}

export async function GET(request: Request) {
  return walletHttp(request, async actor => {
    await prisma.$transaction(tx => liveWalletActor(tx, actor));
    const query = new URL(request.url).searchParams;
    const { organizations, canConsolidate } = await authorizedScope(actor, query.get('scope'));
    const org = organizations.find(org => org.id === query.get('entity')) ?? (!query.has('entity') ? organizations[0] : null);
    if (!org) invalid('Choose an authorized accounting entity.', 403);
    const month = dateField((query.get('month') ?? new Date().toISOString().slice(0, 7)) + '-01', 'report month').slice(0, 7);
    const consolidated = query.get('consolidated') === 'true';
    if (consolidated && !canConsolidate) invalid('Consolidation requires access to the whole NGN group.', 403);
    const result = await readFinanceWorkspace({ organizationId: org.id, bookIds: consolidated ? organizations.map(org => org.id) : [org.id], consolidated, month });
    return walletJson({ ...result, organizations, entity: org.id, month, canConsolidate,
      canManage: hasActionPermission(actor.role, actor.customAdminPermissions, 'finance', category, 'manage_accounting'),
      canClose: canApproveWalletRelease(actor), canPost: await canActorApproveFunds(actor) });
  });
}

const postingActions = new Set(['POST_JOURNAL','REVERSE_JOURNAL','RECORD_OPEN_ITEM','SETTLE_OPEN_ITEM','REGISTER_ASSET','DEPRECIATE_ASSET','DISPOSE_ASSET']);
export async function POST(request: Request) {
  return walletHttp(request, async actor => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Enter an accounting action.');
    const action = field(body.action, 'action');
    const entity = field(body.entity, 'entity');
    const { organizations, canConsolidate } = await authorizedScope(actor, typeof body.scope === 'string' ? body.scope : null);
    const org = organizations.find(o => o.id === entity);
    if (!org || !hasActionPermission(actor.role, actor.customAdminPermissions, 'finance', category, 'manage_accounting')) {
      invalid('You do not have permission to change this accounting book.', 403);
    }
    return prisma.$transaction(async tx => {
      const employee = await liveWalletActor(tx, actor);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'finance-accounting:' + entity},0))`;
      if (postingActions.has(action) && !(await canActorApproveFunds(employee, tx))) invalid('The designated financial approver must post this entry.', 403);
      if (action === 'CLOSE_PERIOD' && !canApproveWalletRelease(employee)) invalid('Only the designated GMD can close a financial period.', 403);
      const target = await executeFinanceAction({ tx, actorId: actor.id, organizationId: entity, body, isGroup: org.type === 'GROUP' && canConsolidate }, action);
      await tx.auditEvent.create({ data: {
        actorId: employee.id, actorName: employee.legalName, actorRole: employee.role,
        groupId: org.parentGroupId ?? org.id, subsidiaryId: entity, targetType: 'FINANCE_ACCOUNTING',
        targetId: String(target), action, correlationId: randomUUID(),
      } });
      return { success: true, result: target };
    }, { timeout: 20000 });
  });
}
