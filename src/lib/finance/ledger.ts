import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { WalletError } from '@/lib/wallet/core';

export type FinanceTx = Prisma.TransactionClient;
export type Account = { id: string; organizationId: string; code: string; name: string; kind: string; cash: boolean };
export type JournalLine = { accountId: string; amount: bigint; departmentId?: string | null; projectId?: string | null };

export function invalid(message: string, status = 400): never {
  throw new WalletError('ACCOUNTING_OPERATION_REJECTED', message, status);
}

export function field(value: unknown, label: string, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid('Enter a valid ' + label + '.');
  return value.trim();
}

export function dateField(value: unknown, label: string) {
  const date = field(value, label, 10);
  const parsed = new Date(date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < '1900-01-01') invalid('Enter a valid ' + label + '.');
  return date;
}

export function moneyMinor(value: unknown, { signed = false, zero = false } = {}) {
  const input = field(value, 'amount', 18);
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(input)) invalid('Enter an amount with up to two decimal places.');
  const negative = input.startsWith('-');
  const [whole, fraction = ''] = (negative ? input.slice(1) : input).split('.');
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if ((!signed && negative) || (!zero && minor === BigInt(0))) invalid(signed ? 'Enter a nonzero amount.' : 'Enter a positive amount.');
  return negative ? -minor : minor;
}

export async function assertOpen(tx: FinanceTx, organizationId: string, date: string) {
  const [closed] = await tx.$queryRaw<{ month: Date }[]>`
    SELECT "month" FROM "FinancePeriodClose" WHERE "organizationId"=${organizationId}
      AND "month">=date_trunc('month',${date}::date)::date LIMIT 1
  `;
  if (closed) invalid('This date is in a closed accounting period.', 409);
}

export async function account(tx: FinanceTx, organizationId: string, id: unknown, kind?: string) {
  const [record] = await tx.$queryRaw<Account[]>`SELECT * FROM "FinanceAccount" WHERE "id"=${field(id, 'account')} AND "organizationId"=${organizationId}`;
  if (!record || (kind && record.kind !== kind)) invalid('Select a valid ' + (kind ? kind.toLowerCase() + ' ' : '') + 'account for this entity.');
  return record;
}

export async function postJournal(tx: FinanceTx, input: {
  organizationId: string; actorId: string; date: string; memo: string; source: string; reference: string;
  lines: JournalLine[]; groupOnly?: boolean;
}) {
  const { organizationId, actorId, date, memo, source, reference, lines } = input;
  if (lines.length < 2 || lines.length > 100 || lines.some(line => line.amount === BigInt(0)) ||
      lines.reduce((total, line) => total + line.amount, BigInt(0)) !== BigInt(0)) invalid('Journal debits and credits must balance.');
  await assertOpen(tx, organizationId, date);
  const id = randomUUID();
  const inserted = await tx.$executeRaw`
    INSERT INTO "FinanceJournal" ("id","organizationId","actorId","date","memo","source","reference","groupOnly")
    VALUES (${id},${organizationId},${actorId},${date}::date,${memo},${source},${reference},${input.groupOnly ?? false})
    ON CONFLICT ("organizationId","source","reference") DO NOTHING
  `;
  if (!inserted) invalid('This source and reference have already been posted.', 409);
  await tx.$executeRaw`
    INSERT INTO "FinanceJournalLine" ("id","organizationId","journalId","accountId","amountMinor","departmentId","projectId")
    VALUES ${Prisma.join(lines.map(line => Prisma.sql`(${randomUUID()},${organizationId},${id},${line.accountId},${line.amount},${line.departmentId ?? null},${line.projectId ?? null})`))}
  `;
  return id;
}

export function assetDate(acquiredOn: string, postedMonths: number) {
  const month = new Date(acquiredOn.slice(0, 7) + '-01T00:00:00Z');
  month.setUTCMonth(month.getUTCMonth() + postedMonths + 1);
  month.setUTCDate(0);
  return month.toISOString().slice(0, 10);
}
