import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { account, assertOpen, assetDate, dateField, field, invalid, moneyMinor, postJournal, type FinanceTx } from './ledger';

import { postingSources } from './sources';

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
    JOIN "FinanceJournal" j ON j."id"=l."journalId" AND NOT j."groupOnly" AND j."source"<>'OPENING'
    WHERE s."organizationId"=${organizationId} AND s."id"=${field(body.statementId, 'statement line')}
      AND s."matchedLineId" IS NULL AND NOT EXISTS (SELECT 1 FROM "FinanceStatementLine" existing WHERE existing."matchedLineId"=l."id")
  `;
  if (!line) invalid('Select an unmatched ledger line with the same account and amount.', 409);
  await assertOpen(tx, organizationId, line.date < line.ledgerDate ? line.date : line.ledgerDate);
  await tx.$executeRaw`UPDATE "FinanceStatementLine" SET "matchedLineId"=${body.lineId as string},"matchedAt"=now() WHERE "id"=${line.id}`;
  return line.id;
}

async function unmatchStatement({ tx, organizationId, body }: Context) {
  const [match] = await tx.$queryRaw<{ id: string; date: string; ledgerDate: string }[]>`
    SELECT s."id",s."date"::text AS "date",j."date"::text AS "ledgerDate"
    FROM "FinanceStatementLine" s JOIN "FinanceJournalLine" l ON l."id"=s."matchedLineId"
    JOIN "FinanceJournal" j ON j."id"=l."journalId"
    WHERE s."id"=${field(body.statementId, 'statement line')} AND s."organizationId"=${organizationId}
  `;
  if (!match) invalid('Choose a matched statement transaction.');
  await assertOpen(tx, organizationId, match.date < match.ledgerDate ? match.date : match.ledgerDate);
  await tx.$executeRaw`UPDATE "FinanceStatementLine" SET "matchedLineId"=NULL,"matchedAt"=NULL WHERE "id"=${match.id}`;
  return match.id;
}

async function assignReconciliation({ tx, organizationId, body }: Context) {
  const targetType = field(body.targetType, 'reconciliation record type');
  const targetId = field(body.targetId, 'reconciliation record');
  const ownerId = field(body.ownerId, 'finance officer');
  const owner = await tx.employee.findFirst({
    where: { id: ownerId, role: { in: ['GMD','SUPER_ADMIN','SYSTEM_ADMIN'] }, status: 'ACTIVE', approvalStatus: 'APPROVED' },
    select: { id: true },
  });
  if (!owner) invalid('Choose an active finance officer.');
  const records = targetType === 'STATEMENT' ? await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "FinanceStatementLine"
    WHERE "id"=${targetId} AND "organizationId"=${organizationId} AND "matchedLineId" IS NULL
  ` : targetType === 'LEDGER' ? await tx.$queryRaw<{ id: string }[]>`
    SELECT l."id" FROM "FinanceJournalLine" l JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
    JOIN "FinanceJournal" j ON j."id"=l."journalId" AND NOT j."groupOnly" AND j."source"<>'OPENING'
    WHERE l."id"=${targetId} AND l."organizationId"=${organizationId}
      AND NOT EXISTS (SELECT 1 FROM "FinanceStatementLine" s WHERE s."matchedLineId"=l."id")
  ` : [];
  if (!records.length) invalid('Select an unresolved reconciliation record.');
  await tx.$executeRaw`
    INSERT INTO "FinanceReconciliationAssignment" ("organizationId","targetType","targetId","ownerId")
    VALUES (${organizationId},${targetType},${targetId},${ownerId})
    ON CONFLICT ("organizationId","targetType","targetId") DO UPDATE SET "ownerId"=EXCLUDED."ownerId"
  `;
  return targetId;
}

async function recordStatementBalance({ tx, organizationId, body }: Context) {
  const bank = await account(tx, organizationId, body.accountId);
  if (!bank.cash) invalid('Choose a bank or cash account.');
  const month = dateField(field(body.month, 'period', 7) + '-01', 'period');
  await assertOpen(tx, organizationId, month);
  const opening = moneyMinor(body.opening, { signed: true, zero: true });
  const closing = moneyMinor(body.closing, { signed: true, zero: true });
  await tx.$executeRaw`
    INSERT INTO "FinanceStatementBalance" ("organizationId","accountId","month","openingMinor","closingMinor","reference")
    VALUES (${organizationId},${bank.id},${month}::date,${opening},${closing},${field(body.reference, 'statement reference')})
    ON CONFLICT ("accountId","month") DO UPDATE SET "openingMinor"=EXCLUDED."openingMinor","closingMinor"=EXCLUDED."closingMinor","reference"=EXCLUDED."reference"
  `;
  return bank.id + ':' + month;
}

