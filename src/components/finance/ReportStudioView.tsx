'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Printer, RefreshCw, Search, ShieldCheck, Wallet, Clock, CheckCircle2, X, ExternalLink, Eye, Layers, ArrowRight } from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { walletMoney } from '@/components/wallet/WalletView';

type DrillTransactionItem = {
  id: string;
  reference: string;
  requestNumber: string | null;
  title: string;
  subsidiaryName: string;
  subsidiaryCode: string;
  requesterName: string;
  requesterCode: string;
  category: string;
  requestType: string;
  isRecurring: boolean;
  recurringInterval: string | null;
  approvalStatus: string;
  paymentStatus: string;
  accountabilityStatus: string;
  channel: string;
  amountMinor: string;
  feeMinor: string;
  isSettled: boolean;
  date: string;
};

type ReportRow = {
  organizationId: string;
  name: string;
  code: string;
  subtitle?: string;
  type?: string;
  settledTxCount: number;
  totalTxCount: number;
  approvedGrossMinor: string;
  chargesMinor: string;
  netDisbursableMinor: string;
  settledMinor: string;
  pendingMinor: string;
  totalRequestedMinor: string;
  settlementPct: number;
  transactions?: DrillTransactionItem[];
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
  const [selectedDrillRow, setSelectedDrillRow] = useState<ReportRow | null>(null);
  const [drillFilter, setDrillFilter] = useState<'ALL' | 'SETTLED' | 'PENDING' | 'RECURRING'>('ALL');
  const [drillSearch, setDrillSearch] = useState('');

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
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>SETTL. %</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>DEEP DIVE</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={11} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    Loading multi-subsidiary settlement statement…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    No subsidiary records match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.organizationId}
                    onClick={() => {
                      setDrillFilter('ALL');
                      setDrillSearch('');
                      setSelectedDrillRow(row);
                    }}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    className="hover:bg-orange-50/40"
                    title={`Click to inspect deeper breakdown for ${row.name}`}
                  >
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>
                      <div>{row.name}</div>
                      {row.subtitle && (
                        <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>{row.subtitle}</div>
                      )}
                    </td>
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
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
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
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrillFilter('ALL');
                          setDrillSearch('');
                          setSelectedDrillRow(row);
                        }}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 6,
                          border: '1px solid #fed7aa',
                          background: '#fff7ed',
                          color: '#ea580c',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Eye size={12} />
                        <span>Inspect ({row.transactions?.length ?? row.totalTxCount})</span>
                      </button>
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
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {data.totals.settlementPct}%
                  </td>
                  <td style={{ padding: '11px 14px' }} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* DEEP-DIVE DRILL-DOWN DOSSIER MODAL (Works across all 6 Report Studio Tabs) */}
      {selectedDrillRow && (() => {
        const allTxs = selectedDrillRow.transactions || [];
        const settledTxs = allTxs.filter((t) => t.isSettled);
        const pendingTxs = allTxs.filter((t) => !t.isSettled);
        const recurringTxs = allTxs.filter((t) => t.isRecurring);
        const q = drillSearch.trim().toLowerCase();

        const displayedTxs = allTxs.filter((t) => {
          if (drillFilter === 'SETTLED' && !t.isSettled) return false;
          if (drillFilter === 'PENDING' && t.isSettled) return false;
          if (drillFilter === 'RECURRING' && !t.isRecurring) return false;
          if (!q) return true;
          return (
            t.reference.toLowerCase().includes(q) ||
            t.title.toLowerCase().includes(q) ||
            t.requesterName.toLowerCase().includes(q) ||
            t.subsidiaryName.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q) ||
            t.channel.toLowerCase().includes(q)
          );
        });

        // Compute category distribution inside this row
        const catTotals = new Map<string, { count: number; amountMinor: bigint }>();
        for (const t of allTxs) {
          const catKey = t.category.replace(/_/g, ' ');
          const cur = catTotals.get(catKey) || { count: 0, amountMinor: BigInt(0) };
          cur.count += 1;
          cur.amountMinor += BigInt(t.amountMinor || '0');
          catTotals.set(catKey, cur);
        }
        const categorySummary = Array.from(catTotals.entries())
          .sort((a, b) => Number(b[1].amountMinor - a[1].amountMinor))
          .slice(0, 6);

        return (
          <div
            onClick={() => setSelectedDrillRow(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'grid',
              placeItems: 'center',
              padding: '20px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                border: '1px solid #e2e8f0',
                width: 'min(1180px, 96vw)',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 30px 70px -15px rgba(15, 23, 42, 0.35)',
              }}
            >
              {/* Modal Sticky Header */}
              <div
                style={{
                  padding: '18px 24px',
                  borderBottom: '1px solid #e2e8f0',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#fff7ed',
                        color: '#ea580c',
                        border: '1px solid #fed7aa',
                      }}
                    >
                      DEEP-DIVE LEDGER BREAKDOWN · {activeViewMeta.label.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#f1f5f9',
                        color: '#334155',
                      }}
                    >
                      {selectedDrillRow.code}
                    </span>
                    {selectedDrillRow.subtitle && (
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                        · {selectedDrillRow.subtitle}
                      </span>
                    )}
                  </div>
                  <h2 style={{ margin: '6px 0 2px', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                    {selectedDrillRow.name}
                  </h2>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Reporting Window: <strong>{data?.period.from} – {data?.period.to}</strong> ({data?.period.label}) · {allTxs.length} Underlying Ledger Transactions
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {viewKey === 'ENTITIES' && onSelectBusiness && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBusiness(selectedDrillRow.organizationId);
                        setSelectedDrillRow(null);
                      }}
                      style={{
                        padding: '8px 13px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#0f172a',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>Switch Workspace to {selectedDrillRow.code}</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedDrillRow(null)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#475569',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                    title="Close Deep-Dive Dossier"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* 5 Summary Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '14px 16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                      TOTAL REQUESTED
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                      {fmtNaira(selectedDrillRow.totalRequestedMinor)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {selectedDrillRow.totalTxCount} total transactions
                    </div>
                  </div>

                  <div style={{ padding: '14px 16px', borderRadius: '12px', background: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase' }}>
                      APPROVED (GROSS)
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>
                      {fmtNaira(selectedDrillRow.approvedGrossMinor)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9a3412', marginTop: '2px' }}>
                      Net Disbursable: {fmtNaira(selectedDrillRow.netDisbursableMinor)}
                    </div>
                  </div>

                  <div style={{ padding: '14px 16px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>
                      SETTLED TO BANK / PAID
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
                      {fmtNaira(selectedDrillRow.settledMinor)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#065f46', marginTop: '2px' }}>
                      {selectedDrillRow.settledTxCount} paid · Charges: {fmtNaira(selectedDrillRow.chargesMinor)}
                    </div>
                  </div>

                  <div style={{ padding: '14px 16px', borderRadius: '12px', background: BigInt(selectedDrillRow.pendingMinor) > BigInt(0) ? '#fffbeb' : '#f8fafc', border: `1px solid ${BigInt(selectedDrillRow.pendingMinor) > BigInt(0) ? '#fde68a' : '#e2e8f0'}` }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: BigInt(selectedDrillRow.pendingMinor) > BigInt(0) ? '#b45309' : '#64748b', textTransform: 'uppercase' }}>
                      PENDING (UNPAID EXPOSURE)
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 900, color: BigInt(selectedDrillRow.pendingMinor) > BigInt(0) ? '#d97706' : '#64748b', marginTop: '4px' }}>
                      {fmtNaira(selectedDrillRow.pendingMinor)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {pendingTxs.length} unpaid / in-review items
                    </div>
                  </div>

                  <div style={{ padding: '14px 16px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                        SETTLEMENT RATE
                      </span>
                      <strong style={{ fontSize: '14px', fontWeight: 900, color: selectedDrillRow.settlementPct >= 95 ? '#059669' : '#d97706' }}>
                        {selectedDrillRow.settlementPct}%
                      </strong>
                    </div>
                    <div style={{ width: '100%', height: '8px', borderRadius: '999px', background: '#f1f5f9', overflow: 'hidden', marginTop: '10px' }}>
                      <div
                        style={{
                          width: `${Math.min(100, selectedDrillRow.settlementPct)}%`,
                          height: '100%',
                          background: selectedDrillRow.settlementPct >= 95 ? '#10b981' : '#f59e0b',
                          borderRadius: '999px',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '6px' }}>
                      {selectedDrillRow.settledTxCount} of {selectedDrillRow.totalTxCount} items settled
                    </div>
                  </div>
                </div>

                {/* Category Composition Chips inside this Row */}
                {categorySummary.length > 0 && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Layers size={13} color="#ea580c" />
                      <span>CATEGORY COMPOSITION:</span>
                    </span>
                    {categorySummary.map(([catName, info]) => (
                      <span
                        key={catName}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#0f172a',
                        }}
                      >
                        {catName}: <strong style={{ color: '#ea580c' }}>{fmtNaira(info.amountMinor)}</strong> ({info.count})
                      </span>
                    ))}
                  </div>
                )}

                {/* Filter Tabs & Search Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {([
                      { key: 'ALL', label: `All Transactions (${allTxs.length})` },
                      { key: 'SETTLED', label: `Paid / Settled (${settledTxs.length})` },
                      { key: 'PENDING', label: `Pending / Unpaid (${pendingTxs.length})` },
                      { key: 'RECURRING', label: `Recurring (${recurringTxs.length})` },
                    ] as const).map((tab) => {
                      const active = drillFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setDrillFilter(tab.key)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: active ? '1px solid #ea580c' : '1px solid #cbd5e1',
                            background: active ? '#ea580c' : '#ffffff',
                            color: active ? '#ffffff' : '#334155',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ position: 'relative' }}>
                    <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="search"
                      placeholder="Search request #, title, staff, bank..."
                      value={drillSearch}
                      onChange={(e) => setDrillSearch(e.target.value)}
                      style={{
                        padding: '7px 12px 7px 30px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        color: '#0f172a',
                        background: '#f8fafc',
                        width: '250px',
                      }}
                    />
                  </div>
                </div>

                {/* Line-by-Line Transactions Table */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>REF &amp; DATE</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>REQUISITION TITLE &amp; CATEGORY</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>ENTITY</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>STAFF / BENEFICIARY</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>SETTLEMENT CHANNEL</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>APPROVAL</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>PAYMENT STATUS</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>AMOUNT</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>DOSSIER</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedTxs.length === 0 ? (
                          <tr>
                            <td colSpan={9} style={{ padding: '28px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                              No individual transactions recorded for {selectedDrillRow.name} in this filter.
                            </td>
                          </tr>
                        ) : (
                          displayedTxs.map((tx) => (
                            <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 800, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#1d4ed8', fontSize: '11.5px' }}>
                                  {tx.reference}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                  {tx.date.slice(0, 10)}
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{tx.title}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                                    {tx.category.replace(/_/g, ' ')} · {tx.requestType.replace(/_/g, ' ')}
                                  </span>
                                  {tx.isRecurring && (
                                    <span style={{ fontSize: '9.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                                      🔁 {tx.recurringInterval || 'MONTHLY'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '11.5px' }}>{tx.subsidiaryName}</div>
                                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>{tx.subsidiaryCode}</div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{tx.requesterName}</div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>{tx.requesterCode}</div>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#334155', fontWeight: 600, fontSize: '11.5px' }}>
                                {tx.channel}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    background: tx.approvalStatus === 'APPROVED' ? '#ecfdf5' : '#fffbeb',
                                    color: tx.approvalStatus === 'APPROVED' ? '#047857' : '#b45309',
                                    border: `1px solid ${tx.approvalStatus === 'APPROVED' ? '#a7f3d0' : '#fde68a'}`,
                                  }}
                                >
                                  {tx.approvalStatus.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    background: tx.isSettled ? '#ecfdf5' : '#fef3c7',
                                    color: tx.isSettled ? '#047857' : '#b45309',
                                    border: `1px solid ${tx.isSettled ? '#a7f3d0' : '#fde68a'}`,
                                  }}
                                >
                                  {tx.paymentStatus.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: tx.isSettled ? '#059669' : '#0f172a', whiteSpace: 'nowrap' }}>
                                {fmtNaira(tx.amountMinor)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {tx.requestNumber ? (
                                  <Link
                                    href={`/requests/${encodeURIComponent(tx.requestNumber)}`}
                                    target="_blank"
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid #cbd5e1',
                                      background: '#ffffff',
                                      color: '#0f172a',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      textDecoration: 'none',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <span>Dossier</span>
                                    <ExternalLink size={11} />
                                  </Link>
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
