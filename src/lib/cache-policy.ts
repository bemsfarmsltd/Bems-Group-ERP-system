import { createHash } from 'node:crypto';

export type CacheDomain =
  | 'finance'
  | 'analytics'
  | 'projects'
  | 'operations'
  | 'hr'
  | 'registry';

export interface RouteCachePolicy {
  domain: CacheDomain;
  ttlMs: number;
}

/**
 * Hard-coded financial, wallet, auth, AI, and webhook prefixes that MUST NEVER be cached.
 * Live wallet balances, Monnify disbursements, approval gates, and sessions always hit PostgreSQL live.
 */
const NEVER_CACHE_PREFIXES = [
  '/api/wallet',
  '/api/auth',
  '/api/approvals',
  '/api/disbursements',
  '/api/ai',
  '/api/webhooks',
  '/api/cron',
  '/api/staff/me',
  '/api/staff/offline',
  '/api/staff/disbursements',
  '/api/upload',
  '/api/download',
  '/api/banking/verify-account',
  '/api/matching/verify',
  '/api/reports/export',
  '/api/emergency',
];

/**
 * Routes that already manage their own dedicated Redis caching internally
 * (skip double-caching in the adapter, while still allowing cross-domain invalidation).
 */
const SELF_CACHED_EXACT_PATHS = new Set([
  '/api/control-center',
  '/api/hr/overview',
  '/api/portfolio',
  '/api/notifications',
  '/api/innovation/overview',
]);

/**
 * Explicit allowlist of safe read-heavy GET endpoints mapped to their cache domain and TTL.
 */
const CACHEABLE_ROUTE_RULES: Array<{ match: (path: string) => boolean; policy: RouteCachePolicy }> = [
  // Analytics & Executive Summaries (15s)
  { match: (p) => p.startsWith('/api/analytics'), policy: { domain: 'analytics', ttlMs: 15_000 } },
  { match: (p) => p === '/api/briefing', policy: { domain: 'analytics', ttlMs: 15_000 } },

  // Finance Read Summaries & Ledgers (15s — live wallet balances/payouts are excluded above)
  {
    match: (p) =>
      p === '/api/finance/accounting' ||
      p === '/api/finance/report-studio' ||
      p === '/api/budgets' ||
      p === '/api/requests' ||
      p === '/api/intercompany' ||
      p === '/api/intercompany/matrix' ||
      p === '/api/intercompany/reconciliation' ||
      p === '/api/accountability' ||
      p === '/api/disputes' ||
      p === '/api/recurring' ||
      p === '/api/treasury',
    policy: { domain: 'finance', ttlMs: 15_000 },
  },

  // Projects & Tasks (15s)
  {
    match: (p) =>
      p === '/api/projects' ||
      p === '/api/projects/ecosystem' ||
      p === '/api/projects/work-items' ||
      p === '/api/projects/teams' ||
      p === '/api/projects/releases' ||
      p === '/api/projects/governance' ||
      p === '/api/projects/staff-timelines' ||
      p === '/api/projects/views' ||
      p === '/api/projects/templates' ||
      p === '/api/tasks',
    policy: { domain: 'projects', ttlMs: 15_000 },
  },

  // Operations (15s)
  {
    match: (p) =>
      p.startsWith('/api/operations/') &&
      p !== '/api/operations/approvals' &&
      p !== '/api/operations/ai-brief',
    policy: { domain: 'operations', ttlMs: 15_000 },
  },

  // HR, Attendance & Payroll Summaries (15s)
  {
    match: (p) =>
      p === '/api/hr/attendance' ||
      p === '/api/hr/staff' ||
      p === '/api/hr/leave' ||
      p === '/api/hr/payroll' ||
      p === '/api/hr/performance' ||
      p === '/api/hr/recruitment' ||
      p === '/api/hr/relations' ||
      p === '/api/hr/documents' ||
      p === '/api/hr/reports' ||
      p === '/api/hr/requests' ||
      p === '/api/hr/config' ||
      p === '/api/hr/id-cards' ||
      p === '/api/attendance/timesheet' ||
      p === '/api/payroll/summary' ||
      p === '/api/payroll',
    policy: { domain: 'hr', ttlMs: 15_000 },
  },

  // Slowly changing Registries & Reference Data (30s–60s)
  {
    match: (p) =>
      p === '/api/organizations' ||
      p === '/api/departments' ||
      p === '/api/vendors' ||
      p === '/api/vendors/invoices' ||
      p === '/api/vendors/grn' ||
      p === '/api/policies' ||
      p === '/api/announcements' ||
      p === '/api/audit' ||
      p === '/api/settings' ||
      p === '/api/meta/structure' ||
      p === '/api/meta/features' ||
      p === '/api/staff',
    policy: { domain: 'registry', ttlMs: 30_000 },
  },
  {
    match: (p) => p === '/api/banking/banks',
    policy: { domain: 'registry', ttlMs: 300_000 },
  },
];

