import { describe, expect, it, vi } from 'vitest';
import { buildBackendServer } from '../backend/server';
import { filterModuleEmailRecipients } from '../src/lib/email-routing';
import { checkRecurringDisbursementEligibility } from '../src/lib/recurring-reminders';
import { canActorApproveFunds, canApproveWalletRelease, superAdminGmdAccessEnabled } from '../src/lib/gmd-access';

import { approvalOtpRequired, matchesReleaseOtp, releaseOtpDigest } from '../src/lib/wallet/approval-security';
import { challengePayload } from '../src/lib/wallet/security';
import { requireCommitments } from '../src/lib/wallet/core';
import { hasAuthorizedTransfer } from '../src/lib/wallet/transfer-authorization';

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

  it('binds approval notes without changing an existing no-note challenge', () => {
    const payload = { id: 'proposal-1', confirmationHash: 'a'.repeat(64) };
    expect(challengePayload('RELEASE', payload)).toEqual(payload);
    expect(challengePayload('RELEASE', { ...payload, note: 'Approved for travel' }))
      .toEqual({ ...payload, note: 'Approved for travel' });
    expect(() => challengePayload('RELEASE', { ...payload, note: 'a'.repeat(1001) })).toThrow();
  });

  it('requires explicit live wallet opt-in and Monnify validation', () => {
    vi.stubEnv('MONNIFY_API_KEY', 'test-key');
    vi.stubEnv('MONNIFY_SECRET_KEY', 'test-secret');
    vi.stubEnv('BEMS_WALLET_ENABLED', 'true');
    vi.stubEnv('MONNIFY_ENVIRONMENT', 'live');
    vi.stubEnv('BEMS_WALLET_TRANSFERS_ENABLED', 'true');
    vi.stubEnv('BEMS_WALLET_LIVE_ENABLED', 'true');
    vi.stubEnv('BEMS_MONNIFY_VALIDATION_ENABLED', undefined);
    vi.stubEnv('BEMS_FINANCIAL_GMD_ID', 'gmd-1');
    vi.stubEnv('MONNIFY_MERCHANT_CODE', 'test-merchant');
    try {
      expect(() => requireCommitments()).toThrow('Live wallet commitments are not activated.');
      vi.stubEnv('BEMS_MONNIFY_VALIDATION_ENABLED', 'true');
      expect(() => requireCommitments()).not.toThrow();
      vi.stubEnv('BEMS_FINANCIAL_GMD_ID', undefined);
      expect(() => requireCommitments()).toThrow('Live wallet commitments are not activated.');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a staff transfer with missing holds, a short allocation, or a changed bank', async () => {
    const query = vi.fn();
    const tx = { $queryRaw: query } as unknown as Parameters<typeof hasAuthorizedTransfer>[0];
    const transfer = {
      id: 'withdrawal', employeeId: 'staff', targetType: 'STAFF', amountMinor: BigInt(10000),
      proposalId: null, requestId: null, vendorId: null, bankAccountId: 'verified-bank',
      bankCode: '058', accountNumber: '0123456789', accountName: 'Staff Member', intentHash: 'stored',
    };
    for (const evidence of [
      { amount: BigInt(0), valid: false, bankVerified: true },
      { amount: BigInt(9999), valid: true, bankVerified: true },
      { amount: BigInt(10000), valid: true, bankVerified: false },
    ]) {
      query.mockResolvedValueOnce([evidence]);
      expect(await hasAuthorizedTransfer(tx, transfer)).toBe(false);
    }
    query.mockResolvedValueOnce([{ amount: BigInt(10000), valid: true, bankVerified: true }]);
    expect(await hasAuthorizedTransfer(tx, transfer)).toBe(true);
  });

  it('requires approval OTP by default and only honors an explicit off policy', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const tx = {
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'group' }) },
      workspaceSetting: { findUnique },
    } as unknown as Parameters<typeof approvalOtpRequired>[0];
    expect(await approvalOtpRequired(tx)).toBe(true);
    findUnique.mockResolvedValueOnce({ value: 'false' });
    expect(await approvalOtpRequired(tx)).toBe(false);
    findUnique.mockResolvedValueOnce({ value: 'unknown' });
    expect(await approvalOtpRequired(tx)).toBe(true);
  });

  it('binds the email OTP digest to a single release challenge', () => {
    vi.stubEnv('MONNIFY_SECRET_KEY', 'wallet-otp-test-key');
    try {
      const digest = releaseOtpDigest('release-one', '582071');
      expect(matchesReleaseOtp('release-one', '582071', digest)).toBe(true);
      expect(matchesReleaseOtp('release-two', '582071', digest)).toBe(false);
      expect(matchesReleaseOtp('release-one', '582072', digest)).toBe(false);
      expect(matchesReleaseOtp('release-one', 582071, digest)).toBe(false);
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

      const recoveryRes = await app.inject({
        method: 'POST',
        url: '/api/control-center/wallet-approval-security',
        headers: { 'content-type': 'application/json' },
        payload: { action: 'AUTHORIZE_RECOVERY', targetId: 'gmd' },
      });
      expect([401, 403]).toContain(recoveryRes.statusCode);

      const withdrawRes = await app.inject({
        method: 'POST',
        url: '/api/wallet/withdrawals',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ intent: { amountMinor: '10000' } }),
      });
      expect([401, 403]).toContain(withdrawRes.statusCode);

      const payslipRes = await app.inject({
        method: 'GET',
        url: '/api/payroll/items/test-item-id/payslip',
      });
      expect(payslipRes.statusCode).toBe(401);

      const autoPayRes = await app.inject({
        method: 'POST',
        url: '/api/requests/REQ-2026-0001/recurring-autopay',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ autoPay: true, pin: '12345678' }),
      });
      expect([401, 403]).toContain(autoPayRes.statusCode);

      const dossierRes = await app.inject({
        method: 'GET',
        url: '/api/admin/employees/test-emp-id/dossier',
      });
      expect([401, 403]).toContain(dossierRes.statusCode);
    } finally {
      await app.close();
      if (prevTransfers === undefined) delete process.env.BEMS_WALLET_TRANSFERS_ENABLED;
      else process.env.BEMS_WALLET_TRANSFERS_ENABLED = prevTransfers;
    }
  });

  it('excludes HR-only admins from finance email alerts and blocks early recurring disbursements', () => {
    const recipients = filterModuleEmailRecipients([
      { id: 'gmd-1', legalName: 'GMD', workEmail: 'gmd@bemserp.work', role: 'GMD' },
      { id: 'hr-1', legalName: 'HR Only Admin', workEmail: 'hr@bemserp.work', role: 'SYSTEM_ADMIN', customAdminPermissions: { hr: { enabled: true, categories: { 'Staff Profiles': { enabled: true, actions: ['view'] } }, subsidiaries: 'ALL' } } },
      { id: 'fin-1', legalName: 'Finance Admin', workEmail: 'fin@bemserp.work', role: 'SYSTEM_ADMIN', customAdminPermissions: { finance: { enabled: true, categories: { Overview: { enabled: true, actions: ['view'] } }, subsidiaries: 'ALL' } } },
    ], 'finance');
    expect(recipients.map(r => r.id)).toEqual(['gmd-1', 'fin-1']);

    const blocked = checkRecurringDisbursementEligibility({
      isRecurring: true,
      recurringLastPaidAt: new Date('2026-11-01T00:00:00Z'),
      recurringNextDueAt: new Date('2026-12-01T00:00:00Z'),
    }, new Date('2026-11-17T00:00:00Z'));
    expect(blocked.allowed).toBe(false);
  });
});
