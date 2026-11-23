import type { FinanceTx } from './ledger';

export type PostingSource = { kind: string; id: string; reference: string; name: string; date: string; amountMinor: bigint };

export function postingSources(tx: FinanceTx, organizationId: string, source?: { id: string; kind: string }) {
  return tx.$queryRaw<PostingSource[]>`
    WITH sources AS (
      SELECT 'WALLET_CREDIT' AS kind, c."id",
        COALESCE(r."requestNumber", c."sourceId") AS reference,
        CASE WHEN c."sourceType"='PAYROLL_ITEM' THEN 'Payroll wallet credit · ' ELSE 'Approved staff wallet credit · ' END || e."legalName" AS name,
        (c."createdAt" AT TIME ZONE 'Africa/Lagos')::date::text AS date, c."amountMinor"
      FROM "WalletCreditLot" c JOIN "Employee" e ON e."id"=c."employeeId"
      JOIN "WalletReleaseProposal" p ON p."id"=c."proposalId" AND p."status"='EXECUTED'
      LEFT JOIN "ExpenditureRequest" r ON r."id"=c."requestId"
      WHERE c."organizationId"=${organizationId}
        AND (${source?.kind ?? 'WALLET_CREDIT'}='WALLET_CREDIT') AND (${source?.id ?? null}::text IS NULL OR c."id"=${source?.id ?? null})
      UNION ALL
      SELECT 'RECORDED_PAYMENT', d."id", d."externalReference", d."beneficiaryName",
        (d."paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date::text, d."amountMinor"
      FROM "Disbursement" d WHERE d."payerOrgId"=${organizationId} AND d."currency"='NGN' AND d."status" IN ('PAID','SETTLED','RECIPIENT_CONFIRMED')
        AND (${source?.kind ?? 'RECORDED_PAYMENT'}='RECORDED_PAYMENT') AND (${source?.id ?? null}::text IS NULL OR d."id"=${source?.id ?? null})
      UNION ALL
      SELECT 'INTERCOMPANY', n."id", n."noteNumber", n."description",
        (n."generatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date::text, n."totalAmountMinor"
      FROM "IntercompanyNote" n WHERE n."sourceEntityId"=${organizationId} AND n."currency"='NGN'
        AND n."status" IN ('ISSUED','RECONCILED','SETTLED') AND n."noteType"='DEBIT_NOTE'
        AND (${source?.kind ?? 'INTERCOMPANY'}='INTERCOMPANY') AND (${source?.id ?? null}::text IS NULL OR n."id"=${source?.id ?? null})
    )
    SELECT s.* FROM sources s WHERE s."amountMinor">0 AND NOT EXISTS (
      SELECT 1 FROM "FinanceJournal" j WHERE j."organizationId"=${organizationId} AND j."source"=s.kind AND j."reference"=s.id
    )
    ORDER BY s.date DESC,s.reference,s.id LIMIT ${source ? 1 : 150}
  `;
}