async function closePeriod({ tx, organizationId, actorId, body }: Context) {
  const month = dateField(field(body.month, 'period', 7) + '-01', 'period');
  await assertOpen(tx, organizationId, month);
  if (month >= new Date().toISOString().slice(0, 7) + '-01') invalid('Close a month after it ends.');
  if (body.reviewed !== true) invalid('Confirm review of accruals, open invoices, assets and reconciliation.');
  const [pending] = await tx.$queryRaw<{ unmatched: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM "FinanceStatementLine"
      WHERE "organizationId"=${organizationId} AND "date"<${month}::date+interval '1 month' AND "matchedLineId" IS NULL)
      OR EXISTS (SELECT 1 FROM "FinanceJournalLine" l JOIN "FinanceJournal" j ON j."id"=l."journalId"
      JOIN "FinanceAccount" a ON a."id"=l."accountId" AND a."cash"
      WHERE l."organizationId"=${organizationId} AND NOT j."groupOnly" AND j."source"<>'OPENING' AND j."date"<${month}::date+interval '1 month'
      AND NOT EXISTS (SELECT 1 FROM "FinanceStatementLine" s WHERE s."matchedLineId"=l."id")) AS unmatched
  `;
  if (pending.unmatched) invalid('Reconcile outstanding cash entries and statement lines before closing the period.', 409);
  const balances = await tx.$queryRaw<{ name: string }[]>`
    WITH balances AS (
      SELECT a."id",a."name",
        COALESCE(sum(l."amountMinor") FILTER (WHERE j."date"<${month}::date OR j."source"='OPENING'),0) AS opening,
        COALESCE(sum(l."amountMinor") FILTER (WHERE j."id" IS NOT NULL),0) AS closing,
        count(j."id") AS entries
      FROM "FinanceAccount" a LEFT JOIN "FinanceJournalLine" l ON l."accountId"=a."id"
      LEFT JOIN "FinanceJournal" j ON j."id"=l."journalId" AND j."date"<${month}::date+interval '1 month' AND NOT j."groupOnly"
      WHERE a."organizationId"=${organizationId} AND a."cash"
      GROUP BY a."id"
    ), statement AS (
      SELECT "accountId",COALESCE(sum("amountMinor"),0) AS movement, count(*) AS entries
      FROM "FinanceStatementLine"
      WHERE "organizationId"=${organizationId} AND "date">=${month}::date AND "date"<${month}::date+interval '1 month'
      GROUP BY "accountId"
    )
    SELECT b."name" FROM balances b LEFT JOIN statement st ON st."accountId"=b."id"
    LEFT JOIN "FinanceStatementBalance" s ON s."accountId"=b."id" AND s."month"=${month}::date
    WHERE (b.entries>0 OR COALESCE(st.entries,0)>0 OR s."accountId" IS NOT NULL) AND (
      s."accountId" IS NULL OR s."openingMinor"<>b.opening OR s."closingMinor"<>b.closing OR
      s."openingMinor"+COALESCE(st.movement,0)<>s."closingMinor"
    )
  `;
  if (balances.length) invalid('Statement opening and closing balances do not reconcile for ' + balances.map(row => row.name).join(', ') + '.', 409);
  const assets = await tx.$queryRaw<Asset[]>`
    SELECT *, "acquiredOn"::text AS "acquiredOn" FROM "FinanceAsset"
    WHERE "organizationId"=${organizationId} AND "disposedOn" IS NULL AND "postedMonths"<"months"
  `;
  if (assets.some(asset => asset.acquiredOn.slice(0,7) <= month.slice(0,7) &&
      assetDate(asset.acquiredOn,asset.postedMonths).slice(0,7) <= month.slice(0,7))) invalid('Post depreciation due through this period before closing.', 409);
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
    case 'SEED_STARTER_ACCOUNTS': {
      const starter: Array<[string, string, 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE', boolean]> = [
        ['1010', 'Monnify Treasury Wallet', 'ASSET', true],
        ['1020', 'Operating Bank Account', 'ASSET', true],
        ['1200', 'Accounts Receivable', 'ASSET', false],
        ['1500', 'Fixed Assets', 'ASSET', false],
        ['1510', 'Accumulated Depreciation', 'ASSET', false],
        ['2010', 'Accounts Payable', 'LIABILITY', false],
        ['2020', 'Staff Wallet Liability', 'LIABILITY', false],
        ['2030', 'Intercompany Clearing', 'LIABILITY', false],
        ['3000', 'Retained Earnings', 'EQUITY', false],
        ['4000', 'Operating Revenue', 'REVENUE', false],
        ['5000', 'Payroll & Salaries', 'EXPENSE', false],
        ['5100', 'Operating Expenses', 'EXPENSE', false],
        ['5200', 'Bank & Monnify Charges', 'EXPENSE', false],
      ];
      let inserted = 0;
      for (const [code, name, kind, cash] of starter) {
        const count = await tx.$executeRaw`
          INSERT INTO "FinanceAccount" ("id","organizationId","code","name","kind","cash")
          VALUES (${randomUUID()},${organizationId},${code},${name},${kind},${cash})
          ON CONFLICT ("organizationId","code") DO NOTHING
        `;
        inserted += Number(count);
      }
      return inserted;
    }
    case 'POST_JOURNAL': {
      const groupOnly = body.groupOnly === true;
      const opening = body.opening === true;
      const postingDate = dateField(body.date, 'posting date');
      if (opening) {
        const [existing] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FinanceJournal" WHERE "organizationId"=${organizationId} LIMIT 1`;
        if (existing || groupOnly || !postingDate.endsWith('-01')) invalid('Post opening balances as the entity’s first journal on the first day of a month.');
      }
      if (groupOnly && !isGroup) invalid('Group eliminations must be posted in the holding entity.');
      const input = body.lines;
      if (!Array.isArray(input) || input.length < 2 || input.length > 100) invalid('Enter two to 100 journal lines.');
      const lines = [];
      for (const line of input) {
        const ledgerAccount = await account(tx, organizationId, line?.accountId);
        if (opening && ['REVENUE','EXPENSE'].includes(ledgerAccount.kind)) invalid('Opening balances use balance-sheet accounts.');
        if (groupOnly && ledgerAccount.cash) invalid('Use non-cash accounts for consolidation eliminations.');
        const departmentId = line.departmentId ? field(line.departmentId, 'department') : null;
        const projectId = line.projectId ? field(line.projectId, 'project') : null;
        if (departmentId && !await tx.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } })) invalid('Invalid department for this entity.');
        if (projectId) {
          const [schema] = await tx.$queryRaw<{ available: boolean }[]>`SELECT to_regclass('"Project"') IS NOT NULL AS available`;
          if (!schema.available || !await tx.project.findFirst({ where: { id: projectId, organizationId, ...(departmentId ? { departmentId } : {}) }, select: { id: true } })) {
            invalid('Invalid project for this entity and department.');
          }
        }
        lines.push({ accountId: ledgerAccount.id, amount: moneyMinor(line.amount, { signed: true }), departmentId, projectId });
      }
      return postJournal(tx, { organizationId, actorId, date: postingDate, memo: field(body.memo, 'journal explanation', 1000),
        source: groupOnly ? 'ELIMINATION' : opening ? 'OPENING' : 'MANUAL', reference: field(body.reference, 'journal reference'), groupOnly, lines });
    }
    case 'POST_SOURCE': {
      const id = field(body.sourceId, 'source transaction');
      const kind = field(body.kind, 'source type');
      const [source] = await postingSources(tx, organizationId, { id, kind });
      if (!source) invalid('This source is unavailable or was already posted.', 409);
      const debit = await account(tx, organizationId, body.debitAccountId);
      const credit = await account(tx, organizationId, body.creditAccountId);
      if (debit.id === credit.id) invalid('Select distinct debit and credit accounts.');
      if (kind === 'WALLET_CREDIT' && (debit.cash || credit.cash)) invalid('An internal wallet credit does not itself move cash.');
      if (kind === 'RECORDED_PAYMENT' && !credit.cash) invalid('Credit the cash account used for the recorded payment.');
      return postJournal(tx, { organizationId, actorId, date: source.date, memo: source.reference + ' · ' + source.name,
        source: kind, reference: id, lines: [{ accountId: debit.id, amount: source.amountMinor }, { accountId: credit.id, amount: -source.amountMinor }] });
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
    case 'UNMATCH_STATEMENT': return unmatchStatement(context);
    case 'ASSIGN_RECONCILIATION': return assignReconciliation(context);
    case 'STATEMENT_BALANCE': return recordStatementBalance(context);
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
