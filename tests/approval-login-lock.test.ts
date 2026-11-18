import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { hashPassword, isApprovalLoginLocked, passwordMatchesApprovalPin } from '../src/lib/auth';

const { findCredential } = vi.hoisted(() => ({ findCredential: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { walletApprovalCredential: { findUnique: findCredential } },
}));

describe('Approval PIN and sign-in', () => {
  it('blocks GMD sign-in until the System Admin opens a recovery window', async () => {
    const gmd = { id: 'gmd', role: 'GMD' };
    const lockedAt = new Date();
    findCredential.mockResolvedValue({ lockedAt, recoveryUntil: null });
    await expect(isApprovalLoginLocked(gmd)).resolves.toBe(true);
    findCredential.mockResolvedValue({ lockedAt, recoveryUntil: new Date(Date.now() - 60_000) });
    await expect(isApprovalLoginLocked(gmd)).resolves.toBe(true);
    findCredential.mockResolvedValue({ lockedAt, recoveryUntil: new Date(Date.now() + 60_000) });
    await expect(isApprovalLoginLocked(gmd)).resolves.toBe(false);
    await expect(isApprovalLoginLocked({ id: 'admin', role: 'SYSTEM_ADMIN' })).resolves.toBe(false);
  });

  it('recognizes the existing approval PIN during password changes', async () => {
    findCredential.mockResolvedValue({ pinHash: await hashPassword('54321876') });
    const tx = {
      $queryRaw: vi.fn(),
      walletApprovalCredential: { findUnique: findCredential },
    } as unknown as Prisma.TransactionClient;
    await expect(passwordMatchesApprovalPin(tx, 'gmd', '54321876')).resolves.toBe(true);
    await expect(passwordMatchesApprovalPin(tx, 'gmd', '54321879')).resolves.toBe(false);
  });
});
