import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { evaluateStaffModuleGuard } from '../backend/next-route-adapter';
import type { AuthenticatedEmployee } from '../src/lib/auth';
import { normalizeStaffAppModulesInput, resolveStaffAppModules } from '../src/lib/staff-modules';

describe('Staff App module policy', () => {
  it('keeps the finance default and preserves explicit denial', () => {
    expect(resolveStaffAppModules(null)).toEqual(['finance']);
    expect(resolveStaffAppModules('[]')).toEqual([]);
    expect(normalizeStaffAppModulesInput(['finance', 'invalid'])).toBeNull();
  });

  it.each([
    '/api/requests/[requestNumber]', '/api/wallet/withdrawals', '/api/accountability/evidence',
    '/api/projects/work-items', '/api/attendance/punch', '/api/hr/leave',
  ])('blocks staff without the grant on %s', async (path) => {
    const actor = { role: 'STAFF', staffAppModules: [] } as unknown as AuthenticatedEmployee;
    const result = await evaluateStaffModuleGuard(path, new NextRequest('http://localhost'), async () => actor);
    expect(result?.status).toBe(403);
  });

  it('keeps session refresh accessible even when no modules are assigned', async () => {
    const resolveActor = vi.fn();
    const result = await evaluateStaffModuleGuard('/api/auth/session', new NextRequest('http://localhost'), resolveActor);
    expect(result).toBeNull();
    expect(resolveActor).not.toHaveBeenCalled();
  });
});
