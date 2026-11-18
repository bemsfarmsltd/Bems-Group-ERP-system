import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import { hasModuleAccess, type CustomAdminPermissionsMap } from '@/lib/admin-permissions';
import OperationsWorkspaceClient from '@/components/operations/OperationsWorkspaceClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Operations Management' };

export default async function OperationsPage() {
  const actor = await getSsrActor();

  if (!actor) {
    redirect('/?redirect=/operations');
  }

  const roleUpper = String(actor.role || '').toUpperCase();
  if (roleUpper === 'STAFF') {
    redirect('/staff-app/index.html');
  }

  if (
    roleUpper === 'CUSTOM_ADMIN' &&
    !hasModuleAccess(actor.role, actor.customAdminPermissions as CustomAdminPermissionsMap | null, 'operations')
  ) {
    redirect('/');
  }

  const resolvedActorName =
    (actor as unknown as { fullName?: string; name?: string; legalName?: string }).fullName ||
    (actor as unknown as { name?: string }).name ||
    actor.legalName ||
    'Operations User';

  const resolvedActorEmail =
    (actor as unknown as { email?: string; workEmail?: string }).email ||
    actor.workEmail ||
    '';

  return (
    <OperationsWorkspaceClient
      actorName={resolvedActorName}
      actorRole={actor.role || 'ADMIN'}
      actorEmail={resolvedActorEmail}
    />
  );
}
