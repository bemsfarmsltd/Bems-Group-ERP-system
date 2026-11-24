import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parsePermissionsJson } from '@/lib/admin-permissions';
import {
  AI_ACCESS_SCOPES,
  AiAccessMatrix,
  AiAccessScopeKey,
  AiScopeDefinition,
  buildDefaultAiAccessMatrix,
  normalizeAiAccessMatrix,
} from './ai-access-scopes';

export {
  AI_ACCESS_SCOPES,
  buildDefaultAiAccessMatrix,
  normalizeAiAccessMatrix,
};
export type { AiAccessMatrix, AiAccessScopeKey, AiScopeDefinition };

/**
 * Loads the active `ai.access` matrix from `WorkspaceSetting`.
 * Group controls set the maximum permissions; an entity can narrow them independently.
 */
export async function getAiAccessMatrix(organizationId?: string): Promise<AiAccessMatrix> {
  try {
    const group = await prisma.organization.findFirst({ where: { type: 'GROUP', status: 'ACTIVE' }, select: { id: true } });
    const groupSetting = group ? await prisma.workspaceSetting.findUnique({ where: { organizationId_key: { organizationId: group.id, key: 'ai.access' } } }) : null;
    const base = groupSetting ? normalizeAiAccessMatrix(JSON.parse(groupSetting.value)) : buildDefaultAiAccessMatrix();
    if (!organizationId || organizationId === group?.id) return base;
    const specific = await prisma.workspaceSetting.findUnique({ where: { organizationId_key: { organizationId, key: 'ai.access' } } });
    if (!specific) return base;
    const local = normalizeAiAccessMatrix(JSON.parse(specific.value));
    return Object.fromEntries(Object.keys(base).map(key => [key, base[key as keyof AiAccessMatrix] !== false && local[key as keyof AiAccessMatrix] !== false])) as AiAccessMatrix;
  } catch {
    return { ...buildDefaultAiAccessMatrix(), 'master.read': false, 'master.write': false };
  }
}

/**
 * Checks whether `scopeKey` is allowed for `mode` ('read' | 'write') under `matrix`.
 * Respects the global `master.read` and `master.write` kill-switches first.
 */
export function isAiAccessAllowed(
  matrix: AiAccessMatrix,
  scopeKey: AiAccessScopeKey,
  mode: 'read' | 'write'
): boolean {
  if (matrix[`master.${mode}`] === false) {
    return false;
  }
  return matrix[`${scopeKey}.${mode}`] !== false;
}

/**
 * Maps an incoming `/api/ai/tools/*` URL pathname to its primary `AiAccessScopeKey`.
 */
export function resolveScopeFromPathname(pathname: string): AiAccessScopeKey | null {
  const clean = pathname.replace(/\/+$/, '');
  if (clean === '/api/ai/context' || clean === '/api/ai/tools' || clean === '/api/ai/chat') {
    return 'context';
  }
  if (clean.startsWith('/api/ai/tools/analytics') || clean === '/api/ai/analytics') return 'context';
  if (clean.startsWith('/api/ai/tools/forecast') || clean === '/api/ai/forecast') return 'context';
  if (clean.startsWith('/api/ai/tools/wallet')) return 'wallet';
  if (clean.startsWith('/api/ai/tools/approvals')) return 'approvals';
  if (clean.startsWith('/api/ai/tools/requests')) return 'requests';
  if (clean.startsWith('/api/ai/tools/accountability')) return 'accountability';
  if (clean.startsWith('/api/ai/tools/budgets')) return 'budgets';
  if (clean.startsWith('/api/ai/tools/payroll')) return 'payroll';
  if (clean.startsWith('/api/ai/tools/staff')) return 'staff_profiles';
  if (clean.startsWith('/api/ai/tools/admin-onboarding')) return 'admin_onboarding';
  if (clean.startsWith('/api/ai/tools/subsidiary')) return 'subsidiary_create';
  if (clean.startsWith('/api/ai/tools/attendance')) return 'attendance_logs';
  if (clean.startsWith('/api/ai/tools/hr-leave')) return 'hr_leave';
  if (clean.startsWith('/api/ai/tools/vendors')) return 'vendors';
  if (clean.startsWith('/api/ai/tools/intercompany')) return 'intercompany';
  if (clean.startsWith('/api/ai/tools/bank-accounts')) return 'bank_accounts';
  if (clean.startsWith('/api/ai/tools/tasks')) return 'tasks';
  if (clean.startsWith('/api/ai/tools/messages')) return 'messages';
  if (clean.startsWith('/api/ai/tools/policies')) return 'policies';
  return null;
}

