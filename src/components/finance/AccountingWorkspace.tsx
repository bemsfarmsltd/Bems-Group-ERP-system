'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { financeWorkspaceStyles, PageHeading, StateMessage } from '@/components/dashboard/gmd/BusinessModules';
import { resolveApiUrl } from '@/lib/api-client';
import { walletMoney } from '@/components/wallet/WalletView';

const { primary, secondary, input, card } = financeWorkspaceStyles;
const endpoint = '/api/finance/accounting';
const tabs = ['General ledger', 'Statements', 'Bank reconciliation', 'Bills & invoices', 'Period close', 'Cash forecast', 'Fixed assets'] as const;
type Tab = (typeof tabs)[number];
type Account = { id: string; code: string; name: string; kind: string; cash: boolean };
type Report = { code: string; name: string; kind: string; movementMinor: string; endingMinor: string };
type CashLine = { id: string; accountId: string; accountName: string; date: string; reference: string; memo: string; amountMinor: string; matchedLineId?: string; ownerName?: string | null };
type Journal = { id: string; date: string; memo: string; reference: string; source: string; groupOnly: boolean; lines: { code: string; name: string; amountMinor: string; department: string | null; project: string | null }[] };
type FinanceData = {
  entity: string; organizations: { id: string; legalName: string; type: string }[];
  canConsolidate: boolean; canManage: boolean; canPost: boolean; canClose: boolean;
  financeOfficers: { id: string; legalName: string }[];
  sources: { id: string; kind: string; reference: string; name: string; date: string; amountMinor: string }[];
  accounts: Account[]; reports: Report[]; journals: Journal[]; statementLines: CashLine[]; cashLines: CashLine[];
  statementBalances: { accountId: string; name: string; openingMinor: string; closingMinor: string; reference: string }[];
  cashStatement: { source: string; receiptsMinor: string; paymentsMinor: string }[];
  departments: { id: string; name: string }[]; projects: { id: string; projectCode: string; departmentId: string | null }[];
  openItems: { id: string; kind: string; party: string; reference: string; dueOn: string; amountMinor: string; remainingMinor: string }[];
  vendorInvoices: { id: string; invoiceNumber: string; amountMinor: string; vendor: { name: string } }[];
  closed: { month: string; closedAt: string; note: string }[];
  cashBalanceMinor: string; forecast: { week: string; amountMinor: string }[];
  cashPlan: { id: string; date: string; label: string; amountMinor: string }[];
  assets: { id: string; tag: string; name: string; location: string; costMinor: string; depreciationMinor: string; disposedOn: string | null; nextPosting: string | null }[];
};

type Option = [value: string, label: string];
type Field = { name: string; label: string; type?: string; options?: Option[]; optional?: boolean; value?: string; note?: string };
type Operation = { title: string; action: string; fields: Field[]; extra?: Record<string, unknown> };
type JournalDraftLine = { accountId: string; amount: string; departmentId: string; projectId: string };
const blankLine = (): JournalDraftLine => ({ accountId: '', amount: '', departmentId: '', projectId: '' });
const money = (value: bigint | string) => walletMoney(value.toString());
const today = () => new Date().toISOString().slice(0, 10);
const date = (label = 'Posting date'): Field => ({ name: 'date', label, type: 'date', value: today() });
const amount: Field = { name: 'amount', label: 'Amount (₦)' };

