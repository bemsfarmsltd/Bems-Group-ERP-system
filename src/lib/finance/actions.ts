import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { account, assertOpen, assetDate, dateField, field, invalid, moneyMinor, postJournal, type FinanceTx } from './ledger';

type Body = Record<string, unknown>;
type Context = { tx: FinanceTx; organizationId: string; actorId: string; body: Body; isGroup: boolean };
type OpenItem = { id: string; kind: string; party: string; remainingMinor: bigint; controlAccountId: string; issuedOn: string };
type Asset = { id: string; tag: string; acquiredOn: string; disposedOn: Date | null; costMinor: bigint; residualMinor: bigint;
  postedMonths: number; months: number; depreciationMinor: bigint; assetAccountId: string; depreciationAccountId: string; expenseAccountId: string };

async function recordOpenItem({ tx, organizationId, actorId, body }: Context) {
  const invoiceId = body.vendorInvoiceId ? field(body.vendorInvoiceId, 'vendor invoice') : null;
  const invoice = invoiceId && await tx.vendorInvoice.findFirst({
    where: { id: invoiceId, status: 'MATCHED', currency: 'NGN', request: { subsidiaryId: organizationId } },
    include: { vendor: { select: { name: true } } },
  });
  if (invoiceId && !invoice) invalid('Select a matched supplier invoice belonging to this entity.');
  const kind = invoice ? 'PAYABLE' : field(body.kind, 'document type');
  if (!['PAYABLE', 'RECEIVABLE'].includes(kind)) invalid('Select a bill or customer invoice.');
  const payable = kind === 'PAYABLE';
  const party = invoice ? invoice.vendor.name : field(body.party, 'vendor or customer');
  const reference = invoice ? invoice.invoiceNumber : field(body.reference, 'invoice reference');
  const issuedOn = invoice ? invoice.invoiceDate.toISOString().slice(0, 10) : dateField(body.date, 'invoice date');
  const dueOn = dateField(body.dueOn, 'due date');
  if (dueOn < issuedOn) invalid('The due date must be on or after the invoice date.');
  const amount = invoice ? invoice.amountMinor : moneyMinor(body.amount);
  if (amount <= BigInt(0)) invalid('The invoice amount must be positive.');
  const control = await account(tx, organizationId, body.controlAccountId, payable ? 'LIABILITY' : 'ASSET');
  const offset = await account(tx, organizationId, body.offsetAccountId, payable ? undefined : 'REVENUE');
  if (control.cash || (payable && (!['ASSET', 'EXPENSE'].includes(offset.kind) || offset.cash))) invalid('Use an outstanding balance account and a valid expense, asset or revenue account.');
  const journalId = await postJournal(tx, {
    organizationId, actorId, date: issuedOn, memo: party + ' · ' + reference, source: kind,
    reference: invoiceId ?? JSON.stringify([party, reference]),
    lines: [{ accountId: offset.id, amount: payable ? amount : -amount }, { accountId: control.id, amount: payable ? -amount : amount }],
  });
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "FinanceOpenItem" ("id","organizationId","kind","party","reference","issuedOn","dueOn","amountMinor","remainingMinor","controlAccountId","journalId","vendorInvoiceId")
    VALUES (${id},${organizationId},${kind},${party},${reference},${issuedOn}::date,${dueOn}::date,${amount},${amount},${control.id},${journalId},${invoiceId})
  `;
  return id;
}

async function settleOpenItem({ tx, organizationId, actorId, body }: Context) {
  const [item] = await tx.$queryRaw<OpenItem[]>`
    SELECT *, "issuedOn"::text AS "issuedOn" FROM "FinanceOpenItem"
    WHERE "id"=${field(body.itemId, 'invoice')} AND "organizationId"=${organizationId} FOR UPDATE
  `;
  if (!item) invalid('This invoice is unavailable.');
  const bank = await account(tx, organizationId, body.accountId);
  if (!bank.cash) invalid('Choose a bank or cash account.');
  const amount = moneyMinor(body.amount);
  if (amount > item.remainingMinor) invalid('The payment exceeds this invoice’s outstanding balance.', 409);
  const date = dateField(body.date, 'payment date');
  if (date < item.issuedOn) invalid('The payment predates the invoice.');
  const cash = item.kind === 'PAYABLE' ? -amount : amount;
  const journalId = await postJournal(tx, {
    organizationId, actorId, date, memo: 'Invoice settlement · ' + item.party, source: 'SETTLEMENT',
    reference: field(body.reference, 'payment reference'),
    lines: [{ accountId: bank.id, amount: cash }, { accountId: item.controlAccountId, amount: -cash }],
  });
  await tx.$executeRaw`UPDATE "FinanceOpenItem" SET "remainingMinor"="remainingMinor"-${amount} WHERE "id"=${item.id}`;
  return journalId;
}

async function importStatement({ tx, organizationId, body }: Context) {
  const bank = await account(tx, organizationId, body.accountId);
  if (!bank.cash) invalid('Choose a bank or cash account.');
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500) invalid('Import between 1 and 500 statement lines.');
  const rows = body.rows.map(row => ({
    id: randomUUID(), date: dateField(row?.date, 'statement date'), reference: field(row?.reference, 'statement transaction ID'),
    amount: moneyMinor(row?.amount, { signed: true }), memo: field(row?.memo ?? row?.reference, 'statement description', 400),
  }));
  if (new Set(rows.map(row => row.reference)).size !== rows.length) invalid('Statement transaction IDs must be distinct.');
  await assertOpen(tx, organizationId, rows.map(row => row.date).sort()[0]);
  const count = await tx.$executeRaw`
    INSERT INTO "FinanceStatementLine" ("id","organizationId","accountId","date","reference","memo","amountMinor")
    VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${row.id},${organizationId},${bank.id},${row.date}::date,${row.reference},${row.memo},${row.amount})`))}
    ON CONFLICT ("accountId","reference") DO NOTHING
  `;
  const stored = await tx.$queryRaw<{ reference: string; date: string; amountMinor: bigint; memo: string }[]>`
    SELECT "reference","date"::text AS "date","amountMinor","memo" FROM "FinanceStatementLine"
    WHERE "accountId"=${bank.id} AND "reference" IN (${Prisma.join(rows.map(row => row.reference))})
  `;
  const indexed = new Map(stored.map(row => [row.reference, row]));
  if (rows.some(row => {
    const old = indexed.get(row.reference);
    return !old || old.date !== row.date || old.amountMinor !== row.amount || old.memo !== row.memo;
  })) invalid('An imported transaction ID already has different statement details. Check the source statement.', 409);
  return count;
}

