import React from 'react';
import { getSsrActor } from '@/lib/ssr-api';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import { MobileAppsViewerClient } from './MobileAppsViewerClient';

export const dynamic = 'force-dynamic';

export default async function MobileAppsPage() {
  const actor = await getSsrActor();

  const userRole = actor?.role || 'GMD';
  const userName = actor?.legalName || 'Executive';

  return (
    <ConnectAppShell initialRole={userRole as any}>
      <MobileAppsViewerClient
        userName={userName}
        userRole={userRole}
      />
    </ConnectAppShell>
  );
}
