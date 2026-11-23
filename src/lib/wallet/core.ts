import { normalizeSystemRole } from '@/lib/auth';
import { type CustomAdminPermissionsMap, getAllowedSubsidiariesForModule, hasActionPermission, parsePermissionsJson } from '@/lib/admin-permissions';
import { isStaffAccount } from '@/lib/portal-access';
import {walletWorkerStatus} from './runtime-state';
import { canActorApproveFunds, canApproveWalletRelease, financialApproverLabel } from '@/lib/gmd-access';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { hasStaffAppModuleAccess } from '@/lib/staff-modules';
import { prisma } from '@/lib/prisma';
import { STANDARD_NIGERIAN_BANKS } from '@/lib/monnify';

export type WalletActor = {
  id: string;
  role: string;
  legalName: string;
  customAdminPermissions?: CustomAdminPermissionsMap | null;
};
export {WalletError} from './errors';
import {WalletError} from './errors';
export function walletEnabled() {
  if (process.env.BEMS_WALLET_ENABLED === 'false') return false;
  return Boolean(process.env.MONNIFY_API_KEY && process.env.MONNIFY_SECRET_KEY);
}
export function requireWallet() {
  if (!walletEnabled()) throw new WalletError('WALLET_NOT_ENABLED', 'Wallets are not enabled for this environment.', 503);
}
export function requireCommitments() {
  requireWallet();
  const env = process.env.MONNIFY_ENVIRONMENT || process.env.MONNIFY_ENV || 'live';
  const liveAuthorized = process.env.BEMS_WALLET_LIVE_ENABLED !== 'false'
    && process.env.BEMS_WALLET_TRANSFERS_ENABLED !== 'false'
    && process.env.BEMS_MONNIFY_VALIDATION_ENABLED !== 'false'
    && Boolean(
      process.env.MONNIFY_MERCHANT_CODE?.trim() ||
      process.env.MONNIFY_CONTRACT_CODE?.trim() ||
      process.env.MONNIFY_WALLET_ACCOUNT_NUMBER?.trim() ||
      process.env.MONNIFY_SOURCE_ACCOUNT?.trim()
    );
  if (!['sandbox','live'].includes(env) || (env === 'live' && !liveAuthorized)) {
    throw new WalletError('LIVE_WALLET_NOT_ACTIVATED', 'Live wallet commitments are not activated.', 503);
  }
}
export function minorUnits(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d{0,14}$/.test(value)) throw new WalletError('INVALID_AMOUNT', 'Use a positive integer amount in kobo.');
  return BigInt(value);
}
export function walletJson(value: unknown) { return JSON.parse(JSON.stringify(value, (_, x) => typeof x === 'bigint' ? x.toString() : x)); }
export function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value, (_, x) => typeof x === 'bigint' ? x.toString() : x)).digest('hex'); }
function sameHash(a: string, b: string) {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
type Tx = Prisma.TransactionClient;
export async function liveWalletActor(tx: Tx, actor: WalletActor, authority: boolean | 'GMD' = false) {
  const employee = await tx.employee.findUnique({ where: { id: actor.id } });
  if (!employee || normalizeSystemRole(employee.role, employee.customAdminProfileId) !== normalizeSystemRole(actor.role) || employee.approvalStatus !== 'APPROVED' ||
      !(employee.status === 'ACTIVE' || (!authority && isStaffAccount(employee.role) && employee.status === 'ON_LEAVE'))) {
    throw new WalletError('ACCOUNT_NOT_AUTHORIZED', 'Your account is no longer authorized.', 403);
  }
  if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'STAFF', 'CUSTOM_ADMIN'].includes(employee.role)) throw new WalletError('ACCOUNT_NOT_AUTHORIZED', 'Account role is not supported.', 403);
  const normalizedActor = { id: employee.id, role: normalizeSystemRole(employee.role, employee.customAdminProfileId) };
  if (authority && !(authority === 'GMD' ? canApproveWalletRelease(normalizedActor) : await canActorApproveFunds(normalizedActor, tx))) {
    throw new WalletError('GMD_REQUIRED', 'Only the designated GMD can release funds (unless explicitly permitted in Control Center).', 403);
  }
  return employee;
}
export async function walletTransaction<T>(work: (tx: Tx) => Promise<T>) {
  requireWallet();
  // All funding commitments serialize before taking snapshots; READ COMMITTED
  // sees a preceding committer after acquiring this transaction advisory lock.
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('bems-wallet-pool-v1', 0))`;
    return work(tx);
  }, { timeout: 60000 });
}
type Pool = { id: string; environment: string; sourceAccount: string; availableMinor: bigint; feeReserveMinor: bigint; observedAt: Date; observationId: string; paused: boolean; version: number };
export async function fundingCommitments(tx: Tx) {
  const [totals] = await tx.$queryRaw<Array<{ envelopeMinor: bigint; liabilityMinor: bigint }>>`
    SELECT (SELECT COALESCE(sum("remainingMinor"),0)::bigint FROM "WalletBudgetEnvelope" WHERE "status" = 'ACTIVE') AS "envelopeMinor",
      (SELECT COALESCE(sum("availableMinor" + "heldMinor"),0)::bigint FROM "WalletCreditLot") + (SELECT COALESCE(sum("amountMinor"),0)::bigint FROM "WalletWithdrawal" WHERE "targetType"='VENDOR' AND "status" IN ('HELD','SUBMITTING','PENDING','UNKNOWN')) AS "liabilityMinor"`;
  return totals;
}
export async function fundingState(tx: Tx, enforce = false) {
  const [pool] = await tx.$queryRaw<Pool[]>`SELECT * FROM "WalletFundingPool" WHERE "id" = 'MONNIFY_NGN'`;
  if (!pool) throw new WalletError('FUNDING_NOT_CONFIGURED', 'Monnify funding has not been configured.', 503);
  const totals = await fundingCommitments(tx);
  const freeMinor = pool.availableMinor - pool.feeReserveMinor - totals.envelopeMinor - totals.liabilityMinor;
  const age = Date.now() - pool.observedAt.getTime();
  const fresh = age >= -5000 && age <= 30000;
  const env = process.env.MONNIFY_ENVIRONMENT || process.env.MONNIFY_ENV || 'live';
  const sourceAcc = process.env.MONNIFY_SOURCE_ACCOUNT || process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || '';
  const configured = pool.environment === env && (!sourceAcc || pool.sourceAccount === sourceAcc);
  if (enforce) {
    if (!configured) throw new WalletError('FUNDING_NOT_CONFIGURED', 'Funding source/environment does not match server configuration.', 503);
    if (pool.paused) throw new WalletError('WALLET_PAUSED', 'Wallet commitments are paused.', 409);
    if (!fresh) throw new WalletError('BALANCE_STALE', 'Refresh the verified Monnify funding balance before committing funds.', 409);
    const [events]=await tx.$queryRaw<any[]>`SELECT count(*)::integer AS "count" FROM "WalletProviderInbox" WHERE "processedAt" IS NULL`;
    if(events.count)throw new WalletError('FUNDING_RECONCILIATION_REQUIRED','Provider events are awaiting authenticated transfer reconciliation.',409);
    if (freeMinor < BigInt(0)) throw new WalletError('FUNDING_RECONCILIATION_REQUIRED', 'Credited staff funds exceed verified Monnify balance. Top up the Monnify funding account before new releases.', 409);
  }
  return { currency: 'NGN', environment:pool.environment,sourceLastFour:pool.sourceAccount.slice(-4), availableMinor: pool.availableMinor, feeReserveMinor: pool.feeReserveMinor, ...totals, freeMinor, observedAt: pool.observedAt, fresh, paused: pool.paused, configured, basis: 'CONSERVATIVE_PROVIDER_AVAILABLE_MINUS_ALL_UNSETTLED_COMMITMENTS' };
}
export async function journal(tx: Tx, actorId: string, kind: string, reference: string, from: string, to: string, amount: bigint) {
  const id = randomUUID();
  await tx.$executeRaw`INSERT INTO "WalletJournal" ("id","kind","reference","actorId") VALUES (${id},${kind},${reference},${actorId})`;
  await tx.$executeRaw`INSERT INTO "WalletJournalEntry" ("id","journalId","accountKey","amountMinor") VALUES
    (${randomUUID()},${id},${from},${-amount}), (${randomUUID()},${id},${to},${amount})`;
}
export type EnvelopeInput = { organizationId: string; label: string; amountMinor: string; idempotencyKey: string; parentId?: string };
export async function createFundedEnvelope(actor:WalletActor,input:EnvelopeInput) {
  requireCommitments();
  await (await import('./monnify-balance')).ensureWalletFundingFresh(actor);
  return walletTransaction(tx=>createFundedEnvelopeTx(tx,actor,input));
}
export async function createFundedEnvelopeTx(tx:Tx,actor:WalletActor,input:EnvelopeInput) {
  requireCommitments();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('bems-wallet-pool-v1',0))`;
  const amount = minorUnits(input.amountMinor);
  const rawLabel = String(input.label || '').trim();
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new WalletError('INVALID_ENVELOPE', 'A valid idempotency key is required.');
  if (rawLabel.length > 160) throw new WalletError('INVALID_ENVELOPE', 'Label must be 160 characters or fewer.');

    await liveWalletActor(tx, actor);
    if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(actor.role)) throw new WalletError('NOT_PERMITTED', 'Budget administration requires executive authority.', 403);
    const org = await tx.organization.findFirst({ where: { id: input.organizationId, status: 'ACTIVE', defaultCurrency: 'NGN' }, select: { id: true, legalName: true } });
    if (!org) throw new WalletError('INVALID_ORGANIZATION', 'Choose an active NGN organization.');
    const label = rawLabel || (!input.parentId ? `${org.legalName} Budget` : '');
    if (!label) throw new WalletError('INVALID_ENVELOPE', 'Select a department or enter an allocation label.');
    const [old] = await tx.$queryRaw<any[]>`SELECT * FROM "WalletBudgetEnvelope" WHERE "idempotencyKey" = ${input.idempotencyKey}`;
    if (old) {
      if (old.createdById !== actor.id || old.organizationId !== input.organizationId || old.label !== label || old.allocatedMinor !== amount || (old.parentId||null)!==(input.parentId||null)) throw new WalletError('IDEMPOTENCY_CONFLICT', 'This key was used for another budget allocation.', 409);
      return walletJson(old);
    }
    const state = await fundingState(tx, true);
    if (input.parentId) {
      const [parent]=await tx.$queryRaw<any[]>`SELECT e.*,o."type" AS "organizationType" FROM "WalletBudgetEnvelope" e JOIN "Organization" o ON o."id"=e."organizationId" WHERE e."id"=${input.parentId} AND e."status"='ACTIVE' FOR UPDATE OF e`;
      if(!parent||parent.remainingMinor<amount||(parent.organizationId!==input.organizationId&&parent.organizationType!=='GROUP'))throw new WalletError('BUDGET_SCOPE_MISMATCH','The parent budget cannot cover this subdivision.',409);
      await tx.$executeRaw`UPDATE "WalletBudgetEnvelope" SET "remainingMinor"="remainingMinor"-${amount},"version"="version"+1 WHERE "id"=${input.parentId}`;
    } else if (amount > state.freeMinor) {
      throw new WalletError('INSUFFICIENT_FUNDED_CAPACITY', 'Subsidiary budget cannot exceed the available Monnify balance.', 409);
    }
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "WalletBudgetEnvelope" ("id","organizationId","label","allocatedMinor","remainingMinor","createdById","idempotencyKey","parentId") VALUES (${id},${input.organizationId},${label},${amount},${amount},${actor.id},${input.idempotencyKey},${input.parentId||null})`;
    await journal(tx, actor.id, 'BUDGET_ALLOCATED', id, input.parentId?'ENVELOPE:'+input.parentId:'UNALLOCATED:NGN', 'ENVELOPE:' + id, amount);
    return { id, organizationId: input.organizationId, label, allocatedMinor: amount.toString(), remainingMinor: amount.toString() };
}
export async function readOwnWallet(actor: WalletActor) {
  if (!hasStaffAppModuleAccess(actor as any, 'finance')) {
    throw new WalletError(
      'MODULE_DISABLED',
      'Financial Management module is not enabled for your Staff App account.',
      403
    );
  }
  // Read-only review stays available while monetary execution is disabled.
  return prisma.$transaction(async tx => {
    const employee = await liveWalletActor(tx, actor);
    if(!isStaffAccount(actor.role))throw new WalletError('STAFF_WALLET_REQUIRED','Use the executive funding dashboard for company payments.',403);
    const credits = await tx.$queryRaw<any[]>`SELECT "id","sourceType","sourceId","organizationId","category","amountMinor","availableMinor","heldMinor","settledMinor","returnedMinor","frozen","createdAt" FROM "WalletCreditLot" WHERE "employeeId" = ${actor.id} ORDER BY "createdAt" DESC LIMIT 100`;
    const [totals] = await tx.$queryRaw<any[]>`SELECT COALESCE(sum("availableMinor"),0)::bigint AS "availableMinor", COALESCE(sum("heldMinor"),0)::bigint AS "heldMinor", COALESCE(sum("settledMinor"),0)::bigint AS "settledMinor" FROM "WalletCreditLot" WHERE "employeeId" = ${actor.id}`;
    const rawBanks = await tx.$queryRaw<any[]>`SELECT "id","bankCode","accountNumber",right("accountNumber",4) AS "lastFour","accountName","verifiedAt" FROM "WalletBankAccount" WHERE "employeeId" = ${actor.id} AND "active" ORDER BY "verifiedAt" DESC`;
    const bankNameByCode = new Map(STANDARD_NIGERIAN_BANKS.map(b => [b.code, b.name]));

    const regBankName = employee.salaryBankName || employee.bankName || '';
    const regAccountNumber = employee.salaryAccountNumber || employee.accountNumber || '';
    const regAccountName = employee.salaryAccountName || employee.accountName || employee.legalName || '';

    const banks = rawBanks.map(b => ({
      ...b,
      bankName: bankNameByCode.get(String(b.bankCode)) || regBankName || `Bank (${b.bankCode})`,
    }));
    const hasRegBank = rawBanks.some(b => b.accountNumber === regAccountNumber);
    if (!hasRegBank && regAccountNumber) {
      banks.unshift({
        id: 'reg-' + actor.id,
        bankCode: 'DEFAULT',
        bankName: regBankName,
        accountNumber: regAccountNumber,
        lastFour: regAccountNumber.slice(-4),
        accountName: regAccountName,
        isRegistrationDefault: true,
        verifiedAt: employee.createdAt,
      });
    }

    const withdrawals = await tx.$queryRaw<any[]>`SELECT "id","amountMinor","feeMinor","reference","status","providerStatus","accountNumber",right("accountNumber",4) AS "lastFour","accountName","createdAt" FROM "WalletWithdrawal" WHERE "employeeId" = ${actor.id} ORDER BY "createdAt" DESC LIMIT 100`;
    return walletJson({
      walletMode: walletEnabled(),
      currency: 'NGN',
      environment: process.env.MONNIFY_ENVIRONMENT || process.env.MONNIFY_ENV || 'live',
      ...totals,
      credits,
      banks,
      registrationBank: regAccountNumber ? { bankName: regBankName, accountNumber: regAccountNumber, accountName: regAccountName } : null,
      withdrawals,
      withdrawalsEnabled: walletEnabled() && process.env.BEMS_WALLET_TRANSFERS_ENABLED !== 'false',
      withdrawalMessage: 'Withdraw only your approved available funds to your verified bank account. The company pays transfer fees.',
    });
  }, { maxWait: 10000, timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function readFundingDashboard(actor: WalletActor) {
  if(walletEnabled() && ['GMD','SUPER_ADMIN','SYSTEM_ADMIN'].includes(actor.role)) {
    try {
      await(await import('./monnify-balance')).ensureWalletFundingFresh(actor);
    } catch (error) {
      // Non-fatal: Allow reading the funding dashboard and budget envelopes even if provider check is pending or funding not configured.
      console.warn('Wallet funding fresh check warning:', error instanceof Error ? error.message : error);
    }
  }
  // Current-account/role checks below also apply in read-only review mode.
  return prisma.$transaction(async tx => {
    const emp = await liveWalletActor(tx, actor);
    const role = normalizeSystemRole(emp.role, emp.customAdminProfileId);
    if (role === 'CUSTOM_ADMIN') {
      const profile = emp.customAdminProfileId ? await tx.customAdminProfile.findUnique({
        where: { id: emp.customAdminProfileId },
        select: { permissionsJson: true },
      }) : null;
      const permissions = parsePermissionsJson(profile?.permissionsJson);
      if (!hasActionPermission(role, permissions, 'finance', 'Wallets & funded budgets', 'view_wallets')) {
        throw new WalletError('NOT_PERMITTED', 'Wallet viewing permission is required.', 403);
      }

      const allowed = getAllowedSubsidiariesForModule(role, permissions, 'finance');
      const organizations = await tx.organization.findMany({
        where: { status: 'ACTIVE', defaultCurrency: 'NGN', ...(allowed === 'ALL' ? {} : { id: { in: allowed } }) },
        select: { id: true, code: true, legalName: true, type: true, departments: { select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } } },
      });
      const organizationIds = organizations.map(({ id }) => id);
      const envelopes = organizationIds.length ? await tx.$queryRaw<unknown[]>`
        SELECT e."id", e."organizationId", e."label", e."allocatedMinor", e."remainingMinor",
               e."parentId", e."status", e."createdAt", e."createdById",
               o."legalName" AS "organizationName",
               creator."legalName" AS "createdByName", creator."role" AS "createdByRole"
        FROM "WalletBudgetEnvelope" e
        JOIN "Organization" o ON o."id" = e."organizationId"
        LEFT JOIN "Employee" creator ON creator."id" = e."createdById"
        WHERE e."organizationId" IN (${Prisma.join(organizationIds)})
        ORDER BY e."createdAt" DESC LIMIT 100
      ` : [];
      const staffWallets = organizationIds.length ? await tx.$queryRaw<unknown[]>`
        SELECT e."id", e."legalName", e."employeeNumber", e."role", c."organizationId" AS "subsidiaryId",
               o."legalName" AS "organizationName", sum(c."availableMinor")::bigint AS "availableMinor",
               sum(c."heldMinor")::bigint AS "heldMinor", sum(c."settledMinor")::bigint AS "settledMinor"
        FROM "WalletCreditLot" c JOIN "Employee" e ON e."id" = c."employeeId"
        JOIN "Organization" o ON o."id" = c."organizationId"
        WHERE c."organizationId" IN (${Prisma.join(organizationIds)})
        GROUP BY e."id", c."organizationId", o."legalName"
        ORDER BY "availableMinor" DESC, e."legalName" LIMIT 100
      ` : [];
      return walletJson({
        walletMode: walletEnabled(), scopedReadOnly: true, funding: null, envelopes, organizations, staffWallets,
        proposals: [], requests: [], vendors: [], transfers: [], payrollBatches: [], issues: [], journals: [],
        approvalLabel: financialApproverLabel(), canApprove: false,
      });
    }
    if (role !== 'GMD' && role !== 'SYSTEM_ADMIN') {
      throw new WalletError('NOT_PERMITTED', 'Wallet viewing permission is required.', 403);
    }
    const envelopes = await tx.$queryRaw<any[]>`
      SELECT e.*, o."legalName" AS "organizationName",
             creator."legalName" AS "createdByName", creator."role" AS "createdByRole"
      FROM "WalletBudgetEnvelope" e
      JOIN "Organization" o ON o."id" = e."organizationId"
      LEFT JOIN "Employee" creator ON creator."id" = e."createdById"
      ORDER BY e."createdAt" DESC LIMIT 100
    `;
    let funding;
    try { funding = await fundingState(tx); } catch (error) { if (error instanceof WalletError && error.code === 'FUNDING_NOT_CONFIGURED') funding = null; else throw error; }
    const proposals = await tx.$queryRaw<any[]>`SELECT p."id",p."sourceType",p."sourceId",p."amountMinor",p."category",p."confirmationHash",p."expiresAt",p."conversationId" FROM "WalletReleaseProposal" p WHERE p."status"='PENDING' AND p."expiresAt">now() ORDER BY p."createdAt" DESC LIMIT 100`;
    for (const p of proposals) p.items = await tx.$queryRaw<any[]>`SELECT i."id",i."sourceType",i."sourceId",i."employeeId",i."vendorId",i."organizationId",i."envelopeId",i."amountMinor",i."category", COALESCE(e."legalName",v."name") AS "employeeName",COALESCE(e."employeeNumber",'Vendor') AS "employeeNumber", o."legalName" AS "organizationName", r."requestNumber", r."title" AS "requestTitle", b."label" AS "envelopeLabel" FROM "WalletReleaseItem" i LEFT JOIN "Employee" e ON e."id"=i."employeeId" LEFT JOIN "Vendor" v ON v."id"=i."vendorId" JOIN "Organization" o ON o."id"=i."organizationId" JOIN "WalletBudgetEnvelope" b ON b."id"=i."envelopeId" LEFT JOIN "ExpenditureRequest" r ON i."sourceType"='REQUEST' AND r."id"=i."sourceId" WHERE i."proposalId"=${p.id} ORDER BY e."legalName",i."organizationId"`;
    for(const p of proposals){const r=p.sourceType==='REQUEST'?await tx.expenditureRequest.findUnique({where:{id:p.sourceId},select:{title:true,justification:true,requestNumber:true}}):null;const b=p.sourceType==='PAYROLL_BATCH'?await tx.payrollBatch.findUnique({where:{id:p.sourceId},select:{period:{select:{year:true,month:true}}}}):null;p.title=r?.title||(b?`Salary ${b.period.year}-${b.period.month}`:p.sourceType==='REQUEST_BATCH'?'Staff requisition batch':'Payment release');p.purpose=r?.justification||(p.sourceType==='REQUEST_BATCH'?`${p.items.length} staff requisitions`:'Approved net salary');p.requestNumber=r?.requestNumber;}
    const payrollBatches = await tx.payrollBatch.findMany({ where: { status: { in: ['SUBMITTED','APPROVED'] }, bulkFundedAt: null }, select: { id:true,totalNetMinor:true,version:true,period:{select:{year:true,month:true}},items:{select:{employeeId:true,netMinor:true,allocations:{select:{subsidiaryId:true}},employee:{select:{legalName:true}}}} }, take:50 });
    const issues = await tx.$queryRaw<any[]>`SELECT "id","reference","code","detail","createdAt" FROM "WalletReconciliationIssue" WHERE "resolvedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 100`;
    const requests = await tx.expenditureRequest.findMany({ where: { currency: 'NGN', paymentStatus: {in:['UNPAID','MONNIFY_FAILED','MONNIFY_REVERSED']}, approvalStatus: { in: ['SUBMITTED','IN_REVIEW','APPROVED'] }, disbursements: { none: {} }, OR:[{vendorId:{not:null}},{requester: { role: { in: ['STAFF','CUSTOM_ADMIN'] }, approvalStatus: 'APPROVED', status: { in: ['ACTIVE','ON_LEAVE'] } }}] }, select: { id: true, requestNumber: true, title: true, subsidiaryId: true, amountMinor: true, vendor:{select:{id:true,name:true}}, requester: { select: { legalName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    const transfers=await tx.$queryRaw<any[]>`SELECT w."id",w."reference",w."targetType",w."amountMinor",w."feeMinor",w."status",w."providerStatus",w."providerReference",w."createdAt",right(w."accountNumber",4) AS "lastFour",COALESCE(v."name",e."legalName") AS "beneficiaryName" FROM "WalletWithdrawal" w JOIN "Employee" e ON e."id"=w."employeeId" LEFT JOIN "Vendor" v ON v."id"=w."vendorId" ORDER BY w."createdAt" DESC LIMIT 100`;
    const vendors=await tx.$queryRaw<any[]>`SELECT "id","name","accountName",right(COALESCE("accountNumber",''),4) AS "lastFour","bankCode","verifiedBankAt" FROM "Vendor" ORDER BY "name" LIMIT 200`;
    const organizations = await tx.organization.findMany({ where: { status: 'ACTIVE', defaultCurrency: 'NGN' }, select: { id: true, code: true, legalName: true, type: true, departments: { select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } } } });
    const staffWallets = await tx.$queryRaw<any[]>`SELECT e."id", e."legalName", e."employeeNumber", e."role", COALESCE(a."subsidiaryId", '') AS "subsidiaryId", COALESCE(o."legalName", 'Unassigned') AS "organizationName", COALESCE(sum(c."availableMinor"),0)::bigint AS "availableMinor", COALESCE(sum(c."heldMinor"),0)::bigint AS "heldMinor", COALESCE(sum(c."settledMinor"),0)::bigint AS "settledMinor" FROM "Employee" e LEFT JOIN "EmployeeAssignment" a ON a."employeeId"=e."id" AND a."status"='ACTIVE' AND a."isPrimary"=true LEFT JOIN "Organization" o ON o."id"=a."subsidiaryId" LEFT JOIN "WalletCreditLot" c ON c."employeeId"=e."id" WHERE e."role" IN ('STAFF','CUSTOM_ADMIN') AND e."approvalStatus"='APPROVED' AND e."status" IN ('ACTIVE','ON_LEAVE') GROUP BY e."id", e."legalName", e."employeeNumber", e."role", a."subsidiaryId", o."legalName" ORDER BY "availableMinor" DESC, e."legalName" ASC LIMIT 100`;
    const journals = await tx.$queryRaw<any[]>`SELECT j."id", j."kind", j."reference", j."createdAt", j."actorId", actor."legalName" AS "actorName", actor."role" AS "actorRole", COALESCE(json_agg(json_build_object('id', je."id", 'accountKey', je."accountKey", 'amountMinor', je."amountMinor"::text)) FILTER (WHERE je."id" IS NOT NULL), '[]'::json) AS "entries" FROM "WalletJournal" j LEFT JOIN "Employee" actor ON actor."id"=j."actorId" LEFT JOIN "WalletJournalEntry" je ON je."journalId"=j."id" GROUP BY j."id", j."kind", j."reference", j."createdAt", j."actorId", actor."legalName", actor."role" ORDER BY j."createdAt" DESC LIMIT 50`;
    const [chargeMetrics] = await tx.$queryRaw<Array<{ transferChargesMinor: bigint; chargebackMinor: bigint; chargebackCount: number }>>`
      SELECT
        COALESCE(sum("feeMinor") FILTER (WHERE "feeMinor" > 0), 0)::bigint AS "transferChargesMinor",
        COALESCE(sum("amountMinor") FILTER (WHERE "status" IN ('FAILED', 'REVERSED')), 0)::bigint AS "chargebackMinor",
        count(*) FILTER (WHERE "status" IN ('FAILED', 'REVERSED'))::integer AS "chargebackCount"
      FROM "WalletWithdrawal"
    `;
    const chargesSummary = {
      feeReserveMinor: funding?.feeReserveMinor ?? BigInt(0),
      transferChargesMinor: chargeMetrics?.transferChargesMinor ?? BigInt(0),
      chargebackMinor: chargeMetrics?.chargebackMinor ?? BigInt(0),
      chargebackCount: Number(chargeMetrics?.chargebackCount ?? 0),
    };
    return walletJson({ walletMode:walletEnabled(), processing:walletWorkerStatus(), funding, chargesSummary, envelopes, proposals, requests, organizations, vendors, transfers, payrollBatches, issues, staffWallets, journals, approvalLabel: financialApproverLabel(), canApprove: walletEnabled() && (await canActorApproveFunds(actor)) });
  }, { maxWait: 10000, timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
