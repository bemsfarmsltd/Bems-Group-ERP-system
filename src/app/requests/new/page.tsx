import React from "react";
import { NewRequestForm } from "./NewRequestForm";
import { redirect } from 'next/navigation';
import { getSsrPageData } from '@/lib/ssr-api';
import { ConnectAppShell } from "@/components/layout/ConnectAppShell";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const { status, data } = await getSsrPageData('requests-new');
  const actor = data?.actor;
  if (status === 401 || !actor || actor.role === 'GMD' || actor.role === 'SYSTEM_ADMIN' || actor.role === 'SUPER_ADMIN') {
    redirect('/');
  }
  if (actor.role === 'STAFF' || actor.role === 'CUSTOM_ADMIN') {
    redirect('/staff');
  }

  return (
    <ConnectAppShell>
      <div style={{ padding: '24px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <NewRequestForm
          subsidiaries={data.subsidiaries || []}
          vendors={data.vendors || []}
          employees={data.employees || []}
          currentStaff={data.currentStaff || null}
        />
      </div>
    </ConnectAppShell>
  );
}
