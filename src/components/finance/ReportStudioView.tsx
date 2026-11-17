'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw, Search, ShieldCheck, Wallet, Clock, CheckCircle2 } from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { walletMoney } from '@/components/wallet/WalletView';

type ReportRow = {
  organizationId: string;
  name: string;
  code: string;
  type: string;
  settledTxCount: number;
  totalTxCount: number;
  approvedGrossMinor: string;
  chargesMinor: string;
  netDisbursableMinor: string;
  settledMinor: string;
  pendingMinor: string;
  totalRequestedMinor: string;
  settlementPct: number;
};

type ReportStudioPayload = {
  statementRef: string;
  period: { key: string; label: string; from: string; to: string };
  kpis: {
    approvedGrossMinor: string;
    chargesMinor: string;
    netSettledMinor: string;
    pendingMinor: string;
    totalRequestedMinor: string;
    settledTxCount: number;
    totalTxCount: number;
    settlementPct: number;
    accountabilityClosedCount: number;
    accountabilityTotalCount: number;
    accountabilityRatePct: number;
  };
  rows: ReportRow[];
  totals: {
    settledTxCount: number;
    totalTxCount: number;
    approvedGrossMinor: string;
    chargesMinor: string;
    netDisbursableMinor: string;
    settledMinor: string;
    pendingMinor: string;
    totalRequestedMinor: string;
    settlementPct: number;
  };
};

const VIEW_OPTIONS = [
  { key: 'ENTITIES', label: 'By Entity', title: 'Subsidiary & Holding Company Settlement Statement', colLabel: 'ENTITY NAME', codeLabel: 'CODE' },
  { key: 'STAFF', label: 'By Staff', title: 'Staff Expenditure, Wallet & Settlement Statement', colLabel: 'STAFF MEMBER', codeLabel: 'STAFF ID' },
  { key: 'ACCOUNTS', label: 'By Account', title: 'Treasury, Monnify & Bank Account Settlement Statement', colLabel: 'ACCOUNT / BANK', codeLabel: 'ACCOUNT' },
  { key: 'PAYMENT_TYPES', label: 'By Payment Type', title: 'Payment Type & Channel Settlement Statement', colLabel: 'PAYMENT TYPE', codeLabel: 'TYPE' },
  { key: 'CATEGORIES', label: 'By Category', title: 'Expenditure Category Settlement Statement', colLabel: 'REQUEST CATEGORY', codeLabel: 'CATEGORY' },
  { key: 'RECURRING', label: 'By Recurring', title: 'Recurring Commitments vs. One-Off Settlement Statement', colLabel: 'CADENCE / TYPE', codeLabel: 'MODE' },
] as const;

const PERIOD_OPTIONS = [
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_MONTH', label: 'Last Month' },
  { key: 'YTD', label: 'Year to Date' },
  { key: 'ALL_TIME', label: 'All-Time' },
  { key: 'CUSTOM', label: 'Custom Range' },
] as const;

const fmtNaira = (minor: string | bigint | number) => walletMoney(String(minor ?? '0'));

