import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyIdCardToken } from '@/lib/id-card-crypto';
import { clampIdCardLevel, ID_CARD_LEVELS, resolveDefaultCardLevel } from '@/lib/id-card-levels';
import { ADMIN_PERMISSION_CATALOG, parsePermissionsJson } from '@/lib/admin-permissions';
import { logHrAudit } from '@/lib/hrRouteHelper';

export const dynamic = 'force-dynamic';

const REGISTRY_KEY = 'hr_id_cards_registry_v1';

interface StoredCardRecord {
  employeeId: string;
  cardNumber: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  expiresAt: string;
  cardLevel?: number | null;
}

async function verifyCredential(params: {
  token?: string | null;
  code?: string | null;
  requiredMinLevel?: number | null;
  requiredModule?: string | null;
  gateName?: string | null;
}) {
  const token = String(params.token || '').trim();
  const code = String(params.code || '').trim();

  if (!token && !code) {
    return { status: 400, body: { verified: false, reason: 'Missing verification token or card code.' } };
  }

  let employeeId = '';
  let tokenLevel: number | null = null;
  let tokenVerified = false;

  if (token) {
    const sigCheck = verifyIdCardToken(token);
    if (!sigCheck.valid) {
      return { status: 401, body: { verified: false, reason: sigCheck.reason } };
    }
    employeeId = sigCheck.payload.eid;
    tokenLevel = sigCheck.payload.lvl;
    tokenVerified = true;
  }

  const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  let registry: Record<string, StoredCardRecord> = {};
  if (rootOrg) {
    const setting = await prisma.workspaceSetting.findUnique({
      where: { organizationId_key: { organizationId: rootOrg.id, key: REGISTRY_KEY } },
    });
    if (setting?.value) {
      try {
        registry = JSON.parse(setting.value) || {};
      } catch {
        registry = {};
      }
    }
  }

  if (!employeeId && code) {
    const foundEntry = Object.values(registry).find(
      (r) => String(r.cardNumber || '').toUpperCase() === code.toUpperCase()
    );
    if (foundEntry) {
      employeeId = foundEntry.employeeId;
    } else {
      const empByNum = await prisma.employee.findFirst({
        where: { employeeNumber: { equals: code.replace(/^.*-ID-/, ''), mode: 'insensitive' } },
        select: { id: true },
      });
      if (empByNum) employeeId = empByNum.id;
    }
  }

  if (!employeeId) {
    return { status: 404, body: { verified: false, reason: 'Credential record not found.' } };
  }

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeNumber: true,
      legalName: true,
      workEmail: true,
      role: true,
      jobTitle: true,
      staffGrade: true,
      employmentType: true,
      status: true,
      approvalStatus: true,
      customAdminProfileId: true,
      customAdminTitle: true,
      customAdminProfile: { select: { name: true, permissionsJson: true } },
      assignments: {
        where: { status: 'ACTIVE' },
        orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
        take: 1,
        include: {
          department: { select: { name: true } },
          subsidiary: { select: { id: true, legalName: true, code: true } },
        },
      },
    },
  });

  if (!emp || emp.status !== 'ACTIVE' || emp.approvalStatus !== 'APPROVED') {
    return { status: 403, body: { verified: false, reason: 'Employee account is inactive or unapproved.' } };
  }

  const record = registry[emp.id] || null;
  if (record?.status === 'REVOKED') {
    return { status: 403, body: { verified: false, reason: 'ID Card has been revoked by HR/Management.' } };
  }
  if (record?.expiresAt && record.expiresAt < new Date().toISOString()) {
    return { status: 403, body: { verified: false, reason: 'ID Card has expired.' } };
  }

  const primary = emp.assignments?.[0];
  const liveLevel = clampIdCardLevel(
    record?.cardLevel ??
      tokenLevel ??
      resolveDefaultCardLevel({
        role: emp.role,
        staffGrade: emp.staffGrade,
        jobTitle: emp.jobTitle,
        departmentName: primary?.department?.name,
        employmentType: emp.employmentType,
        customAdminProfileId: emp.customAdminProfileId,
        customAdminTitle: emp.customAdminTitle,
      })
  );

  const levelSpec = ID_CARD_LEVELS[liveLevel];
  const parsedPerms = parsePermissionsJson(emp.customAdminProfile?.permissionsJson);
  const enabledModules = ADMIN_PERMISSION_CATALOG.filter((m) => parsedPerms?.[m.key]?.enabled).map((m) =>
    String(m.key)
  );

  let clearanceGranted = true;
  let gateReason = 'System-grade credential verified.';

  if (params.requiredMinLevel && liveLevel < params.requiredMinLevel) {
    clearanceGranted = false;
    gateReason = `Insufficient clearance: Level ${liveLevel} (${levelSpec.code}) < required Level ${params.requiredMinLevel}.`;
  }

  if (clearanceGranted && params.requiredModule) {
    const isTopExec = String(emp.role || '').toUpperCase() === 'GMD' || String(emp.role || '').toUpperCase() === 'SUPER_ADMIN';
    if (!isTopExec && !enabledModules.includes(params.requiredModule)) {
      clearanceGranted = false;
      gateReason = `Module "${params.requiredModule}" is not enabled in staff admin clearance.`;
    }
  }

  await logHrAudit({
    actorId: emp.id,
    actorName: emp.legalName,
    actorRole: emp.role,
    groupId: rootOrg?.id || primary?.subsidiary?.id || emp.id,
    action: clearanceGranted ? 'HR_ID_CARD_VERIFIED' : 'HR_ID_CARD_GATE_DENIED',
    targetType: 'ID_CARD',
    targetId: emp.id,
    metadata: {
      gateName: params.gateName || null,
      levelCode: levelSpec.code,
      gateReason,
    },
  }).catch(() => {});

  return {
    status: clearanceGranted ? 200 : 403,
    body: {
      verified: true,
      cryptographicToken: tokenVerified,
      clearanceGranted,
      reason: gateReason,
      cardNumber: record?.cardNumber || `${primary?.subsidiary?.code || 'BEMS'}-ID-${emp.employeeNumber}`,
      cardStatus: record?.status || 'ACTIVE_UNISSUED',
      cardLevel: liveLevel,
      levelCode: levelSpec.code,
      levelName: levelSpec.name,
      clearanceLabel: levelSpec.clearanceLabel,
      facilityScope: levelSpec.facilityScope,
      systemScope: levelSpec.systemScope,
      enabledModules,
      employee: {
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        legalName: emp.legalName,
        role: emp.role,
        jobTitle: emp.jobTitle || emp.role,
        departmentName: primary?.department?.name || 'Operations',
        subsidiaryName: primary?.subsidiary?.legalName || 'BEMS Group',
        subsidiaryCode: primary?.subsidiary?.code || 'BEMS-GROUP',
      },
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const res = await verifyCredential({
    token: searchParams.get('token'),
    code: searchParams.get('code'),
    requiredMinLevel: searchParams.get('minLevel') ? Number(searchParams.get('minLevel')) : null,
    requiredModule: searchParams.get('module'),
    gateName: searchParams.get('gate'),
  });
  return NextResponse.json(res.body, { status: res.status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await verifyCredential({
      token: body.token,
      code: body.code,
      requiredMinLevel: body.requiredMinLevel ? Number(body.requiredMinLevel) : null,
      requiredModule: body.requiredModule,
      gateName: body.gateName,
    });
    return NextResponse.json(res.body, { status: res.status });
  } catch {
    return NextResponse.json({ verified: false, reason: 'Invalid verification request body.' }, { status: 400 });
  }
}
