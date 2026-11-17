'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ArrowLeftRight, CheckCircle2, Clock, FileText } from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { walletMoney } from '@/components/wallet/WalletView';

type IntercompanyNoteRow = {
  id: string;
  noteNumber: string;
  noteType: string;
  status: string;
  description: string;
  totalAmountMinor: string | number;
  currency: string;
  generatedAt: string;
  sourceEntity?: { id: string; legalName: string; code: string } | null;
  targetEntity?: { id: string; legalName: string; code: string } | null;
};

export function IntercompanyNotesView({ scope }: { scope?: string }) {
  const [notes, setNotes] = useState<IntercompanyNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ISSUED' | 'RECONCILED' | 'SETTLED'>('ALL');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = scope && scope !== 'ALL' && scope !== 'GROUP' ? `?subsidiary=${encodeURIComponent(scope)}` : '';
      const res = await fetch(resolveApiUrl(`/api/intercompany${q}`), { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load intercompany notes.');
      setNotes(data?.notes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load intercompany notes.');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (statusFilter !== 'ALL' && n.status !== statusFilter) return false;
      if (!q) return true;
      return `${n.noteNumber} ${n.noteType} ${n.description} ${n.sourceEntity?.legalName || ''} ${n.targetEntity?.legalName || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [notes, statusFilter, query]);

  const totalMinor = notes.reduce((sum, n) => sum + BigInt(n.totalAmountMinor || 0), BigInt(0));
  const issuedMinor = notes.filter((n) => n.status === 'ISSUED').reduce((sum, n) => sum + BigInt(n.totalAmountMinor || 0), BigInt(0));
  const settledMinor = notes.filter((n) => n.status === 'SETTLED' || n.status === 'RECONCILED').reduce((sum, n) => sum + BigInt(n.totalAmountMinor || 0), BigInt(0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#ea580c', textTransform: 'uppercase' }}>
            LEGAL & INTER-ENTITY RECONCILIATION
          </div>
          <h1 style={{ margin: '4px 0 2px', fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Intercompany Debit & Credit Notes
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
            Automated inter-subsidiary billing, shared payroll allocations, and holding-company clearing ledger.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <RefreshCw size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 4 KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ background: 'linear-gradient(135deg, #ea580c, #f97316)', borderRadius: 12, padding: '14px 16px', color: '#ffffff', boxShadow: '0 4px 14px rgba(234, 88, 12, 0.22)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', opacity: 0.9 }}>TOTAL INTERCOMPANY VOLUME</span>
            <ArrowLeftRight size={14} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{walletMoney(totalMinor.toString())}</div>
          <div style={{ fontSize: 11, opacity: 0.9 }}>{notes.length} note(s) generated</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b' }}>PENDING / ISSUED</span>
            <Clock size={14} color="#d97706" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{walletMoney(issuedMinor.toString())}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Awaiting inter-entity settlement</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b' }}>RECONCILED & SETTLED</span>
            <CheckCircle2 size={14} color="#059669" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{walletMoney(settledMinor.toString())}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Cleared across subsidiary books</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b' }}>COMPLIANCE STATUS</span>
            <FileText size={14} color="#0f172a" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>Audit-Ready</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Auto-generated from payroll & shared spends</div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['ALL', 'ISSUED', 'RECONCILED', 'SETTLED'] as const).map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1px solid #ea580c' : '1px solid #cbd5e1',
                  background: active ? 'linear-gradient(135deg, #ea580c, #f97316)' : '#ffffff',
                  color: active ? '#ffffff' : '#334155',
                }}
              >
                {s === 'ALL' ? 'All Notes' : s}
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search note #, entity, or description…"
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            fontSize: 12,
            minWidth: 240,
          }}
        />
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* NOTES TABLE */}
      <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13.5, color: '#0f172a' }}>Intercompany Note Register</strong>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0' }}>
            {filtered.length} Notes
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>NOTE #</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>TYPE</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>SOURCE ENTITY</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>TARGET ENTITY</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>DESCRIPTION</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>AMOUNT</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>STATUS</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>DATE</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 26, textAlign: 'center', color: '#64748b' }}>Loading intercompany notes…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 26, textAlign: 'center', color: '#64748b' }}>No intercompany notes recorded for this scope yet.</td></tr>
              ) : (
                filtered.map((n) => (
                  <tr key={n.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-orange-50/30">
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono-tech, monospace)', fontWeight: 700, color: '#0f172a' }}>{n.noteNumber}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, background: n.noteType === 'DEBIT_NOTE' ? '#fff7ed' : '#ecfdf5', color: n.noteType === 'DEBIT_NOTE' ? '#c2410c' : '#047857', border: `1px solid ${n.noteType === 'DEBIT_NOTE' ? '#fed7aa' : '#a7f3d0'}` }}>
                        {n.noteType.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 600 }}>{n.sourceEntity?.legalName || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#334155' }}>{n.targetEntity?.legalName || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#475569', maxWidth: 280 }}>{n.description}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0f172a' }}>
                      {walletMoney(String(n.totalAmountMinor || 0))}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, background: n.status === 'SETTLED' || n.status === 'RECONCILED' ? '#ecfdf5' : '#fffbeb', color: n.status === 'SETTLED' || n.status === 'RECONCILED' ? '#047857' : '#b45309', border: `1px solid ${n.status === 'SETTLED' || n.status === 'RECONCILED' ? '#a7f3d0' : '#fde68a'}` }}>
                        {n.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#64748b' }}>
                      {new Date(n.generatedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
