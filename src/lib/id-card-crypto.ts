import crypto from 'crypto';
import type { IdCardLevel } from '@/lib/id-card-levels';

export interface IdCardTokenPayload {
  v: 1;
  eid: string;
  cno: string;
  lvl: IdCardLevel;
  role: string;
  sub: string;
  iat: number; // unix seconds
  exp: number; // unix seconds
}

function getSigningSecret(): string {
  return (
    process.env.ID_CARD_SIGNING_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'bems-erp-internal-card-signing-key-v1'
  );
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function computeSignature(encodedPayload: string): string {
  const hmac = crypto.createHmac('sha256', getSigningSecret());
  hmac.update(`BEMS1.${encodedPayload}`);
  return base64UrlEncode(hmac.digest());
}

export function signIdCardToken(params: {
  employeeId: string;
  cardNumber: string;
  cardLevel: IdCardLevel;
  role: string;
  subsidiaryCode: string;
  issuedAtIso: string;
  expiresAtIso: string;
}): string {
  const iat = Math.floor(new Date(params.issuedAtIso).getTime() / 1000) || Math.floor(Date.now() / 1000);
  const exp = Math.floor(new Date(params.expiresAtIso).getTime() / 1000) || iat + 60 * 60 * 24 * 730;
  const payload: IdCardTokenPayload = {
    v: 1,
    eid: params.employeeId,
    cno: params.cardNumber,
    lvl: params.cardLevel,
    role: String(params.role || 'STAFF').toUpperCase(),
    sub: String(params.subsidiaryCode || 'BEMS-GROUP').toUpperCase(),
    iat,
    exp,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = computeSignature(encoded);
  return `BEMS1.${encoded}.${sig}`;
}

export function verifyIdCardToken(token: string):
  | { valid: true; payload: IdCardTokenPayload }
  | { valid: false; reason: string } {
  const trimmed = String(token || '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'BEMS1') {
    return { valid: false, reason: 'Invalid credential token format.' };
  }

  const [, encodedPayload, providedSig] = parts;
  const expectedSig = computeSignature(encodedPayload);

  const bufA = Buffer.from(providedSig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return { valid: false, reason: 'Credential signature mismatch (tampered or invalid key).' };
  }

  try {
    const rawJson = base64UrlDecode(encodedPayload).toString('utf8');
    const parsed = JSON.parse(rawJson) as IdCardTokenPayload;
    if (!parsed?.eid || !parsed?.cno || !parsed?.lvl) {
      return { valid: false, reason: 'Incomplete credential payload.' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (parsed.exp && parsed.exp < nowSec) {
      return { valid: false, reason: 'Credential token has expired.' };
    }
    return { valid: true, payload: parsed };
  } catch {
    return { valid: false, reason: 'Malformed credential payload.' };
  }
}

