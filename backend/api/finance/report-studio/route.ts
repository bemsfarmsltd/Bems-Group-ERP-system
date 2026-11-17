import { walletHttp } from '@/lib/wallet/http';
import { walletJson } from '@/lib/wallet/core';
import { getAllowedSubsidiariesForModule, hasCategoryAccess } from '@/lib/admin-permissions';
import { resolveAuthorizedOrganizationScope } from '@/lib/organizations';
import { prisma } from '@/lib/prisma';
import { invalid } from '@/lib/finance/ledger';

export const dynamic = 'force-dynamic';

type ReportView = 'ENTITIES' | 'STAFF' | 'ACCOUNTS' | 'PAYMENT_TYPES' | 'CATEGORIES' | 'RECURRING';

function resolvePeriodRange(periodParam: string | null, fromParam: string | null, toParam: string | null) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  const key = (periodParam || 'THIS_MONTH').toUpperCase();
  let start: Date;
  let end: Date;
  let label: string;

  if (key === 'LAST_MONTH') {
    start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    label = start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  } else if (key === 'YTD') {
    start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, m, now.getUTCDate(), 23, 59, 59, 999));
    label = `YTD ${y}`;
  } else if (key === 'ALL_TIME') {
    start = new Date(Date.UTC(2020, 0, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(y + 1, 11, 31, 23, 59, 59, 999));
    label = 'All-Time';
  } else if (key === 'CUSTOM' && fromParam && toParam) {
    const parsedFrom = new Date(`${fromParam}T00:00:00.000Z`);
    const parsedTo = new Date(`${toParam}T23:59:59.999Z`);
    if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime()) || parsedFrom > parsedTo) {
      invalid('Provide a valid custom date range.');
    }
    start = parsedFrom;
    end = parsedTo;
    label = `${fromParam} – ${toParam}`;
  } else {
    start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, m, now.getUTCDate(), 23, 59, 59, 999));
    label = 'This Month';
  }

  return {
    key,
    label,
    start,
    end,
    fromIso: start.toISOString().slice(0, 10),
    toIso: end.toISOString().slice(0, 10),
  };
}

type BucketAccumulator = {
  id: string;
  name: string;
  code: string;
  subtitle?: string;
  settledTxCount: number;
  totalTxCount: number;
  approvedGrossMinor: bigint;
  chargesMinor: bigint;
  settledMinor: bigint;
  pendingMinor: bigint;
  totalRequestedMinor: bigint;
};

function finalizeBuckets(buckets: BucketAccumulator[]) {
  let totPaidTx = 0;
  let totTx = 0;
  let totApprovedGross = BigInt(0);
  let totCharges = BigInt(0);
  let totNetDisbursable = BigInt(0);
  let totSettled = BigInt(0);
  let totPending = BigInt(0);
  let totRequested = BigInt(0);

  const rows = buckets
    .sort((a, b) => Number(b.approvedGrossMinor - a.approvedGrossMinor) || Number(b.totalRequestedMinor - a.totalRequestedMinor) || a.name.localeCompare(b.name))
    .map((b) => {
      const netDisbursableMinor = b.approvedGrossMinor > b.chargesMinor ? b.approvedGrossMinor - b.chargesMinor : BigInt(0);
      const settlementPct = b.approvedGrossMinor > BigInt(0)
        ? Math.min(100, Math.round((Number(b.settledMinor) / Number(b.approvedGrossMinor)) * 100))
        : 0;

      totPaidTx += b.settledTxCount;
      totTx += b.totalTxCount;
      totApprovedGross += b.approvedGrossMinor;
      totCharges += b.chargesMinor;
      totNetDisbursable += netDisbursableMinor;
      totSettled += b.settledMinor;
      totPending += b.pendingMinor;
      totRequested += b.totalRequestedMinor;

      return {
        organizationId: b.id,
        name: b.name,
        code: b.code,
        subtitle: b.subtitle || '',
        settledTxCount: b.settledTxCount,
        totalTxCount: b.totalTxCount,
        approvedGrossMinor: b.approvedGrossMinor.toString(),
        chargesMinor: b.chargesMinor.toString(),
        netDisbursableMinor: netDisbursableMinor.toString(),
        settledMinor: b.settledMinor.toString(),
        pendingMinor: b.pendingMinor.toString(),
        totalRequestedMinor: b.totalRequestedMinor.toString(),
        settlementPct,
      };
    });

  const overallSettlementPct = totApprovedGross > BigInt(0)
    ? Math.min(100, Math.round((Number(totSettled) / Number(totApprovedGross)) * 100))
    : 0;

  return {
    rows,
    totals: {
      settledTxCount: totPaidTx,
      totalTxCount: totTx,
      approvedGrossMinor: totApprovedGross.toString(),
      chargesMinor: totCharges.toString(),
      netDisbursableMinor: totNetDisbursable.toString(),
      settledMinor: totSettled.toString(),
      pendingMinor: totPending.toString(),
      totalRequestedMinor: totRequested.toString(),
      settlementPct: overallSettlementPct,
    },
  };
}

