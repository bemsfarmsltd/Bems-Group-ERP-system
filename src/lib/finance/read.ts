import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assetDate, type Account, type FinanceTx } from './ledger';

export async function readFinanceWorkspace({ organizationId, bookIds, consolidated, month }: {
  organizationId: string; bookIds: string[]; consolidated: boolean; month: string;
}) {
  const period = month + '-01';
  return prisma.$transaction(async (tx: FinanceTx) => {
    const accounts = await tx.$queryRaw<Account[]>`
      SELECT * FROM "FinanceAccount" WHERE "organizationId"=${organizationId} ORDER BY "code"
    `;
    const reports = await tx.$queryRaw<Array<{ code: string; name: string; kind: string; endingMinor: bigint; movementMinor: bigint }>>`
      SELECT a."code", min(a."name") AS "name", a."kind",
        COALESCE(sum(l."amountMinor"),0)::bigint AS "endingMinor",
        COALESCE(sum(l."amountMinor") FILTER (WHERE j."date">=${period}::date),0)::bigint AS "movementMinor"
      FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId"
      WHERE j."organizationId" IN (${Prisma.join(bookIds)}) AND (NOT j."groupOnly" OR ${consolidated})
        AND j."date"<${period}::date+interval '1 month'
      GROUP BY a."code",a."kind" ORDER BY a."code",a."kind"
    `;
    const journals = await tx.$queryRaw<any[]>`
      SELECT j."id",j."date"::text AS "date",j."memo",j."reference",j."source", j."groupOnly",
        json_agg(json_build_object('code',a."code",'name',a."name",'amountMinor',l."amountMinor"::text,'department',d."name",'project',p."projectCode") ORDER BY l."amountMinor" DESC,a."code") AS "lines"
      FROM "FinanceJournal" j JOIN "FinanceJournalLine" l ON l."journalId"=j."id" JOIN "FinanceAccount" a ON a."id"=l."accountId"
      LEFT JOIN "Department" d ON d."id"=l."departmentId" LEFT JOIN "Project" p ON p."id"=l."projectId"
      WHERE j."organizationId"=${organizationId} AND j."date">=${period}::date AND j."date"<${period}::date+interval '1 month'
      GROUP BY j."id" ORDER BY j."date" DESC,j."createdAt" DESC LIMIT 100
    `;
    const openItems = await tx.$queryRaw<any[]>`
      SELECT "id","kind","party","reference","issuedOn"::text AS "issuedOn","dueOn"::text AS "dueOn","amountMinor","remainingMinor"
      FROM "FinanceOpenItem" WHERE "organizationId"=${organizationId}
      ORDER BY ("remainingMinor">0) DESC,"dueOn","reference" LIMIT 250
    `;
    const statementLines = await tx.$queryRaw<any[]>`
      SELECT s."id",s."accountId",a."name" AS "accountName",s."date"::text AS "date",s."reference",s."memo",s."amountMinor",s."matchedLineId"
      FROM "FinanceStatementLine" s JOIN "FinanceAccount" a ON a."id"=s."accountId"
      WHERE s."organizationId"=${organizationId} AND s."date"<${period}::date+interval '1 month'
        AND (s."date">=${period}::date OR s."matchedLineId" IS NULL)
      ORDER BY (s."matchedLineId" IS NULL) DESC,s."date",s."id" LIMIT 500
    `;
    const cashLines = await tx.$queryRaw<any[]>`
      SELECT l."id",l."accountId", j."date"::text AS "date", j."reference",j."memo",l."amountMinor",a."name" AS "accountName"
      FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
      WHERE l."organizationId"=${organizationId} AND NOT j."groupOnly" AND j."date"<${period}::date+interval '1 month'
        AND NOT EXISTS (SELECT 1 FROM "FinanceStatementLine" s WHERE s."matchedLineId"=l."id")
      ORDER BY j."date",j."reference",l."id" LIMIT 500
    `;
    const cashStatement = await tx.$queryRaw<any[]>`
      SELECT j."source",
        COALESCE(sum(l."amountMinor") FILTER (WHERE l."amountMinor">0),0)::bigint AS "receiptsMinor",
        COALESCE(-sum(l."amountMinor") FILTER (WHERE l."amountMinor"<0),0)::bigint AS "paymentsMinor"
      FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
      WHERE j."organizationId" IN (${Prisma.join(bookIds)}) AND NOT j."groupOnly"
        AND j."date">=${period}::date AND j."date"<${period}::date+interval '1 month'
      GROUP BY j."source" ORDER BY j."source"
    `;
    const [cash] = await tx.$queryRaw<{ balanceMinor: bigint }[]>`
      SELECT COALESCE(sum(l."amountMinor"),0)::bigint AS "balanceMinor"
      FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
      WHERE j."organizationId"=${organizationId} AND j."date"<=CURRENT_DATE AND NOT j."groupOnly"
    `;
    const cashPlan = await tx.$queryRaw<any[]>`
      SELECT "id","date"::text AS "date","label","reference","amountMinor" FROM "FinanceCashPlan"
      WHERE "organizationId"=${organizationId} AND "active" ORDER BY "date" LIMIT 250
    `;
    const forecast = await tx.$queryRaw<Array<{ week: string; amountMinor: bigint }>>`
      WITH amounts AS (
        SELECT GREATEST("dueOn",CURRENT_DATE) AS "expectedOn",
          CASE WHEN "kind"='PAYABLE' THEN -"remainingMinor" ELSE "remainingMinor" END AS amount
        FROM "FinanceOpenItem" WHERE "organizationId"=${organizationId} AND "remainingMinor">0
        UNION ALL
        SELECT GREATEST("date",CURRENT_DATE),"amountMinor" FROM "FinanceCashPlan"
          WHERE "organizationId"=${organizationId} AND "active"
        UNION ALL
        SELECT j."date",l."amountMinor" FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
          JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
          WHERE j."organizationId"=${organizationId} AND NOT j."groupOnly" AND j."date">CURRENT_DATE
      ), weeks AS (
        SELECT date_trunc('week',CURRENT_DATE)::date+steps."n"*7 AS "week"
        FROM generate_series(0,12) AS steps("n")
      )
      SELECT w."week"::text AS "week",COALESCE(sum(a.amount),0)::bigint AS "amountMinor"
      FROM weeks w LEFT JOIN amounts a ON a."expectedOn">=w."week" AND a."expectedOn"<w."week"+7
      GROUP BY w."week" ORDER BY w."week"
    `;
    const assets = await tx.$queryRaw<any[]>`
      SELECT "id","tag","name","location","acquiredOn"::text AS "acquiredOn","costMinor","residualMinor","months","postedMonths","depreciationMinor","disposedOn"::text AS "disposedOn"
      FROM "FinanceAsset" WHERE "organizationId"=${organizationId} ORDER BY "tag" LIMIT 250
    `;
    for (const asset of assets) {
      asset.nextPosting = asset.disposedOn || asset.postedMonths >= asset.months ? null : assetDate(asset.acquiredOn,asset.postedMonths);
    }
    const closed = await tx.$queryRaw<any[]>`
      SELECT "month"::text AS "month","closedAt","note" FROM "FinancePeriodClose"
      WHERE "organizationId"=${organizationId} ORDER BY "month" DESC LIMIT 36
    `;
    const vendorInvoices = await tx.vendorInvoice.findMany({
      where: { status: 'MATCHED', currency: 'NGN', request: { subsidiaryId: organizationId } },
      select: { id: true, invoiceNumber: true, amountMinor: true, invoiceDate: true, vendor: { select: { name: true } } },
      take: 100, orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
    });
    const imported = new Set((await tx.$queryRaw<{ vendorInvoiceId: string }[]>`
      SELECT "vendorInvoiceId" FROM "FinanceOpenItem" WHERE "organizationId"=${organizationId} AND "vendorInvoiceId" IS NOT NULL
    `).map(row => row.vendorInvoiceId));
    const departments = await tx.department.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const projects = await tx.project.findMany({ where: { organizationId }, select: { id: true, projectCode: true, departmentId: true }, take: 250 });
    return { accounts, reports, journals, openItems, statementLines, cashLines, cashStatement, cashBalanceMinor: cash.balanceMinor,
      cashPlan, forecast, assets, closed, vendorInvoices: vendorInvoices.filter(invoice => !imported.has(invoice.id)), departments, projects };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
}
