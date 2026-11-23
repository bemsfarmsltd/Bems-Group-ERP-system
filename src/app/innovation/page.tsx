import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import { hasModuleAccess, type CustomAdminPermissionsMap } from '@/lib/admin-permissions';
import InnovationWorkspaceClient from '@/components/innovation/InnovationWorkspaceClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Product Management & Innovation System' };

export default async function InnovationPortalPage() {
  const actor = await getSsrActor();

  if (actor) {
    const roleUpper = String(actor.role || '').toUpperCase();
    if (roleUpper === 'STAFF') {
      redirect('/staff/innovation');
    }

    if (
      roleUpper === 'CUSTOM_ADMIN' &&
      !hasModuleAccess(actor.role, actor.customAdminPermissions as CustomAdminPermissionsMap | null, 'innovation')
    ) {
      redirect('/staff/innovation');
    }
  }

  const resolvedActorName =
    (actor as unknown as { fullName?: string; name?: string; legalName?: string } | null)?.fullName ||
    (actor as unknown as { name?: string } | null)?.name ||
    actor?.legalName ||
    'Product Executive';

  const resolvedActorEmail =
    (actor as unknown as { email?: string; workEmail?: string } | null)?.email ||
    actor?.workEmail ||
    '';

  return (
    <InnovationWorkspaceClient
      actorName={resolvedActorName}
      actorRole={actor?.role || 'GMD'}
      actorEmail={resolvedActorEmail}
    />
  );
}
