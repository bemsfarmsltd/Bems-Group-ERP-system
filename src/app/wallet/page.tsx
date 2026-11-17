import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import { isStaffAccount } from '@/lib/portal-access';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import WalletView from '@/components/wallet/WalletView';

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  const actor = await getSsrActor();
  if (!actor) redirect('/?redirect=/wallet');
  if (!isStaffAccount(actor.role)) redirect('/wallet/funding');
  return (
    <ConnectAppShell initialRole="Staff">
      <WalletView />
    </ConnectAppShell>
  );
}
