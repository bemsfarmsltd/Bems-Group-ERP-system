import { NextResponse } from 'next/server';
import { getAllowedSubsidiariesForModule } from '@/lib/admin-permissions';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission, invalidateSessionCache, normalizeSystemRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeStaffAppModulesInput, resolveStaffAppModules, STAFF_APP_MODULE_CATALOG } from '@/lib/staff-modules';
import { invalidateDistributedCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const executive = hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN']);
    const delegatedModules = (['hr', 'control-center'] as const).filter((module) =>
      actor.role === 'CUSTOM_ADMIN' && hasEmployeePermission(actor, module,
        module === 'hr' ? 'employees' : 'onboarding', 'manage_staff_app_modules'));
    if (!executive && delegatedModules.length === 0) {
      return NextResponse.json({ error: 'Staff App module management permission is required.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const employeeId = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
    const modules = normalizeStaffAppModulesInput(body?.modules);
    if (!employeeId || modules === null) {
      return NextResponse.json({
        error: 'Provide an employee ID and an array of valid module keys.',
        validModules: STAFF_APP_MODULE_CATALOG.map((module) => module.key),
      }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true, role: true, customAdminProfileId: true, staffAppModulesJson: true,
          assignments: {
            where: { status: 'ACTIVE', OR: [{ endsOn: null }, { endsOn: { gt: new Date() } }] },
            select: { subsidiaryId: true },
          },
        },
      });
      if (!target) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
      const targetRole = normalizeSystemRole(target.role, target.customAdminProfileId);
      if (!['STAFF', 'CUSTOM_ADMIN'].includes(targetRole)) {
        return NextResponse.json({ error: 'Staff App module access applies to staff accounts.' }, { status: 403 });
      }

      const allowed = executive || (employeeId !== actor.id && delegatedModules.some((module) => {
        const scope = getAllowedSubsidiariesForModule(actor.role, actor.customAdminPermissions, module);
        return scope === 'ALL' || (target.assignments.length > 0 && target.assignments.every(({ subsidiaryId }) => scope.includes(subsidiaryId)));
      }));
      if (!allowed) return NextResponse.json({ error: 'This employee is outside your module management scope.' }, { status: 403 });

      const group = await tx.organization.findFirst({
        where: { type: 'GROUP', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true },
      });
      if (!group) return NextResponse.json({ error: 'An active group is required to audit access changes.' }, { status: 503 });

      await tx.employee.update({ where: { id: employeeId }, data: { staffAppModulesJson: JSON.stringify(modules) } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id, actorName: actor.legalName, actorRole: actor.role,
          groupId: group.id, action: 'STAFF_APP_MODULES_UPDATED', module: 'CONTROL_CENTER',
          targetType: 'EMPLOYEE', targetId: employeeId, correlationId: crypto.randomUUID(),
          metadata: JSON.stringify({ previousModules: resolveStaffAppModules(target.staffAppModulesJson), staffAppModules: modules }),
        },
      });
      return NextResponse.json({ success: true, employeeId, staffAppModules: modules });
    });

    if (result.ok) {
      invalidateSessionCache();
      await invalidateDistributedCache('control-center:');
    }
    return result;
  } catch (error) {
    console.error('Update Staff App modules error:', error);
    return NextResponse.json({ error: 'Could not update Staff App module access.' }, { status: 500 });
  }
}
