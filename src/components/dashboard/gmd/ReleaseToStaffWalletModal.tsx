'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { WalletReleaseAuthorization } from '@/components/wallet/WalletReleaseAuthorization';
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Building2,
  ArrowRight,
  X,
  ShieldCheck,
} from 'lucide-react';

export interface StaffWalletReleaseData {
  requestId: string;
  requestNumber: string;
  title: string;
  amountFormatted: string;
  amountMinor?: string;
  staffName: string;
  staffNumber: string;
  staffRole?: string;
  subsidiaryName: string;
  subsidiaryId?: string;
  brandColor?: string;
}

type ReleasePreview = {
  id: string;
  sourceId: string;
  confirmationHash: string;
  amountMinor: string;
  items: [{ employeeName: string; employeeNumber: string; envelopeLabel: string; title: string }];
};

interface ReleaseToStaffWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  data: StaffWalletReleaseData | null;
}

export const ReleaseToStaffWalletModal: React.FC<ReleaseToStaffWalletModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  data,
}) => {
  const [preview, setPreview] = useState<ReleasePreview | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [allocateUrl, setAllocateUrl] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState<any | null>(null);

  if (!isOpen || !data) return null;

  const reviewed = preview?.sourceId === data.requestId ? preview : null;
  const beneficiary = reviewed?.items[0];
  const staffNumber = beneficiary?.employeeNumber ?? data.staffNumber;
  const staffName = beneficiary?.employeeName ?? data.staffName;
  const walletNumber = `WLT-${staffNumber}`;
  const amountFormatted = reviewed
    ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(reviewed.amountMinor) / 100)
    : data.amountFormatted;

  const handleCopyWalletNumber = () => {
    navigator.clipboard.writeText(walletNumber);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  const handleAuthorizeRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      setErrorCode(null);
      setAllocateUrl(null);

      if (!reviewed) {
        const res = await fetch('/api/wallet/releases/approve-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'PREPARE', requestId: data.requestId }),
        });
        const result = await res.json();
        if (!res.ok) {
          setErrorCode(result.code ?? null);
          if (result.code === 'NO_BUDGET_ENVELOPE') setAllocateUrl('/wallet/funding');
          throw new Error(result.error || 'Failed to prepare the wallet release.');
        }
        setPreview(result);
        return;
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet release could not be prepared.');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setPreview(null);
    setNote('');
    setError(null);
    setErrorCode(null);
    setAllocateUrl(null);
    setSuccessReceipt(null);
    onClose();
  };

  const handleFinish = () => {
    onSuccess();
    close();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50/40 border-b border-emerald-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Release to Staff Wallet
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Financial Approval
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Requisition {data.requestNumber} · {beneficiary?.title ?? data.title}
              </p>
            </div>
          </div>
          <button
            onClick={successReceipt ? handleFinish : close}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        {successReceipt ? (
          /* STATE 2: SUCCESS RECEIPT */
          <div className="p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-100 border border-emerald-300 rounded-full flex items-center justify-center mx-auto text-emerald-600 shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-black text-slate-900 tracking-tight">
                Funds Successfully Credited!
              </h4>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                <strong className="text-slate-900">{successReceipt.amountFormatted}</strong> has been released from{' '}
                <span className="font-semibold">{successReceipt.subsidiary?.name}</span>'s funded budget into{' '}
                <strong className="text-slate-900">{successReceipt.staff?.name}</strong>'s internal wallet.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Beneficiary Staff</span>
                <span className="font-bold text-slate-900">{successReceipt.staff?.name}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Staff Wallet Number</span>
                <span className="font-mono font-bold text-emerald-700">{successReceipt.staff?.walletNumber}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Source Budget Envelope</span>
                <span className="font-medium text-slate-700">{successReceipt.subsidiary?.envelopeLabel || 'Operational Budget'}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Requisition Number</span>
                <span className="font-mono font-bold text-slate-900">{successReceipt.requestNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Credited Timestamp</span>
                <span className="text-slate-600">{successReceipt.timestamp || 'Just now'}</span>
              </div>
            </div>

            <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <span>
                The staff member has been notified via their staff portal. They can now withdraw to their verified bank account at their own convenience without a second business approval.
              </span>
            </div>

            <button
              type="button"
              onClick={handleFinish}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              Done / Return to Approvals
            </button>
          </div>
        ) : (
          /* STATE 1: AUTHORIZATION FORM */
          <form onSubmit={handleAuthorizeRelease} className="p-6 space-y-4">
            {error && (
              <div
                className={`rounded-xl p-3.5 text-xs animate-in fade-in ${
                  errorCode === 'NO_BUDGET_ENVELOPE' || errorCode === 'INSUFFICIENT_BUDGET_BUFFER'
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      errorCode === 'NO_BUDGET_ENVELOPE' || errorCode === 'INSUFFICIENT_BUDGET_BUFFER'
                        ? 'text-amber-600'
                        : 'text-red-500'
                    }`}
                  />
                  <div className="flex-1 space-y-2">
                    <p className="leading-relaxed font-medium">{error}</p>
                    {allocateUrl && (
                      <div>
                        <Link
                          href={allocateUrl}
                          onClick={close}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ea580c] hover:bg-orange-600 text-white font-bold rounded-lg text-[11px] shadow-sm transition-all"
                        >
                          Allocate Funded Budget →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Amount to Release Card */}
            <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/40 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Amount to Credit Staff Wallet
                </span>
                <div className="text-2xl font-black text-emerald-950 tracking-tight mt-0.5">
                  {amountFormatted}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-semibold text-slate-500 block">Funding Source</span>
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1 justify-end mt-0.5">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  {beneficiary?.envelopeLabel ?? data.subsidiaryName}
                </span>
              </div>
            </div>

            {/* Staff Dossier Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Beneficiary Staff Member
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-500">
                  ID: {staffNumber}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-slate-700 text-xs">
                    {staffName.charAt(0)}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 leading-tight">{staffName}</h5>
                    <span className="text-[10px] text-slate-500">
                      {data.staffRole || 'Staff Member'} · {data.subsidiaryName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Staff Wallet Identifier */}
              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Staff Wallet No:</span>
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {walletNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyWalletNumber}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 transition px-2 py-1 rounded hover:bg-slate-200/70"
                >
                  {copiedWallet ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Policy Info Notice */}
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-amber-900 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <span>
                Authorized funds will be credited immediately to the staff internal wallet from the subsidiary's funded budget envelope. The staff member can then withdraw to their verified bank account at their own time.
              </span>
            </div>

            {reviewed && <>
            {/* Executive Directive Note (Optional) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Executive Directive / Note (Optional)
              </label>
              <input
                type="text"
                name="executive_release_directive_note"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g., Authorized within Q4 operational plan."
                maxLength={1000}
                disabled={submitting}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-800 transition"
              />
            </div>

            <WalletReleaseAuthorization key={reviewed.id}
              payload={{ id: reviewed.id, confirmationHash: reviewed.confirmationHash, note: note.trim() || undefined }}
              onBusy={setSubmitting}
              onStale={() => {
                setPreview(null);
                setError('Review a fresh release preview before trying again.');
              }}
              onApproved={result => {
                if (result.status !== 'WALLET_CREDITED') throw new Error('The wallet credit could not be confirmed.');
                setSuccessReceipt({
                  amountFormatted, requestNumber: data.requestNumber, staff: { name: staffName, walletNumber },
                  subsidiary: { name: data.subsidiaryName, envelopeLabel: beneficiary?.envelopeLabel },
                });
              }} />
            </>}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              {!reviewed && <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Processing…' : 'Review release'}
                {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
              </button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