/**
 * Maps a `stageAction` call (`actionType` + `materialPayload`) to the exact granular `AiAccessScopeKey`.
 */
export function resolveScopeFromStagePayload(
  actionType: string,
  materialPayload?: Record<string, any>
): AiAccessScopeKey {
  const subAction = String(
    materialPayload?.action ||
      materialPayload?.action_type ||
      materialPayload?.sub_action ||
      ''
  ).toUpperCase();
  switch (actionType) {
    case 'approval':
    case 'approval_decision':
    case 'payment_record':
    case 'payment_recorder':
    case 'emergency_override':
      return 'approvals';
    case 'request_creation':
      if (subAction === 'SEND_MESSAGE' || subAction === 'REQUEST_CLARIFICATION') {
        return 'request_messages';
      }
      return 'requests';
    case 'accountability':
    case 'accountability_clearance':
    case 'deadline_extension':
      return 'accountability';
    case 'budget':
      return 'budgets';
    case 'salary_change':
      return 'salary';
    case 'payroll_action':
      return 'payroll';
    case 'staff_management':
    case 'staff_approval':
    case 'role_change':
      if (
        actionType === 'staff_approval' ||
        actionType === 'role_change' ||
        subAction === 'TOGGLE_ATTENDANCE_EXEMPT' ||
        subAction === 'CHANGE_STATUS' ||
        subAction === 'DELETE_OR_DEACTIVATE'
      ) {
        return 'staff_status';
      }
      return 'staff_profiles';
    case 'admin_onboarding':
      return 'admin_onboarding';
    case 'subsidiary_creation':
      return 'subsidiary_create';
    case 'subsidiary_update':
      return 'subsidiary_edit';
    case 'attendance_override':
      if (
        subAction === 'UPDATE_POLICY' ||
        subAction === 'UPDATE_ROSTER' ||
        subAction === 'CALIBRATE_STATION'
      ) {
        return 'attendance_policy';
      }
      return 'attendance_logs';
    case 'leave_action':
      return 'hr_leave';
    case 'vendor_registration':
      return 'vendors';
    case 'vendor_approval':
      if (subAction === 'CHECK_MATCH' || subAction === 'STAGE_MATCH' || !subAction) {
        return 'three_way_match';
      }
      return 'vendors';
    case 'grn_creation':
    case 'vendor_invoice_creation':
    case 'three_way_match':
      return 'three_way_match';
    case 'intercompany_Entry':
    case 'intercompany_settle':
    case 'intercompany_note':
      return 'intercompany';
    case 'bank_account_update':
    case 'treasury_account':
    case 'staff_bank_update':
    case 'treasury_bank_register':
    case 'vendor_bank_update':
      return 'bank_accounts';
    case 'task_action':
      return 'tasks';
    case 'staff_message':
      return 'messages';
    case 'policy_update':
      return 'policies';
    default:
      return 'context';
  }
}

export class AiAccessDisabledError extends Error {
  status = 403;
  error_code = 'AI_ACCESS_DISABLED';
  scope: AiAccessScopeKey;
  mode: 'read' | 'write';

  constructor(scope: AiAccessScopeKey, mode: 'read' | 'write', message: string) {
    super(message);
    this.name = 'AiAccessDisabledError';
    this.scope = scope;
    this.mode = mode;
  }
}

