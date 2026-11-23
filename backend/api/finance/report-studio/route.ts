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

type DrillTransactionItem = {
  id: string;
  reference: string;
  requestNumber: string | null;
  title: string;
  subsidiaryName: string;
  subsidiaryCode: string;
  requesterName: string;
  requesterCode: string;
  category: string;
  requestType: string;
  isRecurring: boolean;
  recurringInterval: string | null;
  approvalStatus: string;
  paymentStatus: string;
  accountabilityStatus: string;
  channel: string;
  amountMinor: string;
  feeMinor: string;
  isSettled: boolean;
  date: string;
};

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
  transactions: DrillTransactionItem[];
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
      const activeExposureMinor = b.settledMinor + b.pendingMinor;
      const denomMinor = activeExposureMinor > BigInt(0) ? activeExposureMinor : b.approvedGrossMinor;
      const settlementPct = denomMinor > BigInt(0)
        ? Math.min(100, Math.round((Number(b.settledMinor) / Number(denomMinor)) * 100))
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
        transactions: b.transactions.sort((x, y) => y.date.localeCompare(x.date)),
      };
    });

  const totActiveExposure = totSettled + totPending;
  const totDenom = totActiveExposure > BigInt(0) ? totActiveExposure : totApprovedGross;
  const overallSettlementPct = totDenom > BigInt(0)
    ? Math.min(100, Math.round((Number(totSettled) / Number(totDenom)) * 100))
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

    const requested = await resolveAuthorizedOrganizationScope(actor, scope, 'finance');
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
          requestNumber: true,
          title: true,
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
          createdAt: true,
          requester: {
            select: {
              id: true,
              legalName: true,
              employeeNumber: true,
              role: true,
            },
          },
          vendor: {
            select: {
              id: true,
              name: true,
            },
          },
          disbursements: {
            select: {
              id: true,
              bankName: true,
              externalReference: true,
              paidAt: true,
              status: true,
            },
            orderBy: { paidAt: 'desc' },
            take: 1,
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
          beneficiaryName: true,
          externalReference: true,
          bankName: true,
          amountMinor: true,
          status: true,
          paidAt: true,
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
          accountName: true,
          feeMinor: true,
          amountMinor: true,
          status: true,
          createdAt: true,
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
        transactions: [],
      };
      buckets.set(id, created);
      return created;
    };

    const SETTLED_PAYMENT_STATUSES = new Set([
      'PAID',
      'RECIPIENT_CONFIRMED',
      'SETTLED',
      'COMPLETED',
      'DISBURSED',
      'MONNIFY_SUCCEEDED',
    ]);
    const REJECTED_APPROVAL_STATUSES = new Set(['REJECTED', 'DECLINED', 'CANCELLED']);

    const applyRequestToBucket = (b: BucketAccumulator, r: (typeof requests)[number]) => {
      const isSettled = SETTLED_PAYMENT_STATUSES.has(r.paymentStatus);
      const isRejected = REJECTED_APPROVAL_STATUSES.has(r.approvalStatus);
      const fee = feesByRequest.get(r.id) ?? BigInt(0);
      const org = orgMap.get(r.subsidiaryId);
      const disb = r.disbursements?.[0];
      b.totalTxCount += 1;
      b.totalRequestedMinor += r.amountMinor;
      if (r.approvalStatus === 'APPROVED' || isSettled) {
        b.approvedGrossMinor += r.amountMinor;
      }
      if (isSettled) {
        b.settledTxCount += 1;
        b.settledMinor += r.amountMinor;
      } else if (!isRejected) {
        b.pendingMinor += r.amountMinor;
      }
      b.chargesMinor += fee;

      b.transactions.push({
        id: r.id,
        reference: r.requestNumber,
        requestNumber: r.requestNumber,
        title: r.title,
        subsidiaryName: org?.legalName || 'BEMS Group',
        subsidiaryCode: org?.code || 'BEMS',
        requesterName: r.vendor?.name ? `${r.requester?.legalName || 'Staff'} → ${r.vendor.name}` : (r.requester?.legalName || 'Staff Member'),
        requesterCode: r.requester?.employeeNumber || r.requester?.role || 'STAFF',
        category: r.category || 'GENERAL',
        requestType: r.requestType || 'ORDINARY',
        isRecurring: Boolean(r.isRecurring),
        recurringInterval: r.recurringInterval || null,
        approvalStatus: r.approvalStatus,
        paymentStatus: r.paymentStatus,
        accountabilityStatus: r.accountabilityStatus || 'NOT_REQUIRED',
        channel: disb?.bankName || (isSettled ? 'Monnify / Wallet Release' : 'Pending Settlement'),
        amountMinor: r.amountMinor.toString(),
        feeMinor: fee.toString(),
        isSettled,
        date: (disb?.paidAt || r.createdAt).toISOString(),
      });
    };

    const applyDisbursementToBucket = (b: BucketAccumulator, d: (typeof disbursements)[number]) => {
      const isSettled = SETTLED_PAYMENT_STATUSES.has(d.status);
      const org = orgMap.get(d.payerOrgId);
      const linkedReq = d.requestId ? reqMap.get(d.requestId) : undefined;
      b.totalTxCount += 1;
      b.approvedGrossMinor += d.amountMinor;
      b.totalRequestedMinor += d.amountMinor;
      if (isSettled) {
        b.settledTxCount += 1;
        b.settledMinor += d.amountMinor;
      } else {
        b.pendingMinor += d.amountMinor;
      }
      b.transactions.push({
        id: d.id,
        reference: linkedReq?.requestNumber || d.externalReference || `DISB-${d.id.slice(0, 8)}`,
        requestNumber: linkedReq?.requestNumber || null,
        title: linkedReq?.title || `Disbursement to ${d.beneficiaryName || 'Beneficiary'}`,
        subsidiaryName: org?.legalName || 'BEMS Group',
        subsidiaryCode: org?.code || 'BEMS',
        requesterName: d.beneficiaryName || linkedReq?.requester?.legalName || 'Beneficiary',
        requesterCode: linkedReq?.requester?.employeeNumber || 'DISBURSEMENT',
        category: linkedReq?.category || 'DISBURSEMENT',
        requestType: linkedReq?.requestType || 'DIRECT_DISBURSEMENT',
        isRecurring: Boolean(linkedReq?.isRecurring),
        recurringInterval: linkedReq?.recurringInterval || null,
        approvalStatus: linkedReq?.approvalStatus || 'APPROVED',
        paymentStatus: d.status,
        accountabilityStatus: linkedReq?.accountabilityStatus || 'NOT_REQUIRED',
        channel: d.bankName || 'Bank Transfer',
        amountMinor: d.amountMinor.toString(),
        feeMinor: '0',
        isSettled,
        date: d.paidAt.toISOString(),
      });
    };

    if (view === 'ENTITIES') {
      for (const org of organizations) {
        getOrCreate(org.id, org.legalName, org.code, org.type);
      }
      for (const r of requests) {
        const b = buckets.get(r.subsidiaryId);
        if (!b) continue;
        applyRequestToBucket(b, r);
      }
      for (const d of disbursements) {
        if (SETTLED_PAYMENT_STATUSES.has(d.status) && !d.requestId) {
          const b = buckets.get(d.payerOrgId);
          if (b) applyDisbursementToBucket(b, d);
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
        applyRequestToBucket(b, r);
      }
    } else if (view === 'ACCOUNTS') {
      getOrCreate('MONNIFY_MAIN', 'Monnify Treasury Wallet (Group Pool)', 'MONNIFY-POOL', 'WALLET');
      for (const acc of companyAccounts) {
        const orgCode = orgMap.get(acc.organizationId)?.code || '';
        getOrCreate(`BANK:${acc.bankName}`, acc.bankName, acc.accountNumber.slice(-4).padStart(4, '•'), orgCode);
      }
      for (const d of disbursements) {
        const b = getOrCreate(`BANK:${d.bankName || 'Bank Transfer'}`, d.bankName || 'Bank Transfer', 'BANK', orgMap.get(d.payerOrgId)?.code);
        applyDisbursementToBucket(b, d);
      }
      for (const w of walletWithdrawals) {
        const b = buckets.get('MONNIFY_MAIN')!;
        const isSettled = ['SUCCESS', 'SETTLED', 'COMPLETED'].includes(w.status);
        const linkedReq = w.requestId ? reqMap.get(w.requestId) : undefined;
        const org = linkedReq ? orgMap.get(linkedReq.subsidiaryId) : undefined;
        b.totalTxCount += 1;
        b.approvedGrossMinor += w.amountMinor;
        b.totalRequestedMinor += w.amountMinor;
        b.chargesMinor += w.feeMinor ?? BigInt(0);
        if (isSettled) {
          b.settledTxCount += 1;
          b.settledMinor += w.amountMinor;
        } else {
          b.pendingMinor += w.amountMinor;
        }
        b.transactions.push({
          id: w.id,
          reference: linkedReq?.requestNumber || `WDR-${w.id.slice(0, 8)}`,
          requestNumber: linkedReq?.requestNumber || null,
          title: linkedReq?.title || `Wallet Withdrawal (${w.accountName || 'Staff'})`,
          subsidiaryName: org?.legalName || 'BEMS Group',
          subsidiaryCode: org?.code || 'BEMS',
          requesterName: w.accountName || linkedReq?.requester?.legalName || 'Staff Member',
          requesterCode: linkedReq?.requester?.employeeNumber || 'WALLET',
          category: linkedReq?.category || 'WALLET_WITHDRAWAL',
          requestType: linkedReq?.requestType || 'WALLET',
          isRecurring: Boolean(linkedReq?.isRecurring),
          recurringInterval: linkedReq?.recurringInterval || null,
          approvalStatus: 'APPROVED',
          paymentStatus: w.status,
          accountabilityStatus: linkedReq?.accountabilityStatus || 'NOT_REQUIRED',
          channel: 'Monnify Treasury Wallet',
          amountMinor: w.amountMinor.toString(),
          feeMinor: (w.feeMinor ?? BigInt(0)).toString(),
          isSettled,
          date: w.createdAt.toISOString(),
        });
      }
    } else if (view === 'PAYMENT_TYPES') {
      for (const r of requests) {
        const typeKey = r.requestType || 'ORDINARY';
        const b = getOrCreate(typeKey, typeKey.replaceAll('_', ' '), typeKey, 'Request Flow');
        applyRequestToBucket(b, r);
      }
      const payrollDisb = disbursements.filter((d) => !d.requestId);
      if (payrollDisb.length > 0) {
        const b = getOrCreate('PAYROLL', 'Payroll & Salary Disbursements', 'PAYROLL', 'Salary Run');
        for (const d of payrollDisb) {
          applyDisbursementToBucket(b, d);
        }
      }
    } else if (view === 'CATEGORIES') {
      for (const r of requests) {
        const cat = r.category || 'UNCATEGORIZED';
        const b = getOrCreate(cat, cat.replaceAll('_', ' '), cat, 'Expense Category');
        applyRequestToBucket(b, r);
      }
    } else if (view === 'RECURRING') {
      getOrCreate('RECURRING_MONTHLY', 'Recurring Commitments (Monthly / Periodic)', 'RECURRING', 'Scheduled');
      getOrCreate('ONE_OFF', 'One-Off Expenditure Requests', 'ONE-OFF', 'Ad-hoc');
      for (const r of requests) {
        const key = r.isRecurring ? 'RECURRING_MONTHLY' : 'ONE_OFF';
        const b = buckets.get(key)!;
        applyRequestToBucket(b, r);
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