function Badge({ label, tone = 'slate' }: { label: string; tone?: 'green' | 'amber' | 'red' | 'slate' | 'orange' }) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    green: { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
    amber: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
    red: { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
    orange: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
    slate: { bg: '#f8fafc', fg: '#475569', border: '#e2e8f0' },
  };
  const c = palette[tone];
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function Table({
  headers,
  rows,
  rightCols = [],
  empty = 'No records to show.',
  emptyAction,
}: {
  headers: string[];
  rows: { id: string; cells: ReactNode[] }[];
  rightCols?: number[];
  empty?: string;
  emptyAction?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {headers.map((header, idx) => (
              <th
                key={header}
                scope="col"
                style={{
                  padding: '9px 14px',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  textAlign: rightCols.includes(idx) ? 'right' : 'left',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: '22px 14px', textAlign: 'center', color: '#64748b' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span>{empty}</span>
                  {emptyAction}
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-orange-50/30">
                {row.cells.map((cell, index) => (
                  <td
                    key={index}
                    style={{
                      padding: '10px 14px',
                      verticalAlign: 'top',
                      textAlign: rightCols.includes(index) ? 'right' : 'left',
                      fontVariantNumeric: rightCols.includes(index) ? 'tabular-nums' : undefined,
                      fontWeight: rightCols.includes(index) ? 600 : undefined,
                      color: '#0f172a',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ title, description, badge, action, children }: { title: string; description?: string; badge?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          padding: '13px 16px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
            {badge && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                {badge}
              </span>
            )}
          </div>
          {description && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function exportReport(rows: Report[], month: string) {
  const csv = [['Account', 'Name', 'Type', 'Monthly movement (kobo)', 'Ending balance (kobo)'],
    ...rows.map(row => [row.code, row.name, row.kind, row.movementMinor, row.endingMinor])]
    .map((row, rowIndex) => row.map((value, column) => {
      const safe = rowIndex && column < 3 && /^[=+\-@\s]/.test(value) ? "'" + value : value;
      return '"' + safe.replaceAll('"', '""') + '"';
    }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'trial-balance-' + month + '.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statementRows(text: string) {
  return text.trim().split(/\r?\n/).filter(line => line.trim()).flatMap((line, idx) => {
    const delimiter = line.includes('\t') ? '\t' : ',';
    const [date, reference, amount, ...memo] = line.split(delimiter).map(part => part.trim().replace(/^"|"$/g, ''));
    if (idx === 0 && /^date$/i.test(date || '')) return [];
    if (!date || !reference || !amount) throw new Error('Each statement row needs a date, transaction ID, and signed naira amount separated by tabs or commas.');
    return [{ date, reference, amount, memo: memo.join(' ').trim() || reference }];
  });
}

export function AccountingWorkspace({ scope }: { scope: string }) {
  const [tab, setTab] = useState<Tab>('General ledger');
  const [entity, setEntity] = useState('');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [consolidated, setConsolidated] = useState(false);
  const [result, setResult] = useState<FinanceData>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [operation, setOperation] = useState<Operation>();
  const [draft, setDraft] = useState<JournalDraftLine[]>([blankLine(), blankLine()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams({ scope, month, consolidated: String(consolidated) });
    if (entity) params.set('entity', entity);
    try {
      const res = await fetch(resolveApiUrl(endpoint + '?' + params), { credentials: 'include', cache: 'no-store', signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load accounting records.');
      if (!signal?.aborted) setResult(data);
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load accounting records.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [scope, entity, month, consolidated]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function open(value: Operation) {
    setNotice('');
    setSaveError('');
    setDraft([blankLine(), blankLine()]);
    setOperation(value);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || !operation || busy || loading) return;
    setBusy(true);
    setSaveError('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const payload: Record<string, unknown> = { action: operation.action, entity: result.entity, scope, ...values, ...operation.extra };
      for (const field of operation.fields) if (field.type === 'checkbox') payload[field.name] = values[field.name] === 'on';
      if (operation.action === 'POST_JOURNAL') payload.lines = draft;
      if (operation.action === 'IMPORT_STATEMENT') {
        payload.rows = statementRows(String(values.statement));
        delete payload.statement;
      }
      const res = await fetch(resolveApiUrl(endpoint), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The accounting entry could not be saved.');
      setOperation(undefined);
      setNotice(operation.action === 'IMPORT_STATEMENT' ? data.result + ' new statement line(s) imported.' : 'Accounting record saved.');
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the accounting entry.');
    } finally {
      setBusy(false);
    }
  }

  if (!result) return <>
    <PageHeading eyebrow="FINANCE" title="Accounting" description="Company books, bank reconciliation and month-end reporting." />
    {loadError ? <StateMessage value={loadError} retry={() => void load()} /> : <p role="status">Loading accounting workspace…</p>}
  </>;

  const canPost = result.canManage && result.canPost;
  const button = (label: string, value: Operation, allowed = result.canManage) => allowed
    ? <button type="button" style={secondary} disabled={loading || Boolean(loadError)} onClick={() => open(value)}>{label}</button> : null;
  const options = (filter = (account: Account) => Boolean(account)) => result.accounts.filter(filter).map((account): Option => [account.id, account.code + ' · ' + account.name]);
  const accountField = (name: string, label: string, filter?: (account: Account) => boolean, optional = false): Field => ({ name, label, options: options(filter), optional });
  const cashField = (optional = false) => accountField('accountId', 'Bank or cash account', a => a.cash, optional);
  const selectedEntity = result.organizations.find(org => org.id === result.entity);
  const journalFields: Field[] = [date(), { name: 'reference', label: 'Journal reference' }, { name: 'memo', label: 'Explanation', type: 'textarea' }];
  const accounts = result.accounts.map(a => ({ id: a.id, cells: [a.code, a.name, a.kind, a.cash ? 'Yes' : '—'] }));
  const documents = result.openItems.map(item => {
    const outstanding = BigInt(item.remainingMinor) > BigInt(0);
    const age = Math.floor((Date.parse(today()) - Date.parse(item.dueOn)) / 86400000);
    const aging = !outstanding ? 'Settled' : age <= 0 ? 'Current' : age <= 30 ? '1–30 days' : age <= 60 ? '31–60 days' : age <= 90 ? '61–90 days' : 'Over 90 days';
    const agingTone = !outstanding ? 'green' : age <= 0 ? 'slate' : age <= 30 ? 'amber' : 'red';
    return { id: item.id, cells: [
      <Badge key="kind" label={item.kind === 'PAYABLE' ? 'Payable' : 'Receivable'} tone={item.kind === 'PAYABLE' ? 'orange' : 'slate'} />,
      item.party, item.reference, item.dueOn,
      money(item.amountMinor), money(item.remainingMinor),
      <Badge key="aging" label={aging} tone={agingTone} />,
      outstanding && button('Record settlement', { action: 'SETTLE_OPEN_ITEM', title: 'Record an existing settlement', extra: { itemId: item.id },
        fields: [date('Payment date'), { name: 'reference', label: 'Bank payment reference' }, amount, cashField()] }, canPost)] };
  });
  const assign = (line: CashLine, targetType: 'LEDGER' | 'STATEMENT') => button(line.ownerName ? 'Reassign' : 'Assign', {
    action: 'ASSIGN_RECONCILIATION', title: 'Assign reconciliation for ' + line.reference, extra: { targetType, targetId: line.id },
    fields: [{ name: 'ownerId', label: 'Finance officer', options: result.financeOfficers.map(officer => [officer.id, officer.legalName]) }],
  });
  const reportAmount = (row: Report, period = false) => BigInt(period ? row.movementMinor : row.endingMinor);
  const pnl = result.reports.filter(row => ['REVENUE', 'EXPENSE'].includes(row.kind));
  const surplus = pnl.reduce((sum, row) => sum - reportAmount(row, true), BigInt(0));
  const cumulativeEarnings = pnl.reduce((sum, row) => sum - reportAmount(row), BigInt(0));
  const balanceRows = result.reports.filter(row => !['REVENUE', 'EXPENSE'].includes(row.kind))
    .map(row => ({ id: row.code + row.kind, cells: [row.code, row.name, row.kind, money(reportAmount(row) * (row.kind === 'ASSET' ? BigInt(1) : BigInt(-1)))] as ReactNode[] }));
  if (pnl.length) balanceRows.push({ id: 'earnings', cells: ['—', 'Cumulative unclosed earnings', 'EQUITY', money(cumulativeEarnings)] });
  const forecastRows = result.forecast.reduce<{ balance: bigint; rows: { id: string; cells: string[] }[] }>((state, week) => {
    const balance = state.balance + BigInt(week.amountMinor);
    state.rows.push({ id: week.week, cells: [week.week, money(week.amountMinor), money(balance)] });
    return { balance, rows: state.rows };
  }, { balance: BigInt(result.cashBalanceMinor), rows: [] }).rows;
  const assetOptions = (id: string) => ({ extra: { assetId: id } });
  const isMonthClosed = result.closed.some(row => row.month.slice(0, 7) >= month);
  const openItemsTotalMinor = result.openItems.reduce((sum, item) => sum + BigInt(item.remainingMinor), BigInt(0));
  const unmatchedCount = result.statementLines.filter(line => !line.matchedLineId).length;
  const draftBalanceCheck = draft.reduce((acc, line) => {
    const val = Number(String(line.amount || '').replace(/,/g, '').trim());
    if (!Number.isFinite(val)) return { ...acc, invalid: acc.invalid || Boolean(line.amount?.trim()) };
    return { ...acc, netKobo: acc.netKobo + Math.round(val * 100) };
  }, { netKobo: 0, invalid: false });

  async function seedStarterAccounts() {
    if (!result || busy) return;
    setBusy(true);
    setSaveError('');
    setNotice('');
    try {
      const res = await fetch(resolveApiUrl(endpoint), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SEED_STARTER_ACCOUNTS', entity: result.entity, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not initialize starter Chart of Accounts.');
      setNotice(`Initialized ${data.result ?? 13} standard BEMS ledger accounts for ${selectedEntity?.legalName || 'this entity'}.`);
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not initialize starter Chart of Accounts.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    {/* HEADER + INTEGRATED CONTROLS */}
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#ea580c', textTransform: 'uppercase' }}>
          FINANCE · GENERAL LEDGER & RECONCILIATION
        </div>
        <h1 style={{ margin: '4px 0 2px', fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Accounting
        </h1>
        <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
          Double-entry company books, bank reconciliation, payables/receivables, and month-end close.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <select
          aria-label="Accounting entity"
          value={result.entity}
          disabled={busy}
          onChange={event => { setOperation(undefined); setEntity(event.target.value); setConsolidated(false); }}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 12, fontWeight: 600, maxWidth: 230 }}
        >
          {result.organizations.map(org => <option key={org.id} value={org.id}>{org.legalName}</option>)}
        </select>

        <input
          aria-label="Reporting month"
          type="month"
          value={month}
          disabled={busy}
          onChange={event => { if (event.target.value) setMonth(event.target.value); }}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 12, fontWeight: 600 }}
        />

        {tab === 'Statements' && result.canConsolidate && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#334155', padding: '6px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
            <input type="checkbox" checked={consolidated} onChange={event => setConsolidated(event.target.checked)} />
            Consolidate group
          </label>
        )}

        <button style={secondary} type="button" disabled={loading || busy} onClick={() => void load()}>Refresh</button>

        {result.canManage && accounts.length === 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void seedStarterAccounts()}
            style={{
              padding: '8px 13px',
              borderRadius: 8,
              border: '1px solid #ea580c',
              background: 'linear-gradient(135deg, #ea580c, #f97316)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Initializing…' : '+ Initialize BEMS Chart of Accounts'}
          </button>
        )}
      </div>
    </div>

    {/* KPI STRIP */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      <div style={{ background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)', borderRadius: 12, padding: '14px 16px', color: '#ffffff', boxShadow: '0 4px 14px rgba(234, 88, 12, 0.22)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', opacity: 0.9, textTransform: 'uppercase' }}>Posted Cash Balance</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(result.cashBalanceMinor)}</div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{selectedEntity?.legalName || 'Selected entity'}</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>Awaiting Ledger Posting</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: result.sources.length ? '#ea580c' : '#0f172a', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{result.sources.length}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Unposted wallet / note sources</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>Open Payables & Receivables</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(openItemsTotalMinor)}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{result.openItems.filter(i => BigInt(i.remainingMinor) > BigInt(0)).length} open item(s)</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>Reconciliation & Period</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Badge label={unmatchedCount ? `${unmatchedCount} Unmatched` : 'All Matched'} tone={unmatchedCount ? 'amber' : 'green'} />
          <Badge label={isMonthClosed ? `${month} Closed` : `${month} Open`} tone={isMonthClosed ? 'slate' : 'green'} />
        </div>
      </div>
    </div>

    <nav className="flex flex-wrap gap-2" aria-label="Accounting sections">
      {tabs.map(name => <button key={name} type="button" aria-current={name === tab ? 'page' : undefined} style={name === tab ? primary : secondary}
        onClick={() => setTab(name)}>{name}</button>)}
    </nav>
    {notice && <p role="status" className="inline-status">{notice}</p>}
    {loading && <p role="status" className="text-sm text-slate-600">Refreshing accounting records…</p>}
    {loadError && <StateMessage value={loadError} retry={() => void load()} />}
    {!loading && !loadError && <>
      {tab === 'General ledger' && <>
        <Panel title="Chart of accounts" badge={`${accounts.length} Accounts`} description="Set up the entity’s account codes before posting entries. Use consistent account codes across group entities."
          action={button('Add account', { action: 'ADD_ACCOUNT', title: 'Add a ledger account', fields: [
            { name: 'code', label: 'Account code' }, { name: 'name', label: 'Account name' },
            { name: 'kind', label: 'Account type', options: ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].map(kind => [kind, kind]) },
            { name: 'cash', label: 'Bank, Monnify or cash account', type: 'checkbox' },
          ] })}>
          <Table
            headers={['Code', 'Account', 'Type', 'Cash account']}
            rows={accounts}
            empty="No ledger accounts configured for this entity yet."
            emptyAction={result.canManage ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void seedStarterAccounts()}
                style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #ea580c', background: '#fff7ed', color: '#c2410c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
              >
                + Initialize 13 Standard BEMS Accounts
              </button>
            ) : undefined}
          />
        </Panel>
        <Panel title="Transactions awaiting ledger posting" description="Review posted wallet credits, confirmed payments and intercompany debit notes. Select the accounts before posting.">
          <Table headers={['Date','Reference','Source','Description','Amount','Action']} rightCols={[4]} rows={result.sources.map(source => ({
            id: source.kind + source.id, cells: [source.date,source.reference,source.kind.replaceAll('_',' '),source.name,money(source.amountMinor),
              button('Post to ledger', { action: 'POST_SOURCE', title: 'Post ' + source.reference, extra: { sourceId: source.id, kind: source.kind },
                fields: [accountField('debitAccountId', 'Debit account', a => source.kind !== 'WALLET_CREDIT' || !a.cash),
                  accountField('creditAccountId', 'Credit account', a => source.kind === 'RECORDED_PAYMENT' ? a.cash : source.kind !== 'WALLET_CREDIT' || !a.cash)] }, canPost)],
          }))} />
        </Panel>
        <Panel title="Journal register" description="Amounts are positive for debits and negative for credits. Posted entries retain their audit trail."
          action={<div className="flex flex-wrap gap-2">
            {button('Post opening balances', { action: 'POST_JOURNAL', title: 'Post opening balances as the first journal', fields: journalFields,
              extra: { opening: true } }, canPost && accounts.length >= 2)}
            {button('Post journal', { action: 'POST_JOURNAL', title: 'Post a balanced journal', fields: journalFields }, canPost && accounts.length >= 2)}
            {button('Post elimination', { action: 'POST_JOURNAL', title: 'Post a consolidation elimination', fields: journalFields, extra: { groupOnly: true } }, canPost && result.canConsolidate && selectedEntity?.type === 'GROUP' && accounts.length >= 2)}
          </div>}>
          <Table headers={['Date', 'Reference', 'Source', 'Journal lines', 'Action']} rows={result.journals.map(journal => ({
            id: journal.id, cells: [journal.date, journal.reference, journal.source.replaceAll('_', ' '),
              <details key={journal.id}><summary className="cursor-pointer font-medium">{journal.memo}</summary>
                {journal.lines.map((line, index) => <div key={index} className="text-xs">{line.code} · {line.name} · {money(line.amountMinor)}{line.department && ' · ' + line.department}{line.project && ' · ' + line.project}</div>)}
              </details>,
              ['MANUAL', 'ELIMINATION'].includes(journal.source) && button('Reverse', { action: 'REVERSE_JOURNAL', title: 'Reverse journal entry',
                extra: { journalId: journal.id }, fields: [date('Reversal date'), { name: 'memo', label: 'Reason' }] }, canPost)],
          }))} />
        </Panel>
      </>}
      {tab === 'Statements' && <>
        <Panel title={consolidated ? 'Consolidated trial balance' : 'Trial balance'} description="Management reporting in NGN, including only posted journals through the selected month."
          action={<button type="button" style={secondary} disabled={!result.reports.length} onClick={() => exportReport(result.reports, month)}>Export CSV</button>}>
          <Table headers={['Code','Account','Type','Month movement','Ending debit','Ending credit']} rightCols={[3, 4, 5]} rows={result.reports.map(row => ({
            id: row.code + row.kind, cells: [row.code, row.name, row.kind, money(row.movementMinor),
              reportAmount(row) > BigInt(0) ? money(row.endingMinor) : '—', reportAmount(row) < BigInt(0) ? money(-reportAmount(row)) : '—'],
          }))} />
        </Panel>
        <Panel title="Profit and loss" description={'Result for ' + month + ' · ' + money(surplus)}>
          <Table headers={['Code','Account','Type','Current month']} rightCols={[3]} rows={pnl.map(row => ({
            id: row.code + row.kind, cells: [row.code, row.name, row.kind, money(reportAmount(row, true) * (row.kind === 'REVENUE' ? BigInt(-1) : BigInt(1)) as bigint)],
          }))} />
        </Panel>
        <Panel title="Balance sheet">
          <Table headers={['Code','Account','Type','Ending balance']} rightCols={[3]} rows={balanceRows} />
        </Panel>
        <Panel title="Cash movements" description="Gross posted cash receipts and payments grouped by journal source. Internal bank transfers may appear on both sides.">
          <Table headers={['Journal source','Receipts','Payments','Net']} rightCols={[1, 2, 3]} rows={result.cashStatement.map(row => ({
            id: row.source, cells: [row.source.replaceAll('_', ' '), money(row.receiptsMinor), money(row.paymentsMinor), money(BigInt(row.receiptsMinor) - BigInt(row.paymentsMinor))],
          }))} />
        </Panel>
      </>}
      {tab === 'Bank reconciliation' && <>
        <Panel title="Bank and Monnify statements" description="Import a statement into its corresponding cash account. Match by account and exact signed amount."
          action={button('Import statement', { action: 'IMPORT_STATEMENT', title: 'Import bank or Monnify statement', fields: [
            cashField(), { name: 'statement', label: 'Statement rows', type: 'textarea',
              note: 'Upload a CSV/TSV file or paste up to 500 rows (columns: YYYY-MM-DD, transaction ID, signed naira amount, description).' },
          ] })}>
          <Table headers={['Date','Account','Reference','Description','Amount','Owner','Status']} rightCols={[4]} rows={result.statementLines.map(line => {
            const matches = result.cashLines.filter(candidate => candidate.accountId === line.accountId && candidate.amountMinor === line.amountMinor);
            return { id: line.id, cells: [line.date,line.accountName,line.reference,line.memo,money(line.amountMinor),
              <div className="space-y-1"><div>{line.ownerName ?? '—'}</div>{!line.matchedLineId && assign(line,'STATEMENT')}</div>,
              line.matchedLineId ? <div className="space-y-1"><Badge label="Matched" tone="green" /><div>{button('Unmatch', {
                action: 'UNMATCH_STATEMENT', title: 'Unmatch ' + line.reference, extra: { statementId: line.id }, fields: [],
              })}</div></div> : matches.length ? button('Match', {
                action: 'MATCH_STATEMENT', title: 'Match statement transaction', extra: { statementId: line.id },
                fields: [{ name: 'lineId', label: 'Matching ledger line', options: matches.map(candidate => [candidate.id, candidate.date + ' · ' + candidate.reference + ' · ' + candidate.memo]) }],
              }) || <Badge label="Unmatched" tone="amber" /> : <Badge label="No ledger match" tone="slate" />] };
          })} />
        </Panel>
        <Panel title="Statement balances" description={'Enter the opening and closing values printed on each ' + month + ' statement. Both must agree with the ledger before the month can close.'}
          action={button('Record statement balances', { action: 'STATEMENT_BALANCE', title: 'Record statement balances for ' + month, extra: { month },
            fields: [cashField(), { name: 'opening', label: 'Opening balance (₦)' }, { name: 'closing', label: 'Closing balance (₦)' },
              { name: 'reference', label: 'Statement reference' }] })}>
          <Table headers={['Account','Statement reference','Opening','Closing']} rows={result.statementBalances.map(row => ({
            id: row.accountId, cells: [row.name,row.reference,money(row.openingMinor),money(row.closingMinor)],
          }))} />
        </Panel>
        <Panel title="Unmatched cash postings">
          <Table headers={['Date','Account','Reference','Description','Amount','Owner']} rows={result.cashLines.map(line => ({
            id: line.id, cells: [line.date,line.accountName,line.reference,line.memo,money(line.amountMinor),
              <div className="space-y-1"><div>{line.ownerName ?? '—'}</div>{assign(line,'LEDGER')}</div>],
          }))} />
        </Panel>
      </>}
      {tab === 'Bills & invoices' && (() => {
        const record = (payable: boolean, importing = false): Operation => ({
          action: 'RECORD_OPEN_ITEM', title: importing ? 'Post matched vendor invoice' : payable ? 'Record supplier bill' : 'Record customer invoice',
          extra: { kind: payable ? 'PAYABLE' : 'RECEIVABLE' },
          fields: [
            ...(importing ? [{ name: 'vendorInvoiceId', label: 'Matched supplier invoice', options: result.vendorInvoices.map((v): Option => [v.id, v.invoiceNumber + ' · ' + v.vendor.name + ' · ' + money(v.amountMinor)]) }]
              : [{ name: 'party', label: payable ? 'Supplier' : 'Customer' }, { name: 'reference', label: 'Invoice number' }, date('Invoice date'), amount]),
            { name: 'dueOn', label: 'Due date', type: 'date' },
            accountField('controlAccountId', payable ? 'Accounts payable' : 'Accounts receivable', account => !account.cash && account.kind === (payable ? 'LIABILITY' : 'ASSET')),
            accountField('offsetAccountId', payable ? 'Expense or asset account' : 'Revenue account', account => !account.cash && (payable ? ['EXPENSE','ASSET'].includes(account.kind) : account.kind === 'REVENUE')),
          ],
        });
        return <Panel title="Payables and receivables" description="Track invoices, due dates, outstanding balances and payments. Recording a settlement posts to the ledger."
          action={<div className="flex flex-wrap gap-2">
            {button('Record bill', record(true), canPost)}
            {button('Record customer invoice', record(false), canPost)}
            {button('Post matched vendor invoice', record(true, true), canPost && result.vendorInvoices.length > 0)}
          </div>}>
          <Table headers={['Type','Supplier or customer','Invoice','Due date','Amount','Outstanding','Aging','Action']} rightCols={[4, 5]} rows={documents} />
        </Panel>;
      })()}
      {tab === 'Period close' && <Panel title="Month-end close" description="Close the selected entity through the reporting month. Review outstanding balances and reconcile its cash entries first."
        action={button('Close ' + month, { action: 'CLOSE_PERIOD', title: 'Close accounting period ' + month, extra: { month },
          fields: [{ name: 'reviewed', label: 'I reviewed accruals, open invoices, depreciation, and reconciliation', type: 'checkbox' },
            { name: 'note', label: 'Close review note', type: 'textarea' }] },
          result.canManage && result.canClose && !result.closed.some(row => row.month.slice(0, 7) >= month))}>
        <Table headers={['Closed through','Recorded at','Review note']} rows={result.closed.map(row => ({
          id: row.month, cells: [row.month.slice(0, 7), new Date(row.closedAt).toLocaleString(), row.note],
        }))} />
      </Panel>}
      {tab === 'Cash forecast' && <>
        <Panel title="13-week cash forecast" description={'Cash posted through today · ' + money(result.cashBalanceMinor) + '. The forecast includes unpaid invoices, approved payroll and recurring commitments, future cash postings, and planned items.'}>
          <Table headers={['Week beginning','Expected net movement','Projected cash']} rows={forecastRows} />
        </Panel>
        <Panel title="Planned cash flows" description="Add expected activity that isn’t already captured in the forecast."
          action={button('Add planned cash flow', { action: 'ADD_CASH_PLAN', title: 'Add planned cash flow',
            fields: [date('Expected date'), { name: 'label', label: 'Description' }, { name: 'reference', label: 'Forecast reference' }, { ...amount, label: 'Amount (₦, negative for payments)' }] })}>
          <Table headers={['Date','Description','Amount','Action']} rows={result.cashPlan.map(row => ({
            id: row.id, cells: [row.date,row.label,money(row.amountMinor),button('Remove', {
              action: 'REMOVE_CASH_PLAN', title: 'Remove planned cash flow', extra: { planId: row.id }, fields: [],
            })],
          }))} />
        </Panel>
      </>}
      {tab === 'Fixed assets' && <Panel title="Fixed asset register" description="Acquisitions, location transfers, monthly straight-line depreciation, and disposal."
        action={button('Register acquisition', { action: 'REGISTER_ASSET', title: 'Register a fixed asset', fields: [
          { name: 'tag', label: 'Asset tag' }, { name: 'name', label: 'Asset name' }, { name: 'location', label: 'Location' }, date('Acquisition date'),
          { name: 'cost', label: 'Cost (₦)' }, { name: 'residual', label: 'Residual value (₦)', value: '0' }, { name: 'months', label: 'Useful life in months' },
          accountField('assetAccountId', 'Fixed asset account', a => a.kind === 'ASSET' && !a.cash),
          accountField('depreciationAccountId', 'Accumulated depreciation account', a => a.kind === 'ASSET' && !a.cash),
          accountField('expenseAccountId', 'Depreciation expense', a => a.kind === 'EXPENSE'),
          accountField('offsetAccountId', 'Funding account', a => ['ASSET','LIABILITY','EQUITY'].includes(a.kind)),
        ] }, canPost)}>
        <Table headers={['Tag','Asset','Location','Cost','Depreciation','Net book value','Status','Action']} rows={result.assets.map(asset => ({
          id: asset.id, cells: [asset.tag,asset.name,asset.location,money(asset.costMinor),money(asset.depreciationMinor),
            asset.disposedOn ? '—' : money(BigInt(asset.costMinor) - BigInt(asset.depreciationMinor)),
            asset.disposedOn ? 'Disposed ' + asset.disposedOn : asset.nextPosting ? 'Next depreciation ' + asset.nextPosting : 'Fully depreciated',
            !asset.disposedOn && <div className="flex flex-wrap gap-2">
              {button('Move', { action: 'MOVE_ASSET', title: 'Change asset location', ...assetOptions(asset.id), fields: [{ name: 'location', label: 'New location' }] })}
              {button('Post depreciation', { action: 'DEPRECIATE_ASSET', title: 'Post depreciation for ' + asset.nextPosting, ...assetOptions(asset.id), fields: [] },
                canPost && Boolean(asset.nextPosting && asset.nextPosting <= today()))}
              {button('Dispose', { action: 'DISPOSE_ASSET', title: 'Record asset disposal', ...assetOptions(asset.id), fields: [
                date('Disposal date'), { ...amount, label: 'Proceeds (₦)', value: '0' }, cashField(true),
                accountField('offsetAccountId', 'Gain or loss account', a => ['EXPENSE','REVENUE'].includes(a.kind), true),
              ] }, canPost)}
            </div>],
        }))} />
      </Panel>}
    </>}
    {operation && <div className="template-modal" role="dialog" aria-modal="true" aria-label={operation.title}>
      <div className="template-modal-card" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-title"><h2>{operation.title}</h2></div>
        <form onSubmit={save}>
          <div className="settings-fields">
            {operation.fields.map(field => <label key={field.name} className={field.type === 'textarea' ? 'wide' : undefined}>
              {field.label}
              {field.name === 'statement' && (
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="mb-2 block text-xs text-slate-600"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    const form = e.currentTarget.form;
                    const textarea = form?.elements.namedItem('statement') as HTMLTextAreaElement | null;
                    if (textarea) textarea.value = text;
                  }}
                />
              )}
              {field.options ? <select name={field.name} required={!field.optional} defaultValue={field.value ?? ''}>
                <option value="">Select</option>{field.options.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </select> : field.type === 'textarea' ? <textarea name={field.name} rows={field.name === 'statement' ? 10 : 3} required={!field.optional} defaultValue={field.value} />
                : <input name={field.name} type={field.type ?? 'text'} required={!field.optional} defaultValue={field.value} />}
              {field.note && <span className="text-xs font-normal text-slate-600">{field.note}</span>}
            </label>)}
          </div>
          {operation.action === 'POST_JOURNAL' && <fieldset className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="text-sm font-semibold">Journal lines</legend>
              <Badge
                label={
                  draftBalanceCheck.invalid
                    ? 'Enter numeric amounts'
                    : draftBalanceCheck.netKobo === 0
                      ? '✓ Balanced (₦0.00)'
                      : `Out of balance by ${money(BigInt(Math.abs(draftBalanceCheck.netKobo)))}`
                }
                tone={draftBalanceCheck.invalid ? 'amber' : draftBalanceCheck.netKobo === 0 ? 'green' : 'red'}
              />
            </div>
            <p className="text-xs text-slate-600">Enter debit amounts as positive and credit amounts as negative.</p>
            {draft.map((line, index) => <div className="grid gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-2" key={index}>
              <select aria-label={'Account for line ' + (index + 1)} style={input} value={line.accountId} required
                onChange={event => setDraft(rows => rows.map((row, i) => i === index ? { ...row, accountId: event.target.value } : row))}>
                <option value="">Select account</option>{options(a => !operation.extra?.groupOnly || !a.cash).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input aria-label={'Amount for line ' + (index + 1)} placeholder="Signed amount (₦)" style={input} value={line.amount} required
                onChange={event => setDraft(rows => rows.map((row, i) => i === index ? { ...row, amount: event.target.value } : row))} />
              <select aria-label="Department" style={input} value={line.departmentId}
                onChange={event => setDraft(rows => rows.map((row, i) => i === index ? { ...row, departmentId: event.target.value, projectId: '' } : row))}>
                <option value="">Department (optional)</option>{result.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select aria-label="Project" style={input} value={line.projectId}
                onChange={event => setDraft(rows => rows.map((row, i) => i === index ? { ...row, projectId: event.target.value } : row))}>
                <option value="">Project (optional)</option>{result.projects.filter(project => !line.departmentId || project.departmentId === line.departmentId)
                  .map(project => <option key={project.id} value={project.id}>{project.projectCode}</option>)}
              </select>
              {draft.length > 2 && <button type="button" style={secondary} onClick={() => setDraft(rows => rows.filter((_, i) => i !== index))}>Remove line</button>}
            </div>)}
            <button type="button" style={secondary} disabled={draft.length >= 100 || busy} onClick={() => setDraft(rows => [...rows, blankLine()])}>Add journal line</button>
          </fieldset>}
          {saveError && <p role="alert" className="my-2 text-xs text-red-700">{saveError}</p>}
          <div className="modal-actions">
            <button type="button" disabled={busy} onClick={() => setOperation(undefined)}>Cancel</button>
            <button type="submit" disabled={busy || loading}>{busy ? 'Saving…' : 'Confirm and save'}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
