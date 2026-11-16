import { superAdminGmdAccessEnabled } from '@/lib/gmd-access';
import { getAuthenticatedEmployee } from '@/lib/auth';
import { getAccountAiPolicy } from '@/lib/ai-access-control';
import { NextRequest, NextResponse } from 'next/server';
import { walletEnabled } from '@/lib/wallet/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedEmployee(req);
  const policy = actor ? await getAccountAiPolicy(actor.id, actor.role) : null;
  return NextResponse.json(
    {
      walletMode: walletEnabled(),
      superAdminGmdAccess: superAdminGmdAccessEnabled(),
      accountAiEnabled: policy ? policy.aiEnabled : false,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
