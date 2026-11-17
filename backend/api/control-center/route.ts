import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerCache, invalidateServerCache, setServerCache } from '@/lib/server-cache';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { getAllowedSubsidiariesForModule } from '@/lib/admin-permissions';
import { getMobileAppGate } from '@/lib/mobile-gate';

export const dynamic = 'force-dynamic';

const EXEC_ROLES = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];

export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    const canReadControlCenter =
      actor &&
      (hasAnyRole(actor, EXEC_ROLES) ||
        (hasAnyRole(actor, ['CUSTOM_ADMIN']) && hasEmployeePermission(actor, 'control-center')));
    if (!canReadControlCenter) {
      return NextResponse.json(
        { error: 'Forbidden: Enterprise Control Center access is denied.' },
        { status: 403 }
      );
    }

    const cacheKey = `control-center:${actor.id}`;
    const cached = getServerCache<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const [
      subsidiaries,
      departments,
      leaders,
      activeStaffCount,
      activeProjectsCount,
      openRequestsCount,
      mobileReleases,
      auditEvents,
      gmdGate,
      staffGate,
    ] = await Promise.all([
      prisma.organization.findMany({
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, code: true, type: true, status: true, brandColor: true },
      }),
      prisma.department.findMany({
        orderBy: { name: 'asc' },
        include: { organization: { select: { id: true, legalName: true, code: true } } },
      }),
      prisma.employee.findMany({
        where: { role: { in: EXEC_ROLES }, status: { not: 'DELETED' } },
        orderBy: [{ role: 'asc' }, { legalName: 'asc' }],
        select: {
          id: true,
          legalName: true,
          workEmail: true,
          employeeNumber: true,
          role: true,
          status: true,
          jobTitle: true,
          createdAt: true,
        },
      }),
      prisma.employee.count({ where: { role: 'STAFF', status: 'ACTIVE' } }),
      prisma.project.count({ where: { status: { in: ['ACTIVE', 'APPROVED_PLANNED'] } } }),
      prisma.expenditureRequest.count({ where: { approvalStatus: { in: ['PENDING', 'SUBMITTED'] } } }),
      prisma.mobileAppRelease.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 80 }),
      getMobileAppGate('GMD_APP'),
      getMobileAppGate('STAFF_APP'),
    ]);

    const rootOrgId = subsidiaries[0]?.id || '';
    let aiPolicy = {
      gmdCopilotEnabled: true,
      gmdEdgeGlowEnabled: true,
      staffAiEnabled: false,
      superAdminAiEnabled: false,
    };
    if (rootOrgId) {
      const setting = await prisma.workspaceSetting.findUnique({
        where: { organizationId_key: { organizationId: rootOrgId, key: 'AI_ACCESS_POLICY' } },
      });
      if (setting?.value) {
        try {
          const parsed = JSON.parse(setting.value);
          aiPolicy = {
            gmdCopilotEnabled: parsed.gmdCopilotEnabled ?? true,
            gmdEdgeGlowEnabled: parsed.gmdEdgeGlowEnabled ?? true,
            // Hard-enforced policy: never allow Staff or Super Admin AI fallback
            staffAiEnabled: false,
            superAdminAiEnabled: false,
          };
        } catch {}
      }
    }

    const allowedSubIds = getAllowedSubsidiariesForModule(
      actor.role,
      actor.customAdminPermissions,
      'control-center'
    );
    const visibleSubsidiaries =
      allowedSubIds === 'ALL'
        ? subsidiaries
        : subsidiaries.filter((s) => allowedSubIds.includes(s.id));

    const payload = {
      success: true,
      actor: {
        id: actor.id,
        legalName: actor.legalName,
        role: actor.role,
        workEmail: actor.workEmail,
        customAdminProfileId: actor.customAdminProfileId || null,
        customAdminTitle: actor.customAdminTitle || null,
        customAdminPermissions: actor.customAdminPermissions || null,
      },
      metrics: {
        subsidiariesCount: visibleSubsidiaries.length,
        departmentsCount: departments.length,
        activeStaffCount,
        leadersCount: leaders.length,
        activeProjectsCount,
        openRequestsCount,
      },
      subsidiaries: visibleSubsidiaries,
      departments,
      leaders,
      mobileGates: { GMD_APP: gmdGate, STAFF_APP: staffGate },
      mobileReleases,
      aiPolicy,
      auditEvents,
    };
    setServerCache(cacheKey, payload, 12_000);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/control-center error:', error);
    return NextResponse.json({ error: 'Failed to load Control Center.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES)) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    invalidateServerCache('control-center:');

    const body = await request.json();
    const action = String(body.action || '');

    const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    const groupId = rootOrg?.id || '';

    if (action === 'INVITE_EXECUTIVE') {
      const legalName = String(body.legalName || '').trim();
      const workEmail = String(body.workEmail || '').trim().toLowerCase();
      const role = String(body.role || '').toUpperCase();
      const jobTitle = String(body.jobTitle || '').trim();

      if (!legalName || !workEmail) {
        return NextResponse.json({ error: 'Full name and work email are required.' }, { status: 400 });
      }
      if (!['GMD', 'SUPER_ADMIN'].includes(role)) {
        return NextResponse.json(
          { error: 'Executive invitations are strictly reserved for GMD and SUPER_ADMIN. Staff onboard via self-service.' },
          { status: 400 }
        );
      }

      const existing = await prisma.employee.findFirst({
        where: { workEmail: { equals: workEmail, mode: 'insensitive' } },
      });
      if (existing) {
        return NextResponse.json({ error: 'An account with this work email already exists.' }, { status: 409 });
      }

      const count = await prisma.employee.count();
      const employeeNumber = `EXEC-${String(count + 101).padStart(4, '0')}`;

      const invited = await prisma.employee.create({
        data: {
          employeeNumber,
          legalName,
          workEmail,
          role,
          jobTitle: jobTitle || (role === 'GMD' ? 'Group Managing Director' : 'Super Administrator'),
          status: 'ACTIVE',
        },
      });

      if (groupId) {
        await prisma.auditEvent.create({
          data: {
            actorId: actor.id,
            actorName: actor.legalName,
            actorRole: actor.role,
            groupId,
            targetType: 'EMPLOYEE',
            targetId: invited.id,
            action: 'EXECUTIVE_INVITED',
            metadata: JSON.stringify({ workEmail, role }),
            correlationId: `cc-${Date.now()}`,
          },
        });
      }

      return NextResponse.json({ success: true, leader: invited });
    }

    if (action === 'TOGGLE_LEADER_STATUS') {
      const targetId = String(body.employeeId || '');
      const nextStatus = String(body.status || 'ACTIVE');
      if (!targetId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
      if (targetId === actor.id) {
        return NextResponse.json({ error: 'You cannot suspend your own active executive account.' }, { status: 400 });
      }

      const updated = await prisma.employee.update({
        where: { id: targetId },
        data: { status: nextStatus },
      });
      return NextResponse.json({ success: true, leader: updated });
    }

    if (action === 'UPDATE_AI_POLICY') {
      if (!groupId) return NextResponse.json({ error: 'No root organization configured.' }, { status: 400 });
      const value = JSON.stringify({
        gmdCopilotEnabled: Boolean(body.gmdCopilotEnabled),
        gmdEdgeGlowEnabled: Boolean(body.gmdEdgeGlowEnabled),
        staffAiEnabled: false,
        superAdminAiEnabled: false,
      });
      await prisma.workspaceSetting.upsert({
        where: { organizationId_key: { organizationId: groupId, key: 'AI_ACCESS_POLICY' } },
        update: { value, updatedById: actor.id },
        create: { organizationId: groupId, key: 'AI_ACCESS_POLICY', value, updatedById: actor.id },
      });
      await prisma.auditEvent.create({
        data: {
          actorId: actor.id,
          actorName: actor.legalName,
          actorRole: actor.role,
          groupId,
          targetType: 'POLICY',
          targetId: 'AI_ACCESS_POLICY',
          action: 'POLICY_UPDATED',
          metadata: value,
          correlationId: `cc-ai-${Date.now()}`,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'CREATE_DEPARTMENT') {
      const organizationId = String(body.organizationId || groupId);
      const name = String(body.name || '').trim();
      const code = String(body.code || name.slice(0, 4).toUpperCase()).trim().toUpperCase();
      if (!organizationId || !name) {
        return NextResponse.json({ error: 'Organization and department name are required.' }, { status: 400 });
      }
      const department = await prisma.department.create({
        data: { organizationId, name, code },
      });
      return NextResponse.json({ success: true, department });
    }

    return NextResponse.json({ error: 'Unsupported Control Center action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/control-center error:', error);
    return NextResponse.json({ error: 'Failed to process Control Center action.' }, { status: 500 });
  }
}

