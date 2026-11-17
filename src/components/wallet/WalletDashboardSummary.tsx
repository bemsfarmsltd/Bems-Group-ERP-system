'use client';
import { useEffect, useState } from 'react';
import { resolveApiUrl } from '@/lib/api-client';
import { walletMoney } from './WalletView';

type FundingSummary = {
  walletMode: boolean;
  funding: null | { availableMinor: string; envelopeMinor: string; liabilityMinor: string; observedAt: string; paused: boolean; freeMinor: string; feeReserveMinor: string; fresh: boolean; configured: boolean };
};

export default function WalletDashboardSummary({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<FundingSummary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(resolveApiUrl('/api/wallet/funding'), { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Funding unavailable'); return response.json(); })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  const funding = data?.funding;
  const free = BigInt(funding?.freeMinor ?? '0');
  const blocked = Boolean(funding && (!funding.fresh || !funding.configured || funding.paused || free < BigInt(0)));
  return <section className="card" aria-label="Wallet funding overview" style={{ border: '1px solid #fdba74', background: 'linear-gradient(120deg, #fff7ed, #ffffff)', padding: '24px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      <div>
        <p className="kicker">WALLETS & FUNDED SUBSIDIARY BUDGETS</p>
        <h2 style={{ margin: '8px 0' }}>Company funding, staff wallets and vendor payments</h2>
        <p>Review funded budgets, salary releases, staff requests and direct vendor payments. Authorized financial approvers confirm each disbursement.</p>
      </div>
      <button className="primary-button" onClick={onOpen} style={{ background: '#ea580c', color: '#fff', border: 0, borderRadius: 12, padding: '14px 20px', cursor: 'pointer', fontWeight: 700 }}>Open wallet funding →</button>
    </div>
    {!data && !error && <p role="status">Loading wallet funding…</p>}
    {error && <p role="status">The wallet overview could not be loaded. Open wallet funding to review its status.</p>}
    {data && <>
      <p role="status" style={{ marginTop: 16, fontWeight: 700 }}>{!data.walletMode ? 'Read-only review · wallet approvals and transfers are disabled.' : blocked ? 'New commitments are blocked'  : 'Wallet funding dashboard'}</p>
      {data.funding ? <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 16 }}>
          {[['Verified Monnify balance', data.funding.availableMinor], ['Remaining funded budgets', data.funding.envelopeMinor], ['Unsettled approved funds', data.funding.liabilityMinor], ['Transfer fee reserve', data.funding.feeReserveMinor], [free < BigInt(0) ? 'Funding shortfall' : 'Unallocated funds', (free < BigInt(0) ? -free : free).toString()]].map(([label, value]) => <div key={label}><p>{label}</p><strong style={{ fontSize: 24 }}>{walletMoney(value)}</strong></div>)}
        </div>
        {free < BigInt(0) && <p role="alert" style={{ color: '#9f1239', fontWeight: 700 }}>Monnify funding is short by {walletMoney((-free).toString())}. Open Wallet Funding to review commitments and reconciliation.</p>}
        {!data.funding.fresh && <p role="status">The last observed balance needs refreshing.</p>}
        <p style={{ marginTop: 12 }}>Last provider observation: {new Date(data.funding.observedAt).toLocaleString()}. The funding dashboard checks freshness before any new commitment.</p>
      </> : <p style={{ marginTop: 12 }}>Monnify funding is not connected yet. No provider balance or withdrawable funds have been assumed.</p>}
    </>}
  </section>;
}
