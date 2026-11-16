import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import EnterpriseControlCenterClient from '@/components/control-center/EnterpriseControlCenterClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Control Center' };

export default async function ControlCenterPage() {
  const actor = await getSsrActor();

  if (!actor) {
    redirect('/?redirect=/control-center');
  }

  if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(String(actor.role).toUpperCase())) {
    redirect('/');
  }

  return <EnterpriseControlCenterClient />;
}

