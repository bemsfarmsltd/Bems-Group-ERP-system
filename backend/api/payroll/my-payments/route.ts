import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLagosTime } from '@/lib/attendance/token';

export const dynamic = 'force-dynamic';

function formatNaira(minor: bigint | number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(Number(minor) / 100);
}

export async function GET(request: Request) {
  const actor = await getAuthenticatedEmployee(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to review your salary and payslips.' }, { status: 401 });

  // 1. Fetch staff profile, bank details, and active compensation agreement
  const employee = await prisma.employee.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      legalName: true,
      employeeNumber: true,
      workEmail: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      salaryBankName: true,
      salaryAccountNumber: true,
      salaryAccountName: true,
      assignments: {
        where: { isPrimary: true },
        take: 1,
        include: { subsidiary: { select: { id: true, legalName: true } } }
      },
      employmentAgreements: {
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        take: 1,
        include: {
          compensations: {
            where: { effectiveTo: null },
            orderBy: [{ version: 'desc' }, { effectiveFrom: 'desc' }],
            take: 1
          }
        }
      }
    }
  });

  if (!employee) return NextResponse.json({ error: 'Staff account not found.' }, { status: 404 });

  const activeAgreement = employee.employmentAgreements[0];
  const activeComp = activeAgreement?.compensations[0];
  const grossMinor = activeComp ? Number(activeComp.grossMinor) : 0;

  // Company Policy: Zero Tax / PAYE / Pension Deductions.
  // Automated attendance deductions: 2% of monthly salary per late morning, 5% per unexcused absence (capped at 100%).
  const { workDate } = getLagosTime();
  const currentMonthPrefix = workDate.slice(0, 7);
  const currentMonthRecords = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: actor.id,
      workDate: { startsWith: currentMonthPrefix },
    },
    select: {
      deductionPercent: true,
      excuseStatus: true,
    },
  });
  const totalAttendancePenaltyPercent = currentMonthRecords.reduce((sum, rec) => {
    if (rec.excuseStatus === 'APPROVED') return sum;
    return sum + (rec.deductionPercent > 0 ? rec.deductionPercent : 0);
  }, 0);
  const cappedPenaltyPercent = Math.min(100, Math.max(0, totalAttendancePenaltyPercent));
  const latenessDeductionsMinor = Math.round((grossMinor * cappedPenaltyPercent) / 100);
  const estimatedNetMinor = Math.max(0, grossMinor - latenessDeductionsMinor);

  const compensationSummary = {
    grossMinor,
    grossFormatted: formatNaira(grossMinor),
    employeePensionMinor: 0,
    employeePensionFormatted: '₦0 (No Tax)',
    payeTaxMinor: 0,
    payeTaxFormatted: '₦0 (No Tax)',
    latenessDeductionsMinor,
    latenessDeductionsFormatted: formatNaira(latenessDeductionsMinor),
    estimatedNetMinor,
    estimatedNetFormatted: formatNaira(estimatedNetMinor),
    currency: activeComp?.currency || 'NGN',
    recurrence: activeComp?.recurrence || 'MONTHLY',
    primarySubsidiary: employee.assignments[0]?.subsidiary?.legalName || 'BEMS Conglomerate',
    salaryBankName: employee.salaryBankName || employee.bankName || 'Not Set',
    salaryAccountNumber: employee.salaryAccountNumber || employee.accountNumber || 'Not Set',
    salaryAccountName: employee.salaryAccountName || employee.accountName || employee.legalName,
  };

  // 2. Query all payroll items / payslips for this staff member
  const payrollItems = await prisma.payrollItem.findMany({
    where: { employeeId: actor.id },
    include: {
      batch: { include: { period: true } },
      disbursement: {
        include: {
          receipt: { select: { fileName: true, fileUrl: true } },
          recipientConfirmation: true
        }
      }
    },
    orderBy: { id: 'desc' }
  });

  const payslips = payrollItems.map(item => {
    const period = item.batch.period;
    const disbursement = item.disbursement;
    const periodName = `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(period.year, period.month - 1, 1))} ${period.year}`;

    return {
      id: item.id,
      payrollItemId: item.id,
      periodName,
      year: period.year,
      month: period.month,
      batchVersion: item.batch.version,
      batchStatus: item.batch.status,
      grossMinor: Number(item.grossMinor),
      grossFormatted: formatNaira(item.grossMinor),
      deductionsMinor: Number(item.employeeDeductionsMinor),
      deductionsFormatted: formatNaira(item.employeeDeductionsMinor),
      netMinor: Number(item.netMinor),
      netFormatted: formatNaira(item.netMinor),
      disbursementId: disbursement?.id || null,
      paymentStatus: disbursement?.status || (item.status==='WALLET_CREDITED'?'WALLET_CREDITED':item.batch.status === 'APPROVED' ? 'APPROVED_FOR_PAYMENT' : 'PREPARED'),
      paidAt: disbursement?.paidAt || null,
      bankName: disbursement?.bankName || employee.salaryBankName || employee.bankName || 'Not set',
      reference: disbursement?.externalReference || null,
      receipt: disbursement?.receipt ? { fileName: disbursement.receipt.fileName, url: disbursement.receipt.fileUrl } : null,
      confirmation: disbursement?.recipientConfirmation ? {
        decision: disbursement.recipientConfirmation.decision,
        note: disbursement.recipientConfirmation.note,
        confirmedAt: disbursement.recipientConfirmation.confirmedAt
      } : null,
    };
  });

  // Backward compatibility with previous schema
  const payments = payslips
    .filter(p => p.disbursementId != null)
    .map(p => ({
      id: p.disbursementId!,
      amountFormatted: p.netFormatted,
      bankName: p.bankName,
      reference: p.reference || '—',
      paidAt: p.paidAt,
      status: p.paymentStatus,
      receipt: p.receipt,
      confirmation: p.confirmation,
      periodName: p.periodName,
    }));

  return NextResponse.json({
    ok: true,
    compensation: compensationSummary,
    payslips,
    payments,
  });
}
