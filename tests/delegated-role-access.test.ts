import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedEmployee } from '../src/lib/auth';
import { requireCustomAdminHrAction } from '../src/lib/hrRouteHelper';
import { findPasswordRecoveryAccount, passwordRecoveryTokenKey } from '../src/lib/password-recovery';
import { readFundingDashboard } from '../src/lib/wallet/core';

const { tx } = vi.hoisted(() => ({
  tx: {
    employee: { findUnique: vi.fn(), findMany: vi.fn() },
    customAdminProfile: { findUnique: vi.fn() },
    organization: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { ...tx, $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) },
}));

const customAdmin = { id: 'delegated', role: 'CUSTOM_ADMIN', legalName: 'Delegated Staff' };
function financeProfile(categories: Record<string, { enabled: boolean; actions: string[] }>) {
  return { permissionsJson: JSON.stringify({
    finance: { enabled: true, subsidiaryScope: 'SELECTED', subsidiaryIds: ['permitted'], categories },
  }) };
}

describe('Delegated role boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.employee.findUnique.mockResolvedValue({
      ...customAdmin, status: 'ACTIVE', approvalStatus: 'APPROVED', customAdminProfileId: 'profile',
    });
  });

  it('denies the funding dashboard to a Finance Overview-only profile', async () => {
    tx.customAdminProfile.findUnique.mockResolvedValue(financeProfile({
      Overview: { enabled: true, actions: ['view_wallet_summary'] },
    }));
    await expect(readFundingDashboard(customAdmin)).rejects.toMatchObject({ status: 403 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('uses the current wallet grant and excludes group-wide data from delegated reads', async () => {
    tx.customAdminProfile.findUnique.mockResolvedValue(financeProfile({
      'Wallets & funded budgets': { enabled: true, actions: ['view_wallets'] },
    }));
    tx.organization.findMany.mockResolvedValue([{ id: 'permitted' }]);
    tx.$queryRaw.mockResolvedValue([]);
    const dashboard = await readFundingDashboard(customAdmin);
    expect(tx.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ['permitted'] } }),
    }));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    for (const args of tx.$queryRaw.mock.calls) expect(args[1].values).toEqual(['permitted']);
    expect(dashboard).toMatchObject({
      scopedReadOnly: true, canApprove: false, funding: null, payrollBatches: [], proposals: [], journals: [],
    });
  });

  it('requires an attendance write action for a Custom Admin with attendance read access', () => {
    const actor = {
      ...customAdmin,
      customAdminPermissions: {
        hr: { enabled: true, subsidiaryScope: 'ALL', subsidiaryIds: [], categories: {
          attendance: { enabled: true, actions: ['view_attendance'] },
        } },
      },
    } as AuthenticatedEmployee;
    expect(requireCustomAdminHrAction(actor, 'attendance', 'override_attendance')?.status).toBe(403);
    actor.customAdminPermissions!.hr!.categories.attendance.actions.push('override_attendance');
    expect(requireCustomAdminHrAction(actor, 'attendance', 'override_attendance')).toBeUndefined();
  });

  it('resolves the legacy Staff and System Admin accounts separately for password recovery', async () => {
    const staff = { id: 'staff', role: 'STAFF' };
    const admin = { id: 'admin', role: 'SUPER_ADMIN' };
    tx.employee.findMany.mockResolvedValue([staff, admin]);
    await expect(findPasswordRecoveryAccount('same@example.test', undefined, undefined)).resolves.toBeNull();
    await expect(findPasswordRecoveryAccount('same@example.test', undefined, 'staff')).resolves.toEqual(staff);
    await expect(findPasswordRecoveryAccount('same@example.test', 'SYSTEM_ADMIN', undefined)).resolves.toEqual(admin);
    expect(passwordRecoveryTokenKey(staff.id)).not.toEqual(passwordRecoveryTokenKey(admin.id));
  });
});
