'use client';

import Link from 'next/link';
import { useState } from 'react';
import { WalletApiError, walletApi } from '@/lib/wallet/client';

type Payload = { id: string; confirmationHash: string; note?: string };
type Proof = { id: string; token: string; otpRequired: boolean };

export function WalletReleaseAuthorization({ payload, onApproved, onBusy, onStale }: {
  payload: Payload;
  onApproved: (result: { status: string }) => void | Promise<void>;
  onBusy?: (busy: boolean) => void;
  onStale?: () => void;
}) {
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState<{ proof: Proof; payload: Payload }>();
  const [otpVerified, setOtpVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSettings, setNeedsSettings] = useState(false);

  async function confirm() {
    setBusy(true);
    onBusy?.(true);
    setError('');
    setNeedsSettings(false);
    try {
      const attempt = pending ?? {
        payload,
        proof: await walletApi('challenges', { purpose: 'RELEASE', payload, pin }),
      };
      if (!pending) {
        setPending(attempt);
        if (attempt.proof.otpRequired) return;
      }
      if (attempt.proof.otpRequired && !otpVerified) {
        await walletApi('challenges', { action: 'VERIFY_RELEASE_OTP', id: attempt.proof.id, token: attempt.proof.token, otp });
        setOtpVerified(true);
      }
      const result = await walletApi('releases/' + encodeURIComponent(attempt.payload.id) + '/approve', {
        ...attempt.payload, challengeId: attempt.proof.id, challengeToken: attempt.proof.token,
      });
      await onApproved(result);
    } catch (err) {
      const code = err instanceof WalletApiError ? err.code : undefined;
      if (['CHALLENGE_INVALID', 'APPROVAL_PIN_LOCKED', 'APPROVAL_PIN_REQUIRED'].includes(code ?? '')) {
        setPending(undefined);
        setOtpVerified(false);
      }
      if (code === 'APPROVAL_PIN_REQUIRED' || code === 'APPROVAL_PIN_LOCKED') setNeedsSettings(true);
      if (['NOT_FOUND', 'PROPOSAL_EXPIRED', 'SOURCE_CHANGED', 'SOURCE_NOT_ELIGIBLE', 'HASH_MISMATCH', 'BUDGET_EXCEEDED'].includes(code ?? '')) onStale?.();
      setError(err instanceof Error ? err.message : 'Approval could not be completed.');
    } finally {
      setPin('');
      setOtp('');
      setBusy(false);
      onBusy?.(false);
    }
  }

  const otpRequired = pending?.proof.otpRequired && !otpVerified;
  return <div className="space-y-3">
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {needsSettings && <Link href="/control-center?section=wallet-approval" className="text-xs font-semibold underline">Open Control Center</Link>}
    {otpRequired && <p className="text-xs text-slate-600">Enter the code sent to the GMD’s work email for this release.</p>}
    {(!pending || otpRequired) && <label className="block text-xs font-semibold text-slate-800">
      {otpRequired ? 'GMD email code' : 'Your approval PIN'}
      <input
        className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
        type={otpRequired ? 'text' : 'password'}
        inputMode="numeric"
        autoComplete={otpRequired ? 'one-time-code' : 'off'}
        maxLength={otpRequired ? 6 : 8}
        value={otpRequired ? otp : pin}
        disabled={busy}
        onChange={e => (otpRequired ? setOtp : setPin)(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!busy && (otpRequired ? otp.length === 6 : Boolean(pending) || pin.length === 8)) void confirm();
          }
        }}
      />
    </label>}
    <button type="button" disabled={busy || (otpRequired ? otp.length !== 6 : !pending && pin.length !== 8)}
      onClick={() => void confirm()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
      {busy ? 'Verifying…' : otpRequired || pending ? 'Approve release' : 'Authorize with approval PIN'}
    </button>
  </div>;
}
