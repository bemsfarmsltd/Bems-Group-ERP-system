import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { inferAuditModule } from '@/lib/audit-forensics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Executive or admin authorization required.' }, { status: 403 });
    }

    const { employeeId } = await context.params;
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        assignments: {
          where: { status: 'ACTIVE' },
          include: {
            subsidiary: { select: { id: true, legalName: true, code: true } },
            department: { select: { id: true, name: true } },
          },
          take: 1,
        },
        customAdminProfile: { select: { id: true, name: true } },
      },
    });

    if (!emp) {
      return NextResponse.json({ error: 'Employee or admin record not found.' }, { status: 404 });
    }

    const [
      sessions,
      auditEvents,
      requests,
      creditLots,
      withdrawals,
      bankAccount,
      openAccountabilityCount,
    ] = await Promise.all([
      prisma.authSession.findMany({
        where: { employeeId: emp.id },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { id: true, createdAt: true, expiresAt: true },
      }),
      prisma.auditEvent.findMany({
        where: { OR: [{ actorId: emp.id }, { targetId: emp.id }] },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.expenditureRequest.findMany({
        where: { requestedById: emp.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          requestNumber: true,
          title: true,
          category: true,
          amountMinor: true,
          approvalStatus: true,
          paymentStatus: true,
          createdAt: true,
          subsidiary: { select: { legalName: true } },
        },
      }),
      prisma.walletCreditLot.findMany({
        where: { employeeId: emp.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { id: true, sourceType: true, category: true, amountMinor: true, availableMinor: true, createdAt: true },
      }),
      prisma.walletWithdrawal.findMany({
        where: { employeeId: emp.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { id: true, reference: true, amountMinor: true, feeMinor: true, status: true, bankCode: true, accountNumber: true, createdAt: true },
      }),
      prisma.walletBankAccount.findFirst({
        where: { employeeId: emp.id, active: true },
        select: { bankCode: true, accountNumber: true, accountName: true, verifiedAt: true },
      }),
      prisma.accountabilityCase.count({
        where: { owner: { id: emp.id }, status: { in: ['OPEN', 'EVIDENCE_SUBMITTED'] } },
      }),
    ]);

    const totalApprovedMinor = requests
      .filter((r) => r.approvalStatus === 'APPROVED')
      .reduce((sum, r) => sum + r.amountMinor, BigInt(0));

    const walletBalanceMinor = creditLots.reduce((sum, c) => sum + c.availableMinor, BigInt(0));
    const lastLoginAt = sessions[0]?.createdAt ?? null;
    const lastActiveAt = auditEvents[0]?.createdAt ?? lastLoginAt;
    const activeSessionCount = sessions.filter((s) => s.expiresAt > new Date()).length;

    const activity = [
      ...auditEvents.map((a) => ({
        id: a.id,
        action: a.action,
        module: a.module || inferAuditModule(a.targetType, a.action),
        targetType: a.targetType,
        targetId: a.targetId,
        ipAddress: a.ipAddress,
        deviceLabel: a.deviceLabel,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
      ...sessions.map((s) => ({
        id: `sess_${s.id}`,
        action: 'LOGIN_SESSION',
        module: 'AUTH',
        targetType: 'AUTH_SESSION',
        targetId: s.id,
        ipAddress: null,
        deviceLabel: 'Web / App Session',
        metadata: null,
        createdAt: s.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);

    const walletTransactions = [
      ...creditLots.map((c) => ({
        id: c.id,
        direction: 'CREDIT',
        type: c.sourceType,
        category: c.category,
        amountMinor: c.amountMinor.toString(),
        status: 'CREDITED',
        reference: c.id.slice(0, 10),
        createdAt: c.createdAt.toISOString(),
      })),
      ...withdrawals.map((w) => ({
        id: w.id,
        direction: 'DEBIT',
        type: 'WITHDRAWAL',
        category: w.bankCode,
        amountMinor: w.amountMinor.toString(),
        status: w.status,
        reference: w.reference,
        createdAt: w.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      profile: {
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        legalName: emp.legalName,
        workEmail: emp.workEmail,
        phone: emp.phone,
        role: emp.role,
        jobTitle: emp.jobTitle,
        status: emp.status,
        approvalStatus: emp.approvalStatus,
        emailVerified: Boolean((emp as any).emailVerified ?? true),
        createdAt: emp.createdAt.toISOString(),
        lastLoginAt: lastLoginAt ? lastLoginAt.toISOString() : null,
        lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
        activeSessionCount,
        subsidiaryName: emp.assignments[0]?.subsidiary?.legalName || 'BEMS Group',
        departmentName: emp.assignments[0]?.department?.name || 'General',
        customAdminProfileName: emp.customAdminProfile?.name || null,
        verifiedBank: bankAccount
          ? {
              bankName: bankAccount.bankCode,
              accountNumberMasked: `••••${bankAccount.accountNumber.slice(-4)}`,
              accountName: bankAccount.accountName,
            }
          : null,
      },
      summary: {
        totalRequestsCount: requests.length,
        totalApprovedMinor: totalApprovedMinor.toString(),
        walletBalanceMinor: walletBalanceMinor.toString(),
        openAccountabilityCount,
      },
      activity,
      requests: requests.map((r) => ({
        ...r,
        amountMinor: r.amountMinor.toString(),
        subsidiaryName: r.subsidiary?.legalName || 'BEMS',
        createdAt: r.createdAt.toISOString(),
      })),
      walletTransactions,
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/employees/[employeeId]/dossier:', error);
    return NextResponse.json({ error: error.message || 'Failed to load user dossier.' }, { status: 500 });
  }
}
