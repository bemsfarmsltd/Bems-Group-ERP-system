import { createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import { WalletError, hash, walletTransaction } from './core';
import { hasAuthorizedTransfer } from './transfer-authorization';
import { notifyExecutivesMonnifyWalletFunded } from '@/lib/notifications/monnify-funding';
export async function receiveMonnifyEvent(raw:string,signature:string|null) {
  if(Buffer.byteLength(raw)>65536)throw new WalletError('PAYLOAD_TOO_LARGE','Webhook exceeds the accepted size.',413);
  const secret=process.env.MONNIFY_SECRET_KEY;
  const env = process.env.MONNIFY_ENVIRONMENT || process.env.MONNIFY_ENV || 'live';
  const live = env === 'live';
  if(!secret)throw new WalletError('PROVIDER_NOT_CONFIGURED','Webhook verification is not configured.',503);
  if(live||signature){
    const sigMode = process.env.MONNIFY_WEBHOOK_SIGNATURE_MODE || 'HMAC_SHA512';
    if(sigMode!=='HMAC_SHA512')throw new WalletError('SIGNATURE_CONFIGURATION_REQUIRED','Confirm the merchant webhook signature protocol before activation.',503);
    const expected=createHmac('sha512',secret).update(raw).digest('hex');
    if(!signature||!/^[a-f0-9]{128}$/i.test(signature)||!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))throw new WalletError('INVALID_SIGNATURE','Webhook authentication failed.',401);
  }else if(env!=='sandbox')throw new WalletError('INVALID_SIGNATURE','Webhook authentication failed.',401);
  let body;try{body=JSON.parse(raw);}catch{throw new WalletError('INVALID_EVENT','Invalid event body.');}
  const reference =
    body?.eventData?.reference ||
    body?.eventData?.transactionReference ||
    body?.eventData?.paymentReference ||
    null;
  // Completion callbacks never create credits or settle withdrawals directly.
  // Even sandbox notifications can only wake a query of an existing reference.
  if (typeof body?.eventType !== 'string') return { received: true, ignored: true };
  const eventTypeUpper = body.eventType.toUpperCase();
  const isWalletCreditEvent =
    eventTypeUpper.includes('WALLET') ||
    eventTypeUpper.includes('CREDIT') ||
    eventTypeUpper.includes('FUND') ||
    eventTypeUpper === 'SUCCESSFUL_TRANSACTION';

  if (typeof reference !== 'string' && !isWalletCreditEvent) {
    return { received: true, ignored: true };
  }

  let notifyCredit: { deltaMinor: bigint; sourceAccount: string; reference: string | null } | null = null;

  const outcome = await walletTransaction(async tx => {
    if (typeof reference === 'string') {
      const [withdrawal] = await tx.$queryRaw<any[]>`SELECT "id","environment" FROM "WalletWithdrawal" WHERE "reference"=${reference}`;
      if (withdrawal && withdrawal.environment === env) {
        const n = await tx.$executeRaw`INSERT INTO "WalletProviderInbox" ("id","bodyHash","reference","eventType") VALUES (${randomUUID()},${hash(raw)},${reference},${body.eventType.slice(0, 100)}) ON CONFLICT ("bodyHash") DO NOTHING`;
        if (n) await tx.$executeRaw`UPDATE "WalletWithdrawal" SET "nextAttemptAt"=now() WHERE "id"=${withdrawal.id}`;
        return { received: true, duplicate: n === 0 };
      }
    }

    if (isWalletCreditEvent) {
      const rawAmount =
        body?.eventData?.amountPaid ??
        body?.eventData?.amount ??
        body?.eventData?.transactionAmount ??
        null;
      const numericAmount = typeof rawAmount === 'number' || typeof rawAmount === 'string' ? Number(rawAmount) : 0;
      const creditRef = typeof reference === 'string' ? reference : `CREDIT-${hash(raw).slice(0, 12)}`;
      const n = await tx.$executeRaw`INSERT INTO "WalletProviderInbox" ("id","bodyHash","reference","eventType") VALUES (${randomUUID()},${hash(raw)},${creditRef},${body.eventType.slice(0, 100)}) ON CONFLICT ("bodyHash") DO NOTHING`;
      if (n && Number.isFinite(numericAmount) && numericAmount > 0) {
        const curSource = process.env.MONNIFY_SOURCE_ACCOUNT || process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || 'MONNIFY';
        notifyCredit = {
          deltaMinor: BigInt(Math.round(numericAmount * 100)),
          sourceAccount: curSource,
          reference: creditRef,
        };
      }
      return { received: true, duplicate: n === 0, walletCreditAlerted: Boolean(notifyCredit) };
    }

    return { received: true, ignored: true };
  });

  if (notifyCredit) {
    const credit = notifyCredit as { deltaMinor: bigint; sourceAccount: string; reference: string | null };
    void notifyExecutivesMonnifyWalletFunded({
      deltaMinor: credit.deltaMinor,
      sourceAccount: credit.sourceAccount,
      reference: credit.reference,
      source: 'WEBHOOK',
    }).catch(() => {});
  }

  return outcome;
}
export async function validateMonnifyIntent(body:any,signature:string|null,timestamp:string|null){
  if(process.env.BEMS_MONNIFY_VALIDATION_ENABLED!=='true')throw new WalletError('VALIDATION_NOT_CONFIGURED','Transaction validation is disabled.',503);
  const secret=process.env.MONNIFY_SECRET_KEY,merchant=process.env.MONNIFY_MERCHANT_CODE;
  const reference=body?.type==='SINGLE'?body?.data?.reference:body?.data?.batchReference;
  if(!secret||!merchant||typeof reference!=='string')return {decision:'REJECT'};
  const expected=createHmac('sha256',secret).update(merchant+':'+body.type+':'+reference).digest('hex');
  const time=timestamp&&/^\d+$/.test(timestamp)?Number(timestamp)*(timestamp.length<=10?1000:1):Date.parse(timestamp||'');
  if(!signature||!/^[a-f0-9]{64}$/i.test(signature)||!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex'))||!Number.isFinite(time)||Math.abs(Date.now()-time)>300000)throw new WalletError('INVALID_SIGNATURE','Transaction validation authentication failed.',401);
  if(body.type!=='SINGLE')return {decision:'REJECT'};
  return walletTransaction(async tx=>{
    const [w]=await tx.$queryRaw<any[]>`SELECT * FROM "WalletWithdrawal" WHERE "reference"=${reference}`;
    const curEnv = process.env.MONNIFY_ENVIRONMENT || process.env.MONNIFY_ENV || 'live';
    if(!w||!w.submittedAt||!['SUBMITTING','PENDING','UNKNOWN'].includes(w.status)||w.environment!==curEnv||w.sourceAccount!==body.data.sourceAccountNumber||w.bankCode!==body.data.destinationBankCode||w.accountNumber!==body.data.destinationAccountNumber||body.data.currency!=='NGN')return {decision:'REJECT'};
    const {providerAmountMinor}=await import('./monnify-balance');
    if(providerAmountMinor(body.data.amount)!==w.amountMinor)return {decision:'REJECT'};
    const [pool] = await tx.$queryRaw<Array<{ paused: boolean; sourceAccount: string; environment: string }>>`
      SELECT "paused","sourceAccount","environment" FROM "WalletFundingPool" WHERE "id"='MONNIFY_NGN'
    `;
    if (!pool || pool.paused || pool.sourceAccount !== w.sourceAccount || pool.environment !== w.environment) {
      return { decision: 'REJECT' };
    }
    return { decision: await hasAuthorizedTransfer(tx, w) ? 'APPROVE' : 'REJECT' };
  });
}
