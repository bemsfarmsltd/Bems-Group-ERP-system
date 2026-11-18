import { describe, expect, it, vi } from 'vitest';
import { POST } from '../backend/api/requests/[requestNumber]/recurring-autopay/route';
import { WalletError } from '../src/lib/wallet/errors';

const { actor, checkPin, updateRequest } = vi.hoisted(() => ({
  actor: { id: 'gmd', role: 'GMD', legalName: 'GMD' },
  checkPin: vi.fn(),
  updateRequest: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/gmd-access', () => ({ canApproveWalletRelease: () => true }));
vi.mock('@/lib/wallet/approval-security', () => ({ checkApprovalPin: checkPin }));
vi.mock('@/lib/wallet/security', () => ({ sessionBinding: vi.fn() }));
vi.mock('@/lib/wallet/http', () => ({ walletHttp: (_request: Request, handler: (employee: typeof actor) => unknown) => handler(actor) }));
vi.mock('@/lib/wallet/core', async () => ({
  ...(await import('../src/lib/wallet/errors')),
  liveWalletActor: vi.fn().mockResolvedValue(actor),
  walletTransaction: (callback: (tx: unknown) => unknown) => callback({
    expenditureRequest: { update: updateRequest },
  }),
}));

describe('Recurring Auto-Pay approval', () => {
  it('returns the PIN failure after the transaction and leaves the recurring policy untouched', async () => {
    checkPin.mockResolvedValue(new WalletError('APPROVAL_PIN_INVALID', 'Incorrect PIN.', 403));
    const request = new Request('http://localhost/api/requests/test/recurring-autopay', {
      method: 'POST',
      body: JSON.stringify({ pin: '54321876', autoPay: true }),
    });
    await expect(POST(request, { params: Promise.resolve({ requestNumber: 'test' }) }))
      .rejects.toMatchObject({ code: 'APPROVAL_PIN_INVALID' });
    expect(updateRequest).not.toHaveBeenCalled();
  });
});
