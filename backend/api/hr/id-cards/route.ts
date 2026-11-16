import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { resolveHrContext, logHrAudit } from '@/lib/hrRouteHelper';
import { hasEmployeePermission } from '@/lib/auth';
import { ADMIN_PERMISSION_CATALOG, parsePermissionsJson } from '@/lib/admin-permissions';
import { resolveOrganizationBranding } from '@/lib/subsidiary-branding';
import {
  clampIdCardLevel,
  ID_CARD_LEVELS,
  levelToTierCompat,
  resolveDefaultCardLevel,
  type IdCardLevel,
  type IdCardTierCompat,
} from '@/lib/id-card-levels';
import { signIdCardToken } from '@/lib/id-card-crypto';

export const dynamic = 'force-dynamic';

const REGISTRY_KEY = 'hr_id_cards_registry_v1';
const SIGNATURE_KEY = 'hr_id_card_management_signature_v1';

export type IdCardTier = IdCardTierCompat;

export interface IdCardRecord {
  employeeId: string;
  cardNumber: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  expiresAt: string;
  issuedById: string;
  issuedByName: string;
  revokedReason?: string | null;
  customColor?: string | null;
  secondaryColor?: string | null;
  cardTemplate?: 'ribbon' | 'aurora' | 'diagonal' | 'classic' | null;
  cardTier?: IdCardTier | null;
  cardLevel?: IdCardLevel | null;
}

async function loadRegistry(rootOrgId: string): Promise<Record<string, IdCardRecord>> {
  const setting = await prisma.workspaceSetting.findUnique({
    where: { organizationId_key: { organizationId: rootOrgId, key: REGISTRY_KEY } },
  });
  if (!setting?.value) return {};
  try {
    return JSON.parse(setting.value) || {};
  } catch {
    return {};
  }
}

async function loadManagementSignature(rootOrgId: string): Promise<string | null> {
  const setting = await prisma.workspaceSetting.findUnique({
    where: { organizationId_key: { organizationId: rootOrgId, key: SIGNATURE_KEY } },
  });
  return setting?.value || null;
}

function buildCardNumber(employeeNumber: string, subCode?: string | null): string {
  const prefix = String(subCode || 'BEMS').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'BEMS';
  const empNum = String(employeeNumber || '000').replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  return `${prefix}-ID-${empNum}`;
}

