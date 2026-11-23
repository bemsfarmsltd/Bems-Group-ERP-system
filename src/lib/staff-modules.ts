export type StaffAppModuleKey =
  | 'finance'
  | 'projects'
  | 'hr'
  | 'operations'
  | 'media'
  | 'innovation';

export interface StaffAppModuleDef {
  key: StaffAppModuleKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const STAFF_APP_MODULE_CATALOG: StaffAppModuleDef[] = [
  {
    key: 'finance',
    label: 'Financial Management System',
    description: 'Requisitions, approvals, wallet disbursements, and 72h expenditure retirement.',
    defaultEnabled: true,
  },
  {
    key: 'projects',
    label: 'Project Management System',
    description: 'Project tracking, milestone execution, deliverables, and site tasks.',
    defaultEnabled: false,
  },
  {
    key: 'hr',
    label: 'Human Resource Management System',
    description: 'Attendance check-in, leave requests, staff directory, and workplace records.',
    defaultEnabled: false,
  },
  {
    key: 'operations',
    label: 'Operations & Logistics',
    description: 'Field operations, fleet dispatch, and site logistics.',
    defaultEnabled: false,
  },
  {
    key: 'media',
    label: 'Media & Studio Assets',
    description: 'Production workflows, studio scheduling, and media deliverables.',
    defaultEnabled: false,
  },
  {
    key: 'innovation',
    label: 'Product Management & Innovation',
    description: 'Product portfolios, ideas, shared brainstorming canvases, roadmaps, PRDs, and research.',
    defaultEnabled: true,
  },
];

export const DEFAULT_STAFF_APP_MODULES: StaffAppModuleKey[] = STAFF_APP_MODULE_CATALOG
  .filter((m) => m.defaultEnabled)
  .map((m) => m.key);

const VALID_KEYS = new Set<string>(STAFF_APP_MODULE_CATALOG.map((m) => m.key));

/**
 * Resolves the active Staff App module list for an employee.
 * Null/unset falls back to DEFAULT_STAFF_APP_MODULES (["finance"]) for backward compatibility.
 * Explicit JSON arrays (including []) are preserved verbatim after key validation.
 */
export function resolveStaffAppModules(staffAppModulesJson?: string | null): StaffAppModuleKey[] {
  if (staffAppModulesJson === null || staffAppModulesJson === undefined || staffAppModulesJson === '') {
    return [...DEFAULT_STAFF_APP_MODULES];
  }
  try {
    const parsed = JSON.parse(staffAppModulesJson);
    if (!Array.isArray(parsed)) return [...DEFAULT_STAFF_APP_MODULES];
    const filtered = parsed.filter((item): item is StaffAppModuleKey => typeof item === 'string' && VALID_KEYS.has(item));
    return Array.from(new Set(filtered));
  } catch {
    return [...DEFAULT_STAFF_APP_MODULES];
  }
}

export function normalizeStaffAppModulesInput(input: unknown): StaffAppModuleKey[] | null {
  if (!Array.isArray(input) || input.some((key) => typeof key !== 'string' || !VALID_KEYS.has(key))) return null;
  return Array.from(new Set(input as StaffAppModuleKey[]));
}

const MODULE_BY_API_ROOT: Record<string, StaffAppModuleKey> = {
  requests: 'finance', wallet: 'finance', accountability: 'finance', approvals: 'finance',
  projects: 'projects', hr: 'hr', attendance: 'hr', leave: 'hr',
  operations: 'operations', media: 'media', innovation: 'innovation',
};

export function staffModuleForApiPath(path: string): StaffAppModuleKey | undefined {
  const [, prefix, root, section] = path.split('?')[0].split('/');
  if (prefix !== 'api') return;
  if (root === 'staff') {
    if (section === 'projects') return 'projects';
    if (section === 'disbursements') return 'finance';
    if (section === 'leave' || section === 'attendance') return 'hr';
    return;
  }
  return Object.hasOwn(MODULE_BY_API_ROOT, root) ? MODULE_BY_API_ROOT[root] : undefined;
}

export function hasStaffAppModuleAccess(
  employee: { role?: string | null; staffAppModules?: string[] | null; staffAppModulesJson?: string | null } | null | undefined,
  moduleKey: StaffAppModuleKey
): boolean {
  if (!employee) return false;
  const role = String(employee.role || '').toUpperCase();
  if (role !== 'STAFF') return true;
  const modules = Array.isArray(employee.staffAppModules)
    ? employee.staffAppModules
    : resolveStaffAppModules(employee.staffAppModulesJson);
  return modules.includes(moduleKey);
}