async function matchStatement({ tx, organizationId, body }: Context) {
  const [line] = await tx.$queryRaw<{ id: string; date: string; ledgerDate: string }[]>`
    SELECT s."id", s."date"::text AS "date", j."date"::text AS "ledgerDate" FROM "FinanceStatementLine" s
    JOIN "FinanceJournalLine" l ON l."id"=${field(body.lineId, 'ledger entry')}
      AND l."organizationId"=s."organizationId" AND l."accountId"=s."accountId" AND l."amountMinor"=s."amountMinor"
    JOIN "FinanceJournal" j ON j."id"=l."journalId" AND NOT j."groupOnly"
    WHERE s."organizationId"=${organizationId} AND s."id"=${field(body.statementId, 'statement line')}
      AND s."matchedLineId" IS NULL AND NOT EXISTS (SELECT 1 FROM "FinanceStatementLine" existing WHERE existing."matchedLineId"=l."id")
  `;
  if (!line) invalid('Select an unmatched ledger line with the same account and amount.', 409);
  await assertOpen(tx, organizationId, line.date < line.ledgerDate ? line.date : line.ledgerDate);
  await tx.$executeRaw`UPDATE "FinanceStatementLine" SET "matchedLineId"=${body.lineId as string},"matchedAt"=now() WHERE "id"=${line.id}`;
  return line.id;
}

