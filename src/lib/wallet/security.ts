import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyPassword,hashToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { WalletActor, WalletError, hash, liveWalletActor, minorUnits, requireWallet, walletTransaction } from './core';
import { sendEmail } from '@/lib/email';
import { approvalCredential, approvalOtpRequired, checkApprovalPin, matchesReleaseOtp, releaseOtpDigest } from './approval-security';
export type SecurityProof = { id: string; token: string; sessionHash: string };
export async function sessionBinding(request:Request,actorId:string){
 const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
 const rawCookie=request.headers.get('cookie')?.match(/(?:^|;\s*)bems_session=([^;]+)/)?.[1];
 const cookie=rawCookie?decodeURIComponent(rawCookie):null;
 for(const candidate of [bearer,cookie].filter(Boolean) as string[]){
  const session=await prisma.authSession.findUnique({where:{tokenHash:hashToken(candidate)},select:{employeeId:true,expiresAt:true}});
  if(session?.employeeId===actorId&&session.expiresAt>new Date())return hash('wallet-session:'+hashToken(candidate));
 }
 throw new WalletError('HUMAN_SESSION_REQUIRED','A current authenticated session is required for transaction confirmation.',401);
}
export function challengePayload(purpose: string, input: any) {
  if (purpose === 'RELEASE') {
    if (typeof input?.id !== 'string' || !/^[a-f0-9]{64}$/.test(input?.confirmationHash)) throw new WalletError('INVALID_CHALLENGE','An exact stored release is required.');
    if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 1000)) throw new WalletError('INVALID_CHALLENGE','Use an approval note of up to 1,000 characters.');
    return { id: input.id, confirmationHash: input.confirmationHash, ...(input.note ? { note: input.note } : {}) };
  }
  if (purpose === 'POOL_CONTROL') {
    if(input?.operation==='ACKNOWLEDGE_ISSUE'){if(typeof input.issueId!=='string'||typeof input.note!=='string'||input.note.trim().length<10||input.note.length>1000)throw new WalletError('INVALID_CHALLENGE','Identify the issue and explain its verified correction.');return {operation:input.operation,issueId:input.issueId,note:input.note.trim()};}
    if (!['PAUSE','ACTIVATE'].includes(input?.operation)) throw new WalletError('INVALID_CHALLENGE','Choose a funding control operation.');
    return { operation: input.operation };
  }
  if(purpose==='RETURN_PROJECT'){if(typeof input?.creditLotId!=='string'||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>1000||typeof input.idempotencyKey!=='string'||input.idempotencyKey.length<8||input.idempotencyKey.length>128)throw new WalletError('INVALID_RETURN','Select unused project funds and explain the return.');return {creditLotId:input.creditLotId,amountMinor:minorUnits(input.amountMinor).toString(),reason:input.reason.trim(),idempotencyKey:input.idempotencyKey};}
  if (purpose !== 'WITHDRAWAL') throw new WalletError('INVALID_CHALLENGE','Unsupported transaction purpose.');
  const amountMinor = minorUnits(input?.amountMinor).toString();
  if (typeof input.bankAccountId !== 'string' || typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128 || !Array.isArray(input.creditAllocations) || !input.creditAllocations.length || input.creditAllocations.length > 1000) throw new WalletError('INVALID_WITHDRAWAL','Select approved credit lots and a verified account.');
  const allocations = input.creditAllocations.map((a: any) => {
    if (typeof a?.creditLotId !== 'string') throw new WalletError('INVALID_WITHDRAWAL','A credit lot is required.');
    return { creditLotId: a.creditLotId, amountMinor: minorUnits(a.amountMinor).toString() };
  }).sort((a: any,b: any) => a.creditLotId.localeCompare(b.creditLotId));
  if (new Set(allocations.map((a: any) => a.creditLotId)).size !== allocations.length || allocations.reduce((n:bigint,a:any)=>n+BigInt(a.amountMinor),BigInt(0)) !== BigInt(amountMinor)) throw new WalletError('INVALID_WITHDRAWAL','Credit allocations must equal the withdrawal amount without duplicate lots.');
  return { amountMinor, bankAccountId: input.bankAccountId, idempotencyKey: input.idempotencyKey, creditAllocations: allocations };
}
export async function verifyWalletPassword(actor: WalletActor, password: unknown, authority: boolean | 'GMD' = false) {
  requireWallet();
  const rate = await checkRateLimit('wallet-password:'+actor.id,{windowMs:60000,maxAttempts:5});
  if (!rate.allowed) throw new WalletError('RATE_LIMITED','Too many security attempts. Try again shortly.',429);
  const employee = await prisma.$transaction(tx=>liveWalletActor(tx,actor,authority));
  if (typeof password !== 'string' || password.length > 256 || !await verifyPassword(password,employee.passwordHash)) throw new WalletError('PASSWORD_REQUIRED','Your current account password is required to confirm this transaction.',403);
  return hash(employee.passwordHash);
}
export async function issueWalletChallenge(actor: WalletActor, input: {purpose:string;payload:unknown;password?:unknown;pin?:unknown;sessionHash:string}) {
  const payload = challengePayload(input.purpose,input.payload);
  if (input.purpose === 'RELEASE') return issueReleaseChallenge(actor, payload, input.pin, input.sessionHash);
  const credentialHash = await verifyWalletPassword(actor,input.password,input.purpose === 'POOL_CONTROL' && (payload as any).operation !== 'PAUSE' ? 'GMD' : false);
  if(input.purpose==='POOL_CONTROL'&&!['GMD','SUPER_ADMIN','SYSTEM_ADMIN'].includes(actor.role))throw new WalletError('NOT_PERMITTED','Executive security authority is required.',403);
  const id=randomUUID(),token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+120000);
  await prisma.$executeRaw`INSERT INTO "WalletChallenge" ("id","actorId","purpose","payloadHash","tokenHash","sessionHash","credentialHash","expiresAt") VALUES (${id},${actor.id},${input.purpose},${hash(payload)},${hash(token)},${input.sessionHash},${credentialHash},${expiresAt})`;
  return {id,token,expiresAt};
}
function releasePayload(payload: unknown) {
  return challengePayload('RELEASE', payload) as { id: string; confirmationHash: string; note?: string };
}

