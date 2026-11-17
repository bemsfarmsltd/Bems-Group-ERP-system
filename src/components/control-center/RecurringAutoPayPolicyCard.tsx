'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { resolveApiUrl } from '@/lib/api-client';

type RecurringRow = {
  id: string;
  requestNumber: string;
  title: string;
  amountMinor: string;
  recurringInterval: string | null;
  recurringAutoPay?: boolean;
  recurringNextDueAt?: string | null;
  approvalStatus: string;
  subsidiary?: { legalName: string };
};

const formatNaira = (minor: string | number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(minor || 0) / 100);

export function RecurringAutoPayPolicyCard({ setNotice }: { setNotice: (msg: string) => void }) {
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<RecurringRow | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(resolveApiUrl(`/api/recurring?_t=${Date.now()}`), { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load recurring commitments.');
      setRows(data?.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recurring commitments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitToggle(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const nextState = !target.recurringAutoPay;
      const res = await fetch(resolveApiUrl(`/api/requests/${encodeURIComponent(target.requestNumber)}/recurring-autopay`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoPay: nextState, pin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not update Auto-Pay policy.');
      setNotice(`Auto-Pay ${nextState ? 'enabled' : 'disabled'} for ${target.requestNumber} (${target.title}).`);
      setTarget(null);
      setPin('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update Auto-Pay policy.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Recurring Expenditure Auto-Pay Governance</h3>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-700">
              GMD Approval PIN Required
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Control whether approved recurring commitments auto-pay on their cycle due date. Early disbursements before the due date are blocked, and commitments with Auto-Pay OFF alert GMD &amp; Finance admins 7 days prior.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && <p role="alert" className="mt-3 text-xs font-medium text-red-700">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5">Commitment</th>
              <th className="px-3 py-2.5">Entity</th>
              <th className="px-3 py-2.5">Amount &amp; Cadence</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Auto-Pay Toggle</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading recurring commitments…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No recurring commitments configured yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-slate-900">{r.title}</div>
                    <div className="text-[11px] text-slate-500">{r.requestNumber}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{r.subsidiary?.legalName || 'BEMS'}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">
                    {formatNaira(r.amountMinor)} · <span className="text-slate-500">{r.recurringInterval || 'MONTHLY'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${r.recurringAutoPay ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                      {r.recurringAutoPay ? '✓ Auto-Pay ON' : 'Auto-Pay OFF'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => { setTarget(r); setPin(''); setError(''); }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${r.recurringAutoPay ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                    >
                      {r.recurringAutoPay ? 'Disable Auto-Pay' : 'Enable Auto-Pay (PIN)'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {target && (
        <form onSubmit={submitToggle} className="mt-4 space-y-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
          <div className="text-xs font-bold text-slate-900">
            Confirm with 8-Digit GMD Approval PIN to {target.recurringAutoPay ? 'disable' : 'enable'} Auto-Pay for {target.title} ({target.requestNumber})
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              required
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="8-digit GMD Approval PIN"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={busy || pin.length !== 8}
              className="rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setTarget(null); setPin(''); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
