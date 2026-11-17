import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getAuthenticatedEmployee, getHrAuthorizationScope, hasAnyRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatNairaAscii(minor: bigint | number): string {
  const naira = Number(minor) / 100;
  return `NGN ${naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Sign in to download payslip.' }, { status: 401 });
    }

    const { itemId } = await params;
    const item = await prisma.payrollItem.findUnique({
      where: { id: itemId },
      include: {
        batch: { include: { period: true } },
        employee: {
          include: {
            assignments: {
              where: { status: 'ACTIVE' },
              orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
              take: 1,
              include: { subsidiary: true, department: true },
            },
          },
        },
        allocations: { include: { subsidiary: true } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Payroll item not found.' }, { status: 404 });
    }

    const isOwner = item.employeeId === actor.id;
    const isExec = hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']);
    const hrScope = !isOwner && !isExec ? await getHrAuthorizationScope(actor) : null;
    if (!isOwner && !isExec && !hrScope?.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const period = item.batch.period;
    const periodLabel = `${new Intl.DateTimeFormat('en', { month: 'long' }).format(
      new Date(period.year, period.month - 1, 1)
    )} ${period.year}`;
    const assignment = item.employee.assignments[0];
    const subsidiaryName = assignment?.subsidiary?.legalName || 'BEMS Group';
    const departmentName = assignment?.department?.name || 'Operations';

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdf.embedFont(StandardFonts.Helvetica);

    const orange = rgb(0.918, 0.345, 0.047);
    const slate900 = rgb(0.059, 0.09, 0.165);
    const slate600 = rgb(0.278, 0.333, 0.412);
    const border = rgb(0.886, 0.91, 0.941);

    let y = 785;
    page.drawText('BEMS GROUP HOLDINGS', { x: 48, y, size: 18, font: fontBold, color: orange });
    y -= 20;
    page.drawText(`OFFICIAL EMPLOYEE PAYSLIP - ${periodLabel.toUpperCase()}`, {
      x: 48,
      y,
      size: 12,
      font: fontBold,
      color: slate900,
    });
    y -= 14;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: border });

    y -= 26;
    const drawRow = (label: string, value: string, boldVal = false) => {
      page.drawText(label, { x: 48, y, size: 10, font: fontReg, color: slate600 });
      page.drawText(value, { x: 240, y, size: 10, font: boldVal ? fontBold : fontReg, color: slate900 });
      y -= 18;
    };

    drawRow('Employee Name', item.employee.legalName, true);
    drawRow('Staff Number', item.employee.employeeNumber || 'N/A');
    drawRow('Work Email', item.employee.workEmail);
    drawRow('Subsidiary', subsidiaryName);
    drawRow('Department', departmentName);
    drawRow('Pay Period', periodLabel);
    drawRow('Batch / Item Status', `${item.batch.status} / ${item.status}`);

    y -= 8;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: border });
    y -= 24;

    page.drawText('EARNINGS & DEDUCTIONS', { x: 48, y, size: 11, font: fontBold, color: slate900 });
    y -= 20;
    drawRow('Gross Monthly Salary', formatNairaAscii(item.grossMinor));
    drawRow('Attendance / Lateness Deductions', `- ${formatNairaAscii(item.employeeDeductionsMinor)}`);
    drawRow('Tax / Statutory Deductions', 'NGN 0.00 (Zero Tax Policy)');
    y -= 4;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: border });
    y -= 20;
    drawRow('NET PAYOUT', formatNairaAscii(item.netMinor), true);

    if (item.allocations.length > 0) {
      y -= 12;
      page.drawText('SUBSIDIARY COST ALLOCATION', { x: 48, y, size: 11, font: fontBold, color: slate900 });
      y -= 18;
      for (const alloc of item.allocations) {
        drawRow(
          `${alloc.subsidiary.legalName} (${alloc.percentage}%)`,
          formatNairaAscii(alloc.allocableCostMinor)
        );
      }
    }

    y -= 20;
    page.drawText(
      `Generated on ${new Date().toISOString().split('T')[0]} by BEMS ERP Enterprise Payroll Engine`,
      { x: 48, y, size: 8, font: fontReg, color: slate600 }
    );

    const bytes = await pdf.save();
    const safeName = `${(item.employee.employeeNumber || item.employee.legalName).replace(/[^a-zA-Z0-9_-]/g, '_')}_${period.year}-${String(period.month).padStart(2, '0')}_payslip.pdf`;

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[Payslip GET] Error:', err);
    return NextResponse.json({ error: 'Could not generate payslip PDF.' }, { status: 500 });
  }
}