async function closePeriod({ tx, organizationId, actorId, body }: Context) {
  const month = dateField(field(body.month, 'period', 7) + '-01', 'period');
  await assertOpen(tx, organizationId, month);
  if (body.reviewed !== true) invalid('Confirm review of accruals, open invoices, assets and reconciliation.');
  const [pending] = await tx.$queryRaw<{ unmatched: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM "FinanceStatementLine"
      WHERE "organizationId"=${organizationId} AND "date"<${month}::date+interval '1 month' AND "matchedLineId" IS NULL)
      OR EXISTS (SELECT 1 FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
      WHERE l."organizationId"=${organizationId} AND NOT j."groupOnly" AND j."date"<${month}::date+interval '1 month'
      AND NOT EXISTS (SELECT 1 FROM "FinanceStatementLine" s WHERE s."matchedLineId"=l."id")) AS unmatched
  `;
  if (pending.unmatched) invalid('Reconcile outstanding cash entries and statement lines before closing the period.', 409);
  await tx.$executeRaw`
    INSERT INTO "FinancePeriodClose" ("organizationId","month","actorId","note")
    VALUES (${organizationId},${month}::date,${actorId},${field(body.note, 'close review note', 1000)})
  `;
  return month;
}

async function registerAsset({ tx, organizationId, actorId, body }: Context) {
  const id = randomUUID();
  const tag = field(body.tag, 'asset tag');
  const name = field(body.name, 'asset name');
  const date = dateField(body.date, 'acquisition date');
  const cost = moneyMinor(body.cost);
  const residual = moneyMinor(body.residual ?? '0', { zero: true });
  const months = Number(field(body.months, 'useful life', 3));
  if (!Number.isInteger(months) || months < 1 || months > 600 || residual > cost) invalid('Enter a valid useful life and residual value.');
  const asset = await account(tx, organizationId, body.assetAccountId, 'ASSET');
  const contra = await account(tx, organizationId, body.depreciationAccountId, 'ASSET');
  const expense = await account(tx, organizationId, body.expenseAccountId, 'EXPENSE');
  const offset = await account(tx, organizationId, body.offsetAccountId);
  if (asset.cash || contra.cash || !['ASSET', 'LIABILITY', 'EQUITY'].includes(offset.kind) ||
      new Set([asset.id, contra.id, offset.id]).size !== 3) invalid('Choose distinct fixed asset, accumulated depreciation and funding accounts.');
  await postJournal(tx, { organizationId, actorId, date, memo: name, source: 'ASSET_ACQUISITION', reference: tag,
    lines: [{ accountId: asset.id, amount: cost }, { accountId: offset.id, amount: -cost }] });
  await tx.$executeRaw`
    INSERT INTO "FinanceAsset" ("id","organizationId","tag","name","location","acquiredOn","costMinor","residualMinor","months","assetAccountId","depreciationAccountId","expenseAccountId")
    VALUES (${id},${organizationId},${tag},${name},${field(body.location, 'location')},${date}::date,${cost},${residual},${months},${asset.id},${contra.id},${expense.id})
  `;
  return id;
}

async function changeAsset({ tx, organizationId, actorId, body }: Context, action: string) {
  const [asset] = await tx.$queryRaw<Asset[]>`
    SELECT *, "acquiredOn"::text AS "acquiredOn" FROM "FinanceAsset"
    WHERE "id"=${field(body.assetId, 'asset')} AND "organizationId"=${organizationId} FOR UPDATE
  `;
  if (!asset || asset.disposedOn) invalid('Select an active asset.');
  if (action === 'MOVE_ASSET') {
    await tx.$executeRaw`UPDATE "FinanceAsset" SET "location"=${field(body.location, 'new location')} WHERE "id"=${asset.id}`;
    return asset.id;
  }
  if (action === 'DEPRECIATE_ASSET') {
    if (asset.postedMonths >= asset.months) invalid('This asset is fully depreciated.');
    const date = assetDate(asset.acquiredOn, asset.postedMonths);
    if (date > new Date().toISOString().slice(0, 10)) invalid('The next depreciation period has not ended.');
    await assertOpen(tx, organizationId, date);
    const cumulative = (asset.costMinor - asset.residualMinor) * BigInt(asset.postedMonths + 1) / BigInt(asset.months);
    const amount = cumulative - asset.depreciationMinor;
    if (amount > BigInt(0)) await postJournal(tx, { organizationId, actorId, date, memo: asset.tag + ' depreciation',
      source: 'ASSET_DEPRECIATION', reference: asset.id + ':' + date,
      lines: [{ accountId: asset.expenseAccountId, amount }, { accountId: asset.depreciationAccountId, amount: -amount }] });
    await tx.$executeRaw`UPDATE "FinanceAsset" SET "postedMonths"="postedMonths"+1,"depreciationMinor"=${cumulative} WHERE "id"=${asset.id}`;
    return asset.id;
  }
  const date = dateField(body.date, 'disposal date');
  if (date < asset.acquiredOn || (asset.postedMonths > 0 && date < assetDate(asset.acquiredOn, asset.postedMonths - 1))) invalid('Disposal cannot predate acquisition or posted depreciation.');
  if (asset.postedMonths < asset.months && assetDate(asset.acquiredOn, asset.postedMonths) < date) invalid('Post the outstanding monthly depreciation before disposal.');
  const proceeds = moneyMinor(body.amount, { zero: true });
  const gain = proceeds - (asset.costMinor - asset.depreciationMinor);
  const lines = [{ accountId: asset.assetAccountId, amount: -asset.costMinor }];
  if (asset.depreciationMinor) lines.push({ accountId: asset.depreciationAccountId, amount: asset.depreciationMinor });
  if (proceeds) {
    const bank = await account(tx, organizationId, body.accountId);
    if (!bank.cash) invalid('Select the cash account receiving the disposal proceeds.');
    lines.push({ accountId: bank.id, amount: proceeds });
  }
  if (gain) {
    const result = await account(tx, organizationId, body.offsetAccountId, gain > BigInt(0) ? 'REVENUE' : 'EXPENSE');
    lines.push({ accountId: result.id, amount: -gain });
  }
  await postJournal(tx, { organizationId, actorId, date, memo: asset.tag + ' disposal', source: 'ASSET_DISPOSAL', reference: asset.id, lines });
  await tx.$executeRaw`UPDATE "FinanceAsset" SET "disposedOn"=${date}::date WHERE "id"=${asset.id}`;
  return asset.id;
}

export async function executeFinanceAction(context: Context, action: string): Promise<string | number> {
  const { tx, organizationId, actorId, body, isGroup } = context;
  switch (action) {
    case 'ADD_ACCOUNT': {
      const id = randomUUID();
      const kind = field(body.kind, 'account type');
      if (!['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(kind) || (body.cash === true && kind !== 'ASSET')) invalid('Select an account type. Only assets can be cash accounts.');
      const count = await tx.$executeRaw`
        INSERT INTO "FinanceAccount" ("id","organizationId","code","name","kind","cash")
        VALUES (${id},${organizationId},${field(body.code, 'account code', 30).toUpperCase()},${field(body.name, 'account name')},${kind},${body.cash === true})
        ON CONFLICT ("organizationId","code") DO NOTHING
      `;
      if (!count) invalid('This account code is already in use.', 409);
      return id;
    }
    case 'POST_JOURNAL': {
      const groupOnly = body.groupOnly === true;
      if (groupOnly && !isGroup) invalid('Group eliminations must be posted in the holding entity.');
      const input = body.lines;
      if (!Array.isArray(input) || input.length < 2 || input.length > 100) invalid('Enter two to 100 journal lines.');
      const lines = [];
      for (const line of input) {
        const ledgerAccount = await account(tx, organizationId, line?.accountId);
        if (groupOnly && ledgerAccount.cash) invalid('Use non-cash accounts for consolidation eliminations.');
        const departmentId = line.departmentId ? field(line.departmentId, 'department') : null;
        const projectId = line.projectId ? field(line.projectId, 'project') : null;
        if (departmentId && !await tx.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } })) invalid('Invalid department for this entity.');
        if (projectId && !await tx.project.findFirst({ where: { id: projectId, organizationId, ...(departmentId ? { departmentId } : {}) }, select: { id: true } })) invalid('Invalid project for this entity and department.');
        lines.push({ accountId: ledgerAccount.id, amount: moneyMinor(line.amount, { signed: true }), departmentId, projectId });
      }
      return postJournal(tx, { organizationId, actorId, date: dateField(body.date, 'posting date'), memo: field(body.memo, 'journal explanation', 1000),
        source: groupOnly ? 'ELIMINATION' : 'MANUAL', reference: field(body.reference, 'journal reference'), groupOnly, lines });
    }
    case 'REVERSE_JOURNAL': {
      const originalId = field(body.journalId, 'journal');
      const [original] = await tx.$queryRaw<{ memo: string; date: string; groupOnly: boolean }[]>`
        SELECT "memo","date"::text AS "date","groupOnly" FROM "FinanceJournal"
        WHERE "id"=${originalId} AND "organizationId"=${organizationId} AND "source" IN ('MANUAL','ELIMINATION')
      `;
      if (!original) invalid('Select a manual journal or elimination to reverse.');
      const date = dateField(body.date, 'reversal date');
      if (date < original.date) invalid('Reversal date cannot precede the original journal.');
      const lines = await tx.$queryRaw<{ accountId: string; amount: bigint; departmentId: string | null; projectId: string | null }[]>`
        SELECT "accountId", -"amountMinor" AS amount, "departmentId","projectId" FROM "FinanceJournalLine" WHERE "journalId"=${originalId}
      `;
      return postJournal(tx, { organizationId, actorId, date, memo: field(body.memo, 'reversal reason', 1000),
        source: 'REVERSAL', reference: originalId, groupOnly: original.groupOnly, lines });
    }
    case 'RECORD_OPEN_ITEM': return recordOpenItem(context);
    case 'SETTLE_OPEN_ITEM': return settleOpenItem(context);
    case 'IMPORT_STATEMENT': return importStatement(context);
    case 'MATCH_STATEMENT': return matchStatement(context);
    case 'CLOSE_PERIOD': return closePeriod(context);
    case 'ADD_CASH_PLAN': {
      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "FinanceCashPlan" ("id","organizationId","date","label","reference","amountMinor")
        VALUES (${id},${organizationId},${dateField(body.date, 'expected date')}::date,${field(body.label, 'cash flow label')},${field(body.reference, 'forecast reference')},${moneyMinor(body.amount, { signed: true })})
      `;
      return id;
    }
    case 'REMOVE_CASH_PLAN': {
      const id = field(body.planId, 'forecast item');
      const count = await tx.$executeRaw`UPDATE "FinanceCashPlan" SET "active"=false WHERE "id"=${id} AND "organizationId"=${organizationId} AND "active"`;
      if (!count) invalid('This forecast item is unavailable.');
      return id;
    }
    case 'REGISTER_ASSET': return registerAsset(context);
    case 'MOVE_ASSET':
    case 'DEPRECIATE_ASSET':
    case 'DISPOSE_ASSET': return changeAsset(context, action);
    default: return invalid('Choose an accounting action.');
  }
}
