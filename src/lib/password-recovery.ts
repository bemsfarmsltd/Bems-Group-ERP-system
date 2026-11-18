import { normalizeSystemRole } from '@/lib/auth';
import { isStaffAccount } from '@/lib/portal-access';
import { prisma } from '@/lib/prisma';

export async function findPasswordRecoveryAccount(email: string, requestedRole: unknown, portal: unknown) {
  const role = typeof requestedRole === 'string' ? requestedRole.trim().toUpperCase() : '';
  if (role && !['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN', 'CUSTOM_ADMIN', 'STAFF'].includes(role)) return null;
  if (portal !== undefined && portal !== 'staff') return null;

  const candidates = await prisma.employee.findMany({
    where: { workEmail: { equals: email, mode: 'insensitive' }, status: 'ACTIVE', approvalStatus: 'APPROVED' },
    select: { id: true, workEmail: true, legalName: true, role: true, customAdminProfileId: true },
  });
  const eligible = candidates.filter((employee) => {
    const canonicalRole = normalizeSystemRole(employee.role, employee.customAdminProfileId);
    return (!role || canonicalRole === normalizeSystemRole(role)) && (portal !== 'staff' || isStaffAccount(canonicalRole));
  });
  return eligible.length === 1 ? eligible[0] : null;
}

export function passwordRecoveryTokenKey(employeeId: string) {
  return `password-reset:${employeeId}`;
}
