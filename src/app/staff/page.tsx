import React from 'react';
import { redirect } from 'next/navigation';
import { getSsrPageData } from '@/lib/ssr-api';
import { StaffPortalContainer } from '@/components/dashboard/staff/StaffPortalContainer';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const { status, data } = await getSsrPageData('staff');

  if (status === 401 || !data?.actor) {
    redirect('/?redirect=/staff');
  }
  if (status === 403 || !data.staffUser) {
    redirect('/');
  }

  return (
    <StaffPortalContainer
      user={data.staffUser}
      businessName={data.businessName || 'Staff Workspace'}
      subsidiaries={data.subsidiaries || []}
      vendors={data.vendors || []}
      currentStaff={data.currentStaff || null}
    />
  );
}
