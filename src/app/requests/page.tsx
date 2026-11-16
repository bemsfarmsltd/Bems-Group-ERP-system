import React from 'react';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import { RequestsInventoryClient } from './RequestsInventoryClient';
import { redirect } from 'next/navigation';
import { getSsrPageData } from '@/lib/ssr-api';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const { status, data } = await getSsrPageData('requests');
  if (status === 401 || !data?.actor) {
    redirect('/');
  }

  return (
    <ConnectAppShell>
      <RequestsInventoryClient
        requests={data.requests || []}
        subsidiaries={data.subsidiaries || []}
        vendors={data.vendors || []}
        currentStaff={data.currentStaff || null}
      />
    </ConnectAppShell>
  );
}