export function ReportStudioView({
  scope,
  onSelectBusiness,
}: {
  scope: string;
  onSelectBusiness?: (id: string) => void;
}) {
  const [viewKey, setViewKey] = useState<string>('ENTITIES');
  const [periodKey, setPeriodKey] = useState<string>('THIS_MONTH');
  const [fromDate, setFromDate] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ReportStudioPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activeViewMeta = VIEW_OPTIONS.find((v) => v.key === viewKey) || VIEW_OPTIONS[0];

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ scope, period: periodKey, view: viewKey });
    if (periodKey === 'CUSTOM') {
      params.set('from', fromDate);
      params.set('to', toDate);
    }
    try {
      const res = await fetch(resolveApiUrl(`/api/finance/report-studio?${params.toString()}`), {
        credentials: 'include',
        cache: 'no-store',
        signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load Report Studio.');
      if (!signal?.aborted) setData(json);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Could not load Report Studio.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [scope, periodKey, viewKey, fromDate, toDate]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [data, search]);

  function exportCsv() {
    if (!data) return;
    const header = [
      'Entity Name',
      'Code',
      'Paid TXs',
      'Total TXs',
      'Approved Gross (NGN)',
      'Charges (NGN)',
      'Net Disbursable (NGN)',
      'Settled (NGN)',
      'Pending Unpaid (NGN)',
      'Total Requested (NGN)',
      'Settlement %',
    ];
    const lines = filteredRows.map((r) => [
      r.name,
      r.code,
      String(r.settledTxCount),
      String(r.totalTxCount),
      (Number(r.approvedGrossMinor) / 100).toFixed(2),
      (Number(r.chargesMinor) / 100).toFixed(2),
      (Number(r.netDisbursableMinor) / 100).toFixed(2),
      (Number(r.settledMinor) / 100).toFixed(2),
      (Number(r.pendingMinor) / 100).toFixed(2),
      (Number(r.totalRequestedMinor) / 100).toFixed(2),
      `${r.settlementPct}%`,
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.statementRef}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HEADER + CONTROLS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#ea580c', textTransform: 'uppercase' }}>
            EXECUTIVE INTELLIGENCE & REPORTING · REPORT STUDIO
          </div>
          <h1 style={{ margin: '4px 0 2px', fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Entity Expenditure & Settlement Statement
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
            Live multi-subsidiary disbursement, transfer fee, settlement, and pending exposure ledger.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <select
            aria-label="Reporting period"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>

          {periodKey === 'CUSTOM' && (
            <>
              <input
                type="date"
                aria-label="From date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12 }}
              />
              <input
                type="date"
                aria-label="To date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12 }}
              />
            </>
          )}

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{
              padding: '7px 11px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || !filteredRows.length}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #ea580c',
              background: '#fff7ed',
              color: '#c2410c',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #ea580c',
              background: 'linear-gradient(135deg, #ea580c, #f97316)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Printer size={13} />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* DIMENSION SWITCHER */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {VIEW_OPTIONS.map((opt) => {
          const active = opt.key === viewKey;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setViewKey(opt.key)}
              style={{
                padding: '7px 13px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: active ? '1px solid #ea580c' : '1px solid #cbd5e1',
                background: active ? 'linear-gradient(135deg, #ea580c, #f97316)' : '#ffffff',
                color: active ? '#ffffff' : '#334155',
                boxShadow: active ? '0 2px 8px rgba(234, 88, 12, 0.2)' : 'none',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* 4 KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <div
          style={{
            background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
            borderRadius: 12,
            padding: '14px 16px',
            color: '#ffffff',
            boxShadow: '0 4px 14px rgba(234, 88, 12, 0.22)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', opacity: 0.9 }}>APPROVED OUTFLOW (GROSS)</span>
            <Wallet size={14} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {data ? fmtNaira(data.kpis.approvedGrossMinor) : '—'}
          </div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
            {data ? `${data.kpis.settledTxCount} / ${data.kpis.totalTxCount} transactions settled` : 'Loading statement…'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b' }}>NET SETTLED TO RECIPIENTS</span>
            <CheckCircle2 size={14} color="#059669" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {data ? fmtNaira(data.kpis.netSettledMinor) : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {data ? `${data.kpis.settlementPct}% settlement completion` : '—'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b' }}>PENDING (UNPAID EXPOSURE)</span>
            <Clock size={14} color="#d97706" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {data ? fmtNaira(data.kpis.pendingMinor) : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {data ? `Charges: ${fmtNaira(data.kpis.chargesMinor)}` : '—'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b' }}>ACCOUNTABILITY CLOSURE</span>
            <ShieldCheck size={14} color="#0f172a" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {data ? `${data.kpis.accountabilityRatePct}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {data ? `${data.kpis.accountabilityClosedCount} / ${data.kpis.accountabilityTotalCount} approved cases closed` : '—'}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* STATEMENT TABLE CARD */}
      <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            background: '#ffffff',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              {activeViewMeta.title}
            </h2>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3, fontFamily: 'var(--font-mono-tech, monospace)' }}>
              Reference: {data?.statementRef || 'BEMS-REP-PENDING'} &bull; Period: {data ? `${data.period.from} – ${data.period.to}` : '—'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="search"
                placeholder="Filter entity or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '6px 10px 6px 28px',
                  borderRadius: 7,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  color: '#0f172a',
                  background: '#f8fafc',
                  width: 190,
                }}
              />
            </div>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                fontSize: 11,
                fontWeight: 700,
                color: '#334155',
                whiteSpace: 'nowrap',
              }}
            >
              {filteredRows.length} Records
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>{activeViewMeta.colLabel}</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>{activeViewMeta.codeLabel}</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>PAID / TOTAL TXS</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>APPROVED (GROSS)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>CHARGES</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>NET DISBURSABLE</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>SETTLED TO BANK</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>PENDING (UNPAID)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>TOTAL REQUESTED</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>SETTL. %</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={10} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    Loading multi-subsidiary settlement statement…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    No subsidiary records match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.organizationId}
                    onClick={() => viewKey === 'ENTITIES' && onSelectBusiness?.(row.organizationId)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: viewKey === 'ENTITIES' && onSelectBusiness ? 'pointer' : 'default',
                      transition: 'background 0.12s',
                    }}
                    className="hover:bg-orange-50/40"
                  >
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>{row.name}</td>
                    <td style={{ padding: '11px 12px', fontFamily: 'var(--font-mono-tech, monospace)', fontSize: 11.5, color: '#475569' }}>{row.code}</td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#334155' }}>
                      {row.settledTxCount} / {row.totalTxCount}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0f172a' }}>
                      {fmtNaira(row.approvedGrossMinor)}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                      {fmtNaira(row.chargesMinor)}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0f172a' }}>
                      {fmtNaira(row.netDisbursableMinor)}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#059669' }}>
                      {fmtNaira(row.settledMinor)}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: BigInt(row.pendingMinor) > BigInt(0) ? '#d97706' : '#64748b' }}>
                      {fmtNaira(row.pendingMinor)}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0f172a' }}>
                      {fmtNaira(row.totalRequestedMinor)}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: 5,
                          fontSize: 11,
                          background: row.settlementPct >= 95 ? '#ecfdf5' : row.settlementPct >= 50 ? '#fffbeb' : '#f8fafc',
                          color: row.settlementPct >= 95 ? '#047857' : row.settlementPct >= 50 ? '#b45309' : '#475569',
                          border: `1px solid ${row.settlementPct >= 95 ? '#a7f3d0' : row.settlementPct >= 50 ? '#fde68a' : '#e2e8f0'}`,
                        }}
                      >
                        {row.settlementPct}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {data && filteredRows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800, color: '#0f172a' }}>
                  <td style={{ padding: '11px 14px' }}>CONSOLIDATED TOTAL</td>
                  <td style={{ padding: '11px 12px', fontFamily: 'var(--font-mono-tech, monospace)', fontSize: 11, color: '#64748b' }}>ALL</td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {data.totals.settledTxCount} / {data.totals.totalTxCount}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNaira(data.totals.approvedGrossMinor)}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                    {fmtNaira(data.totals.chargesMinor)}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNaira(data.totals.netDisbursableMinor)}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#059669' }}>
                    {fmtNaira(data.totals.settledMinor)}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#d97706' }}>
                    {fmtNaira(data.totals.pendingMinor)}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNaira(data.totals.totalRequestedMinor)}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {data.totals.settlementPct}%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
