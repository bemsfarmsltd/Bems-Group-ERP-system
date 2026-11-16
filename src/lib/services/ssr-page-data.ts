import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { loadAuthorizedExecutiveBriefing } from '@/lib/services/briefing-read';
import { requestIdentifierWhere, toSystemRequestId } from '@/lib/request-id';
import { resolveOrganizationBranding } from '@/lib/subsidiary-branding';

function safeJson<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

export async function loadSsrPageData(
  req: Request,
  page: string,
  requestNumber?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (page === 'download') {
    const [staffGate, gmdGate] = await Promise.all([
      prisma.mobileAppGate.findUnique({ where: { appId: 'STAFF_APP' } }),
      prisma.mobileAppGate.findUnique({ where: { appId: 'GMD_APP' } }),
    ]);
    return {
      status: 200,
      body: {
        staffVersion: staffGate?.latestVersionAvailable || '1.3.5',
        gmdVersion: gmdGate?.latestVersionAvailable || '1.3.5',
      },
    };
  }

  const actor = await getAuthenticatedEmployee(req);
  if (!actor) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  if (page === 'session') {
    return { status: 200, body: { actor } };
  }

  if (page === 'vendors') {
    const isExecutive = hasAnyRole(actor, ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD']);
    const vendors = await prisma.vendor.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        category: true,
        rating: true,
        createdAt: true,
        ...(isExecutive
          ? {
              taxId: true,
              contactEmail: true,
              contactPhone: true,
              bankName: true,
              accountNumber: true,
              accountName: true,
              notes: true,
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });

    const projectedVendors = vendors.map((v: any) => ({
      id: v.id,
      name: v.name,
      code: v.code,
      category: v.category,
      rating: v.rating,
      taxId: isExecutive ? v.taxId || null : null,
      contactEmail: isExecutive ? v.contactEmail || null : null,
      contactPhone: isExecutive ? v.contactPhone || null : null,
      bankName: isExecutive ? v.bankName || null : null,
      accountNumber: isExecutive ? v.accountNumber || null : null,
      accountName: isExecutive ? v.accountName || null : null,
      notes: isExecutive ? v.notes || null : null,
      createdAt: v.createdAt.toISOString(),
    }));

    return { status: 200, body: { actor, vendors: projectedVendors, isExecutive } };
  }

  if (page === 'accountability') {
    const isStaff = actor.role === 'STAFF';
    const accountabilityCases = await prisma.accountabilityCase.findMany({
      where: isStaff ? { OR: [{ ownerUserId: actor.id }, { request: { requestedById: actor.id } }] } : undefined,
      include: {
        request: {
          include: {
            subsidiary: true,
            requester: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      status: 200,
      body: {
        actor,
        cases: JSON.parse(JSON.stringify(accountabilityCases, (_, v) => (typeof v === 'bigint' ? Number(v) : v))),
      },
    };
  }

  if (page === 'briefing') {
    if (!hasAnyRole(actor, ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD'])) {
      return { status: 403, body: { error: 'Forbidden' } };
    }
    const briefing = await loadAuthorizedExecutiveBriefing(actor);
    if (!briefing.authorized) {
      return { status: 403, body: { error: 'Forbidden' } };
    }
    return { status: 200, body: safeJson({ actor, briefing: briefing.data }) };
  }

  if (page === 'requests') {
    const isStaff = actor.role === 'STAFF';
    const [requests, subsidiaries, vendors, currentStaff] = await Promise.all([
      prisma.expenditureRequest.findMany({
        where: isStaff ? { requestedById: actor.id } : undefined,
        include: { subsidiary: true, requester: true, channel: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organization.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, code: true, type: true },
      }),
      prisma.vendor.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, category: true, bankName: true, accountNumber: true, accountName: true },
      }),
      prisma.employee.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          legalName: true,
          workEmail: true,
          employeeNumber: true,
          bankName: true,
          accountNumber: true,
          accountName: true,
          assignments: {
            where: { status: 'ACTIVE' },
            select: {
              subsidiaryId: true,
              departmentId: true,
              positionName: true,
              isPrimary: true,
              subsidiary: { select: { id: true, legalName: true, code: true } },
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const rows = requests.map((request) => ({
      id: request.id,
      systemId: toSystemRequestId(request.id),
      requestNumber: request.requestNumber,
      title: request.title,
      requestType: request.requestType,
      category: request.category,
      subsidiaryName: request.subsidiary.legalName,
      requesterName: request.requester.legalName,
      requesterEmail: request.requester.workEmail,
      amountMinor: String(request.amountMinor),
      currency: request.currency,
      approvalStatus: request.approvalStatus,
      paymentStatus: request.paymentStatus,
      accountabilityStatus: request.accountabilityStatus,
      createdAt: request.createdAt.toISOString(),
    }));

    return { status: 200, body: { actor, requests: rows, subsidiaries, vendors, currentStaff } };
  }

  if (page === 'requests-new') {
    const [subsidiaries, vendors, employees, currentStaff] = await Promise.all([
      prisma.organization.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, code: true, type: true },
      }),
      prisma.vendor.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, category: true, bankName: true, accountNumber: true, accountName: true },
      }),
      prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, workEmail: true, employeeNumber: true },
      }),
      prisma.employee.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          legalName: true,
          workEmail: true,
          employeeNumber: true,
          bankName: true,
          accountNumber: true,
          accountName: true,
          assignments: {
            where: { status: 'ACTIVE' },
            select: {
              subsidiaryId: true,
              departmentId: true,
              positionName: true,
              isPrimary: true,
              subsidiary: { select: { id: true, legalName: true, code: true } },
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);
    return { status: 200, body: { actor, subsidiaries, vendors, employees, currentStaff } };
  }

  if (page === 'request-detail') {
    const reqNum = String(requestNumber || '').trim();
    if (!reqNum) return { status: 400, body: { error: 'Missing requestNumber' } };
    const request = await prisma.expenditureRequest.findUnique({
      where: requestIdentifierWhere(reqNum),
      include: {
        subsidiary: true,
        requester: true,
        vendor: true,
        attachments: true,
        disbursements: {
          orderBy: { createdAt: 'desc' },
          include: {
            receipt: { select: { id: true, fileName: true, fileUrl: true, sha256: true, mimeType: true, uploadedAt: true } },
            recordedBy: { select: { id: true, legalName: true } },
            recipientConfirmation: { include: { employee: { select: { id: true, legalName: true } } } },
          },
        },
        approvalSteps: { orderBy: { stageIndex: 'asc' }, include: { approver: true } },
        channel: {
          include: {
            messages: { where: { visibility: 'GROUP' }, orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!request) return { status: 404, body: { error: 'Not found' } };
    const isParticipant =
      request.requestedById === actor.id || request.approvalSteps.some((step) => step.approverId === actor.id);
    if (!isParticipant && actor.role !== 'GMD' && actor.role !== 'SYSTEM_ADMIN') {
      return { status: 403, body: { error: 'Forbidden' } };
    }
    const serializableRequest = safeJson(request) as Record<string, unknown>;
    serializableRequest.systemId = toSystemRequestId(request.id);
    return { status: 200, body: { actor, request: serializableRequest } };
  }

  if (page === 'staff') {
    if (actor.role !== 'STAFF' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'GMD') {
      return { status: 403, body: { error: 'Forbidden' } };
    }
    let businessName = 'Staff Workspace';
    const [assignment, subsidiaries, vendors, currentStaff] = await Promise.all([
      prisma.employeeAssignment.findFirst({
        where: { employeeId: actor.id },
        orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
        include: {
          subsidiary: {
            include: { settings: { where: { key: { in: ['BRAND_COLOR', 'BRAND_LOGO_URL'] } } } },
          },
          department: true,
        },
      }),
      prisma.organization.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, code: true, type: true },
      }),
      prisma.vendor.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, category: true, bankName: true, accountNumber: true, accountName: true },
      }),
      prisma.employee.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          legalName: true,
          workEmail: true,
          employeeNumber: true,
          phone: true,
          avatarUrl: true,
          gender: true,
          dateOfBirth: true,
          residentialAddress: true,
          cityState: true,
          jobTitle: true,
          employmentType: true,
          resumptionDate: true,
          bankName: true,
          accountNumber: true,
          accountName: true,
          salaryBankName: true,
          salaryAccountNumber: true,
          salaryAccountName: true,
          workLocation: true,
          staffGrade: true,
          maritalStatus: true,
          stateOfOrigin: true,
          lga: true,
          nextOfKinName: true,
          nextOfKinPhone: true,
          nextOfKinRelationship: true,
          nextOfKinAddress: true,
          assignments: {
            where: { status: 'ACTIVE' },
            select: {
              subsidiaryId: true,
              departmentId: true,
              positionName: true,
              isPrimary: true,
              subsidiary: { select: { id: true, legalName: true, code: true } },
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    if (assignment?.subsidiary) businessName = assignment.subsidiary.legalName;
    const primaryAssignment: any =
      currentStaff?.assignments?.find((a: any) => a.isPrimary) || currentStaff?.assignments?.[0] || assignment;
    const staffSubsidiary = primaryAssignment?.subsidiary?.legalName || businessName;
    const staffDepartment = primaryAssignment?.department?.name || 'General Operations';
    const staffPosition = primaryAssignment?.positionName || currentStaff?.jobTitle || 'Staff Personnel';
    const branding = resolveOrganizationBranding(assignment?.subsidiary);
    businessName = branding.subsidiaryName;

    const staffUser = {
      id: actor.id,
      ...branding,
      fullName: actor.legalName,
      email: actor.workEmail,
      role: actor.role,
      employeeNumber: actor.employeeNumber,
      phone: actor.phone || currentStaff?.phone || '',
      avatarUrl: actor.avatarUrl || currentStaff?.avatarUrl || '',
      bankName: currentStaff?.bankName || '',
      accountNumber: currentStaff?.accountNumber || '',
      accountName: currentStaff?.accountName || actor.legalName,
      salaryBankName: currentStaff?.salaryBankName || currentStaff?.bankName || '',
      salaryAccountNumber: currentStaff?.salaryAccountNumber || currentStaff?.accountNumber || '',
      salaryAccountName: currentStaff?.salaryAccountName || actor.legalName,
      jobTitle: staffPosition,
      department: staffDepartment,
      subsidiary: staffSubsidiary,
      workLocation: currentStaff?.workLocation || 'Oyo Logistics & Farm Hub',
      staffGrade: currentStaff?.staffGrade || 'Level 06 - Operational Specialist',
      employmentType: currentStaff?.employmentType || 'FULL_TIME',
      resumptionDate: currentStaff?.resumptionDate
        ? new Date(currentStaff.resumptionDate).toISOString().split('T')[0]
        : '2026-10-28',
      gender: currentStaff?.gender || 'FEMALE',
      dateOfBirth: currentStaff?.dateOfBirth || '2002-05-12',
      residentialAddress: currentStaff?.residentialAddress || 'Oyo Central Base',
      cityState: currentStaff?.cityState || 'Oyo State',
      maritalStatus: currentStaff?.maritalStatus || 'SINGLE',
      stateOfOrigin: currentStaff?.stateOfOrigin || 'Oyo State',
      lga: currentStaff?.lga || 'Ibadan North',
      nextOfKinName: currentStaff?.nextOfKinName || '',
      nextOfKinPhone: currentStaff?.nextOfKinPhone || '',
      nextOfKinRelationship: currentStaff?.nextOfKinRelationship || '',
      nextOfKinAddress: currentStaff?.nextOfKinAddress || '',
    };

    return { status: 200, body: { actor, staffUser, businessName, subsidiaries, vendors, currentStaff } };
  }

  return { status: 400, body: { error: `Unknown SSR page: ${page}` } };
}
