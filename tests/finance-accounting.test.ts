import { describe, expect, it, vi } from 'vitest';
import { buildBackendServer } from '../backend/server';
import { assetDate, dateField, moneyMinor, postJournal, type FinanceTx } from '../src/lib/finance/ledger';
import { executeFinanceAction } from '../src/lib/finance/actions';

describe('Finance accounting controls', () => {
  it('parses journal amounts exactly and rejects invalid dates', () => {
    expect(moneyMinor('9000000000.01')).toBe(BigInt('900000000001'));
    expect(moneyMinor('-42.05', { signed: true })).toBe(BigInt(-4205));
    expect(() => moneyMinor('0.001')).toThrow();
    expect(() => moneyMinor('-42.05')).toThrow();
    expect(() => dateField('2026-02-29', 'date')).toThrow();
    expect(assetDate('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('rejects an unbalanced or closed-period journal before inserting any records', async () => {
    const execute = vi.fn();
    const query = vi.fn().mockResolvedValue([{ month: '2026-10-01' }]);
    const tx = { $queryRaw: query, $executeRaw: execute } as unknown as FinanceTx;
    const journal = { organizationId: 'entity', actorId: 'gmd', date: '2026-10-15', memo: 'Invoice', source: 'MANUAL', reference: '1' };
    await expect(postJournal(tx, { ...journal, lines: [{ accountId: 'a', amount: BigInt(2) }, { accountId: 'b', amount: BigInt(-1) }] })).rejects.toThrow('must balance');
    expect(query).not.toHaveBeenCalled();
    await expect(postJournal(tx, { ...journal, lines: [{ accountId: 'a', amount: BigInt(2) }, { accountId: 'b', amount: BigInt(-2) }] })).rejects.toThrow('closed accounting period');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects settlements larger than the open item', async () => {
    const execute = vi.fn();
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: 'bill', remainingMinor: BigInt(10000), kind: 'PAYABLE', issuedOn: '2026-09-01' }])
      .mockResolvedValueOnce([{ id: 'bank', cash: true, kind: 'ASSET' }]);
    const tx = { $queryRaw: query, $executeRaw: execute } as unknown as FinanceTx;
    await expect(executeFinanceAction({
      tx, actorId: 'gmd', organizationId: 'entity', isGroup: false,
      body: { itemId: 'bill', accountId: 'bank', amount: '100.01', date: '2026-10-01', reference: 'transfer' },
    }, 'SETTLE_OPEN_ITEM')).rejects.toThrow('exceeds');
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires a human session on the registered accounting API', async () => {
    const app = await buildBackendServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/finance/accounting' });
      expect(res.statusCode).toBe(401);
      const reportRes = await app.inject({ method: 'GET', url: '/api/finance/report-studio' });
      expect(reportRes.statusCode).toBe(401);
      const staffReportRes = await app.inject({ method: 'GET', url: '/api/finance/report-studio?view=STAFF' });
      expect(staffReportRes.statusCode).toBe(401);
      const mutation = await app.inject({
        method: 'POST', url: '/api/finance/accounting', headers: { 'content-type': 'application/json' },
        payload: { action: 'CLOSE_PERIOD', entity: 'entity', month: '2026-10' },
      });
      expect(mutation.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
