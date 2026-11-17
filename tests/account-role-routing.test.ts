import type { Prisma } from '@prisma/client';
import { assertSingleActiveGmd, assertSingleActiveSystemAdmin } from '../src/lib/employee-lifecycle';
import { describe, expect, it, vi } from 'vitest';
import { CANONICAL_ROLES, hasAnyRole, normalizeSystemRole, publicEmployee, type AuthenticatedEmployee } from '../src/lib/auth';
import { hasModuleAccess } from '../src/lib/admin-permissions';
import { canAccessEmployeePortal, isStaffAccount } from '../src/lib/portal-access';

describe('Staff identity and custom grants', () => {
  it('exposes four canonical role codes while accepting the legacy System Admin alias', () => {
    expect(Object.keys(CANONICAL_ROLES)).toEqual(['GMD', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN', 'STAFF']);
    expect(normalizeSystemRole(' super_admin ')).toBe('SYSTEM_ADMIN');
    expect(publicEmployee({ role: 'SUPER_ADMIN' }).role).toBe('SYSTEM_ADMIN');
    expect(publicEmployee({ role: 'SUPER_ADMIN', customAdminProfileId: 'legacy-scoped' }).role).toBe('CUSTOM_ADMIN');
  });

  it('checks both legacy and canonical System Admin records for the same active seat', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'current-admin' });
    const tx = { employee: { findFirst } } as unknown as Prisma.TransactionClient;
    await expect(assertSingleActiveSystemAdmin(undefined, tx)).rejects.toMatchObject({ statusCode: 409 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      role: { in: ['SYSTEM_ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE', approvalStatus: 'APPROVED',
    }) }));
    findFirst.mockResolvedValue(null);
    await expect(assertSingleActiveSystemAdmin('current-admin', tx)).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: 'current-admin' } }) }));
  });

  it('rejects a second active GMD', async () => {
    const tx = { employee: { findFirst: vi.fn().mockResolvedValue({ id: 'current-gmd' }) } } as unknown as Prisma.TransactionClient;
    await expect(assertSingleActiveGmd(undefined, tx)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps employment access for delegated staff without granting executive roles', () => {
    const actor = { role: 'CUSTOM_ADMIN', status: 'ON_LEAVE', approvalStatus: 'APPROVED' };
    expect(isStaffAccount(actor.role)).toBe(true);
    expect(canAccessEmployeePortal(actor)).toBe(true);
    expect(hasAnyRole(actor as AuthenticatedEmployee, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN'])).toBe(false);
    expect(canAccessEmployeePortal({ ...actor, status: 'SUSPENDED' })).toBe(false);
  });

  it('does not assign modules when a custom profile is empty, disabled, or missing', () => {
    for (const permissionsJson of ['{}', '{"finance":{"enabled":false}}', null]) {
      const actor = publicEmployee({ role: 'CUSTOM_ADMIN', customAdminProfile: { permissionsJson } });
      expect(hasModuleAccess(actor.role, actor.customAdminPermissions, 'finance')).toBe(false);
    }
  });
});
