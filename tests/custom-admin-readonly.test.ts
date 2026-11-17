import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createMonnifyComplianceReadOnlyPermissions,
  getAllowedSubsidiariesForModule,
  hasActionPermission,
  hasCategoryAccess,
  hasModuleAccess,
  isReadOnlyCustomAdmin,
} from '@/lib/admin-permissions';
import { hashPassword, hasAnyRole, verifyPassword, type AuthenticatedEmployee } from '@/lib/auth';
import { evaluateReadOnlyGuard } from '../backend/next-route-adapter';

function makeCustomAdmin(permissions = createMonnifyComplianceReadOnlyPermissions()): AuthenticatedEmployee {
  return {
    id: 'emp_monnify_test',
    employeeNumber: 'BEMS-MON-001',
    legalName: 'Monnify Compliance Reviewer',
    workEmail: 'compliance@monnify.test',
    phone: null,
    role: 'CUSTOM_ADMIN',
    avatarUrl: null,
    customAdminProfileId: 'prof_monnify_ro',
    customAdminTitle: 'Monnify Compliance (Read-Only)',
    customAdminPermissions: permissions,
  };
}

describe('CUSTOM_ADMIN role isolation & global read-only enforcement', () => {
  it('never matches SYSTEM_ADMIN, SUPER_ADMIN, or GMD in hasAnyRole', () => {
    const customAdmin = makeCustomAdmin();
    expect(hasAnyRole(customAdmin, ['SYSTEM_ADMIN'])).toBe(false);
    expect(hasAnyRole(customAdmin, ['SUPER_ADMIN'])).toBe(false);
    expect(hasAnyRole(customAdmin, ['GMD'])).toBe(false);
    expect(hasAnyRole(customAdmin, ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD'])).toBe(false);
    expect(hasAnyRole(customAdmin, ['CUSTOM_ADMIN'])).toBe(true);
  });

  it('fails closed when CUSTOM_ADMIN has no permissions map', () => {
    expect(hasModuleAccess('CUSTOM_ADMIN', null, 'finance')).toBe(false);
    expect(hasModuleAccess('CUSTOM_ADMIN', {}, 'finance')).toBe(false);
    expect(hasCategoryAccess('CUSTOM_ADMIN', null, 'finance', 'Overview')).toBe(false);
    expect(hasActionPermission('CUSTOM_ADMIN', null, 'finance', 'Overview', 'view_telemetry')).toBe(false);
    expect(getAllowedSubsidiariesForModule('CUSTOM_ADMIN', null, 'finance')).toEqual([]);
  });

  it('grants only explicitly permitted read actions for Monnify Compliance preset', () => {
    const perms = createMonnifyComplianceReadOnlyPermissions();
    expect(hasModuleAccess('CUSTOM_ADMIN', perms, 'finance')).toBe(true);
    expect(hasModuleAccess('CUSTOM_ADMIN', perms, 'hr')).toBe(false);
    expect(hasActionPermission('CUSTOM_ADMIN', perms, 'finance', 'Treasury accounts', 'view_treasury')).toBe(true);
    expect(hasActionPermission('CUSTOM_ADMIN', perms, 'finance', 'Approvals & payments', 'disburse_monnify')).toBe(false);
    expect(hasActionPermission('CUSTOM_ADMIN', perms, 'control-center', 'audit_trail', 'view_audit_logs')).toBe(true);
    expect(hasActionPermission('CUSTOM_ADMIN', perms, 'control-center', 'onboarding', 'invite_new_admin')).toBe(false);
  });

  it('detects strictly read-only CUSTOM_ADMIN profiles and flips false on any mutating or secret action', () => {
    const roPerms = createMonnifyComplianceReadOnlyPermissions();
    expect(isReadOnlyCustomAdmin('CUSTOM_ADMIN', roPerms)).toBe(true);
    expect(isReadOnlyCustomAdmin('SYSTEM_ADMIN', roPerms)).toBe(false);

    const writablePerms = createMonnifyComplianceReadOnlyPermissions();
    writablePerms.finance!.categories!['Approvals & payments'] = {
      enabled: true,
      actions: ['view_approvals', 'disburse_monnify'],
    };
    expect(isReadOnlyCustomAdmin('CUSTOM_ADMIN', writablePerms)).toBe(false);

    const secretRevealPerms = createMonnifyComplianceReadOnlyPermissions();
    secretRevealPerms.projects = {
      enabled: true,
      subsidiaryScope: 'ALL',
      subsidiaryIds: [],
      categories: {
        handover_vault: { enabled: true, actions: ['view_reveal_credentials'] },
      },
    };
    expect(isReadOnlyCustomAdmin('CUSTOM_ADMIN', secretRevealPerms)).toBe(false);
  });

  it('globally blocks non-auth POST/PUT/PATCH/DELETE for read-only CUSTOM_ADMIN while allowing GET and auth endpoints', async () => {
    const readOnlyActor = makeCustomAdmin();
    const resolveReadOnly = async () => readOnlyActor;

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const req = new NextRequest('https://bemserp.work/api/requests/create', {
        method,
        headers: { cookie: 'bems_session=fake-token' },
      });
      const res = await evaluateReadOnlyGuard(method, '/api/requests/create', req, resolveReadOnly);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
    }

    // Allow GET requests
    const getReq = new NextRequest('https://bemserp.work/api/requests', {
      method: 'GET',
      headers: { cookie: 'bems_session=fake-token' },
    });
    expect(await evaluateReadOnlyGuard('GET', '/api/requests', getReq, resolveReadOnly)).toBeNull();

    // Allow login / logout
    const logoutReq = new NextRequest('https://bemserp.work/api/auth/logout', {
      method: 'POST',
      headers: { cookie: 'bems_session=fake-token' },
    });
    expect(await evaluateReadOnlyGuard('POST', '/api/auth/logout', logoutReq, resolveReadOnly)).toBeNull();

    // Allow writable CUSTOM_ADMIN (still subject to per-route action permissions)
    const writablePerms = createMonnifyComplianceReadOnlyPermissions();
    writablePerms.finance!.categories!['Budgets & commitments'] = {
      enabled: true,
      actions: ['view_budgets', 'create_edit_budget'],
    };
    const writableActor = makeCustomAdmin(writablePerms);
    const postReq = new NextRequest('https://bemserp.work/api/budgets', {
      method: 'POST',
      headers: { cookie: 'bems_session=fake-token' },
    });
    expect(await evaluateReadOnlyGuard('POST', '/api/budgets', postReq, async () => writableActor)).toBeNull();
  });

  it('distinguishes dual Staff and Admin accounts sharing the same email by their separate passwords', async () => {
    const staffHash = await hashPassword('StaffSecret#2026');
    const adminHash = await hashPassword('AdminSecret#2026');
    const candidates = [
      { id: 'emp_staff', workEmail: 'shared@bemsgroup.com', role: 'STAFF', passwordHash: staffHash },
      { id: 'emp_admin', workEmail: 'shared@bemsgroup.com', role: 'SYSTEM_ADMIN', passwordHash: adminHash },
    ];

    const matchByPassword = async (pw: string) => {
      for (const c of candidates) {
        if (await verifyPassword(pw, c.passwordHash)) return c;
      }
      return null;
    };

    const staffMatch = await matchByPassword('StaffSecret#2026');
    expect(staffMatch?.id).toBe('emp_staff');
    expect(staffMatch?.role).toBe('STAFF');

    const adminMatch = await matchByPassword('AdminSecret#2026');
    expect(adminMatch?.id).toBe('emp_admin');
    expect(adminMatch?.role).toBe('SYSTEM_ADMIN');

    expect(await matchByPassword('WrongPassword')).toBeNull();
  });
});
