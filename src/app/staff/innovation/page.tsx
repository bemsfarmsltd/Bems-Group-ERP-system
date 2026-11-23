import { getSsrActor } from '@/lib/ssr-api';
import StaffInnovationPortalClient from '@/components/innovation/StaffInnovationPortalClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS Staff App | Product Management & Innovation Workspace' };

export default async function StaffInnovationPage() {
  const actor = await getSsrActor();

  const resolvedActorName =
    (actor as unknown as { fullName?: string; name?: string; legalName?: string } | null)?.fullName ||
    (actor as unknown as { name?: string } | null)?.name ||
    actor?.legalName ||
    'Staff Contributor';

  return (
    <StaffInnovationPortalClient
      actorName={resolvedActorName}
      actorRole={actor?.role || 'STAFF'}
    />
  );
}
