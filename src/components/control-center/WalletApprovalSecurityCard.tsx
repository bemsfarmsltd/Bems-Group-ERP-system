'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Security = {
  canApprove: boolean;
  canChangeOtp: boolean;
  canRecover: boolean;
  pinSet: boolean;
  locked: boolean;
  recoveryAuthorized: boolean;
  otpRequired: boolean;
  lockedAccounts: { id: string; legalName: string; recoveryUntil: string | null }[];
};
type Action = 'SET_PIN' | 'SET_OTP_POLICY' | 'AUTHORIZE_RECOVERY';
const endpoint = '/api/control-center/wallet-approval-security';

export function WalletApprovalSecurityCard({ setNotice }: { setNotice: (message: string) => void }) {
  const [security, setSecurity] = useState<Security>();
  const [action, setAction] = useState<Action>();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(endpoint, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Approval settings are unavailable.');
    setSecurity(data);
  }, []);

  useEffect(() => {
    void load().catch(err => setError(err.message));
  }, [load]);

  function select(next?: Action) {
    setAction(next);
    setPassword('');
    setPin('');
    setCurrentPin('');
    setConfirmPin('');
    setTargetId('');
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!security || !action) return;
    if (action === 'SET_PIN' && pin !== confirmPin) {
      setError('The new PIN entries must match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, password, pin, currentPin, targetId, required: !security.otpRequired }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval security could not be updated.');
      await load();
      select();
      setNotice(action === 'SET_PIN' ? 'Approval PIN saved.' : action === 'SET_OTP_POLICY' ? 'Approval OTP policy updated.' : 'PIN recovery authorized for 30 minutes.');
    } catch (err) {
      setPassword('');
      setPin('');
      setCurrentPin('');
      setConfirmPin('');
      setError(err instanceof Error ? err.message : 'Approval security could not be updated.');
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1 block rounded-lg border border-slate-300 p-2 text-sm';
  const button = 'rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50';
  const pinInput = (label: string, value: string, change: (value: string) => void) => (
    <label className="text-xs font-semibold">{label}<input className={field} type="password" autoComplete="off"
      inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required value={value} onChange={e => change(e.target.value.replace(/\D/g, ''))} /></label>
  );
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-900">Wallet Approval Security (PIN, OTP & Recovery)</h3>
          {security && (
            <>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${security.otpRequired ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {security.otpRequired ? '✓ GMD Email OTP On' : 'Email OTP Off'}
              </span>
              {security.canApprove && (
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${security.locked ? 'border-red-200 bg-red-50 text-red-700' : security.pinSet ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  {security.locked ? 'Approval PIN Locked' : security.pinSet ? '✓ 8-Digit PIN Active' : 'PIN Not Set'}
                </span>
              )}
              {security.canRecover && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                  {security.lockedAccounts.length ? `${security.lockedAccounts.length} Locked Account(s)` : '0 Locked Accounts'}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    {security && <>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700">
          <div className="font-bold text-slate-900">Approval PIN & Lockout</div>
          <p className="mt-1 text-slate-600">
            {security.canApprove
              ? security.locked
                ? security.recoveryAuthorized ? 'Recovery authorized. Set a new PIN within the 30-minute window.' : 'Financial approval is locked after 3 failed PIN attempts. Ask a Super Admin to authorize recovery.'
                : security.pinSet ? 'Your private 8-digit approval PIN is active for wallet releases.' : 'Set your private 8-digit approval PIN to authorize wallet releases.'
              : 'Your current account is Super Admin (no direct disbursement authority). You can authorize a 30-minute PIN recovery window if the GMD or a delegate is locked out.'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700">
          <div className="font-bold text-slate-900">GMD Email OTP Policy</div>
          <p className="mt-1 text-slate-600">
            Email OTP is {security.otpRequired ? 'required for every wallet release (including payroll and vendor payments) and sent only to the designated GMD’s work email.' : 'currently disabled. Only the designated GMD can toggle this policy.'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {security.canApprove && (!security.locked || security.recoveryAuthorized) &&
          <button className={button} disabled={busy} onClick={() => select('SET_PIN')}>{security.pinSet && !security.locked ? 'Change PIN' : 'Set approval PIN'}</button>}
        {security.canChangeOtp && <>
          <button className={button} role="switch" aria-label="Require email OTP for wallet approvals" aria-checked={security.otpRequired}
            disabled={busy} onClick={() => select('SET_OTP_POLICY')}>Email OTP {security.otpRequired ? 'on' : 'off'}</button>
        </>}
        {security.canRecover && security.lockedAccounts.length > 0 &&
          <button className={button} disabled={busy} onClick={() => select('AUTHORIZE_RECOVERY')}>Authorize PIN recovery</button>}
      </div>
      {action && <form onSubmit={save} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
        {action === 'SET_OTP_POLICY' && <p className="text-xs">Confirm to turn email OTP {security.otpRequired ? 'off' : 'on'}.</p>}
        {action === 'AUTHORIZE_RECOVERY' && <label className="text-xs font-semibold">Account whose identity you verified
          <select className={field} required value={targetId} onChange={e => setTargetId(e.target.value)}>
            <option value="">Select account</option>
            {security.lockedAccounts.map(account => <option key={account.id} value={account.id}>{account.legalName}</option>)}
          </select>
        </label>}
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-semibold">Current account password
            <input className={field} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {action === 'SET_PIN' && security.pinSet && !security.locked && pinInput('Current approval PIN', currentPin, setCurrentPin)}
          {action === 'SET_PIN' && pinInput('New eight-digit PIN', pin, setPin)}
          {action === 'SET_PIN' && pinInput('Repeat new PIN', confirmPin, setConfirmPin)}
          {action === 'SET_OTP_POLICY' && security.otpRequired && pinInput('Current approval PIN', pin, setPin)}
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm'}</button>
          <button type="button" disabled={busy} className={button} onClick={() => select()}>Cancel</button>
        </div>
      </form>}
    </>}
    {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
  </section>;
}
