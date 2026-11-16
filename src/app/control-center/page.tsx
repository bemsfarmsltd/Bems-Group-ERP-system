import { redirect } from 'next/navigation';
import { getAuthenticatedEmployee } from '@/lib/auth';
import EnterpriseControlCenterClient from '@/components/control-center/EnterpriseControlCenterClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Control Center' };

export default async function ControlCenterPage() {
  const actor = await getAuthenticatedEmployee();

  if (!actor) {
    redirect('/?redirect=/control-center');
  }

  if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(String(actor.role).toUpperCase())) {
    redirect('/');
  }

  return <EnterpriseControlCenterClient />;
}

