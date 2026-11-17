import {
  getAllowedSubsidiariesForModule,
  hasModuleAccess,
  type AdminModuleKey,
  type CustomAdminPermissionsMap,
} from '@/lib/admin-permissions';

type RecipientCandidate = {
  id: string;
  legalName: string;
  workEmail: string;
  role: string;
  customAdminPermissions?: unknown;
  customAdminProfile?: { permissions?: unknown } | null;
};

function normalizePermissions(raw: unknown): CustomAdminPermissionsMap | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as CustomAdminPermissionsMap) : null;
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? (raw as CustomAdminPermissionsMap) : null;
}

/**
 * Pure filter for module-scoped email/notification routing.
 * Ensures HR-only or unrelated module admins never receive Finance/Wallet emails.
 */
export function filterModuleEmailRecipients<T extends RecipientCandidate>(
  candidates: T[],
  moduleKey: AdminModuleKey,
  subsidiaryId?: string | null,
): T[] {
  return candidates.filter((emp) => {
    if (!emp.workEmail || !emp.workEmail.includes('@')) return false;
    const role = (emp.role || '').toUpperCase();
    if (role === 'GMD') return true;

    const customPerms = normalizePermissions(
      emp.customAdminProfile?.permissions ?? emp.customAdminPermissions,
    );

    if (customPerms) {
      if (!hasModuleAccess(role, customPerms, moduleKey)) return false;
      if (subsidiaryId) {
        const allowedSubs = getAllowedSubsidiariesForModule(role, customPerms, moduleKey);
        if (allowedSubs !== 'ALL' && !allowedSubs.includes(subsidiaryId)) return false;
      }
      return true;
    }

    return role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN';
  });
}

export async function resolveModuleEmailRecipients(
  prismaClient: any,
  moduleKey: AdminModuleKey,
  subsidiaryId?: string | null,
) {
  const candidates: RecipientCandidate[] = await prismaClient.employee.findMany({
    where: {
      status: 'ACTIVE',
      role: { in: ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'] },
    },
    select: {
      id: true,
      legalName: true,
      workEmail: true,
      role: true,
      customAdminProfile: {
        select: { permissions: true },
      },
    },
  });

  return filterModuleEmailRecipients(candidates, moduleKey, subsidiaryId);
}