export async function GET(req: NextRequest) {
  const ctx = await resolveHrContext(req);
  if (ctx.error || !ctx.actor || !ctx.hrScope) return ctx.error!;
  const { actor, hrScope } = ctx;

  if (!hasEmployeePermission(actor, 'hr', 'id_cards')) {
    return NextResponse.json({ error: 'Forbidden: ID Card access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const requestedSubId = searchParams.get('subsidiaryId') || '';

  const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const registry = rootOrg ? await loadRegistry(rootOrg.id) : {};
  const managementSignatureUrl = rootOrg ? await loadManagementSignature(rootOrg.id) : null;

  const allowedSubIds = requestedSubId
    ? hrScope.isGlobal || hrScope.subsidiaryIds.includes(requestedSubId)
      ? [requestedSubId]
      : []
    : hrScope.subsidiaryIds;

  const useSubFilter = Boolean(requestedSubId) || !hrScope.isGlobal;

  const employees = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      role: { in: ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'STAFF'] },
      ...(useSubFilter
        ? {
            assignments: {
              some: {
                status: 'ACTIVE',
                subsidiaryId: { in: allowedSubIds.length > 0 ? allowedSubIds : ['__NONE__'] },
              },
            },
          }
        : {}),
    },
    orderBy: [{ legalName: 'asc' }],
    select: {
      id: true,
      employeeNumber: true,
      legalName: true,
      workEmail: true,
      phone: true,
      role: true,
      jobTitle: true,
      staffGrade: true,
      customAdminProfileId: true,
      customAdminTitle: true,
      customAdminProfile: { select: { name: true, permissionsJson: true } },
      avatarUrl: true,
      resumptionDate: true,
      employmentType: true,
      assignments: {
        where: { status: 'ACTIVE' },
        orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
        take: 1,
        include: {
          department: { select: { id: true, name: true, code: true } },
          subsidiary: {
            select: { id: true, legalName: true, code: true, brandColor: true, logoUrl: true },
          },
        },
      },
    },
  });

  const origin = req.headers.get('origin') || 'https://bemserp.work';
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const defaultExpiryDate = new Date(nowDate);
  defaultExpiryDate.setMonth(defaultExpiryDate.getMonth() + 24);
  const defaultExpiryIso = defaultExpiryDate.toISOString();

  const cards = await Promise.all(
    employees.map(async (emp) => {
      const primary = emp.assignments?.[0];
      const sub = primary?.subsidiary;
      const branding = sub
        ? resolveOrganizationBranding(sub)
        : { subsidiaryBrandColor: '#ea580c', subsidiaryLogoUrl: '/bems-group-logo.png?v=20261024' };
      const record = registry[emp.id] || null;
      const cardNumber = record?.cardNumber || buildCardNumber(emp.employeeNumber, sub?.code);

      const defaultLevel = resolveDefaultCardLevel({
        role: emp.role,
        staffGrade: emp.staffGrade,
        jobTitle: emp.jobTitle,
        departmentName: primary?.department?.name,
        employmentType: emp.employmentType,
        customAdminProfileId: emp.customAdminProfileId,
        customAdminTitle: emp.customAdminTitle,
      });

      const cardLevel: IdCardLevel = record?.cardLevel ? clampIdCardLevel(record.cardLevel) : defaultLevel;
      const levelSpec = ID_CARD_LEVELS[cardLevel];
      const computedTier = levelToTierCompat(cardLevel);

      const effectiveIssuedAt = record?.issuedAt || nowIso;
      const effectiveExpiresAt = record?.expiresAt || defaultExpiryIso;

      const qrToken = signIdCardToken({
        employeeId: emp.id,
        cardNumber,
        cardLevel,
        role: emp.role,
        subsidiaryCode: sub?.code || 'BEMS-GROUP',
        issuedAtIso: effectiveIssuedAt,
        expiresAtIso: effectiveExpiresAt,
      });

      const verifyUrl = `${origin}/api/hr/id-cards/verify?token=${encodeURIComponent(qrToken)}`;
      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(verifyUrl, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      } catch {}

      const computedStatus =
        record?.status === 'REVOKED'
          ? 'REVOKED'
          : record && record.expiresAt < nowIso
          ? 'EXPIRED'
          : record
          ? 'ACTIVE'
          : 'NOT_ISSUED';

      let systemClearance: string[] = [];
      if (cardLevel === 10) {
        systemClearance = ['Full Group Clearance', 'GMD Wallet & AI', 'All Modules'];
      } else if (cardLevel === 9) {
        systemClearance = ['Executive Clearance', 'Control Center', 'Data Center L9'];
      } else if (cardLevel === 8) {
        const parsed = parsePermissionsJson(emp.customAdminProfile?.permissionsJson);
        const enabledModules = ADMIN_PERMISSION_CATALOG.filter((m) => parsed?.[m.key]?.enabled).map((m) =>
          m.label.replace(' Management', '')
        );
        systemClearance = enabledModules.length > 0 ? enabledModules : ['Scoped Admin Portal'];
      } else if (cardLevel === 5 || cardLevel === 6) {
        systemClearance = [levelSpec.systemScope, 'Internal QR Auth'];
      }

      return {
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        legalName: emp.legalName,
        workEmail: emp.workEmail,
        phone: emp.phone,
        role: emp.role,
        jobTitle: emp.jobTitle || emp.role,
        staffGrade: emp.staffGrade || null,
        employmentType: emp.employmentType,
        avatarUrl: emp.avatarUrl,
        resumptionDate: emp.resumptionDate,
        departmentName: primary?.department?.name || 'Operations',
        departmentCode: primary?.department?.code || 'OPS',
        subsidiaryId: sub?.id || null,
        subsidiaryName: sub?.legalName || 'BEMS Group',
        subsidiaryCode: sub?.code || 'BEMS-GROUP',
        brandColor: sub?.brandColor || branding.subsidiaryBrandColor || '#ea580c',
        logoUrl: sub?.logoUrl || branding.subsidiaryLogoUrl || '/bems-group-logo.png?v=20261024',
        customColor: record?.customColor || null,
        secondaryColor: record?.secondaryColor || null,
        cardTemplate: record?.cardTemplate || 'aurora',
        cardTier: computedTier,
        cardLevel,
        levelCode: levelSpec.code,
        levelName: levelSpec.name,
        clearanceLabel: levelSpec.clearanceLabel,
        facilityScope: levelSpec.facilityScope,
        systemScope: levelSpec.systemScope,
        customAdminTitle: emp.customAdminTitle || emp.customAdminProfile?.name || null,
        systemClearance,
        cardNumber,
        status: computedStatus,
        issuedAt: effectiveIssuedAt,
        expiresAt: effectiveExpiresAt,
        isPreviewDates: !record,
        issuedByName: record?.issuedByName || null,
        revokedReason: record?.revokedReason || null,
        qrDataUrl,
        qrToken,
        verifyUrl,
      };
    })
  );

  return NextResponse.json({ success: true, cards, managementSignatureUrl });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveHrContext(req);
  if (ctx.error || !ctx.actor) return ctx.error!;
  const { actor } = ctx;

  if (!hasEmployeePermission(actor, 'hr', 'id_cards', 'issue_revoke_id_cards')) {
    return NextResponse.json({ error: 'Forbidden: ID Card issuance authority required.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = String(body.action || '').toUpperCase();

    const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!rootOrg) {
      return NextResponse.json({ error: 'Root organization not configured.' }, { status: 400 });
    }

    if (action === 'SAVE_SIGNATURE') {
      const signatureDataUrl = body.signatureDataUrl ? String(body.signatureDataUrl).trim() : '';
      if (!signatureDataUrl) {
        await prisma.workspaceSetting.deleteMany({
          where: { organizationId: rootOrg.id, key: SIGNATURE_KEY },
        });
      } else {
        await prisma.workspaceSetting.upsert({
          where: { organizationId_key: { organizationId: rootOrg.id, key: SIGNATURE_KEY } },
          update: { value: signatureDataUrl, updatedById: actor.id },
          create: {
            organizationId: rootOrg.id,
            key: SIGNATURE_KEY,
            value: signatureDataUrl,
            updatedById: actor.id,
          },
        });
      }
      await logHrAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: rootOrg.id,
        action: 'HR_ID_CARD_SIGNATURE_UPDATED',
        targetType: 'ID_CARD',
        targetId: rootOrg.id,
        metadata: { cleared: !signatureDataUrl },
      });
      return NextResponse.json({ success: true, managementSignatureUrl: signatureDataUrl || null });
    }

    const employeeIds: string[] = Array.isArray(body.employeeIds)
      ? body.employeeIds.map(String)
      : body.employeeId
      ? [String(body.employeeId)]
      : [];
    const validityMonths = Math.min(60, Math.max(1, Number(body.validityMonths || 24)));
    const reason = body.reason ? String(body.reason).trim() : null;
    const customColor = body.customColor ? String(body.customColor).trim() : null;
    const secondaryColor = body.secondaryColor ? String(body.secondaryColor).trim() : null;
    const cardTemplate = body.cardTemplate ? (String(body.cardTemplate) as IdCardRecord['cardTemplate']) : null;
    const cardLevel = body.cardLevel ? clampIdCardLevel(body.cardLevel) : null;

    if (employeeIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one employee.' }, { status: 400 });
    }

    const registry = await loadRegistry(rootOrg.id);
    const targets = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        legalName: true,
        employeeNumber: true,
        role: true,
        jobTitle: true,
        staffGrade: true,
        employmentType: true,
        customAdminProfileId: true,
        customAdminTitle: true,
        assignments: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
          take: 1,
          include: {
            department: { select: { name: true } },
            subsidiary: { select: { code: true } },
          },
        },
      },
    });

    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + validityMonths);

    for (const target of targets) {
      const subCode = target.assignments?.[0]?.subsidiary?.code;
      const existing = registry[target.id];
      const cardNumber = existing?.cardNumber || buildCardNumber(target.employeeNumber, subCode);
      const resolvedLevel =
        cardLevel ??
        existing?.cardLevel ??
        resolveDefaultCardLevel({
          role: target.role,
          staffGrade: target.staffGrade,
          jobTitle: target.jobTitle,
          departmentName: target.assignments?.[0]?.department?.name,
          employmentType: target.employmentType,
          customAdminProfileId: target.customAdminProfileId,
          customAdminTitle: target.customAdminTitle,
        });

      if (action === 'REVOKE_CARD') {
        registry[target.id] = {
          employeeId: target.id,
          cardNumber,
          status: 'REVOKED',
          issuedAt: existing?.issuedAt || now.toISOString(),
          expiresAt: existing?.expiresAt || expires.toISOString(),
          issuedById: actor.id,
          issuedByName: actor.legalName,
          revokedReason: reason || 'Revoked by HR',
          cardLevel: resolvedLevel,
          cardTier: levelToTierCompat(resolvedLevel),
        };
      } else {
        registry[target.id] = {
          employeeId: target.id,
          cardNumber,
          status: 'ACTIVE',
          issuedAt: now.toISOString(),
          expiresAt: expires.toISOString(),
          issuedById: actor.id,
          issuedByName: actor.legalName,
          revokedReason: null,
          customColor: customColor ?? existing?.customColor ?? null,
          secondaryColor: secondaryColor ?? existing?.secondaryColor ?? null,
          cardTemplate: cardTemplate ?? existing?.cardTemplate ?? 'aurora',
          cardLevel: resolvedLevel,
          cardTier: levelToTierCompat(resolvedLevel),
        };
      }
    }

    await prisma.workspaceSetting.upsert({
      where: { organizationId_key: { organizationId: rootOrg.id, key: REGISTRY_KEY } },
      update: { value: JSON.stringify(registry), updatedById: actor.id },
      create: {
        organizationId: rootOrg.id,
        key: REGISTRY_KEY,
        value: JSON.stringify(registry),
        updatedById: actor.id,
      },
    });

    await logHrAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: rootOrg.id,
      action: action === 'REVOKE_CARD' ? 'HR_ID_CARD_REVOKED' : 'HR_ID_CARD_ISSUED',
      targetType: 'ID_CARD',
      targetId: employeeIds[0],
      metadata: { count: targets.length, validityMonths, cardLevel, reason },
    });

    return NextResponse.json({ success: true, updatedCount: targets.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update ID card.' }, { status: 500 });
  }
}