async function issueReleaseChallenge(actor: WalletActor, input: unknown, pin: unknown, sessionHash: string) {
  const payload = releasePayload(input);
  if (typeof pin !== 'string') throw new WalletError('APPROVAL_PIN_REQUIRED', 'Enter your wallet approval PIN to continue.', 403);
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const result = await walletTransaction(async tx => {
    const employee = await liveWalletActor(tx, actor, true);
    const [proposal] = await tx.$queryRaw<Array<{ amountMinor: bigint; sourceType: string; sourceId: string }>>`
      SELECT "amountMinor","sourceType","sourceId" FROM "WalletReleaseProposal"
      WHERE "id"=${payload.id} AND "confirmationHash"=${payload.confirmationHash} AND "status"='PENDING' AND "expiresAt">now()
    `;
    if (!proposal) throw new WalletError('PROPOSAL_EXPIRED', 'Prepare a fresh release preview.', 409);

    const approvalPinHash = await checkApprovalPin(tx, actor, pin);
    if (approvalPinHash instanceof WalletError) return approvalPinHash;

    const otpRequired = await approvalOtpRequired(tx);
    const gmd = otpRequired && await tx.employee.findFirst({
      where: { id: process.env.BEMS_FINANCIAL_GMD_ID || '', role: 'GMD', status: 'ACTIVE', approvalStatus: 'APPROVED' },
      select: { workEmail: true },
    });
    if (otpRequired && (!gmd || !/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(gmd.workEmail))) {
      throw new WalletError('GMD_EMAIL_REQUIRED', 'Configure the designated GMD’s work email before approving funds.', 503);
    }
    const code = otpRequired ? String(randomInt(100000, 1000000)) : null;
    const digest = code ? releaseOtpDigest(id, code) : null;
    const expiresAt = new Date(Date.now() + (otpRequired ? 300000 : 120000));
    const source = proposal.sourceType === 'REQUEST'
      ? await tx.expenditureRequest.findUnique({ where: { id: proposal.sourceId }, select: { requestNumber: true } })
      : null;
    const beneficiaries = await tx.$queryRaw<Array<{ name: string | null; requestNumber: string | null; amountMinor: bigint }>>`
      SELECT COALESCE(e."legalName", v."name") AS name, r."requestNumber", i."amountMinor"
      FROM "WalletReleaseItem" i
      LEFT JOIN "Employee" e ON e."id"=i."employeeId"
      LEFT JOIN "Vendor" v ON v."id"=i."vendorId"
      LEFT JOIN "ExpenditureRequest" r ON i."sourceType"='REQUEST' AND r."id"=i."sourceId"
      WHERE i."proposalId"=${payload.id} ORDER BY r."requestNumber", i."id"
    `;
    await tx.$executeRaw`
      INSERT INTO "WalletChallenge" ("id","actorId","purpose","payloadHash","tokenHash","sessionHash","credentialHash","expiresAt","approvalPinHash","otpDigest")
      VALUES (${id},${actor.id},'RELEASE',${hash(payload)},${hash(token)},${sessionHash},${hash(employee.passwordHash)},${expiresAt},${approvalPinHash},${digest})
    `;
    return { code, email: gmd ? gmd.workEmail : null, expiresAt, amount: proposal.amountMinor, reference: source?.requestNumber ?? payload.id,
      beneficiary: beneficiaries.length === 1 ? beneficiaries[0].name : `${beneficiaries.length} payment allocations`,
      batchDetails: proposal.sourceType === 'REQUEST_BATCH' ? beneficiaries : [] };
  });
  if (result instanceof WalletError) throw result;
  if (result.code && result.email) {
    if (!(await checkRateLimit('wallet-approval-email', { windowMs: 60000, maxAttempts: 6 })).allowed) {
      await prisma.$executeRaw`UPDATE "WalletChallenge" SET "usedAt"=now() WHERE "id"=${id}`;
      throw new WalletError('RATE_LIMITED', 'Too many approval codes were requested. Try again shortly.', 429);
    }
    const formatAmount = (amount: bigint) => (amount / BigInt(100)).toString() + '.' + (amount % BigInt(100)).toString().padStart(2, '0');
    const amount = formatAmount(result.amount);
    const batchDetails = result.batchDetails.map(item => `\n${item.requestNumber} · ${item.name} · NGN ${formatAmount(item.amountMinor)}`).join('');
    const message = `Approval code: ${result.code}\nRelease: ${result.reference}\nAmount: NGN ${amount}\nBeneficiary: ${result.beneficiary || 'See release preview'}${batchDetails}\nApprover: ${actor.legalName}\nThis code expires in five minutes. Only provide it for the exact release you independently verified and authorized.`;
    const sent = await sendEmail({ to: result.email, subject: 'Bems ERP wallet approval code',
      text: message, html: '<pre>' + message.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!) + '</pre>',
      eventType: 'WALLET_APPROVAL_OTP' }).catch(() => null);
    if (!sent?.success || sent.simulated) {
      await prisma.$executeRaw`UPDATE "WalletChallenge" SET "usedAt"=now() WHERE "id"=${id}`;
      throw new WalletError('APPROVAL_EMAIL_UNAVAILABLE', 'The code could not be sent to the GMD. No funds were released.', 503);
    }
  }
  return { id, token, expiresAt: result.expiresAt, otpRequired: Boolean(result.code) };
}

