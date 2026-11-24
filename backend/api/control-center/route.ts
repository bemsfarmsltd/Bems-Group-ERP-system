import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDistributedCache, invalidateDistributedCache, setDistributedCache } from '@/lib/server-cache';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { getAllowedSubsidiariesForModule } from '@/lib/admin-permissions';
import { getMobileAppGate } from '@/lib/mobile-gate';
import { getGlobalPayoutControl, setGlobalPayoutControl } from '@/lib/wallet/payout-control';

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

    const scopedAdmin = actor.role === 'CUSTOM_ADMIN';
    const cacheKey = `control-center:${actor.id}`;
    const cached = scopedAdmin ? null : await getDistributedCache<any>(cacheKey);
    if (cached) return NextResponse.json(cached);
    const allowedSubIds = getAllowedSubsidiariesForModule(actor.role, actor.customAdminPermissions, 'control-center');
    const subsidiaryFilter = allowedSubIds === 'ALL' ? {} : { in: allowedSubIds };
    const canView = (category: string, action: string) => !scopedAdmin || hasEmployeePermission(actor, 'control-center', category, action);
    const viewOverview = canView('overview', 'view_control_overview');
    const viewLeadership = canView('onboarding', 'view_admins');
    const viewMobile = canView('mobile_apps', 'view_mobile_releases');
    const viewAudit = canView('audit_trail', 'view_audit_logs');
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
        where: { id: subsidiaryFilter },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, code: true, type: true, status: true, brandColor: true },
      }),
      canView('org_structure', 'view_orgs_depts') ? prisma.department.findMany({
        where: { organizationId: subsidiaryFilter },
        orderBy: { name: 'asc' },
        include: { organization: { select: { id: true, legalName: true, code: true } } },
      }) : Promise.resolve([]),
      viewLeadership ? prisma.employee.findMany({
        where: { role: { in: [...EXEC_ROLES, 'CUSTOM_ADMIN'] }, status: { notIn: ['DELETED', 'TERMINATED'] },
          ...(allowedSubIds === 'ALL' ? {} : { assignments: { some: { status: 'ACTIVE', subsidiaryId: subsidiaryFilter } } }) },
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
      }) : Promise.resolve([]),
      viewOverview ? prisma.employee.count({ where: {
        role: { in: ['STAFF', 'CUSTOM_ADMIN'] }, status: 'ACTIVE',
        ...(allowedSubIds === 'ALL' ? {} : { assignments: { some: { status: 'ACTIVE', subsidiaryId: subsidiaryFilter } } }),
      } }) : Promise.resolve(0),
      viewOverview ? prisma.project.count({ where: { organizationId: subsidiaryFilter, status: { in: ['ACTIVE', 'APPROVED_PLANNED'] } } }) : Promise.resolve(0),
      viewOverview ? prisma.expenditureRequest.count({ where: { subsidiaryId: subsidiaryFilter, approvalStatus: { in: ['PENDING', 'SUBMITTED'] } } }) : Promise.resolve(0),
      viewMobile ? prisma.mobileAppRelease.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }) : Promise.resolve([]),
      viewAudit ? prisma.auditEvent.findMany({ where: { subsidiaryId: subsidiaryFilter }, orderBy: { createdAt: 'desc' }, take: 80 }) : Promise.resolve([]),
      viewMobile ? getMobileAppGate('GMD_APP') : Promise.resolve(null),
      viewMobile ? getMobileAppGate('STAFF_APP') : Promise.resolve(null),
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

    const globalPayoutControl = await getGlobalPayoutControl();

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
        subsidiariesCount: subsidiaries.length,
        departmentsCount: departments.length,
        activeStaffCount,
        leadersCount: leaders.length,
        activeProjectsCount,
        openRequestsCount,
      },
      subsidiaries,
      departments,
      leaders,
      mobileGates: { GMD_APP: gmdGate, STAFF_APP: staffGate },
      mobileReleases,
      aiPolicy,
      globalPayoutControl,
      auditEvents,
    };
    if (!scopedAdmin) await setDistributedCache(cacheKey, payload, 15_000);
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
    await invalidateDistributedCache('control-center:');

    const body = await request.json();
    const action = String(body.action || '');

    const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    const groupId = rootOrg?.id || '';

    if (action === 'TOGGLE_GLOBAL_PAYOUTS') {
      const disabled = Boolean(body.disabled);
      const reason = body.reason ? String(body.reason).trim() : null;
      const globalPayoutControl = await setGlobalPayoutControl(actor, disabled, reason);
      return NextResponse.json({ success: true, globalPayoutControl });
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

