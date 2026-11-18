import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { normalizeStaffAppModulesInput, STAFF_APP_MODULE_CATALOG } from '@/lib/staff-modules';
import { invalidateServerCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canManage =
      hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN']) ||
      (hasAnyRole(actor, ['CUSTOM_ADMIN']) &&
        (hasEmployeePermission(actor, 'control-center') || hasEmployeePermission(actor, 'hr')));

    if (!canManage) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to configure Staff App modules.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const employeeId = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
    }

    if (!Array.isArray(body?.modules)) {
      return NextResponse.json(
        {
          error: 'modules must be an array of module keys.',
          validModules: STAFF_APP_MODULE_CATALOG.map((m) => m.key),
        },
        { status: 400 }
      );
    }

    const normalizedModules = normalizeStaffAppModulesInput(body.modules);

    const target = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, legalName: true, employeeNumber: true, role: true },
    });

    if (!target) {
      return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        staffAppModulesJson: JSON.stringify(normalizedModules),
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: 'BEMS_GROUP',
        action: 'STAFF_APP_MODULES_UPDATED',
        module: 'CONTROL_CENTER',
        targetType: 'EMPLOYEE',
        targetId: target.id,
        correlationId: `staff-modules-${target.id}-${Date.now()}`,
        metadata: JSON.stringify({
          employeeNumber: target.employeeNumber,
          legalName: target.legalName,
          staffAppModules: normalizedModules,
        }),
      },
    });

    invalidateServerCache(`control-center:${actor.id}`);

    return NextResponse.json({
      success: true,
      employeeId: target.id,
      staffAppModules: normalizedModules,
    });
  } catch (error) {
    console.error('Update staff app modules error:', error);
    return NextResponse.json(
      { error: 'Could not update Staff App module access.' },
      { status: 500 }
    );
  }
}
