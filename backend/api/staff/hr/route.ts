import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getAuthenticatedEmployee } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { signIdCardToken } from '@/lib/id-card-crypto';
import {
  clampIdCardLevel,
  ID_CARD_LEVELS,
  levelToTierCompat,
  resolveDefaultCardLevel,
  type IdCardLevel,
} from '@/lib/id-card-levels';

export const dynamic = 'force-dynamic';

const ID_CARDS_REGISTRY_KEY = 'hr_id_cards_registry_v1';
const SIGNATURE_KEY = 'hr_id_card_management_signature_v1';

interface IdCardRecord {
  employeeId: string;
  cardNumber: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  expiresAt: string;
  issuedById: string;
  issuedByName: string;
  customColor?: string | null;
  secondaryColor?: string | null;
  cardTemplate?: string | null;
  cardTier?: string | null;
  cardLevel?: number | null;
}

export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const todayWat = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const currentYear = Number(todayWat.slice(0, 4));
    const currentMonth = Number(todayWat.slice(5, 7));
    const currentMonthPrefix = todayWat.slice(0, 7);

    const [
      employeeRecord,
      assignments,
      agreement,
      workSchedule,
      attendanceRecords,
      leaveRequests,
      payrollItems,
      deductionAdjustments,
      loans,
      documents,
      hrTickets,
      kpis,
      evaluations,
      pips,
      trainingAssignments,
      availableCourses,
      disciplinaryCases,
      grievances,
      rootOrg,
    ] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          employeeNumber: true,
          legalName: true,
          workEmail: true,
          phone: true,
          avatarUrl: true,
          jobTitle: true,
          employmentType: true,
          resumptionDate: true,
          residentialAddress: true,
          cityState: true,
          workLocation: true,
          staffGrade: true,
          bankName: true,
          accountNumber: true,
          accountName: true,
          salaryBankName: true,
          salaryAccountNumber: true,
          salaryAccountName: true,
          nextOfKinName: true,
          nextOfKinPhone: true,
          nextOfKinRelationship: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.employeeAssignment.findMany({
        where: { employeeId: actor.id },
        orderBy: [{ status: 'asc' }, { isPrimary: 'desc' }, { startsOn: 'desc' }],
        include: {
          subsidiary: { select: { id: true, legalName: true, code: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.employmentAgreement.findFirst({
        where: { employeeId: actor.id, status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        include: { compensations: { where: { effectiveTo: null }, orderBy: [{ version: 'desc' }, { effectiveFrom: 'desc' }], take: 1 } },
      }),
      prisma.staffWorkSchedule.findUnique({ where: { employeeId: actor.id } }),
      prisma.attendanceRecord.findMany({
        where: { employeeId: actor.id },
        orderBy: { workDate: 'desc' },
        take: 30,
        select: {
          id: true,
          workDate: true,
          status: true,
          checkInTime: true,
          checkOutTime: true,
          checkInDistanceM: true,
          isDeductionApplied: true,
          deductionPercent: true,
          deductionMinor: true,
          excuseStatus: true,
          excuseRequestNote: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.payrollItem.findMany({
        where: { employeeId: actor.id },
        orderBy: { batch: { createdAt: 'desc' } },
        take: 12,
        include: {
          batch: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              period: { select: { year: true, month: true } },
            },
          },
        },
      }),
      prisma.payrollDeductionAdjustment.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.employeeLoan.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.employeeDocument.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          docType: true,
          title: true,
          fileUrl: true,
          version: true,
          expiryDate: true,
          requiresSignature: true,
          signedAt: true,
          createdAt: true,
        },
      }),
      prisma.hrRequestTicket.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      prisma.kpiDefinition.findMany({
        where: { employeeId: actor.id, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.performanceEvaluation.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          cycle: { select: { id: true, title: true, cycleType: true, startDate: true, endDate: true } },
          reviewer: { select: { id: true, legalName: true } },
        },
      }),
      prisma.performanceImprovementPlan.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.employeeTrainingAssignment.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, title: true, category: true, provider: true, durationHours: true, isMandatory: true } },
        },
      }),
      prisma.trainingCourse.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.disciplinaryCase.findMany({
        where: { employeeId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.employeeGrievanceCase.findMany({
        where: { reporterId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }),
    ]);

    const activeAssignment = assignments.find((a) => a.status === 'ACTIVE') || assignments[0] || null;
    const subId = activeAssignment?.subsidiaryId || rootOrg?.id || '';
    const subCode = activeAssignment?.subsidiary?.code || 'BEMS';

    const [attendancePolicy, announcements] = await Promise.all([
      subId ? prisma.attendancePolicy.findUnique({ where: { organizationId: subId } }) : null,
      prisma.companyAnnouncement.findMany({
        where: {
          OR: [{ subsidiaryId: null }, ...(subId ? [{ subsidiaryId: subId }] : [])],
        },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        include: { author: { select: { legalName: true } } },
      }),
    ]);

    // ID Card registry, management signature & signed QR token (matches /api/hr/id-cards)
    let idCardRecord: IdCardRecord | null = null;
    let managementSignatureUrl: string | null = null;
    if (rootOrg) {
      const [setting, sigSetting] = await Promise.all([
        prisma.workspaceSetting.findUnique({
          where: { organizationId_key: { organizationId: rootOrg.id, key: ID_CARDS_REGISTRY_KEY } },
        }),
        prisma.workspaceSetting.findUnique({
          where: { organizationId_key: { organizationId: rootOrg.id, key: SIGNATURE_KEY } },
        }),
      ]);
      managementSignatureUrl = sigSetting?.value || null;
      if (setting?.value) {
        try {
          const registry = JSON.parse(setting.value) as Record<string, IdCardRecord>;
          idCardRecord = registry?.[actor.id] || null;
        } catch {
          idCardRecord = null;
        }
      }
    }

    const defaultLevel = resolveDefaultCardLevel({
      role: actor.role,
      staffGrade: employeeRecord?.staffGrade,
      jobTitle: activeAssignment?.positionName || employeeRecord?.jobTitle,
      departmentName: activeAssignment?.department?.name,
      employmentType: employeeRecord?.employmentType,
    });
    const cardLevel: IdCardLevel = idCardRecord?.cardLevel ? clampIdCardLevel(idCardRecord.cardLevel) : defaultLevel;
    const levelSpec = ID_CARD_LEVELS[cardLevel];
    const computedTier = levelToTierCompat(cardLevel);

    const cardNumber = idCardRecord?.cardNumber || `${subCode}-ID-${actor.employeeNumber}`;
    const issuedAtIso =
      idCardRecord?.issuedAt ||
      (employeeRecord?.resumptionDate ? employeeRecord.resumptionDate.toISOString() : now.toISOString());
    const defaultExp = new Date(now);
    defaultExp.setMonth(defaultExp.getMonth() + 24);
    const expiresAtIso = idCardRecord?.expiresAt || defaultExp.toISOString();

    let qrDataUrl: string | null = null;
    try {
      const token = signIdCardToken({
        employeeId: actor.id,
        cardNumber,
        cardLevel,
        role: actor.role,
        subsidiaryCode: subCode,
        issuedAtIso,
        expiresAtIso,
      });
      const verifyUrl = `https://bemserp.work/api/hr/id-cards/verify?token=${encodeURIComponent(token)}`;
      qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
    } catch {
      qrDataUrl = null;
    }

    const todayAttendance = attendanceRecords.find((r) => r.workDate === todayWat) || null;
    const approvedLeaveDays = leaveRequests
      .filter((l) => l.status === 'APPROVED')
      .reduce((sum, l) => {
        const start = new Date(`${l.startDate}T00:00:00Z`).getTime();
        const end = new Date(`${l.endDate}T00:00:00Z`).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return sum;
        return sum + Math.floor((end - start) / 86400000) + 1;
      }, 0);

    // Current Month Pay, Deductions & Remaining Balance to Collect
    const currentMonthPayroll = payrollItems.find(
      (p) => p.batch?.period?.year === currentYear && p.batch?.period?.month === currentMonth,
    );
    const activeComp = agreement?.compensations?.[0] || null;
    const grossMonthlyMinor = currentMonthPayroll
      ? Number(currentMonthPayroll.grossMinor)
      : Number(activeComp?.grossMinor ?? 0);

    const attendanceDeductionsThisMonthMinor = attendanceRecords
      .filter((r) => r.workDate.startsWith(currentMonthPrefix) && r.excuseStatus !== 'APPROVED')
      .reduce((sum, r) => sum + Number(r.deductionMinor || 0), 0);

    const activeLoanInstallmentMinor = loans
      .filter((l) => l.status === 'ACTIVE' && l.disbursedAt != null)
      .reduce((sum, l) => sum + Number(l.monthlyInstallmentMinor || 0), 0);

    const adjustmentDeductionsMinor = deductionAdjustments
      .filter((d) => d.direction === 'DEDUCTION' && (d.status === 'APPROVED' || d.status === 'APPLIED' || d.status === 'PROPOSED'))
      .reduce((sum, d) => sum + Number(d.amountMinor || 0), 0);

    const payrollStatutoryDeductionsMinor = currentMonthPayroll
      ? Number(currentMonthPayroll.employeeDeductionsMinor)
      : 0;

    const totalDeductionsMinor =
      payrollStatutoryDeductionsMinor > 0
        ? payrollStatutoryDeductionsMinor
        : attendanceDeductionsThisMonthMinor + activeLoanInstallmentMinor + adjustmentDeductionsMinor;

    const netMonthlyMinor = currentMonthPayroll
      ? Number(currentMonthPayroll.netMinor)
      : Math.max(0, grossMonthlyMinor - totalDeductionsMinor);

    const isCurrentMonthDisbursed =
      currentMonthPayroll?.status === 'PAID' || currentMonthPayroll?.batch?.status === 'DISBURSED';
    const alreadyPaidMinor = isCurrentMonthDisbursed ? netMonthlyMinor : 0;
    const remainingToCollectMinor = Math.max(0, netMonthlyMinor - alreadyPaidMinor);

    const pendingIdCardTicket = hrTickets.find(
      (t) => t.category === 'ID_CARD' && (t.status === 'PENDING' || t.status === 'IN_REVIEW'),
    );
    const resignationTicket = hrTickets.find((t) => t.category === 'RESIGNATION_EXIT') || null;
    const policyDocs = documents.filter((d) => d.docType === 'POLICY' || d.docType === 'NDA');
    const employmentDocs = documents.filter((d) => d.docType !== 'POLICY');

    const resumptionDt = employeeRecord?.resumptionDate ? new Date(employeeRecord.resumptionDate) : null;
    const probationEndDt = resumptionDt ? new Date(resumptionDt.getTime() + 90 * 86400000) : null;
    const isProbationConfirmed =
      employeeRecord?.employmentType === 'FULL_TIME' &&
      documents.some((d) => d.docType === 'CONFIRMATION_LETTER');

    return NextResponse.json({
      profile: {
        id: actor.id,
        legalName: employeeRecord?.legalName || actor.legalName,
        employeeNumber: employeeRecord?.employeeNumber || actor.employeeNumber,
        jobTitle: activeAssignment?.positionName || employeeRecord?.jobTitle || 'Staff Member',
        workEmail: employeeRecord?.workEmail || actor.workEmail,
        phone: employeeRecord?.phone || actor.phone,
        avatarUrl: employeeRecord?.avatarUrl || null,
        employmentType: employeeRecord?.employmentType || 'FULL_TIME',
        resumptionDate: employeeRecord?.resumptionDate || null,
        residentialAddress: employeeRecord?.residentialAddress || null,
        cityState: employeeRecord?.cityState || null,
        workLocation: employeeRecord?.workLocation || null,
        staffGrade: employeeRecord?.staffGrade || null,
        subsidiaryName: activeAssignment?.subsidiary?.legalName || 'BEMS Group',
        subsidiaryCode: subCode,
        departmentName: activeAssignment?.department?.name || 'Operations',
        bankName: employeeRecord?.salaryBankName || employeeRecord?.bankName || null,
        accountNumber: employeeRecord?.salaryAccountNumber || employeeRecord?.accountNumber || null,
        accountName: employeeRecord?.salaryAccountName || employeeRecord?.accountName || null,
        nextOfKinName: employeeRecord?.nextOfKinName || null,
        nextOfKinPhone: employeeRecord?.nextOfKinPhone || null,
        nextOfKinRelationship: employeeRecord?.nextOfKinRelationship || null,
      },
      agreement: agreement
        ? {
            id: agreement.id,
            agreementType: agreement.agreementType,
            paymentModel: agreement.paymentModel,
            startDate: agreement.startDate,
            endDate: agreement.endDate,
            grossMinor: Number(activeComp?.grossMinor ?? 0),
            currency: activeComp?.currency || 'NGN',
            recurrence: activeComp?.recurrence || 'MONTHLY',
          }
        : null,
      schedule: {
        shiftStart: workSchedule?.customShiftIn || attendancePolicy?.resumptionTime || '08:00',
        shiftEnd: workSchedule?.customShiftOut || attendancePolicy?.closingTime || '17:00',
        gracePeriodMinutes: attendancePolicy?.gracePeriodMinutes ?? 15,
        weeklyOffDays: workSchedule?.weeklyOffDays || '0,6',
        isExempt: workSchedule?.isExempt ?? false,
        notes: workSchedule?.notes || null,
      },
      idCard: {
        cardNumber,
        status: idCardRecord?.status || 'DIGITAL_ACTIVE',
        isIssuedInRegistry: Boolean(idCardRecord),
        issuedAt: issuedAtIso,
        expiresAt: expiresAtIso,
        cardTier: computedTier,
        cardLevel,
        levelCode: levelSpec.code,
        levelName: levelSpec.name,
        shortTitle: levelSpec.shortTitle,
        clearanceLabel: levelSpec.clearanceLabel,
        facilityScope: levelSpec.facilityScope,
        systemScope: levelSpec.systemScope,
        systemClearance:
          cardLevel === 10
            ? ['Full Group Clearance', 'GMD Wallet & AI', 'All Modules']
            : cardLevel === 9
              ? ['Executive Clearance', 'Control Center', 'Data Center L9']
              : [levelSpec.systemScope, 'Internal QR Auth'],
        accentDefault: levelSpec.accentDefault,
        secondaryDefault: levelSpec.secondaryDefault,
        cardTemplate: idCardRecord?.cardTemplate || 'aurora',
        customColor: idCardRecord?.customColor || null,
        secondaryColor: idCardRecord?.secondaryColor || null,
        managementSignatureUrl,
        qrDataUrl,
        hasPendingPhysicalRequest: Boolean(pendingIdCardTicket),
        pendingRequestCode: pendingIdCardTicket?.referenceCode || null,
      },
      currentMonthPay: {
        monthLabel: new Intl.DateTimeFormat('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'Africa/Lagos',
        }).format(now),
        currency: activeComp?.currency || currentMonthPayroll?.currency || 'NGN',
        grossMonthlyMinor,
        payrollStatutoryDeductionsMinor,
        attendanceDeductionsThisMonthMinor,
        activeLoanInstallmentMinor,
        adjustmentDeductionsMinor,
        totalDeductionsMinor,
        netMonthlyMinor,
        alreadyPaidMinor,
        remainingToCollectMinor,
        payrollStatus: currentMonthPayroll?.batch?.status || currentMonthPayroll?.status || 'PREPARING',
      },
      todayDate: todayWat,
      todayAttendance: todayAttendance
        ? { ...todayAttendance, deductionMinor: Number(todayAttendance.deductionMinor || 0) }
        : null,
      attendanceRecords: attendanceRecords.map((r) => ({
        ...r,
        deductionMinor: Number(r.deductionMinor || 0),
      })),
      leaveSummary: {
        annualAllowanceDays: 20,
        usedDays: approvedLeaveDays,
        remainingDays: Math.max(0, 20 - approvedLeaveDays),
        pendingCount: leaveRequests.filter((l) => l.status === 'PENDING').length,
      },
      leaveRequests,
      payrollItems: payrollItems.map((p) => {
        const periodLabel = p.batch?.period
          ? new Date(Date.UTC(p.batch.period.year, p.batch.period.month - 1, 1)).toLocaleString(
              'en-US',
              { month: 'short', year: 'numeric', timeZone: 'UTC' },
            )
          : 'Payroll Run';
        return {
          id: p.id,
          period: periodLabel,
          batchStatus: p.batch?.status || p.status,
          grossMinor: Number(p.grossMinor),
          deductionsMinor: Number(p.employeeDeductionsMinor),
          netMinor: Number(p.netMinor),
          currency: p.currency,
          status: p.status,
          createdAt: p.batch?.createdAt || null,
        };
      }),
      deductionAdjustments: deductionAdjustments.map((d) => ({
        ...d,
        amountMinor: Number(d.amountMinor),
      })),
      loans: loans.map((l) => ({
        ...l,
        principalMinor: Number(l.principalMinor),
        monthlyInstallmentMinor: Number(l.monthlyInstallmentMinor),
        remainingBalanceMinor: Number(l.remainingBalanceMinor),
        isDisbursed: Boolean(l.disbursedAt),
      })),
      documents: employmentDocs,
      policies: policyDocs,
      hrTickets,
      performance: {
        kpis,
        evaluations: evaluations.map((e) => ({
          id: e.id,
          cycleTitle: e.cycle?.title || 'Performance Review',
          cycleType: e.cycle?.cycleType || 'QUARTERLY',
          overallScore: e.overallScore,
          reviewerName: e.reviewer?.legalName || 'Manager',
          reviewerSummary: e.reviewerSummary,
          employeeComment: e.employeeComment,
          status: e.status,
          pipRequired: e.pipRequired,
          createdAt: e.createdAt,
        })),
        pips,
      },
      probation: {
        employmentType: employeeRecord?.employmentType || 'FULL_TIME',
        resumptionDate: employeeRecord?.resumptionDate || null,
        expectedReviewDate: probationEndDt ? probationEndDt.toISOString() : null,
        isConfirmed: isProbationConfirmed,
        status: isProbationConfirmed
          ? 'CONFIRMED'
          : employeeRecord?.employmentType === 'PROBATION'
            ? 'ON_PROBATION'
            : 'ACTIVE_EMPLOYMENT',
      },
      training: {
        assignments: trainingAssignments,
        catalog: availableCourses,
      },
      disciplinaryCases,
      grievances,
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        category: a.category,
        priority: a.priority,
        authorName: a.author?.legalName || 'HR Department',
        publishedAt: a.publishedAt,
      })),
      careerHistory: assignments.map((a) => ({
        id: a.id,
        positionName: a.positionName,
        departmentName: a.department?.name || 'Operations',
        subsidiaryName: a.subsidiary?.legalName || 'BEMS Group',
        startsOn: a.startsOn,
        endsOn: a.endsOn,
        status: a.status,
        isPrimary: a.isPrimary,
      })),
      exitClearance: resignationTicket
        ? {
            referenceCode: resignationTicket.referenceCode,
            status: resignationTicket.status,
            description: resignationTicket.description,
            resolutionNote: resignationTicket.resolutionNote,
            createdAt: resignationTicket.createdAt,
            departments: [
              { name: 'Human Resources', requirement: 'Employment & documentation review', status: resignationTicket.status === 'APPROVED' ? 'CLEARED' : 'PENDING' },
              { name: 'Finance', requirement: 'Authorized outstanding financial matters & loans', status: loans.some((l) => l.remainingBalanceMinor > BigInt(0)) ? 'ACTION_REQUIRED' : 'CLEARED' },
              { name: 'Administration', requirement: 'Return of company assets & ID badge', status: 'PENDING' },
              { name: 'IT', requirement: 'Account & equipment handover', status: 'PENDING' },
              { name: 'Department', requirement: 'Work & project deliverables handover', status: 'PENDING' },
              { name: 'Management', requirement: 'Final designated approval', status: 'PENDING' },
            ],
          }
        : null,
    });
  } catch (error) {
    console.error('[STAFF_HR_GET]', error);
    return NextResponse.json({ error: 'Could not load HR workspace.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = String(body.action || '').toUpperCase();

    const assignment = await prisma.employeeAssignment.findFirst({
      where: { employeeId: actor.id, status: 'ACTIVE' },
      orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
      select: { subsidiaryId: true },
    });
    const fallbackOrg = assignment?.subsidiaryId
      ? null
      : await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    const organizationId = assignment?.subsidiaryId || fallbackOrg?.id || '';

    if (action === 'UPDATE_PROFILE_CONTACT') {
      const updated = await prisma.employee.update({
        where: { id: actor.id },
        data: {
          ...(body.phone !== undefined ? { phone: String(body.phone || '').trim() || null } : {}),
          ...(body.residentialAddress !== undefined
            ? { residentialAddress: String(body.residentialAddress || '').trim() || null }
            : {}),
          ...(body.cityState !== undefined ? { cityState: String(body.cityState || '').trim() || null } : {}),
          ...(body.nextOfKinName !== undefined
            ? { nextOfKinName: String(body.nextOfKinName || '').trim() || null }
            : {}),
          ...(body.nextOfKinPhone !== undefined
            ? { nextOfKinPhone: String(body.nextOfKinPhone || '').trim() || null }
            : {}),
          ...(body.nextOfKinRelationship !== undefined
            ? { nextOfKinRelationship: String(body.nextOfKinRelationship || '').trim() || null }
            : {}),
        },
        select: { id: true, phone: true, residentialAddress: true, cityState: true },
      });
      return NextResponse.json({ success: true, profile: updated });
    }

    if (action === 'REQUEST_LEAVE') {
      const leaveType = String(body.leaveType || 'ANNUAL').toUpperCase();
      const startDate = String(body.startDate || '').trim();
      const endDate = String(body.endDate || '').trim();
      const reason = String(body.reason || '').trim();
      const handoverNotes = body.handoverNotes ? String(body.handoverNotes).trim() : null;

      if (!startDate || !endDate || !reason) {
        return NextResponse.json({ error: 'Start date, end date, and reason are required.' }, { status: 400 });
      }
      if (endDate < startDate) {
        return NextResponse.json({ error: 'End date cannot be earlier than start date.' }, { status: 400 });
      }

      const created = await prisma.leaveRequest.create({
        data: {
          employeeId: actor.id,
          leaveType,
          startDate,
          endDate,
          reason,
          handoverNotes,
          status: 'PENDING',
        },
      });
      return NextResponse.json({ success: true, leaveRequest: created }, { status: 201 });
    }

    if (action === 'CANCEL_LEAVE') {
      const leaveId = String(body.leaveId || '').trim();
      const existing = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
      if (!existing || existing.employeeId !== actor.id) {
        return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
      }
      if (existing.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only pending leave requests can be cancelled.' }, { status: 400 });
      }
      const updated = await prisma.leaveRequest.update({
        where: { id: leaveId },
        data: { status: 'CANCELLED' },
      });
      return NextResponse.json({ success: true, leaveRequest: updated });
    }

    if (action === 'SUBMIT_HR_REQUEST') {
      const category = String(body.category || 'EMPLOYMENT_LETTER').toUpperCase();
      const subject = String(body.subject || '').trim();
      const description = String(body.description || '').trim();
      const priority = String(body.priority || 'NORMAL').toUpperCase();

      if (!subject || !description || !organizationId) {
        return NextResponse.json({ error: 'Subject, description, and active organization are required.' }, { status: 400 });
      }

      const referenceCode = `HRQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const ticket = await prisma.hrRequestTicket.create({
        data: {
          referenceCode,
          organizationId,
          employeeId: actor.id,
          category,
          subject,
          description,
          priority,
          status: 'PENDING',
        },
      });
      return NextResponse.json({ success: true, ticket }, { status: 201 });
    }

    if (action === 'WITHDRAW_HR_REQUEST') {
      const ticketId = String(body.ticketId || '').trim();
      const existing = await prisma.hrRequestTicket.findUnique({ where: { id: ticketId } });
      if (!existing || existing.employeeId !== actor.id) {
        return NextResponse.json({ error: 'HR request not found.' }, { status: 404 });
      }
      if (existing.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only pending requests can be withdrawn.' }, { status: 400 });
      }
      const updated = await prisma.hrRequestTicket.update({
        where: { id: ticketId },
        data: { status: 'CANCELLED' },
      });
      return NextResponse.json({ success: true, ticket: updated });
    }

    if (action === 'REQUEST_ATTENDANCE_EXCUSE') {
      const attendanceId = String(body.attendanceId || '').trim();
      const excuseReason = String(body.excuseReason || '').trim();
      if (!attendanceId || !excuseReason) {
        return NextResponse.json({ error: 'Attendance record ID and excuse reason are required.' }, { status: 400 });
      }
      const record = await prisma.attendanceRecord.findUnique({ where: { id: attendanceId } });
      if (!record || record.employeeId !== actor.id) {
        return NextResponse.json({ error: 'Attendance record not found.' }, { status: 404 });
      }
      const updated = await prisma.attendanceRecord.update({
        where: { id: attendanceId },
        data: {
          excuseRequestNote: excuseReason,
          excuseRequestedByName: actor.legalName,
          excuseStatus: 'PENDING_GMD_APPROVAL',
        },
      });
      return NextResponse.json({
        success: true,
        attendanceRecord: { ...updated, deductionMinor: Number(updated.deductionMinor || 0) },
      });
    }

    if (action === 'DISPUTE_DEDUCTION') {
      const adjustmentId = String(body.adjustmentId || '').trim();
      const disputeNote = String(body.disputeNote || '').trim();
      if (!adjustmentId || !disputeNote) {
        return NextResponse.json({ error: 'Adjustment ID and dispute note are required.' }, { status: 400 });
      }
      const adjustment = await prisma.payrollDeductionAdjustment.findUnique({ where: { id: adjustmentId } });
      if (!adjustment || adjustment.employeeId !== actor.id) {
        return NextResponse.json({ error: 'Deduction adjustment not found.' }, { status: 404 });
      }
      const updated = await prisma.payrollDeductionAdjustment.update({
        where: { id: adjustmentId },
        data: { status: 'DISPUTED', disputeNote },
      });
      return NextResponse.json({
        success: true,
        adjustment: { ...updated, amountMinor: Number(updated.amountMinor) },
      });
    }

    if (action === 'REQUEST_LOAN_OR_ADVANCE') {
      const loanType = String(body.loanType || 'SALARY_ADVANCE').toUpperCase();
      const amountNaira = Number(body.amountNaira || 0);
      const tenureMonths = Math.max(1, Math.min(24, Number(body.tenureMonths || 1)));
      const reason = String(body.reason || '').trim();
      if (!Number.isFinite(amountNaira) || amountNaira <= 0 || !reason || !organizationId) {
        return NextResponse.json({ error: 'Valid loan amount, tenure, and reason are required.' }, { status: 400 });
      }
      const principalMinor = BigInt(Math.round(amountNaira * 100));
      const monthlyInstallmentMinor = BigInt(Math.ceil(Number(principalMinor) / tenureMonths));
      const loan = await prisma.employeeLoan.create({
        data: {
          organizationId,
          employeeId: actor.id,
          loanType,
          principalMinor,
          monthlyInstallmentMinor,
          remainingBalanceMinor: principalMinor,
          tenureMonths,
          reason,
          status: 'PENDING',
        },
      });
      return NextResponse.json(
        {
          success: true,
          loan: {
            ...loan,
            principalMinor: Number(loan.principalMinor),
            monthlyInstallmentMinor: Number(loan.monthlyInstallmentMinor),
            remainingBalanceMinor: Number(loan.remainingBalanceMinor),
          },
        },
        { status: 201 },
      );
    }

    if (action === 'RESPOND_DISCIPLINARY') {
      const caseId = String(body.caseId || '').trim();
      const responseText = String(body.employeeResponse || '').trim();
      if (!caseId || !responseText) {
        return NextResponse.json({ error: 'Case ID and response are required.' }, { status: 400 });
      }
      const dc = await prisma.disciplinaryCase.findUnique({ where: { id: caseId } });
      if (!dc || dc.employeeId !== actor.id) {
        return NextResponse.json({ error: 'Disciplinary case not found.' }, { status: 404 });
      }
      if (dc.employeeResponse) {
        return NextResponse.json({ error: 'Submitted response is immutable; submit an appeal via HR Request if needed.' }, { status: 400 });
      }
      const updated = await prisma.disciplinaryCase.update({
        where: { id: caseId },
        data: { employeeResponse: responseText, step: 'EMPLOYEE_RESPONSE' },
      });
      return NextResponse.json({ success: true, disciplinaryCase: updated });
    }

    if (action === 'SUBMIT_GRIEVANCE') {
      const category = String(body.category || 'OTHER').toUpperCase();
      const summary = String(body.summary || '').trim();
      const isConfidential = body.isConfidential !== false;
      if (!summary || !organizationId) {
        return NextResponse.json({ error: 'Complaint summary is required.' }, { status: 400 });
      }
      const ticketCode = `GRV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const grievance = await prisma.employeeGrievanceCase.create({
        data: {
          ticketCode,
          organizationId,
          reporterId: actor.id,
          category,
          summary,
          isConfidential,
          status: 'OPEN',
        },
      });
      return NextResponse.json({ success: true, grievance }, { status: 201 });
    }

    if (action === 'SUBMIT_SELF_APPRAISAL') {
      const evaluationId = String(body.evaluationId || '').trim();
      const comment = String(body.employeeComment || '').trim();
      if (!evaluationId || !comment) {
        return NextResponse.json({ error: 'Evaluation ID and self-appraisal comment are required.' }, { status: 400 });
      }
      const evalRecord = await prisma.performanceEvaluation.findUnique({ where: { id: evaluationId } });
      if (!evalRecord || evalRecord.employeeId !== actor.id) {
        return NextResponse.json({ error: 'Evaluation not found.' }, { status: 404 });
      }
      const updated = await prisma.performanceEvaluation.update({
        where: { id: evaluationId },
        data: { employeeComment: comment, status: 'ACKNOWLEDGED' },
      });
      return NextResponse.json({ success: true, evaluation: updated });
    }

    if (action === 'COMPLETE_TRAINING') {
      const assignmentId = String(body.assignmentId || '').trim();
      const existing = await prisma.employeeTrainingAssignment.findUnique({ where: { id: assignmentId } });
      if (!existing || existing.employeeId !== actor.id) {
        return NextResponse.json({ error: 'Training assignment not found.' }, { status: 404 });
      }
      const updated = await prisma.employeeTrainingAssignment.update({
        where: { id: assignmentId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return NextResponse.json({ success: true, assignment: updated });
    }

    if (action === 'SIGN_DOCUMENT') {
      const documentId = String(body.documentId || '').trim();
      if (!documentId) {
        return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
      }
      const doc = await prisma.employeeDocument.findUnique({ where: { id: documentId } });
      if (!doc || doc.employeeId !== actor.id) {
        return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
      }
      const updated = await prisma.employeeDocument.update({
        where: { id: documentId },
        data: { signedAt: new Date() },
      });
      return NextResponse.json({ success: true, document: updated });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error('[STAFF_HR_POST]', error);
    return NextResponse.json({ error: 'Could not process HR request.' }, { status: 500 });
  }
}
