import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import { ConnectAppShell } from '@/components/layout/ConnectAppShell';
import FundingView from '@/components/wallet/FundingView';

export const dynamic = 'force-dynamic';

export default async function FundingPage({ searchParams }: { searchParams: Promise<{ payrollBatch?: string }> }) {
  const actor = await getSsrActor();
  if (!actor) {
    redirect('/?redirect=/wallet/funding');
  }
  if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN'].includes(actor.role)) {
    redirect('/finance');
  }
  const initialRole = actor.role === 'GMD' ? 'GMD' : 'SystemAdmin';
  return (
    <ConnectAppShell initialRole={initialRole}>
      <FundingView initialPayrollBatchId={(await searchParams).payrollBatch} />
    </ConnectAppShell>
  );
}
