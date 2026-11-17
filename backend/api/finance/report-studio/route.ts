import { walletHttp } from '@/lib/wallet/http';
import { walletJson } from '@/lib/wallet/core';
import { getAllowedSubsidiariesForModule, hasCategoryAccess } from '@/lib/admin-permissions';
import { resolveAuthorizedOrganizationScope } from '@/lib/organizations';
import { prisma } from '@/lib/prisma';
import { invalid } from '@/lib/finance/ledger';

export const dynamic = 'force-dynamic';

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

export async function GET(request: Request) {
  return walletHttp(request, async (actor) => {
    if (!hasCategoryAccess(actor.role, actor.customAdminPermissions, 'finance', 'Overview') && !['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(actor.role)) {
      invalid('Finance access is required to view Report Studio.', 403);
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');
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

    const [requests, disbursements, walletFees] = await Promise.all([
      prisma.expenditureRequest.findMany({
        where: {
          subsidiaryId: { in: orgIds },
          createdAt: { gte: period.start, lte: period.end },
          approvalStatus: { not: 'DRAFT' },
        },
        select: {
          id: true,
          subsidiaryId: true,
          amountMinor: true,
          approvalStatus: true,
          paymentStatus: true,
          accountabilityStatus: true,
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
          amountMinor: true,
          status: true,
        },
      }),
      prisma.walletWithdrawal.findMany({
        where: {
          createdAt: { gte: period.start, lte: period.end },
          status: { in: ['SUCCESS', 'SETTLED', 'COMPLETED', 'SUBMITTED', 'PROCESSING'] },
          requestId: { not: null },
        },
        select: {
          requestId: true,
          feeMinor: true,
          amountMinor: true,
        },
      }),
    ]);

    const requestOrgMap = new Map<string, string>();
    for (const r of requests) requestOrgMap.set(r.id, r.subsidiaryId);

    const feesByOrg = new Map<string, bigint>();
    for (const w of walletFees) {
      if (!w.requestId) continue;
      const orgId = requestOrgMap.get(w.requestId);
      if (!orgId) continue;
      feesByOrg.set(orgId, (feesByOrg.get(orgId) ?? BigInt(0)) + (w.feeMinor ?? BigInt(0)));
    }

    let totPaidTx = 0;
    let totTx = 0;
    let totApprovedGross = BigInt(0);
    let totCharges = BigInt(0);
    let totNetDisbursable = BigInt(0);
    let totSettled = BigInt(0);
    let totPending = BigInt(0);
    let totRequested = BigInt(0);
    let accountabilityClosedCount = 0;
    let accountabilityTotalCount = 0;

    const rows = organizations.map((org) => {
      const orgReqs = requests.filter((r) => r.subsidiaryId === org.id);
      const orgDisb = disbursements.filter((d) => d.payerOrgId === org.id);

      const totalTxCount = orgReqs.length;
      const settledTxCount = orgReqs.filter((r) => r.paymentStatus === 'RECIPIENT_CONFIRMED').length;

      let totalRequestedMinor = BigInt(0);
      let approvedGrossMinor = BigInt(0);
      let pendingMinor = BigInt(0);

      for (const r of orgReqs) {
        totalRequestedMinor += r.amountMinor;
        if (r.approvalStatus === 'APPROVED') {
          approvedGrossMinor += r.amountMinor;
          if (r.paymentStatus === 'UNPAID' || r.paymentStatus === 'AWAITING_RECIPIENT_CONFIRMATION') {
            pendingMinor += r.amountMinor;
          }
          accountabilityTotalCount += 1;
          if (r.accountabilityStatus === 'VERIFIED' || r.accountabilityStatus === 'CLOSED') {
            accountabilityClosedCount += 1;
          }
        }
      }

      let settledMinor = BigInt(0);
      for (const d of orgDisb) {
        if (d.status === 'RECIPIENT_CONFIRMED') {
          settledMinor += d.amountMinor;
        }
      }
      if (settledMinor === BigInt(0)) {
        for (const r of orgReqs) {
          if (r.approvalStatus === 'APPROVED' && r.paymentStatus === 'RECIPIENT_CONFIRMED') {
            settledMinor += r.amountMinor;
          }
        }
      }

      const chargesMinor = feesByOrg.get(org.id) ?? BigInt(0);
      const netDisbursableMinor = approvedGrossMinor > chargesMinor ? approvedGrossMinor - chargesMinor : BigInt(0);
      const settlementPct = approvedGrossMinor > BigInt(0)
        ? Math.min(100, Math.round((Number(settledMinor) / Number(approvedGrossMinor)) * 100))
        : 0;

      totPaidTx += settledTxCount;
      totTx += totalTxCount;
      totApprovedGross += approvedGrossMinor;
      totCharges += chargesMinor;
      totNetDisbursable += netDisbursableMinor;
      totSettled += settledMinor;
      totPending += pendingMinor;
      totRequested += totalRequestedMinor;

      return {
        organizationId: org.id,
        name: org.legalName,
        code: org.code,
        type: org.type,
        settledTxCount,
        totalTxCount,
        approvedGrossMinor: approvedGrossMinor.toString(),
        chargesMinor: chargesMinor.toString(),
        netDisbursableMinor: netDisbursableMinor.toString(),
        settledMinor: settledMinor.toString(),
        pendingMinor: pendingMinor.toString(),
        totalRequestedMinor: totalRequestedMinor.toString(),
        settlementPct,
      };
    });

    const overallSettlementPct = totApprovedGross > BigInt(0)
      ? Math.min(100, Math.round((Number(totSettled) / Number(totApprovedGross)) * 100))
      : 0;
    const accountabilityRatePct = accountabilityTotalCount > 0
      ? Math.round((accountabilityClosedCount / accountabilityTotalCount) * 100)
      : 100;

    const scopeSlug = requested.isGroup ? 'ALL-SCOPES' : organizations[0].code;
    const statementRef = `BEMS-REP-${period.key}-${scopeSlug}`;

    return walletJson({
      statementRef,
      period: {
        key: period.key,
        label: period.label,
        from: period.fromIso,
        to: period.toIso,
      },
      kpis: {
        approvedGrossMinor: totApprovedGross.toString(),
        chargesMinor: totCharges.toString(),
        netSettledMinor: totSettled.toString(),
        pendingMinor: totPending.toString(),
        totalRequestedMinor: totRequested.toString(),
        settledTxCount: totPaidTx,
        totalTxCount: totTx,
        settlementPct: overallSettlementPct,
        accountabilityClosedCount,
        accountabilityTotalCount,
        accountabilityRatePct,
      },
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
    });
  });
}
