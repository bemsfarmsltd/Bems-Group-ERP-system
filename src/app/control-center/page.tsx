import { hasModuleAccess, type CustomAdminPermissionsMap } from '@/lib/admin-permissions';
import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import EnterpriseControlCenterClient from '@/components/control-center/EnterpriseControlCenterClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Control Center' };

export default async function ControlCenterPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const actor = await getSsrActor();

  if (!actor) {
    redirect('/?redirect=/control-center');
  }

  if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN'].includes(String(actor.role).toUpperCase())) {
    redirect('/');
  }

  if (actor.role === 'CUSTOM_ADMIN' && !hasModuleAccess(actor.role, actor.customAdminPermissions as CustomAdminPermissionsMap | null, 'control-center')) {
    redirect('/');
  }

  return <EnterpriseControlCenterClient openWalletApprovals={(await searchParams).section === 'wallet-approval'} />;
}

