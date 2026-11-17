import { canActorApproveFunds } from '@/lib/gmd-access';
import { WalletError } from '@/lib/wallet/core';
import { walletHttp } from '@/lib/wallet/http';
import { stageWalletRelease } from '@/lib/wallet/releases';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return walletHttp(request, async actor => {
    if (!(await canActorApproveFunds(actor))) {
      throw new WalletError('NOT_PERMITTED', 'Only the designated financial approver can prepare this release.', 403);
    }
    const body = await request.json().catch(() => null);
    if (body?.action !== 'PREPARE' || typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 128) {
      throw new WalletError('RELEASE_PREVIEW_REQUIRED', 'Prepare and confirm the exact release before crediting the wallet.', 409);
    }
    return stageWalletRelease(actor, { sourceType: 'REQUEST', sourceId: body.requestId }, { staffRequestOnly: true });
  });
}
