import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { postingSources } from './sources';
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
        json_agg(json_build_object('code',a."code",'name',a."name",'amountMinor',l."amountMinor"::text,'department',d."name",'project',l."projectId") ORDER BY l."amountMinor" DESC,a."code") AS "lines"
      FROM "FinanceJournal" j JOIN "FinanceJournalLine" l ON l."journalId"=j."id" JOIN "FinanceAccount" a ON a."id"=l."accountId"
      LEFT JOIN "Department" d ON d."id"=l."departmentId"
      WHERE j."organizationId"=${organizationId} AND j."date">=${period}::date AND j."date"<${period}::date+interval '1 month'
      GROUP BY j."id" ORDER BY j."date" DESC,j."createdAt" DESC LIMIT 100
    `;
    const openItems = await tx.$queryRaw<any[]>`
      SELECT "id","kind","party","reference","issuedOn"::text AS "issuedOn","dueOn"::text AS "dueOn","amountMinor","remainingMinor"
      FROM "FinanceOpenItem" WHERE "organizationId"=${organizationId}
      ORDER BY ("remainingMinor">0) DESC,"dueOn","reference" LIMIT 250
    `;
    const statementLines = await tx.$queryRaw<any[]>`
      SELECT s."id",s."accountId",a."name" AS "accountName",s."date"::text AS "date",s."reference",s."memo",s."amountMinor",s."matchedLineId", e."legalName" AS "ownerName"
      FROM "FinanceStatementLine" s JOIN "FinanceAccount" a ON a."id"=s."accountId"
      LEFT JOIN "FinanceReconciliationAssignment" r ON r."organizationId"=s."organizationId" AND r."targetType"='STATEMENT' AND r."targetId"=s."id"
      LEFT JOIN "Employee" e ON e."id"=r."ownerId"
      WHERE s."organizationId"=${organizationId} AND s."date"<${period}::date+interval '1 month'
        AND (s."date">=${period}::date OR s."matchedLineId" IS NULL)
      ORDER BY (s."matchedLineId" IS NULL) DESC,s."date",s."id" LIMIT 500
    `;
    const statementBalances = await tx.$queryRaw<any[]>`
      SELECT s."accountId",a."name",s."openingMinor",s."closingMinor",s."reference"
      FROM "FinanceStatementBalance" s JOIN "FinanceAccount" a ON a."id"=s."accountId"
      WHERE s."organizationId"=${organizationId} AND s."month"=${period}::date ORDER BY a."code"
    `;
    const cashLines = await tx.$queryRaw<any[]>`
      SELECT l."id",l."accountId", j."date"::text AS "date", j."reference",j."memo",l."amountMinor",a."name" AS "accountName",e."legalName" AS "ownerName"
      FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
      LEFT JOIN "FinanceReconciliationAssignment" r ON r."organizationId"=l."organizationId" AND r."targetType"='LEDGER' AND r."targetId"=l."id"
      LEFT JOIN "Employee" e ON e."id"=r."ownerId"
      WHERE l."organizationId"=${organizationId} AND NOT j."groupOnly" AND j."source"<>'OPENING' AND j."date"<${period}::date+interval '1 month'
        AND NOT EXISTS (SELECT 1 FROM "FinanceStatementLine" s WHERE s."matchedLineId"=l."id")
      ORDER BY j."date",j."reference",l."id" LIMIT 500
    `;
    const cashStatement = await tx.$queryRaw<any[]>`
      SELECT j."source",
        COALESCE(sum(l."amountMinor") FILTER (WHERE l."amountMinor">0),0)::bigint AS "receiptsMinor",
        COALESCE(-sum(l."amountMinor") FILTER (WHERE l."amountMinor"<0),0)::bigint AS "paymentsMinor"
      FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
      WHERE j."organizationId" IN (${Prisma.join(bookIds)}) AND NOT j."groupOnly" AND j."source"<>'OPENING'
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
        UNION ALL
        SELECT GREATEST(r."neededBy"::date,CURRENT_DATE),-r."amountMinor"
          FROM "ExpenditureRequest" r
          WHERE r."subsidiaryId"=${organizationId} AND r."currency"='NGN'
            AND r."isRecurring" AND r."approvalStatus"='APPROVED' AND r."paymentStatus"='UNPAID'
            AND NOT EXISTS (
              SELECT 1 FROM "VendorInvoice" v JOIN "FinanceOpenItem" i ON i."vendorInvoiceId"=v."id" WHERE v."requestId"=r."id"
            )
        UNION ALL
        SELECT GREATEST(p."endsOn"::date,CURRENT_DATE),-i."netMinor"
          FROM "PayrollItem" i JOIN "PayrollBatch" b ON b."id"=i."batchId" JOIN "PayrollPeriod" p ON p."id"=b."periodId"
          WHERE COALESCE(b."paymentEntityId",p."groupId")=${organizationId} AND b."status"='APPROVED'
            AND b."bulkFundedAt" IS NULL AND COALESCE(b."bulkFundedAmountMinor",0)=0
            AND i."currency"='NGN' AND i."status" NOT IN ('PAID','WALLET_CREDITED','DISBURSED')
            AND NOT EXISTS (SELECT 1 FROM "Disbursement" d WHERE d."payrollItemId"=i."id")
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
    const sources = await postingSources(tx, organizationId);
    const financeOfficers = await tx.employee.findMany({
      where: { role: { in: ['GMD','SUPER_ADMIN','SYSTEM_ADMIN'] }, status: 'ACTIVE', approvalStatus: 'APPROVED' },
      select: { id: true, legalName: true }, orderBy: { legalName: 'asc' },
    });
    const departments = await tx.department.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const [projectSchema] = await tx.$queryRaw<{ available: boolean }[]>`SELECT to_regclass('"Project"') IS NOT NULL AS available`;
    const projects = projectSchema.available
      ? await tx.project.findMany({ where: { organizationId }, select: { id: true, projectCode: true, departmentId: true }, take: 250 })
      : [];
    const projectCodes = new Map(projects.map(project => [project.id, project.projectCode]));
    for (const journal of journals) {
      for (const line of journal.lines) if (line.project) line.project = projectCodes.get(line.project) ?? line.project;
    }
    return { accounts, reports, journals, openItems, statementLines, statementBalances, cashLines, cashStatement, cashBalanceMinor: cash.balanceMinor,
      cashPlan, forecast, assets, closed, sources, financeOfficers, vendorInvoices: vendorInvoices.filter(invoice => !imported.has(invoice.id)), departments, projects };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
}
