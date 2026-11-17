'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Policy = {
  delegateId: string | null;
  canEdit: boolean;
  hardLockedByEnv: boolean;
  candidates: { id: string; legalName: string; employeeNumber: string }[];
};

export function FundApprovalPolicyCard({ setNotice }: { setNotice?: (msg: string) => void }) {
  const [policy, setPolicy] = useState<Policy>();
  const [delegateId, setDelegateId] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/control-center/fund-approval-policy', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load fund approval authority.');
        setPolicy(data);
        setDelegateId(data.delegateId ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fund approval authority.');
      }
    })();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/control-center/fund-approval-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegateId: delegateId || null, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update fund approval authority.');
      setPolicy(current => current && { ...current, delegateId: data.delegateId });
      setPassword('');
      setNotice?.(data.delegateId ? 'Fund approval delegate saved.' : 'Fund approval restricted to the GMD.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fund approval authority.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Fund Approval Authority</h3>
      {policy && <p className="mt-1 text-xs text-slate-600">
        {policy.delegateId ? 'GMD and one delegated approver. Each uses their own password.' : 'Only the designated GMD can authorize a wallet release.'}
      </p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {policy?.canEdit && !policy.hardLockedByEnv && (
        <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-800">
            Fund approver
            <select className="mt-1 block rounded-lg border border-slate-300 p-2" value={delegateId} onChange={e => setDelegateId(e.target.value)}>
              <option value="">GMD only</option>
              {policy.candidates.map(candidate => (
                <option value={candidate.id} key={candidate.id}>{candidate.legalName} ({candidate.employeeNumber})</option>
              ))}
              {policy.delegateId && !policy.candidates.some(candidate => candidate.id === policy.delegateId) && (
                <option value={policy.delegateId} disabled>Previously selected approver unavailable</option>
              )}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-800">
            Current GMD password
            <input className="mt-1 block rounded-lg border border-slate-300 p-2" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <button disabled={saving || !password || (delegateId || null) === policy.delegateId} className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save authority'}
          </button>
        </form>
      )}
    </section>
  );
}