export async function assertAiScopeAllowed(
  scopeKey: AiAccessScopeKey,
  mode: 'read' | 'write',
  organizationId?: string
): Promise<void> {
  const matrix = await getAiAccessMatrix(organizationId);
  if (!isAiAccessAllowed(matrix, scopeKey, mode)) {
    const def = AI_ACCESS_SCOPES.find((s) => s.key === scopeKey);
    const label = def?.label || scopeKey;
    const masterBlocked = matrix[`master.${mode}`] === false;
    const message = masterBlocked
      ? `Global AI ${mode.toUpperCase()} access is currently turned OFF by the Admin under Settings → AI & Copilot Access.`
      : `AI ${mode.toUpperCase()} access for "${label}" is currently turned OFF by the Admin under Settings → AI & Copilot Access.`;
    throw new AiAccessDisabledError(scopeKey, mode, message);
  }
}

export interface AccountAiPolicy {
  aiEnabled: boolean;
  masterRead: boolean;
  masterWrite: boolean;
  scopes: Record<string, boolean>;
}

const AI_POLICY_CACHE_TTL_MS = 15_000;
const globalForAiPolicyCache = globalThis as unknown as {
  bemsAiPolicyCache?: { data: Record<string, Partial<AccountAiPolicy>>; exp: number };
};

export function invalidateAiPolicyCache() {
  globalForAiPolicyCache.bemsAiPolicyCache = undefined;
}

/**
 * Loads the 2-layer per-account AI policy from `WorkspaceSetting` (`ai_access_control_v2`).
 * Layer 1: `aiEnabled` (GMD defaults to true, non-GMD defaults to false unless explicitly activated).
 * Layer 2: `masterRead`, `masterWrite`, and per-scope `<scope>.read` / `<scope>.write`.
 */
export async function getAccountAiPolicy(
  employeeId: string,
  role: string
): Promise<AccountAiPolicy> {
  const normalizedRole = String(role || '').toUpperCase();
  const isGmd = normalizedRole === 'GMD';
  const defaultScopes: Record<string, boolean> = {};
  for (const s of AI_ACCESS_SCOPES) {
    defaultScopes[`${s.key}.read`] = isGmd;
    defaultScopes[`${s.key}.write`] = isGmd;
  }

  // Ordinary STAFF accounts never have AI access — only GMD, Super Admin, or Custom Admins granted AI Copilot
  if (normalizedRole === 'STAFF') {
    return {
      aiEnabled: false,
      masterRead: false,
      masterWrite: false,
      scopes: defaultScopes,
    };
  }

  // For CUSTOM_ADMIN, check if their assigned Named Custom Admin Profile grants the `ai-copilot` module
  let customAdminProfileAllowsAi = false;
  let customAdminAllowsWrite = false;
  if (normalizedRole === 'CUSTOM_ADMIN') {
    try {
      const emp = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { customAdminProfile: { select: { permissionsJson: true } } },
      });
      const perms = parsePermissionsJson(emp?.customAdminProfile?.permissionsJson);
      const aiGrant = perms['ai-copilot'];
      if (aiGrant?.enabled) {
        customAdminProfileAllowsAi = true;
        customAdminAllowsWrite = Boolean(aiGrant.categories?.['ai_staging']?.enabled);
      }
    } catch {}
  }

  const fallbackScopes = { ...defaultScopes };
  if (customAdminProfileAllowsAi) {
    for (const s of AI_ACCESS_SCOPES) {
      // Never grant wallet/approvals write to Custom Admins via profile default
      fallbackScopes[`${s.key}.read`] = true;
      fallbackScopes[`${s.key}.write`] =
        customAdminAllowsWrite && !['wallet', 'approvals', 'salary', 'payroll'].includes(s.key);
    }
  }

  const fallback: AccountAiPolicy = {
    aiEnabled: isGmd || customAdminProfileAllowsAi,
    masterRead: isGmd || customAdminProfileAllowsAi,
    masterWrite: isGmd || customAdminAllowsWrite,
    scopes: fallbackScopes,
  };
  try {
    let parsed: Record<string, Partial<AccountAiPolicy>> | null = null;
    const cached = globalForAiPolicyCache.bemsAiPolicyCache;
    if (cached && cached.exp > Date.now()) {
      parsed = cached.data;
    } else {
      const rootOrg = await prisma.organization.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!rootOrg) return fallback;
      const setting = await prisma.workspaceSetting.findUnique({
        where: { organizationId_key: { organizationId: rootOrg.id, key: 'ai_access_control_v2' } },
      });
      if (!setting?.value) return fallback;
      parsed = JSON.parse(setting.value) as Record<string, Partial<AccountAiPolicy>>;
      globalForAiPolicyCache.bemsAiPolicyCache = {
        data: parsed,
        exp: Date.now() + AI_POLICY_CACHE_TTL_MS,
      };
    }
    const stored = parsed?.[employeeId];
    if (!stored) return fallback;
    const mergedScopes = { ...fallbackScopes, ...(stored.scopes || {}) };
    const anyScopeTrue = Object.values(mergedScopes).some(Boolean);
    const aiEnabled = Boolean(stored.aiEnabled) || customAdminProfileAllowsAi;
    // If Layer 1 was activated without any read scope yet, permit basic chat context read
    const masterRead =
      aiEnabled && stored.masterRead === false && !anyScopeTrue ? true : stored.masterRead !== false;
    if (aiEnabled && !anyScopeTrue) {
      mergedScopes['context.read'] = true;
    }
    return {
      aiEnabled,
      masterRead,
      masterWrite: stored.masterWrite !== false,
      scopes: mergedScopes,
    };
  } catch {
    return fallback;
  }
}

