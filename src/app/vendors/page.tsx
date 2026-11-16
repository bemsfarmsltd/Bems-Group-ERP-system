import React from 'react';
import { redirect } from 'next/navigation';
import { getSsrPageData } from '@/lib/ssr-api';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import { VendorsClient } from './VendorsClient';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const { status, data } = await getSsrPageData('vendors');
  if (status === 401 || !data?.actor) {
    redirect('/?redirect=/vendors');
  }

  const initialRole = data.actor.role === 'GMD' ? 'GMD' : data.isExecutive ? 'SystemAdmin' : 'Staff';

  return (
    <ConnectAppShell initialRole={initialRole}>
      <VendorsClient initialVendors={data.vendors || []} />
    </ConnectAppShell>
  );
}
