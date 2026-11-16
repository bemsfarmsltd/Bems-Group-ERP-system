import React from 'react';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import { AccountabilityClient } from './AccountabilityClient';
import { redirect } from 'next/navigation';
import { getSsrPageData } from '@/lib/ssr-api';

export const dynamic = 'force-dynamic';

export default async function AccountabilityPage() {
  const { status, data } = await getSsrPageData('accountability');
  if (status === 401 || !data?.actor) {
    redirect('/');
  }

  return (
    <ConnectAppShell>
      <AccountabilityClient initialCases={data.cases || []} />
    </ConnectAppShell>
  );
}
