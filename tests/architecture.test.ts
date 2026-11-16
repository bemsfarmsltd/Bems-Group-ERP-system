import { describe, it, expect } from 'vitest';
import { signIdCardToken, verifyIdCardToken } from '../src/lib/id-card-crypto';
import { resolveDefaultCardLevel } from '../src/lib/id-card-levels';
import { ApiValidationError, IdCardVerifyBodySchema, parseWithSchema } from '../src/lib/validation/http';
import { getDistributedCache, setDistributedCache } from '../src/lib/server-cache';
import { publishRealtimeEvent, subscribeRealtimeChannel } from '../src/lib/realtime';

describe('BEMS ERP Core Architecture Suite', () => {
  it('signs and verifies system-grade ID card HMAC-SHA256 tokens and rejects tampering', () => {
    const now = new Date();
    const exp = new Date(now.getTime() + 86400_000 * 30);
    const token = signIdCardToken({
      employeeId: 'emp-123',
      cardNumber: 'BBH-ID-001',
      cardLevel: 5,
      role: 'STAFF',
      subsidiaryCode: 'BBH',
      issuedAtIso: now.toISOString(),
      expiresAtIso: exp.toISOString(),
    });

    const valid = verifyIdCardToken(token);
    expect(valid.valid).toBe(true);
    if (valid.valid) {
      expect(valid.payload.eid).toBe('emp-123');
      expect(valid.payload.lvl).toBe(5);
    }

    const tampered = verifyIdCardToken(token.slice(0, -4) + 'zzzz');
    expect(tampered.valid).toBe(false);
  });

  it('resolves 10-level ID cards accurately across company structure', () => {
    expect(resolveDefaultCardLevel({ role: 'GMD' })).toBe(10);
    expect(resolveDefaultCardLevel({ role: 'SUPER_ADMIN' })).toBe(9);
    expect(resolveDefaultCardLevel({ role: 'SYSTEM_ADMIN' })).toBe(8);
    expect(resolveDefaultCardLevel({ role: 'STAFF', customAdminProfileId: 'prof-1' })).toBe(8);
    expect(resolveDefaultCardLevel({ role: 'STAFF', jobTitle: 'Operations Manager' })).toBe(7);
    expect(resolveDefaultCardLevel({ role: 'STAFF', jobTitle: 'Lead Mobile Developer' })).toBe(6);
    expect(resolveDefaultCardLevel({ role: 'STAFF', jobTitle: 'Software Developer' })).toBe(5);
    expect(resolveDefaultCardLevel({ role: 'STAFF', jobTitle: 'Driver', departmentName: 'Software Engineering & DevOps' })).toBe(2);
    expect(resolveDefaultCardLevel({ role: 'STAFF', employmentType: 'INTERN' })).toBe(1);
  });

  it('validates API payloads with Zod and throws ApiValidationError on empty body', () => {
    expect(() => parseWithSchema(IdCardVerifyBodySchema, {})).toThrow(ApiValidationError);
    const ok = parseWithSchema(IdCardVerifyBodySchema, { code: 'BBH-ID-001', requiredMinLevel: 5 });
    expect(ok.requiredMinLevel).toBe(5);
  });

  it('supports distributed cache fallback and realtime pub/sub events', async () => {
    await setDistributedCache('test:arch', { healthy: true }, 5000);
    const val = await getDistributedCache<{ healthy: boolean }>('test:arch');
    expect(val?.healthy).toBe(true);

    let eventType = '';
    const unsub = subscribeRealtimeChannel('vitest-ch', (evt) => {
      eventType = evt.type;
    });
    await publishRealtimeEvent('vitest-ch', 'wallet_updated', { amount: 1000 });
    unsub();
    expect(eventType).toBe('wallet_updated');
  });
});
