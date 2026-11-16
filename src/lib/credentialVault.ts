import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getVaultKey(): Buffer {
  const raw =
    process.env.PROJECT_VAULT_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'bems-erp-project-vault-dev-key-32bytes';
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptCredentialSecret(plainText: string): {
  encryptedSecret: string;
  iv: string;
  authTag: string;
} {
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedSecret: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptCredentialSecret(payload: {
  encryptedSecret: string;
  iv: string;
  authTag: string;
}): string {
  const key = getVaultKey();
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedSecret, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function canRevealProjectCredential(params: {
  role: string;
  actorId: string;
  entryEmployeeId: string;
  projectTeamLeadId?: string | null;
}): boolean {
  const upper = (params.role || '').toUpperCase();
  if (upper === 'GMD' || upper === 'SUPER_ADMIN' || upper === 'SYSTEM_ADMIN') {
    return true;
  }
  if (params.projectTeamLeadId && params.actorId === params.projectTeamLeadId) {
    return true;
  }
  return params.actorId === params.entryEmployeeId;
}

