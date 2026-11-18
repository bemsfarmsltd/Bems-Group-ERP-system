import { describe, expect, it } from 'vitest';
import { isValidOpsTransition, requireCustomAdminOpsAction } from '@/lib/opsRouteHelper';
import { hasStaffAppModuleAccess } from '@/lib/staff-modules';

describe('Operations Management System (Phase 1) Rules', () => {
  it('enforces valid work-order state transitions and rejects invalid jumps', () => {
    expect(isValidOpsTransition('NEW', 'TRIAGED')).toBe(true);
    expect(isValidOpsTransition('NEW', 'ASSIGNED')).toBe(true);
    expect(isValidOpsTransition('IN_PROGRESS', 'BLOCKED')).toBe(true);
    expect(isValidOpsTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(isValidOpsTransition('COMPLETED', 'CLOSED')).toBe(true);

    expect(isValidOpsTransition('NEW', 'CLOSED')).toBe(false);
    expect(isValidOpsTransition('CLOSED', 'IN_PROGRESS')).toBe(false);
    expect(isValidOpsTransition('CANCELLED', 'ASSIGNED')).toBe(false);
  });

  it('enforces STAFF operations module access via staffAppModules', () => {
    expect(hasStaffAppModuleAccess({ role: 'STAFF', staffAppModules: ['finance'] }, 'operations')).toBe(false);
    expect(hasStaffAppModuleAccess({ role: 'STAFF', staffAppModules: ['finance', 'operations'] }, 'operations')).toBe(true);
    expect(hasStaffAppModuleAccess({ role: 'GMD', staffAppModules: [] }, 'operations')).toBe(true);
  });

  it('enforces CUSTOM_ADMIN operations granular permissions', () => {
    const viewOnlyCustomAdmin: any = {
      id: 'u1',
      employeeNumber: 'EMP-01',
      legalName: 'Ops Viewer',
      workEmail: 'viewer@bems.test',
      phone: null,
      role: 'CUSTOM_ADMIN',
      avatarUrl: null,
      customAdminPermissions: {
        operations: {
          enabled: true,
          subsidiaryScope: 'ALL',
          categories: {
            operations_core: { actions: ['view_module'] },
          },
        },
      },
    };
    const denied = requireCustomAdminOpsAction(viewOnlyCustomAdmin, 'operations_setup', 'manage_sites_services');
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);

    const gmdActor: any = { ...viewOnlyCustomAdmin, role: 'GMD', customAdminPermissions: null };
    expect(requireCustomAdminOpsAction(gmdActor, 'operations_setup', 'manage_sites_services')).toBeNull();
  });
});