export async function GET(request: Request) {
  return walletHttp(request, async (actor) => {
    if (!hasCategoryAccess(actor.role, actor.customAdminPermissions, 'finance', 'Overview') && !['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(actor.role)) {
      invalid('Finance access is required to view Report Studio.', 403);
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');
    const rawView = (url.searchParams.get('view') || 'ENTITIES').toUpperCase();
    const view: ReportView = (['ENTITIES', 'STAFF', 'ACCOUNTS', 'PAYMENT_TYPES', 'CATEGORIES', 'RECURRING'].includes(rawView)
      ? rawView
      : 'ENTITIES') as ReportView;

    const period = resolvePeriodRange(
      url.searchParams.get('period'),
      url.searchParams.get('from'),
      url.searchParams.get('to'),
    );

    const requested = await resolveAuthorizedOrganizationScope(actor, scope);
    const granted = getAllowedSubsidiariesForModule(actor.role, actor.customAdminPermissions, 'finance');
    const allowedIds = requested.organizationIds.filter((id) => granted === 'ALL' || granted.includes(id));

    const organizations = await prisma.organization.findMany({
      where: { status: 'ACTIVE', id: { in: allowedIds } },
      select: { id: true, legalName: true, code: true, type: true },
      orderBy: { legalName: 'asc' },
    });

    if (!organizations.length) {
      invalid('No authorized organization scope is available.', 403);
    }

    const orgIds = organizations.map((o) => o.id);
    const orgMap = new Map(organizations.map((o) => [o.id, o]));

    const [requests, disbursements, walletWithdrawals, companyAccounts] = await Promise.all([
      prisma.expenditureRequest.findMany({
        where: {
          subsidiaryId: { in: orgIds },
          createdAt: { gte: period.start, lte: period.end },
          approvalStatus: { not: 'DRAFT' },
        },
        select: {
          id: true,
          subsidiaryId: true,
          requestedById: true,
          requestType: true,
          category: true,
          isRecurring: true,
          recurringInterval: true,
          amountMinor: true,
          approvalStatus: true,
          paymentStatus: true,
          accountabilityStatus: true,
          requester: {
            select: {
              id: true,
              legalName: true,
              employeeNumber: true,
              role: true,
            },
          },
        },
      }),
      prisma.disbursement.findMany({
        where: {
          payerOrgId: { in: orgIds },
          paidAt: { gte: period.start, lte: period.end },
        },
        select: {
          id: true,
          payerOrgId: true,
          requestId: true,
          beneficiaryEmployeeId: true,
          bankName: true,
          amountMinor: true,
          status: true,
        },
      }),
      prisma.walletWithdrawal.findMany({
        where: {
          createdAt: { gte: period.start, lte: period.end },
          status: { in: ['SUCCESS', 'SETTLED', 'COMPLETED', 'SUBMITTED', 'PROCESSING'] },
        },
        select: {
          id: true,
          employeeId: true,
          requestId: true,
          sourceAccount: true,
          bankCode: true,
          feeMinor: true,
          amountMinor: true,
          status: true,
        },
      }),
      prisma.companyBankAccount.findMany({
        where: { organizationId: { in: orgIds } },
        select: { id: true, bankName: true, accountNumber: true, organizationId: true },
      }),
    ]);

    let accountabilityClosedCount = 0;
    let accountabilityTotalCount = 0;
    const reqMap = new Map<string, (typeof requests)[number]>();
    for (const r of requests) {
      reqMap.set(r.id, r);
      if (r.approvalStatus === 'APPROVED') {
        accountabilityTotalCount += 1;
        if (r.accountabilityStatus === 'VERIFIED' || r.accountabilityStatus === 'CLOSED') {
          accountabilityClosedCount += 1;
        }
      }
    }

    const feesByRequest = new Map<string, bigint>();
    for (const w of walletWithdrawals) {
      if (!w.requestId) continue;
      feesByRequest.set(w.requestId, (feesByRequest.get(w.requestId) ?? BigInt(0)) + (w.feeMinor ?? BigInt(0)));
    }

    const buckets = new Map<string, BucketAccumulator>();
    const getOrCreate = (id: string, name: string, code: string, subtitle?: string): BucketAccumulator => {
      const existing = buckets.get(id);
      if (existing) return existing;
      const created: BucketAccumulator = {
        id,
        name,
        code,
        subtitle,
        settledTxCount: 0,
        totalTxCount: 0,
        approvedGrossMinor: BigInt(0),
        chargesMinor: BigInt(0),
        settledMinor: BigInt(0),
        pendingMinor: BigInt(0),
        totalRequestedMinor: BigInt(0),
      };
      buckets.set(id, created);
      return created;
    };

    if (view === 'ENTITIES') {
      for (const org of organizations) {
        getOrCreate(org.id, org.legalName, org.code, org.type);
      }
      for (const r of requests) {
        const b = buckets.get(r.subsidiaryId);
        if (!b) continue;
        b.totalTxCount += 1;
        b.totalRequestedMinor += r.amountMinor;
        if (r.approvalStatus === 'APPROVED') {
          b.approvedGrossMinor += r.amountMinor;
          if (r.paymentStatus === 'UNPAID' || r.paymentStatus === 'AWAITING_RECIPIENT_CONFIRMATION') {
            b.pendingMinor += r.amountMinor;
          }
          if (r.paymentStatus === 'RECIPIENT_CONFIRMED') {
            b.settledTxCount += 1;
            b.settledMinor += r.amountMinor;
          }
        }
        b.chargesMinor += feesByRequest.get(r.id) ?? BigInt(0);
      }
      for (const d of disbursements) {
        if (d.status === 'RECIPIENT_CONFIRMED' && !d.requestId) {
          const b = buckets.get(d.payerOrgId);
          if (b) b.settledMinor += d.amountMinor;
        }
      }
    } else if (view === 'STAFF') {
      const activeStaff = await prisma.employee.findMany({
        where: { status: 'ACTIVE', assignments: { some: { subsidiaryId: { in: orgIds }, status: 'ACTIVE' } } },
        select: {
          id: true,
          legalName: true,
          employeeNumber: true,
          role: true,
          assignments: { where: { status: 'ACTIVE' }, select: { subsidiaryId: true }, take: 1 },
        },
        orderBy: { legalName: 'asc' },
      });
      for (const emp of activeStaff) {
        const empOrgId = emp.assignments[0]?.subsidiaryId;
        const orgCode = (empOrgId && orgMap.get(empOrgId)?.code) || '';
        getOrCreate(emp.id, emp.legalName, emp.employeeNumber || emp.role, orgCode);
      }
      for (const r of requests) {
        const b = getOrCreate(
          r.requestedById,
          r.requester?.legalName || 'Staff Member',
          r.requester?.employeeNumber || r.requester?.role || 'STAFF',
          orgMap.get(r.subsidiaryId)?.code || '',
        );
        b.totalTxCount += 1;
        b.totalRequestedMinor += r.amountMinor;
        if (r.approvalStatus === 'APPROVED') {
          b.approvedGrossMinor += r.amountMinor;
          if (r.paymentStatus === 'UNPAID' || r.paymentStatus === 'AWAITING_RECIPIENT_CONFIRMATION') {
            b.pendingMinor += r.amountMinor;
          }
          if (r.paymentStatus === 'RECIPIENT_CONFIRMED') {
            b.settledTxCount += 1;
            b.settledMinor += r.amountMinor;
          }
        }
        b.chargesMinor += feesByRequest.get(r.id) ?? BigInt(0);
      }
    } else if (view === 'ACCOUNTS') {
      getOrCreate('MONNIFY_MAIN', 'Monnify Treasury Wallet (Group Pool)', 'MONNIFY-POOL', 'WALLET');
      for (const acc of companyAccounts) {
        const orgCode = orgMap.get(acc.organizationId)?.code || '';
        getOrCreate(`BANK:${acc.bankName}`, acc.bankName, acc.accountNumber.slice(-4).padStart(4, '•'), orgCode);
      }
      for (const d of disbursements) {
        const b = getOrCreate(`BANK:${d.bankName || 'Bank Transfer'}`, d.bankName || 'Bank Transfer', 'BANK', orgMap.get(d.payerOrgId)?.code);
        b.totalTxCount += 1;
        b.approvedGrossMinor += d.amountMinor;
        b.totalRequestedMinor += d.amountMinor;
        if (d.status === 'RECIPIENT_CONFIRMED') {
          b.settledTxCount += 1;
          b.settledMinor += d.amountMinor;
        } else {
          b.pendingMinor += d.amountMinor;
        }
      }
      for (const w of walletWithdrawals) {
        const b = buckets.get('MONNIFY_MAIN')!;
        b.totalTxCount += 1;
        b.approvedGrossMinor += w.amountMinor;
        b.totalRequestedMinor += w.amountMinor;
        b.chargesMinor += w.feeMinor ?? BigInt(0);
        if (['SUCCESS', 'SETTLED', 'COMPLETED'].includes(w.status)) {
          b.settledTxCount += 1;
          b.settledMinor += w.amountMinor;
        } else {
          b.pendingMinor += w.amountMinor;
        }
      }
    } else if (view === 'PAYMENT_TYPES') {
      for (const r of requests) {
        const typeKey = r.requestType || 'ORDINARY';
        const b = getOrCreate(typeKey, typeKey.replaceAll('_', ' '), typeKey, 'Request Flow');
        b.totalTxCount += 1;
        b.totalRequestedMinor += r.amountMinor;
        if (r.approvalStatus === 'APPROVED') {
          b.approvedGrossMinor += r.amountMinor;
          if (r.paymentStatus === 'RECIPIENT_CONFIRMED') {
            b.settledTxCount += 1;
            b.settledMinor += r.amountMinor;
          } else {
            b.pendingMinor += r.amountMinor;
          }
        }
        b.chargesMinor += feesByRequest.get(r.id) ?? BigInt(0);
      }
      const payrollDisb = disbursements.filter((d) => !d.requestId);
      if (payrollDisb.length > 0) {
        const b = getOrCreate('PAYROLL', 'Payroll & Salary Disbursements', 'PAYROLL', 'Salary Run');
        for (const d of payrollDisb) {
          b.totalTxCount += 1;
          b.approvedGrossMinor += d.amountMinor;
          b.totalRequestedMinor += d.amountMinor;
          if (d.status === 'RECIPIENT_CONFIRMED') {
            b.settledTxCount += 1;
            b.settledMinor += d.amountMinor;
          } else {
            b.pendingMinor += d.amountMinor;
          }
        }
      }
    } else if (view === 'CATEGORIES') {
      for (const r of requests) {
        const cat = r.category || 'UNCATEGORIZED';
        const b = getOrCreate(cat, cat.replaceAll('_', ' '), cat, 'Expense Category');
        b.totalTxCount += 1;
        b.totalRequestedMinor += r.amountMinor;
        if (r.approvalStatus === 'APPROVED') {
          b.approvedGrossMinor += r.amountMinor;
          if (r.paymentStatus === 'RECIPIENT_CONFIRMED') {
            b.settledTxCount += 1;
            b.settledMinor += r.amountMinor;
          } else {
            b.pendingMinor += r.amountMinor;
          }
        }
        b.chargesMinor += feesByRequest.get(r.id) ?? BigInt(0);
      }
    } else if (view === 'RECURRING') {
      getOrCreate('RECURRING_MONTHLY', 'Recurring Commitments (Monthly / Periodic)', 'RECURRING', 'Scheduled');
      getOrCreate('ONE_OFF', 'One-Off Expenditure Requests', 'ONE-OFF', 'Ad-hoc');
      for (const r of requests) {
        const key = r.isRecurring ? 'RECURRING_MONTHLY' : 'ONE_OFF';
        const b = buckets.get(key)!;
        b.totalTxCount += 1;
        b.totalRequestedMinor += r.amountMinor;
        if (r.approvalStatus === 'APPROVED') {
          b.approvedGrossMinor += r.amountMinor;
          if (r.paymentStatus === 'RECIPIENT_CONFIRMED') {
            b.settledTxCount += 1;
            b.settledMinor += r.amountMinor;
          } else {
            b.pendingMinor += r.amountMinor;
          }
        }
        b.chargesMinor += feesByRequest.get(r.id) ?? BigInt(0);
      }
    }

    const { rows, totals } = finalizeBuckets(Array.from(buckets.values()));
    const accountabilityRatePct = accountabilityTotalCount > 0
      ? Math.round((accountabilityClosedCount / accountabilityTotalCount) * 100)
      : 100;

    const scopeSlug = requested.isGroup ? 'ALL-SCOPES' : organizations[0].code;
    const statementRef = `BEMS-REP-${period.key}-${view}-${scopeSlug}`;

    return walletJson({
      view,
      statementRef,
      period: {
        key: period.key,
        label: period.label,
        from: period.fromIso,
        to: period.toIso,
      },
      kpis: {
        approvedGrossMinor: totals.approvedGrossMinor,
        chargesMinor: totals.chargesMinor,
        netSettledMinor: totals.settledMinor,
        pendingMinor: totals.pendingMinor,
        totalRequestedMinor: totals.totalRequestedMinor,
        settledTxCount: totals.settledTxCount,
        totalTxCount: totals.totalTxCount,
        settlementPct: totals.settlementPct,
        accountabilityClosedCount,
        accountabilityTotalCount,
        accountabilityRatePct,
      },
      rows,
      totals,
    });
  });
}