export function resolveGetCachePolicy(cleanPath: string): RouteCachePolicy | null {
  if (SELF_CACHED_EXACT_PATHS.has(cleanPath)) return null;
  for (const denied of NEVER_CACHE_PREFIXES) {
    if (cleanPath === denied || cleanPath.startsWith(`${denied}/`)) {
      return null;
    }
  }
  for (const rule of CACHEABLE_ROUTE_RULES) {
    if (rule.match(cleanPath)) return rule.policy;
  }
  return null;
}

/**
 * Returns the Redis cache key prefixes to invalidate after a successful (2xx) mutation
 * on the given API path.
 */
export function resolveInvalidationPrefixes(cleanPath: string): string[] {
  if (
    cleanPath.startsWith('/api/requests') ||
    cleanPath.startsWith('/api/approvals') ||
    cleanPath.startsWith('/api/disbursements') ||
    cleanPath.startsWith('/api/wallet') ||
    cleanPath.startsWith('/api/budgets') ||
    cleanPath.startsWith('/api/intercompany') ||
    cleanPath.startsWith('/api/accountability') ||
    cleanPath.startsWith('/api/disputes') ||
    cleanPath.startsWith('/api/recurring') ||
    cleanPath.startsWith('/api/receipts') ||
    cleanPath.startsWith('/api/finance') ||
    cleanPath.startsWith('/api/treasury')
  ) {
    return ['api:finance:', 'api:analytics:', 'portfolio:', 'notifications:'];
  }

  if (cleanPath.startsWith('/api/projects') || cleanPath.startsWith('/api/tasks')) {
    return ['api:projects:', 'portfolio:'];
  }

  if (cleanPath.startsWith('/api/operations')) {
    return ['api:operations:'];
  }

  if (
    cleanPath.startsWith('/api/hr') ||
    cleanPath.startsWith('/api/attendance') ||
    cleanPath.startsWith('/api/payroll') ||
    cleanPath.startsWith('/api/staff')
  ) {
    return ['api:hr:', 'hr-overview:', 'api:registry:', 'portfolio:'];
  }

  if (cleanPath.startsWith('/api/innovation')) {
    return ['innovation-overview:'];
  }

  if (
    cleanPath.startsWith('/api/vendors') ||
    cleanPath.startsWith('/api/organizations') ||
    cleanPath.startsWith('/api/departments') ||
    cleanPath.startsWith('/api/policies') ||
    cleanPath.startsWith('/api/announcements') ||
    cleanPath.startsWith('/api/settings') ||
    cleanPath.startsWith('/api/control-center') ||
    cleanPath.startsWith('/api/admin')
  ) {
    return ['api:registry:', 'portfolio:', 'control-center:', 'hr-overview:'];
  }

  return [];
}

/**
 * Builds an actor-isolated Redis cache key so RBAC & subsidiary scopes never bleed across sessions.
 */
export function buildApiCacheKey(
  domain: CacheDomain,
  pathWithQuery: string,
  cookieHeader: string,
  authHeader: string,
  employeeHeader: string
): string {
  const sessionMatch = cookieHeader.match(/bems_session=([^;]+)/);
  const identityMaterial =
    (sessionMatch ? `cookie:${sessionMatch[1]}` : '') ||
    (authHeader ? `auth:${authHeader}` : '') ||
    (employeeHeader ? `emp:${employeeHeader}` : 'anon');

  const actorHash = createHash('sha256').update(identityMaterial).digest('hex').slice(0, 16);
  const pathHash = createHash('sha256').update(pathWithQuery).digest('hex').slice(0, 20);
  return `api:${domain}:${actorHash}:${pathHash}`;
}