/**
 * Checks whether an AI scope is enabled for `mode` ('read' | 'write').
 * Returns a 403 `NextResponse` if disabled by Admin in Settings or per-account 2-Layer AI Control, or `null` if allowed.
 */
export async function checkAiScopeOrResponse(
  scopeKey: AiAccessScopeKey,
  mode: 'read' | 'write',
  organizationId?: string,
  actor?: { id: string; role: string } | null
): Promise<NextResponse | null> {
  if (actor?.id) {
    const policy = await getAccountAiPolicy(actor.id, actor.role);
    if (!policy.aiEnabled) {
      const message = 'AI access is disabled for your account under Control Center → AI Access Control.';
      return NextResponse.json(
        { ok: false, error_code: 'AI_ACCOUNT_DISABLED', scope: scopeKey, mode, error: message, message },
        { status: 403 }
      );
    }
    const def = AI_ACCESS_SCOPES.find((s) => s.key === scopeKey);
    const label = def?.label || scopeKey;
    if ((mode === 'read' && !policy.masterRead) || (mode === 'write' && !policy.masterWrite)) {
      const message = `AI ${mode.toUpperCase()} access is turned OFF for your account under Control Center → AI Access Control.`;
      return NextResponse.json(
        { ok: false, error_code: 'AI_ACCESS_DISABLED', scope: scopeKey, mode, error: message, message },
        { status: 403 }
      );
    }
    if (scopeKey !== ('master' as AiAccessScopeKey) && policy.scopes[`${scopeKey}.${mode}`] === false) {
      const message = `AI ${mode.toUpperCase()} access for "${label}" is disabled for your account under Control Center → AI Access Control.`;
      return NextResponse.json(
        { ok: false, error_code: 'AI_ACCESS_DISABLED', scope: scopeKey, mode, error: message, message },
        { status: 403 }
      );
    }
  }

  const matrix = await getAiAccessMatrix(organizationId);
  if (!isAiAccessAllowed(matrix, scopeKey, mode)) {
    const def = AI_ACCESS_SCOPES.find((s) => s.key === scopeKey);
    const label = def?.label || scopeKey;
    const masterBlocked = matrix[`master.${mode}`] === false;
    const message = masterBlocked
      ? `Global AI ${mode.toUpperCase()} access is currently turned OFF by the Admin under Settings → AI & Copilot Access.`
      : `AI ${mode.toUpperCase()} access for "${label}" is currently turned OFF by the Admin under Settings → AI & Copilot Access.`;
    return NextResponse.json(
      {
        ok: false,
        error_code: 'AI_ACCESS_DISABLED',
        scope: scopeKey,
        mode,
        error: message,
        message,
      },
      { status: 403 }
    );
  }
  return null;
}
