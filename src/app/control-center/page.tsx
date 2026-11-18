import { hasModuleAccess, type CustomAdminPermissionsMap } from '@/lib/admin-permissions';
import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import EnterpriseControlCenterClient, { type ControlSection } from '@/components/control-center/EnterpriseControlCenterClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Control Center' };

const SECTION_ALIAS_MAP: Record<string, ControlSection> = {
  overview: 'overview',
  onboarding: 'onboarding',
  ai_control: 'ai_control',
  'ai-control': 'ai_control',
  wallet_approval: 'wallet_approval',
  'wallet-approval': 'wallet_approval',
  notifications: 'notifications',
  data_retention: 'data_retention',
  'data-retention': 'data_retention',
  mobile_apps: 'mobile_apps',
  'mobile-apps': 'mobile_apps',
  org_structure: 'org_structure',
  'org-structure': 'org_structure',
  audit_trail: 'audit_trail',
  'audit-trail': 'audit_trail',
};

export default async function ControlCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; category?: string }>;
}) {
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

  const resolvedParams = await searchParams;
  const initialSection = resolvedParams.section ? SECTION_ALIAS_MAP[resolvedParams.section] : undefined;

  return (
    <EnterpriseControlCenterClient
      openWalletApprovals={resolvedParams.section === 'wallet-approval'}
      initialSection={initialSection}
      initialNotificationCategory={resolvedParams.category || 'ALL'}
    />
  );
}

