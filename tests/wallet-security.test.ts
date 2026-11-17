import { describe, expect, it, vi } from 'vitest';
import { buildBackendServer } from '../backend/server';
import { canActorApproveFunds, canApproveWalletRelease, superAdminGmdAccessEnabled } from '../src/lib/gmd-access';

describe('Wallet & Fund Approval Security Controls', () => {
  it('defaults fund release authority strictly to GMD-only', () => {
    const prev = process.env.BEMS_SUPER_ADMIN_GMD_ACCESS;
    delete process.env.BEMS_SUPER_ADMIN_GMD_ACCESS;

    expect(superAdminGmdAccessEnabled()).toBe(false);
    expect(canApproveWalletRelease({ id: 'gmd-1', role: 'GMD' })).toBe(true);
    expect(canApproveWalletRelease({ id: 'sa-1', role: 'SUPER_ADMIN' })).toBe(false);
    expect(canApproveWalletRelease({ id: 'sys-1', role: 'SYSTEM_ADMIN' })).toBe(false);
    expect(canApproveWalletRelease({ id: 'staff-1', role: 'STAFF' })).toBe(false);

    if (prev !== undefined) process.env.BEMS_SUPER_ADMIN_GMD_ACCESS = prev;
  });

  it('allows only the named administrator and respects revocation and the server lock', async () => {
    const db = {
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'group' }) },
      workspaceSetting: { findUnique: vi.fn().mockResolvedValue({
        value: 'delegate-1', updatedAt: new Date(), updatedById: 'gmd-1',
      }) },
    };
    const policyDb = db as unknown as NonNullable<Parameters<typeof canActorApproveFunds>[1]>;
    const delegate = { id: 'delegate-1', role: 'SUPER_ADMIN' };
    vi.stubEnv('BEMS_SUPER_ADMIN_GMD_ACCESS', 'true');
    try {
      expect(await canActorApproveFunds(delegate, policyDb)).toBe(true);
      expect(await canActorApproveFunds({ id: 'other', role: 'SUPER_ADMIN' }, policyDb)).toBe(false);
      expect(await canActorApproveFunds({ ...delegate, role: 'STAFF' }, policyDb)).toBe(false);
      vi.stubEnv('BEMS_SUPER_ADMIN_GMD_ACCESS', 'false');
      expect(await canActorApproveFunds(delegate, policyDb)).toBe(false);
      vi.stubEnv('BEMS_SUPER_ADMIN_GMD_ACCESS', 'true');
      db.workspaceSetting.findUnique.mockResolvedValue(null);
      expect(await canActorApproveFunds(delegate, policyDb)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('blocks unauthenticated access to fund-approval-policy and withdrawals even when transfers are disabled', async () => {
    const prevTransfers = process.env.BEMS_WALLET_TRANSFERS_ENABLED;
    process.env.BEMS_WALLET_TRANSFERS_ENABLED = 'false';

    const app = await buildBackendServer();
    try {
      const policyRes = await app.inject({
        method: 'POST',
        url: '/api/control-center/fund-approval-policy',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ allowSuperAdmin: true, password: 'test' }),
      });
      expect(policyRes.statusCode).toBe(403);

      const withdrawRes = await app.inject({
        method: 'POST',
        url: '/api/wallet/withdrawals',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ intent: { amountMinor: '10000' } }),
      });
      expect([401, 403]).toContain(withdrawRes.statusCode);
    } finally {
      await app.close();
      if (prevTransfers === undefined) delete process.env.BEMS_WALLET_TRANSFERS_ENABLED;
      else process.env.BEMS_WALLET_TRANSFERS_ENABLED = prevTransfers;
    }
  });
});
