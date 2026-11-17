import { walletHttp } from '@/lib/wallet/http';
import { issueWalletChallenge, sessionBinding, verifyWalletReleaseOtp } from '@/lib/wallet/security';

export async function POST(request: Request) {
  return walletHttp(request, async actor => {
    const body = await request.json();
    const sessionHash = await sessionBinding(request, actor.id);
    if (body.action === 'VERIFY_RELEASE_OTP') {
      return verifyWalletReleaseOtp(actor, { id: body.id, token: body.token, sessionHash }, body.otp);
    }
    return issueWalletChallenge(actor, { purpose: body.purpose, payload: body.payload, password: body.password, pin: body.pin, sessionHash });
  });
}
