import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import { NotificationCentrePanel } from '@/components/notifications/NotificationCentrePanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Notification Centre' };

export default async function NotificationCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const actor = await getSsrActor();
  if (!actor) {
    redirect('/?redirect=/notifications');
  }

  const params = await searchParams;
  const category = params.category || 'ALL';
  const roleUpper = String(actor.role || '').toUpperCase();

  if (['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN'].includes(roleUpper)) {
    const qs = new URLSearchParams({ section: 'notifications' });
    if (category && category !== 'ALL') {
      qs.set('category', category);
    }
    redirect(`/control-center?${qs.toString()}`);
  }

  return <NotificationCentrePanel initialCategory={category} />;
}