export async function verifyWalletReleaseOtp(actor: WalletActor, proof: SecurityProof, otp: unknown) {
  if (typeof proof.id !== 'string' || typeof proof.token !== 'string') throw new WalletError('CHALLENGE_INVALID', 'Prepare a new approval confirmation.', 403);
  const result = await walletTransaction(async tx => {
    const [challenge] = await tx.$queryRaw<any[]>`SELECT * FROM "WalletChallenge" WHERE "id"=${proof.id} FOR UPDATE`;
    const employee = await liveWalletActor(tx, actor, true);
    const credential = await approvalCredential(tx, actor.id);
    if (!challenge || challenge.purpose !== 'RELEASE' || challenge.actorId !== actor.id || challenge.usedAt
      || challenge.sessionHash !== proof.sessionHash || challenge.tokenHash !== hash(proof.token)
      || challenge.credentialHash !== hash(employee.passwordHash) || !credential || credential.lockedAt
      || challenge.approvalPinHash !== hash(credential.pinHash) || challenge.expiresAt <= new Date() || !challenge.otpDigest) {
      return new WalletError('CHALLENGE_INVALID', 'The approval confirmation expired or was revoked. Start again.', 403);
    }
    if (challenge.otpVerifiedAt) return { verified: true };
    if (!matchesReleaseOtp(challenge.id, otp, challenge.otpDigest)) {
      const attempts = challenge.otpAttempts + 1;
      await tx.$executeRaw`UPDATE "WalletChallenge" SET "otpAttempts"=${attempts},"usedAt"=CASE WHEN ${attempts}>=3 THEN now() ELSE NULL END WHERE "id"=${proof.id}`;
      return new WalletError(attempts >= 3 ? 'CHALLENGE_INVALID' : 'APPROVAL_OTP_INVALID',
        attempts >= 3 ? 'Too many incorrect codes. Start again.' : 'Incorrect approval code.', 403);
    }
    await tx.$executeRaw`UPDATE "WalletChallenge" SET "otpVerifiedAt"=now() WHERE "id"=${proof.id}`;
    return { verified: true };
  });
  if (result instanceof WalletError) throw result;
  return result;
}

