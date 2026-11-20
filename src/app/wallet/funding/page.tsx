import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import { hasActionPermission, type CustomAdminPermissionsMap } from '@/lib/admin-permissions';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import FundingView from '@/components/wallet/FundingView';

export const dynamic = 'force-dynamic';

export default async function FundingPage({ searchParams }: { searchParams: Promise<{ payrollBatch?: string }> }) {
  const actor = await getSsrActor();
  if (actor) {
    if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN'].includes(actor.role)) {
      redirect('/staff');
    }
    if (
      actor.role === 'CUSTOM_ADMIN' &&
      !hasActionPermission(actor.role, actor.customAdminPermissions as CustomAdminPermissionsMap | null, 'finance', 'Wallets & funded budgets', 'view_wallets')
    ) {
      redirect('/finance');
    }
  }
  const initialRole = actor?.role === 'GMD' ? 'GMD' : 'SystemAdmin';
  return (
    <ConnectAppShell initialRole={initialRole}>
      <FundingView initialPayrollBatchId={(await searchParams).payrollBatch} />
    </ConnectAppShell>
  );
}
