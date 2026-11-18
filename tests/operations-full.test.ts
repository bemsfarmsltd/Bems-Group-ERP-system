import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetAuthenticatedEmployee = vi.fn();

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getAuthenticatedEmployee: (...args: any[]) => mockGetAuthenticatedEmployee(...args),
  };
});

vi.mock('@/lib/ops-ensure-schema', () => ({
  ensureOperationsSchema: vi.fn().mockResolvedValue(undefined),
}));

import { POST as aiBriefPost } from '../backend/api/operations/ai-brief/route';
import { requireCustomAdminOpsAction } from '@/lib/opsRouteHelper';

describe('Operations Management System (Phases 2-4) Governance & Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strictly restricts AI-Assisted Operations Intelligence (/api/operations/ai-brief) to GMD only', async () => {
    for (const role of ['STAFF', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN']) {
      mockGetAuthenticatedEmployee.mockResolvedValueOnce({
        id: 'emp-1',
        employeeNumber: 'EMP-1',
        legalName: 'Non GMD User',
        workEmail: 'user@bems.test',
        phone: null,
        role,
        avatarUrl: null,
      });
      const res = await aiBriefPost(new Request('http://localhost/api/operations/ai-brief', { method: 'POST' }));
      expect(res.status).toBe(403);
    }
  });

  it('enforces Phases 2-4 Custom Admin permissions for assurance, resources, and governance', () => {
    const assuranceViewer: any = {
      id: 'u-ca',
      employeeNumber: 'EMP-CA',
      legalName: 'Assurance Viewer',
      workEmail: 'ca@bems.test',
      phone: null,
      role: 'CUSTOM_ADMIN',
      avatarUrl: null,
      customAdminPermissions: {
        operations: {
          enabled: true,
          subsidiaryScope: 'ALL',
          categories: {
            operations_assurance: { actions: ['view_assurance'] },
          },
        },
      },
    };

    expect(requireCustomAdminOpsAction(assuranceViewer, 'operations_assurance', 'close_incidents')?.status).toBe(403);
    expect(requireCustomAdminOpsAction(assuranceViewer, 'operations_resources', 'manage_stock')?.status).toBe(403);
    expect(requireCustomAdminOpsAction(assuranceViewer, 'operations_governance', 'manage_reconciliations')?.status).toBe(403);
  });
});