export async function consumeWalletChallenge(tx:Prisma.TransactionClient,actor:WalletActor,purpose:string,payload:unknown,proof?:SecurityProof) {
  if (!proof || typeof proof.token !== 'string') throw new WalletError('TRANSACTION_AUTH_REQUIRED', purpose === 'RELEASE' ? 'Confirm this exact release using your approval PIN.' : 'Confirm this exact transaction using your current password.', 403);
  const [challenge]=await tx.$queryRaw<any[]>`SELECT * FROM "WalletChallenge" WHERE "id"=${proof.id} FOR UPDATE`;
  const employee=await liveWalletActor(tx,actor,purpose === 'POOL_CONTROL' && (payload as any)?.operation !== 'PAUSE' ? 'GMD' : purpose === 'RELEASE');
  const tokenHash=hash(proof.token);
  if (!challenge || challenge.actorId!==actor.id || challenge.purpose!==purpose || challenge.usedAt || challenge.expiresAt<=new Date() || challenge.payloadHash!==hash(challengePayload(purpose,payload)) || challenge.sessionHash!==proof.sessionHash || challenge.credentialHash!==hash(employee.passwordHash) || challenge.tokenHash.length!==tokenHash.length || !timingSafeEqual(Buffer.from(tokenHash),Buffer.from(challenge.tokenHash))) throw new WalletError('CHALLENGE_INVALID','The transaction confirmation is invalid, expired or already used.',403);
  if (purpose === 'RELEASE') {
    const credential = await approvalCredential(tx, actor.id);
    if (!credential || credential.lockedAt || challenge.approvalPinHash !== hash(credential.pinHash)) {
      throw new WalletError('CHALLENGE_INVALID', 'Approval PIN confirmation expired or was revoked.', 403);
    }
    if ((challenge.otpDigest || await approvalOtpRequired(tx)) && !challenge.otpVerifiedAt) {
      throw new WalletError('APPROVAL_OTP_REQUIRED', 'Enter the approval code sent to the GMD before releasing funds.', 403);
    }
  }
  await tx.$executeRaw`UPDATE "WalletChallenge" SET "usedAt"=now() WHERE "id"=${proof.id}`;
}
