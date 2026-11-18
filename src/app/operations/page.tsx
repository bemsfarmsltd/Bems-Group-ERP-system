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

  return <OperationsWorkspaceClient actorName={actor.legalName} actorRole={actor.role} />;
}
