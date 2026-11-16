import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { AI_ACCESS_SCOPES } from '@/lib/ai-access-scopes';
import { invalidateAiPolicyCache } from '@/lib/ai-access-control';

const EXEC_ROLES = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];
const SETTING_KEY = 'ai_access_control_v2';

export interface AccountAiPolicy {
  aiEnabled: boolean;
  masterRead: boolean;
  masterWrite: boolean;
  scopes: Record<string, boolean>;
}

function buildDefaultPolicy(role: string): AccountAiPolicy {
  const isGmd = String(role || '').toUpperCase() === 'GMD';
  const scopes: Record<string, boolean> = {};
  for (const s of AI_ACCESS_SCOPES) {
    scopes[`${s.key}.read`] = isGmd;
    scopes[`${s.key}.write`] = isGmd;
  }
  return {
    aiEnabled: isGmd,
    masterRead: isGmd,
    masterWrite: isGmd,
    scopes,
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'overview')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    const setting = rootOrg
      ? await prisma.workspaceSetting.findUnique({
          where: { organizationId_key: { organizationId: rootOrg.id, key: SETTING_KEY } },
        })
      : null;

    let savedPolicies: Record<string, AccountAiPolicy> = {};
    if (setting?.value) {
      try {
        savedPolicies = JSON.parse(setting.value) || {};
      } catch {
        savedPolicies = {};
      }
    }

    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ role: 'asc' }, { legalName: 'asc' }],
      select: {
        id: true,
        legalName: true,
        workEmail: true,
        employeeNumber: true,
        role: true,
        customAdminTitle: true,
        jobTitle: true,
      },
    });

    const accounts = employees.map((emp) => {
      const defaults = buildDefaultPolicy(emp.role);
      const stored = savedPolicies[emp.id];
      return {
        ...emp,
        policy: stored
          ? {
              aiEnabled: Boolean(stored.aiEnabled),
              masterRead: stored.masterRead !== false,
              masterWrite: stored.masterWrite !== false,
              scopes: { ...defaults.scopes, ...(stored.scopes || {}) },
            }
          : defaults,
      };
    });

    return NextResponse.json({ accounts });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load AI access controls.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'overview')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const body = await request.json();
    const employeeId = String(body.employeeId || '').trim();
    const policy = body.policy as AccountAiPolicy | undefined;

    if (!employeeId || !policy) {
      return NextResponse.json({ error: 'employeeId and policy are required.' }, { status: 400 });
    }

    const target = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, legalName: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!rootOrg) {
      return NextResponse.json({ error: 'Root organization not configured.' }, { status: 400 });
    }

    const existingSetting = await prisma.workspaceSetting.findUnique({
      where: { organizationId_key: { organizationId: rootOrg.id, key: SETTING_KEY } },
    });

    let allPolicies: Record<string, AccountAiPolicy> = {};
    if (existingSetting?.value) {
      try {
        allPolicies = JSON.parse(existingSetting.value) || {};
      } catch {
        allPolicies = {};
      }
    }

    allPolicies[employeeId] = {
      aiEnabled: Boolean(policy.aiEnabled),
      masterRead: policy.masterRead !== false,
      masterWrite: policy.masterWrite !== false,
      scopes: policy.scopes || {},
    };

    await prisma.workspaceSetting.upsert({
      where: { organizationId_key: { organizationId: rootOrg.id, key: SETTING_KEY } },
      update: { value: JSON.stringify(allPolicies), updatedById: actor.id },
      create: {
        organizationId: rootOrg.id,
        key: SETTING_KEY,
        value: JSON.stringify(allPolicies),
        updatedById: actor.id,
      },
    });
    invalidateAiPolicyCache();

    await prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: rootOrg.id,
        targetType: 'AI_ACCESS_POLICY',
        targetId: employeeId,
        action: policy.aiEnabled ? 'AI_ACCESS_UPDATED' : 'AI_ACCESS_DISABLED',
        metadata: JSON.stringify({
          targetName: target.legalName,
          targetRole: target.role,
          aiEnabled: Boolean(policy.aiEnabled),
          masterRead: policy.masterRead !== false,
          masterWrite: policy.masterWrite !== false,
        }),
        correlationId: `ai-ctrl-${Date.now()}`,
      },
    });

    return NextResponse.json({ success: true, policy: allPolicies[employeeId] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save AI access control.' }, { status: 500 });
  }
}

