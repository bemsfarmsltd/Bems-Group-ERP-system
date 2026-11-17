import { describe, expect, it, vi } from 'vitest';
import { type AuthenticatedEmployee } from '../src/lib/auth';
import { resolveAuthorizedOrganizationScope } from '../src/lib/organizations';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'finance-org' },
        { id: 'other-org' },
        { id: 'staff-org' },
      ]),
    },
    employeeAssignment: {
      findMany: vi.fn().mockResolvedValue([{ subsidiaryId: 'staff-org' }]),
    },
  },
}));

const actor: AuthenticatedEmployee = {
  id: 'employee-id',
  role: 'CUSTOM_ADMIN',
  customAdminPermissions: {
    finance: { enabled: true, subsidiaryScope: 'SELECTED', subsidiaryIds: ['finance-org'], categories: {} },
    projects: { enabled: true, subsidiaryScope: 'ALL', categories: {} },
  },
} as AuthenticatedEmployee;

describe('Custom Admin subsidiary authorization', () => {
  it('keeps group-wide Projects access from widening the Finance grant', async () => {
    const financeScope = await resolveAuthorizedOrganizationScope(actor, 'ALL', 'finance');
    expect(financeScope.organizationIds).toEqual(['finance-org']);
    const projectScope = await resolveAuthorizedOrganizationScope(actor, 'ALL', 'projects');
    expect(projectScope.organizationIds).toEqual(['finance-org', 'other-org', 'staff-org']);
  });

  it('requires a module for delegated access and uses assignments for staff access', async () => {
    const unspecifiedScope = await resolveAuthorizedOrganizationScope(actor, 'ALL');
    expect(unspecifiedScope.organizationIds).toEqual([]);
    const staffScope = await resolveAuthorizedOrganizationScope(actor, 'ALL', 'staff');
    expect(staffScope.organizationIds).toEqual(['staff-org']);
  });
});
