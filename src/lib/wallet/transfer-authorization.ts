import type { Prisma } from '@prisma/client';
import { hash } from './core';

type StoredTransfer = {
  id: string;
  employeeId: string;
  targetType: string;
  proposalId: string | null;
  requestId: string | null;
  vendorId: string | null;
  bankAccountId: string | null;
  amountMinor: bigint;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  intentHash: string;
};

export async function hasAuthorizedTransfer(tx: Prisma.TransactionClient, transfer: StoredTransfer) {
  if (transfer.targetType === 'VENDOR') {
    const [item] = await tx.$queryRaw<Array<{ bankSnapshot: string | null }>>`
      SELECT i."bankSnapshot"
      FROM "WalletReleaseItem" i
      JOIN "WalletReleaseProposal" p ON p."id" = i."proposalId"
      JOIN "WalletPaidSource" s ON s."proposalId" = p."id" AND s."key" = 'REQUEST:' || i."sourceId"
      WHERE p."id" = ${transfer.proposalId} AND p."status" = 'EXECUTED'
        AND p."approvedById" = ${transfer.employeeId} AND p."sourceType" = 'REQUEST'
        AND p."sourceId" = ${transfer.requestId} AND i."sourceId" = p."sourceId"
        AND i."vendorId" = ${transfer.vendorId} AND i."amountMinor" = ${transfer.amountMinor}
    `;
    if (!item?.bankSnapshot) return false;
    const bank = {
      accountNumber: transfer.accountNumber,
      bankCode: transfer.bankCode,
      accountName: transfer.accountName,
    };
    return item.bankSnapshot === JSON.stringify(bank)
      && transfer.intentHash === hash({ id: transfer.proposalId, bank, amount: transfer.amountMinor });
  }

  if (transfer.targetType !== 'STAFF') return false;
  const [authorization] = await tx.$queryRaw<Array<{ amount: bigint; valid: boolean; bankVerified: boolean }>>`
    SELECT COALESCE(sum(a."amountMinor"),0)::bigint AS "amount",
      COALESCE(bool_and(c."employeeId" = ${transfer.employeeId} AND NOT c."frozen"
        AND c."heldMinor" >= a."amountMinor" AND p."status" = 'EXECUTED' AND p."approvedById" IS NOT NULL), false) AS "valid",
      EXISTS (
        SELECT 1 FROM "WalletBankAccount" b
        JOIN "Employee" e ON e."id" = b."employeeId"
        WHERE b."id" = ${transfer.bankAccountId} AND b."employeeId" = ${transfer.employeeId}
          AND b."active" AND b."bankCode" = ${transfer.bankCode}
          AND b."accountNumber" = ${transfer.accountNumber} AND b."accountName" = ${transfer.accountName}
          AND e."role" IN ('STAFF','CUSTOM_ADMIN') AND e."approvalStatus" = 'APPROVED' AND e."status" IN ('ACTIVE','ON_LEAVE')
      ) AS "bankVerified"
    FROM "WalletWithdrawalAllocation" a
    JOIN "WalletCreditLot" c ON c."id" = a."creditLotId"
    JOIN "WalletReleaseProposal" p ON p."id" = c."proposalId"
    WHERE a."withdrawalId" = ${transfer.id}
  `;
  return authorization.valid && authorization.bankVerified && authorization.amount === transfer.amountMinor;
}
