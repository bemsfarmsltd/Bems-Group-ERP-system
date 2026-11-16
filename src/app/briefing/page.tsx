import React from 'react';
import { redirect } from 'next/navigation';
import { getSsrPageData, hasSsrAnyRole } from '@/lib/ssr-api';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import { ExecutiveBriefingClient } from './ExecutiveBriefingClient';

export const dynamic = 'force-dynamic';

export default async function ExecutiveBriefingPage() {
  const { status, data } = await getSsrPageData('briefing');
  if (status === 401 || !data?.actor) {
    redirect('/?redirect=/briefing');
  }
  if (!hasSsrAnyRole(data.actor, ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD'])) {
    redirect('/staff');
  }
  if (status === 403 || !data.briefing) {
    redirect('/finance');
  }

  const initialRole = data.actor.role === 'GMD' ? 'GMD' : 'SystemAdmin';

  return (
    <ConnectAppShell initialRole={initialRole}>
      <ExecutiveBriefingClient
        organizations={data.briefing.organizations}
        requests={data.briefing.requests}
        budgets={data.briefing.budgets}
        accountabilityCases={data.briefing.accountabilityCases}
        disbursements={data.briefing.disbursements}
      />
    </ConnectAppShell>
  );
}
