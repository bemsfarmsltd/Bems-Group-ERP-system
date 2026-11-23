'use client';
import { WalletReleaseAuthorization } from './WalletReleaseAuthorization';
import { isBemsGroup, normalizeOrganizationIdentifier } from '@/lib/organization-identity';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Wallet,
  Landmark,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Lock,
  ChevronRight,
  Plus,
  Search,
  Filter,
  Users,
  BookOpen,
  FileText,
  Layers,
  ExternalLink,
  TrendingUp,
  Coins,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { walletApi as api, walletMoney, nairaToMinor } from './WalletView';

type TabKey = 'envelopes' | 'releases' | 'vendors' | 'transfers' | 'staff';

export interface FundingViewProps {
  businessName?: string;
  scope?: string;
  businessId?: string;
  brandColor?: string;
  isGroup?: boolean;
  initialPayrollBatchId?: string;
}

export default function FundingView({
  businessName,
  scope,
  businessId,
  brandColor,
  isGroup,
  initialPayrollBatchId,
}: FundingViewProps = {}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(initialPayrollBatchId ? 'releases' : 'envelopes');

  // Resolve active subsidiary from general workspace filtering
  const effectiveScope = scope || businessId;
  const [selectedSubId, setSelectedSubId] = useState<string>(
    effectiveScope ? normalizeOrganizationIdentifier(effectiveScope) : 'ALL'
  );

  useEffect(() => {
    if (scope !== undefined) {
      setSelectedSubId(scope ? normalizeOrganizationIdentifier(scope) : 'ALL');
    } else if (businessId !== undefined) {
      setSelectedSubId(businessId ? normalizeOrganizationIdentifier(businessId) : 'ALL');
    } else if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bems_active_org');
      const urlOrg = new URLSearchParams(window.location.search).get('org');
      if (urlOrg) setSelectedSubId(normalizeOrganizationIdentifier(urlOrg));
      else if (stored) setSelectedSubId(normalizeOrganizationIdentifier(stored));
    }
  }, [scope, businessId]);

  // Allocation Modal State
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocateMode, setAllocateMode] = useState<'SUBSIDIARY' | 'DEPARTMENT'>('SUBSIDIARY');
  const [organizationId, setOrganizationId] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [parentId, setParentId] = useState('');
  const allocationKey = useRef(crypto.randomUUID());

  // Adjustment Modal State
  const [adjustment, setAdjustment] = useState<any>(null);
  const [adjustOperation, setAdjustOperation] = useState('INCREASE');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [targetEnvelopeId, setTargetEnvelopeId] = useState('');

  // Vendor Bank Modal State
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [vendorBankCode, setVendorBankCode] = useState('');
  const [vendorAccount, setVendorAccount] = useState('');
  const [vendorPassword, setVendorPassword] = useState('');
  const [bankList, setBankList] = useState<any[]>([]);

  // Release Preview Preparation State
  const [sourceType, setSourceType] = useState(initialPayrollBatchId ? 'PAYROLL_BATCH' : 'REQUEST');
  const [sourceId, setSourceId] = useState(initialPayrollBatchId ?? '');
  const [batchRequestIds, setBatchRequestIds] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Confirmation Modal State (GMD Password-proven approval / Issue Ack / Pool Pause)
  const [confirmation, setConfirmation] = useState<any>(null);
  const [password, setPassword] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerSubTab, setLedgerSubTab] = useState<'transfers' | 'journals'>('transfers');

  // Fetch banks list
  useEffect(() => {
    let current = true;
    api('banks', undefined, 'GET')
      .then((d: any) => {
        if (current && d.banks) setBankList(d.banks);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  // Load funding dashboard data
  const load = useCallback(async () => {
    try {
      const d = await api('funding', undefined, 'GET');
      if (!Array.isArray(d.organizations) || !Array.isArray(d.envelopes) || typeof d.walletMode !== 'boolean') throw new Error('The funding dashboard returned incomplete data. Please retry.');
      setError('');
      setData(d);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to load wallet dashboard.');
    }
  }, []);

  useEffect(() => {
    let current = true;
    load();
    return () => {
      current = false;
    };
  }, [load]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice(null);
    try {
      await work();
      await load();
    } catch (e: any) {
      setError(e?.message || (typeof e === 'string' ? e : 'The requested operation could not be completed.'));
    } finally {
      setBusy(false);
      setPassword('');
      setConfirmation(null);
    }
  }

  // Active subsidiary info
  const activeSubsidiary = useMemo(() => {
    if (!data?.organizations || selectedSubId === 'ALL') return null;
    const org = data.organizations.find((o: any) => o.id === selectedSubId || o.code === selectedSubId);
    return isBemsGroup(org) ? null : org || null;
  }, [data?.organizations, selectedSubId]);

  // Dynamic brand color: follows active subsidiary
  const effectiveBrandColor =
    brandColor ||
    (activeSubsidiary as any)?.brandColor ||
    (activeSubsidiary as any)?.color ||
    (isGroup || selectedSubId === 'ALL' ? '#ea580c' : '#0d8a70');

  const displayBusinessName =
    businessName ||
    (activeSubsidiary ? activeSubsidiary.legalName : 'BEMS Group');

  // Filtered Envelopes by active subsidiary
  const filteredEnvelopes = useMemo(() => {
    if (!data?.envelopes) return [];
    let list = data.envelopes;
    if (activeSubsidiary) {
      list = list.filter((e: any) => e.organizationId === activeSubsidiary.id);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e: any) =>
          e.label.toLowerCase().includes(q) ||
          e.organizationName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.envelopes, activeSubsidiary, searchQuery]);

  // Filtered Proposals (Pending GMD Release Previews)
  const filteredProposals = useMemo(() => {
    if (!data?.proposals) return [];
    if (!activeSubsidiary) return data.proposals;
    return data.proposals.filter((p: any) =>
      p.items?.some((i: any) => i.organizationId === activeSubsidiary.id)
    );
  }, [data?.proposals, activeSubsidiary]);

  // Filtered Transfers
  const filteredTransfers = useMemo(() => {
    if (!data?.transfers) return [];
    let list = data.transfers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t: any) =>
          t.beneficiaryName?.toLowerCase().includes(q) ||
          t.reference?.toLowerCase().includes(q) ||
          t.status?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.transfers, searchQuery]);

  // Staff retain their wallets after a Custom Admin grant.
  const filteredStaffWallets = useMemo(() => {
    if (!data?.staffWallets) return [];
    let list = data.staffWallets.filter((s: any) => ['STAFF', 'CUSTOM_ADMIN'].includes(s.role));
    if (activeSubsidiary) {
      list = list.filter((s: any) => s.subsidiaryId === activeSubsidiary.id);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s: any) =>
          s.legalName?.toLowerCase().includes(q) ||
          s.employeeNumber?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.staffWallets, activeSubsidiary, searchQuery]);

  // Filtered Vendors
  const filteredVendors = useMemo(() => {
    if (!data?.vendors) return [];
    let list = data.vendors;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v: any) =>
          v.name?.toLowerCase().includes(q) ||
          v.accountName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.vendors, searchQuery]);

  // Release preparation helpers
  const selectedPaymentSource =
    sourceType === 'REQUEST'
      ? data?.requests?.find((r: any) => r.id === sourceId)
      : data?.payrollBatches?.find((r: any) => r.id === sourceId);

  const eligibleBatchRequests = (data?.requests ?? []).filter((request: any) => !request.vendor);
  const selectedBatchRequests = eligibleBatchRequests.filter((request: any) => batchRequestIds.includes(request.id));
  const batchTotal = selectedBatchRequests.reduce((total: bigint, request: any) => total + BigInt(request.amountMinor), BigInt(0));
  const releaseOrganizations: string[] = sourceType === 'REQUEST_BATCH'
    ? [...new Set<string>(selectedBatchRequests.map((request: any) => request.subsidiaryId))]
    : sourceType === 'REQUEST'
      ? selectedPaymentSource
        ? [selectedPaymentSource.subsidiaryId]
        : []
      : [
          ...new Set<string>(
            (selectedPaymentSource?.items || []).flatMap((i: any) =>
              (i.allocations || []).map((a: any) => a.subsidiaryId)
            )
          ),
        ];

  async function handleConfirmAction() {
    await run(async () => {
      if (confirmation.operation) {
        const payload =
          confirmation.operation === 'ACKNOWLEDGE_ISSUE'
            ? { operation: confirmation.operation, issueId: confirmation.issueId, note: confirmation.note }
            : { operation: confirmation.operation };
        const proof = await api('challenges', { purpose: 'POOL_CONTROL', payload, password });
        if (confirmation.operation === 'ACKNOWLEDGE_ISSUE') {
          await api('issues/' + confirmation.issueId + '/ack', {
            note: confirmation.note,
            challengeId: proof.id,
            challengeToken: proof.token,
          });
          setNotice('Funding control issue acknowledged.');
        } else {
          await api('pool-control', { ...payload, challengeId: proof.id, challengeToken: proof.token });
          setNotice('Funding pool controls updated successfully.');
        }

      }
    });
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0, paddingBottom: '24px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '24px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Wallets &amp; Funded Budgets</h1>
            <button
              onClick={() => { setError(''); void load(); }}
              disabled={busy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid #fed7aa',
                background: '#fff7ed',
                color: '#ea580c',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
              <span>Retry Loading</span>
            </button>
          </div>

          {error ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }} role="alert">
              <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Funding Connection Notice</strong>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#7f1d1d' }}>{error}</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13, padding: '20px 0' }} role="status">
              <RefreshCw size={16} className="animate-spin text-orange-600" />
              <span>Loading verified funding and wallet records…</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-ai-domain="finance" style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0, paddingBottom: '24px' }}>
      {/* Toast Notice */}
      {notice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#e9f7f1',
            color: '#137b62',
            border: '1px solid #c2ebd9',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(19, 123, 98, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} />
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            style={{ background: 'none', border: 0, color: '#137b62', cursor: 'pointer', padding: '2px' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff1f2',
            color: '#be123c',
            border: '1px solid #fecdd3',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            style={{ background: 'none', border: 0, color: '#be123c', cursor: 'pointer' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {data?.walletMode === false && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fffbeb',
            color: '#92400e',
            border: '1px solid #fef3c7',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} color="#d97706" />
            <span>
              <strong>Safe Read-Only Review Active:</strong> Wallet execution is disabled in the hosting configuration. You can review recorded balances and wallet records; allocations, approvals and transfers remain disabled.
            </span>
          </div>
          <span style={{ fontSize: '9px', fontWeight: 800, background: '#fef3c7', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
            REVIEW MODE
          </span>
        </div>
      )}

      {data.funding && (
        <div role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
          <span>Company funding pool: <strong>{data.funding.paused ? 'Paused' : 'Active'}</strong>. {data.funding.paused ? 'Allocations, payment approvals and withdrawals are blocked until secure activation.' : 'Payments remain subject to verified funding and approval checks.'}</span>
          <button disabled={busy || !data.canApprove} onClick={() => { setPassword(''); setConfirmation({ operation: data.funding.paused ? 'ACTIVATE' : 'PAUSE' }); }}>
            {data.funding.paused ? 'Review activation' : 'Pause funding pool'}
          </button>
        </div>
      )}
      {/* Executive Header */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: '8px', letterSpacing: '1.2px', fontWeight: 800, color: '#7d8ba1', textTransform: 'uppercase' }}>
            TREASURY & WALLET GOVERNANCE · {displayBusinessName.toUpperCase()}
          </span>
          <h1 style={{ fontSize: '18px', letterSpacing: '-0.3px', fontWeight: 700, margin: '4px 0 2px', color: '#17253d' }}>
            Wallets & Funded Budgets
          </h1>
          <p style={{ fontSize: '11px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
            {data.scopedReadOnly ? 'Read-only wallets and funded budgets for your assigned subsidiaries.' : `Central Monnify funding account and subsidiary budgets. Payments require ${data.approvalLabel || 'an authorized executive'} approval.`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            disabled={busy || !data.walletMode || data.scopedReadOnly}
            onClick={() =>
              run(async () => {
                await api('funding/refresh', {});
                setNotice('Verified Monnify pool balance refreshed.');
              })
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '7px',
              fontSize: '10px',
              fontWeight: 650,
              background: '#fff',
              color: '#263c60',
              border: '1px solid #dce4ef',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
            Refresh Balance
          </button>

          <button
            disabled={busy || !data.walletMode || data.scopedReadOnly}
            onClick={() =>
              run(async () => {
                const result = await api('reconcile', {});
                setNotice(result.message || 'Reconciliation completed.');
              })
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '7px',
              fontSize: '10px',
              fontWeight: 650,
              background: '#fff',
              color: '#263c60',
              border: '1px solid #dce4ef',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              cursor: 'pointer',
            }}
          >
            <ShieldCheck size={12} color="#059669" />
            Reconcile Provider
          </button>

          <button
            disabled={busy || !data.walletMode || !data.funding || data.funding.paused || !data.funding.configured}
            title={!data.walletMode ? 'Enable wallet execution in hosting settings first.' : data.funding?.paused ? 'Activate the company funding pool first.' : ''}
            onClick={() => {
              setAllocateMode('SUBSIDIARY');
              setOrganizationId(activeSubsidiary?.id || data.organizations.find((o: any) => selectedSubId === 'ALL' ? isBemsGroup(o) : o.id === selectedSubId || o.code === selectedSubId)?.id || '');
              setSelectedDepartment('');
              setLabel('');
              setAmount('');
              setParentId('');
              setShowAllocateModal(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '7px',
              fontSize: '11px',
              fontWeight: 700,
              background: effectiveBrandColor,
              color: '#ffffff',
              border: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Allocate Funded Budget
          </button>
        </div>
      </header>

      {/* Top Metric Strip (4 High-Density Sleek White Cards ~75px height) */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
        {/* Metric 1: Verified Available */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.6px', color: '#64748b', textTransform: 'uppercase' }}>
              Last Verified Monnify Balance
            </span>
            <Landmark size={13} color="#059669" />
          </div>
          <div>
            <strong style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2, color: '#059669', display: 'block' }}>
              {data?.funding ? walletMoney(data.funding.availableMinor) : '—'}
            </strong>
            <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#64748b' }}>
              {data.funding ? `Checked ${new Date(data.funding.observedAt).toLocaleString()}${data.funding.fresh ? '' : ' · Refresh required'}` : 'No verified funding snapshot available'}
            </p>
          </div>
        </div>

        {/* Metric 2: Funded Budget Envelopes */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.6px', color: '#64748b', textTransform: 'uppercase' }}>
              Funded Budget Envelopes
            </span>
            <Layers size={13} color="#2563eb" />
          </div>
          <div>
            <strong style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2, color: '#17253d', display: 'block' }}>
              {data?.funding ? walletMoney(data.funding.envelopeMinor) : '—'}
            </strong>
            <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#64748b' }}>
              {data?.envelopes?.length || 0} active subsidiary envelopes
            </p>
          </div>
        </div>

        {/* Metric 3: Staff Liabilities */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.6px', color: '#b45309', textTransform: 'uppercase' }}>
              Unsettled Staff Liabilities
            </span>
            <Wallet size={13} color="#d97706" />
          </div>
          <div>
            <strong style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2, color: '#d97706', display: 'block' }}>
              {data?.funding ? walletMoney(data.funding.liabilityMinor) : '—'}
            </strong>
            <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#64748b' }}>
              GMD-approved funds in staff wallets
            </p>
          </div>
        </div>

        {/* Metric 4: Unallocated Capacity */}
        <div
          style={{
            background: '#ffffff',
            border: `1px solid ${effectiveBrandColor}33`,
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: `0 1px 4px ${effectiveBrandColor}12`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.6px', color: effectiveBrandColor, textTransform: 'uppercase' }}>
              Unallocated Monnify Backing
            </span>
            <Coins size={13} color={effectiveBrandColor} />
          </div>
          <div>
            <strong style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2, color: effectiveBrandColor, display: 'block' }}>
              {data?.funding ? walletMoney(data.funding.freeMinor) : '—'}
            </strong>
            <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#64748b' }}>
              Available to allocate to subsidiary budgets
            </p>
          </div>
        </div>
      </section>

      {/* Multi-Tab Toolbar & Search (Light Enterprise Styling) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '8px 12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'envelopes', label: 'Subsidiary Budget Envelopes', count: filteredEnvelopes.length },
            { key: 'releases', label: 'Fund Release Previews', count: filteredProposals.length },
            { key: 'vendors', label: 'Verified Suppliers', count: filteredVendors.length },
            { key: 'transfers', label: 'Transfers & Ledger', count: filteredTransfers.length },
            { key: 'staff', label: 'Staff Wallets Directory', count: filteredStaffWallets.length },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 7,
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 600,
                  background: isActive ? effectiveBrandColor : '#f8fafc',
                  color: isActive ? '#ffffff' : '#475569',
                  border: isActive ? `1px solid ${effectiveBrandColor}` : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: 10,
                    background: isActive ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                    color: isActive ? '#ffffff' : '#64748b',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by label, reference, or name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 10px 5px 30px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 11,
              background: '#ffffff',
              boxSizing: 'border-box',
              color: '#1e293b',
            }}
          />
        </div>
      </div>

      {/* TAB 1: SUBSIDIARY BUDGET ENVELOPES */}
      {activeTab === 'envelopes' && (() => {
        const envelopeIds = new Set(filteredEnvelopes.map((x: any) => x.id));
        const topLevelEnvelopes = filteredEnvelopes.filter((x: any) => !x.parentId || !envelopeIds.has(x.parentId));
        const childrenByParent = new Map<string, any[]>();
        for (const x of filteredEnvelopes) {
          if (x.parentId && envelopeIds.has(x.parentId)) {
            const arr = childrenByParent.get(x.parentId) || [];
            arr.push(x);
            childrenByParent.set(x.parentId, arr);
          }
        }

        return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {topLevelEnvelopes.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12 }}>
              No funded subsidiary budgets found for this workspace. Click &ldquo;Allocate Funded Budget&rdquo; above to fund a subsidiary.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
              {topLevelEnvelopes.map((e: any) => {
                const allocated = BigInt(e.allocatedMinor || '0');
                const remaining = BigInt(e.remainingMinor || '0');
                const pct = allocated > BigInt(0) ? Number((remaining * BigInt(100)) / allocated) : 0;
                const deptAllocations = childrenByParent.get(e.id) || [];

                return (
                  <div
                    key={e.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: '9px', fontWeight: 800, color: effectiveBrandColor, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                          Subsidiary Budget
                        </span>
                        <h4 style={{ fontSize: '14px', fontWeight: 800, margin: '2px 0 0', color: '#17253d' }}>
                          {e.organizationName}
                        </h4>
                        {e.label && e.label !== `${e.organizationName} Budget` && (
                          <span style={{ fontSize: '10.5px', color: '#64748b' }}>{e.label}</span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: e.status === 'ACTIVE' ? '#ecfdf5' : '#f8fafc',
                          color: e.status === 'ACTIVE' ? '#059669' : '#64748b',
                          border: e.status === 'ACTIVE' ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                        }}
                      >
                        {e.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                      <div>
                        <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>Unallocated Subsidiary Buffer</span>
                        <strong style={{ fontSize: '14px', fontWeight: 800, color: '#059669' }}>{walletMoney(e.remainingMinor)}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>Total Funded</span>
                        <strong style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>{walletMoney(e.allocatedMinor)}</strong>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: 4 }}>
                        <span>Subsidiary Buffer Remaining</span>
                        <span style={{ fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <div style={{ width: '100%', height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(0, pct))}%`,
                            background: pct > 30 ? '#10b981' : pct > 10 ? '#f59e0b' : '#ef4444',
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>

                    {deptAllocations.length > 0 && (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          Department Allocations ({deptAllocations.length})
                        </span>
                        {deptAllocations.map((child: any) => (
                          <div key={child.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4, borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {child.label}
                              </div>
                              <div style={{ fontSize: '9.5px', color: '#64748b' }}>
                                Left: <strong style={{ color: '#059669' }}>{walletMoney(child.remainingMinor)}</strong> / {walletMoney(child.allocatedMinor)}
                              </div>
                            </div>
                            {child.status === 'ACTIVE' && (
                              <div style={{ display: 'flex', gap: 4, shrink: 0 } as any}>
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    setAdjustment(child);
                                    setAdjustAmount('');
                                    setTargetEnvelopeId('');
                                  }}
                                  style={{ padding: '3px 7px', borderRadius: 5, background: '#fff', color: '#334155', border: '1px solid #cbd5e1', fontSize: '9.5px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                  Adjust
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      await api('envelopes/' + child.id, { operation: 'CLOSE', expectedVersion: child.version }, 'PATCH');
                                      setNotice('Department allocation closed.');
                                    })
                                  }
                                  style={{ padding: '3px 7px', borderRadius: 5, background: '#fff', color: '#94a3b8', border: '1px solid #e2e8f0', fontSize: '9.5px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                  Close
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {e.status === 'ACTIVE' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <button
                          disabled={busy || remaining <= BigInt(0)}
                          onClick={() => {
                            setAllocateMode('DEPARTMENT');
                            setOrganizationId(e.organizationId);
                            setParentId(e.id);
                            setSelectedDepartment('');
                            setLabel('');
                            setAmount('');
                            setShowAllocateModal(true);
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: '#fff7ed',
                            color: '#ea580c',
                            border: '1px solid #fed7aa',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: remaining <= BigInt(0) ? 'not-allowed' : 'pointer',
                            opacity: remaining <= BigInt(0) ? 0.5 : 1,
                          }}
                        >
                          + Allocate to Dept
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setAdjustment(e);
                            setAdjustAmount('');
                            setTargetEnvelopeId('');
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: '#f8fafc',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            fontSize: '10px',
                            fontWeight: 650,
                            cursor: 'pointer',
                          }}
                        >
                          Adjust / Top Up
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api('envelopes/' + e.id, { operation: 'CLOSE', expectedVersion: e.version }, 'PATCH');
                              setNotice('Budget closed. Unused funds returned to the central Monnify pool.');
                            })
                          }
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: '#fff',
                            color: '#94a3b8',
                            border: '1px solid #e2e8f0',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        );
      })()}

      {/* TAB 2: FUND RELEASE PREVIEWS */}
      {activeTab === 'releases' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredProposals.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12 }}>
              No pending release previews in queue. Prepare a preview below to stage a payment.
            </div>
          ) : (
            filteredProposals.map((p: any) => (
              <div
                key={p.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#475569', fontFamily: 'monospace' }}>
                        {p.requestNumber}
                      </span>
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${effectiveBrandColor}14`, color: effectiveBrandColor, border: `1px solid ${effectiveBrandColor}33` }}>
                        {p.category}
                      </span>
                    </div>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '4px 0 2px', color: '#17253d' }}>
                      {p.title}
                    </h4>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>{p.purpose}</p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>Release Total</span>
                    <strong style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>
                      {walletMoney(p.amountMinor)}
                    </strong>
                  </div>
                </div>

                {/* Beneficiaries List */}
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '8px', fontWeight: 800, color: '#64748b', letterSpacing: '0.6px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Beneficiaries & Destination Bank Snapshots ({p.items?.length || 0})
                  </span>
                  {p.items?.map((item: any) => {
                    let bankDetails = null;
                    try {
                      if (item.bankSnapshot) bankDetails = JSON.parse(item.bankSnapshot);
                    } catch {}
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          fontSize: '11px',
                          padding: '4px 0',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div>
                          <strong style={{ color: '#1e293b' }}>{item.employeeName}</strong>
                          {p.sourceType === 'REQUEST_BATCH' && <div className="text-xs text-slate-600">{item.requestNumber} · {item.requestTitle} · {item.envelopeLabel}</div>}
                          <span style={{ color: '#64748b', fontSize: '10px', marginLeft: 4 }}>
                            ({item.employeeNumber}) · {item.organizationName}
                          </span>
                          {bankDetails && (
                            <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                              🏦 {bankDetails.accountName} · ending in •••• {bankDetails.accountNumber?.slice(-4)} ({bankDetails.bankCode})
                            </div>
                          )}
                        </div>
                        <strong style={{ color: '#334155', fontFamily: 'monospace' }}>{walletMoney(item.amountMinor)}</strong>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> Expires {new Date(p.expiresAt).toLocaleTimeString()}
                  </span>

                  <button
                    disabled={busy || !data?.canApprove}
                    onClick={() => setConfirmation(p)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 14px',
                      borderRadius: 7,
                      fontSize: '11px',
                      fontWeight: 700,
                      background: data?.canApprove ? effectiveBrandColor : '#f1f5f9',
                      color: data?.canApprove ? '#ffffff' : '#94a3b8',
                      border: data?.canApprove ? 0 : '1px solid #e2e8f0',
                      cursor: data?.canApprove ? 'pointer' : 'not-allowed',
                      boxShadow: data?.canApprove ? `0 1px 3px ${effectiveBrandColor}40` : 'none',
                    }}
                  >
                    <ShieldCheck size={13} />
                    {data?.canApprove ? 'Review & Execute Approval' : 'Authorized Financial Approver Required'}
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Prepare Release Preview */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#17253d', margin: 0 }}>
              Prepare New Release Preview
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Payment Category</label>
                <select
                  value={sourceType}
                  onChange={(e) => {
                    setSourceType(e.target.value);
                    setSourceId('');
                    setBatchRequestIds([]);
                    setMapping({});
                  }}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff' }}
                >
                  <option value="REQUEST">Staff Request / Project / Allowance</option>
                  <option value="REQUEST_BATCH">Multiple staff requisitions</option>
                  <option value="PAYROLL_BATCH">Whole Salary Net Batch</option>
                </select>
              </div>

              {sourceType === 'REQUEST_BATCH' ? (
                <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold">Select 2–25 staff requisitions</legend>
                  <div className="max-h-56 space-y-2 overflow-auto">
                    {eligibleBatchRequests.length === 0 && <p className="text-xs text-slate-600">No staff requisitions are eligible.</p>}
                    {eligibleBatchRequests.map((request: any) => {
                      const checked = batchRequestIds.includes(request.id);
                      return <label key={request.id} className="flex items-start gap-2 text-xs">
                        <input type="checkbox" checked={checked} disabled={busy || (!checked && batchRequestIds.length >= 25)}
                          onChange={() => setBatchRequestIds(ids => checked ? ids.filter(id => id !== request.id) : [...ids, request.id])} />
                        <span>{request.requestNumber} · {request.title} · {request.requester?.legalName} · {walletMoney(request.amountMinor)}</span>
                      </label>;
                    })}
                  </div>
                  <p className="text-xs font-semibold">{selectedBatchRequests.length} selected · {walletMoney(batchTotal.toString())}</p>
                </fieldset>
              ) : (              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Approved Source</label>
                <select
                  value={sourceId}
                  onChange={(e) => {
                    setSourceId(e.target.value);
                    setMapping({});
                  }}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff' }}
                >
                  <option value="">Select approved payment source…</option>
                  {(sourceType === 'REQUEST' ? data?.requests : data?.payrollBatches)?.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {sourceType === 'REQUEST'
                        ? `${r.vendor?.name || r.requester?.legalName} — ${r.title} — ${walletMoney(r.amountMinor)}`
                        : `Salary ${r.period?.year}-${r.period?.month} · ${walletMoney(r.totalNetMinor)}`}
                    </option>
                  ))}
                </select>
              </div>)}

            </div>

            {releaseOrganizations.length > 0 && (
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>
                  Map to Subsidiary Budget Envelopes:
                </span>
                {releaseOrganizations.map((orgId) => {
                  const org = data?.organizations?.find((o: any) => o.id === orgId);
                  const orgEnvelopes = data?.envelopes?.filter(
                    (e: any) => e.organizationId === orgId && e.status === 'ACTIVE'
                  );
                  return (
                    <div key={orgId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
                      <span style={{ fontWeight: 600, color: '#475569' }}>{org?.legalName || 'Subsidiary'}:</span>
                      <select
                        value={mapping[orgId] || ''}
                        onChange={(e) => setMapping({ ...mapping, [orgId]: e.target.value })}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff', minWidth: 240 }}
                      >
                        <option value="">Choose funded budget envelope…</option>
                        {orgEnvelopes?.map((env: any) => (
                          <option key={env.id} value={env.id}>
                            {env.label} · {walletMoney(env.remainingMinor)} remaining
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              disabled={
                busy ||
                (sourceType === 'REQUEST_BATCH' ? selectedBatchRequests.length < 2 || selectedBatchRequests.length !== batchRequestIds.length : !sourceId) ||
                !releaseOrganizations.length ||
                releaseOrganizations.some((o) => !mapping[o])
              }
              onClick={() =>
                run(async () => {
                  await api('releases', { sourceType, sourceId, envelopesByOrganization: mapping,
                    ...(sourceType === 'REQUEST_BATCH' ? { requestIds: batchRequestIds } : {}) });
                  setNotice('Release preview staged. Awaiting designated GMD approval.');
                  setSourceId('');
                  setBatchRequestIds([]);
                  setMapping({});
                })
              }
              style={{
                alignSelf: 'flex-start',
                padding: '6px 14px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                background: effectiveBrandColor,
                color: '#fff',
                border: 0,
                cursor: 'pointer',
              }}
            >
              Prepare GMD Preview →
            </button>
          </div>
        </section>
      )}

      {/* TAB 3: VERIFIED SUPPLIERS */}
      {activeTab === 'vendors' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setVendorId('');
                setVendorBankCode('');
                setVendorAccount('');
                setVendorPassword('');
                setShowVendorModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 650,
                background: '#fff',
                color: '#263c60',
                border: '1px solid #dce4ef',
                cursor: 'pointer',
              }}
            >
              <Plus size={12} color={effectiveBrandColor} /> Verify Supplier Bank
            </button>
          </div>

          {filteredVendors.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12 }}>
              No commercial suppliers found matching your search.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {filteredVendors.map((v: any) => (
                <div
                  key={v.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#17253d' }}>{v.name}</h4>
                      <span style={{ fontSize: 10, color: '#64748b' }}>{v.accountName || 'No bank recorded'}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: v.verifiedBankAt ? '#ecfdf5' : '#fffbeb',
                        color: v.verifiedBankAt ? '#059669' : '#d97706',
                        border: v.verifiedBankAt ? '1px solid #a7f3d0' : '1px solid #fde68a',
                      }}
                    >
                      {v.verifiedBankAt ? 'Verified' : 'Pending'}
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 8, borderRadius: 6, fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>
                    <div>Bank Code: {v.bankCode || '—'}</div>
                    <div>Account: •••• {v.lastFour || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: TRANSFERS & LEDGER */}
      {activeTab === 'transfers' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setLedgerSubTab('transfers')}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: ledgerSubTab === 'transfers' ? effectiveBrandColor : '#f8fafc',
                color: ledgerSubTab === 'transfers' ? '#fff' : '#64748b',
                border: ledgerSubTab === 'transfers' ? `1px solid ${effectiveBrandColor}` : '1px solid #e2e8f0',
                cursor: 'pointer',
              }}
            >
              Monnify Bank Transfers
            </button>
            <button
              onClick={() => setLedgerSubTab('journals')}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: ledgerSubTab === 'journals' ? effectiveBrandColor : '#f8fafc',
                color: ledgerSubTab === 'journals' ? '#fff' : '#64748b',
                border: ledgerSubTab === 'journals' ? `1px solid ${effectiveBrandColor}` : '1px solid #e2e8f0',
                cursor: 'pointer',
              }}
            >
              Double-Entry General Ledger
            </button>
          </div>

          {ledgerSubTab === 'transfers' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredTransfers.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12 }}>
                  No Monnify bank transfers recorded yet.
                </div>
              ) : (
                filteredTransfers.map((t: any) => (
                  <div
                    key={t.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 11,
                    }}
                  >
                    <div>
                      <strong style={{ color: '#17253d' }}>{t.beneficiaryName}</strong>
                      <span style={{ fontSize: 9, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>
                        {t.targetType}
                      </span>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                        Ref: {t.reference} · Acct ending in •••• {t.lastFour}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: 13, color: '#059669', fontFamily: 'monospace', display: 'block' }}>
                        {walletMoney(t.amountMinor)}
                      </strong>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>
                        Fee: {walletMoney(t.feeMinor)} (Company paid)
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(!data?.journals || data.journals.length === 0) ? (
                <div style={{ padding: '36px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12 }}>
                  No double-entry journal postings found.
                </div>
              ) : (
                data.journals.map((j: any) => (
                  <div
                    key={j.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <strong style={{ color: effectiveBrandColor, fontFamily: 'monospace' }}>{j.kind} · Ref: {j.reference}</strong>
                      <span style={{ color: '#94a3b8' }}>{new Date(j.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10, fontFamily: 'monospace' }}>
                      {j.entries?.map((entry: any) => {
                        const amt = BigInt(entry.amountMinor || '0');
                        const isCredit = amt >= BigInt(0);
                        return (
                          <div
                            key={entry.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              background: '#f8fafc',
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: '1px solid #f1f5f9',
                            }}
                          >
                            <span style={{ color: '#475569' }}>{entry.accountKey}</span>
                            <span style={{ color: isCredit ? '#059669' : '#dc2626', fontWeight: 700 }}>
                              {isCredit ? '+' : ''}{walletMoney(entry.amountMinor)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 5: STAFF WALLETS DIRECTORY */}
      {activeTab === 'staff' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredStaffWallets.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12 }}>
              No staff members found in this subsidiary workspace.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    <th style={{ padding: '10px 14px' }}>Employee</th>
                    <th style={{ padding: '10px 14px' }}>Subsidiary</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Available Balance</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Pending Withdrawals</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Settled Lifetime</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffWallets.map((staff: any) => (
                    <tr key={`${staff.id}:${staff.subsidiaryId}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 650, color: '#17253d' }}>{staff.legalName}</div>
                        <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>
                          {staff.employeeNumber} · {staff.role}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>{staff.organizationName}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                        {walletMoney(staff.availableMinor)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#d97706', fontFamily: 'monospace' }}>
                        {walletMoney(staff.heldMinor)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b', fontFamily: 'monospace' }}>
                        {walletMoney(staff.settledMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ALLOCATE MODAL (LIGHT THEME) */}
      {showAllocateModal && (() => {
        const freeMinorNum = Number(data?.funding?.freeMinor ?? 0);
        const allocationBlocked = Boolean(data?.funding?.paused) || freeMinorNum <= 0;
        const activeTopLevelEnvelopes = (data?.envelopes || []).filter((e: any) => e.status === 'ACTIVE' && !e.parentId);
        const selectedParentEnv = activeTopLevelEnvelopes.find((e: any) => e.id === parentId) || activeTopLevelEnvelopes.find((e: any) => e.organizationId === organizationId) || null;
        const effectiveOrgId = allocateMode === 'DEPARTMENT' && selectedParentEnv ? selectedParentEnv.organizationId : organizationId;
        const selectedOrg = data?.organizations?.find((o: any) => o.id === effectiveOrgId);
        const orgDepartments: Array<{ id: string; name: string; code: string }> = selectedOrg?.departments || [];
        const resolvedDeptLabel = selectedDepartment === '__CUSTOM__' ? label.trim() : (selectedDepartment || label.trim());
        const canSubmit = allocateMode === 'SUBSIDIARY'
          ? (!busy && !allocationBlocked && Boolean(effectiveOrgId) && Boolean(amount))
          : (!busy && Boolean(selectedParentEnv) && Boolean(resolvedDeptLabel) && Boolean(amount));

        return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#ffffff', borderRadius: 12, padding: 20, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#17253d', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} color={effectiveBrandColor} /> {allocateMode === 'SUBSIDIARY' ? 'Fund Subsidiary Budget' : 'Allocate to Department'}
              </h3>
              <button onClick={() => setShowAllocateModal(false)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setAllocateMode('SUBSIDIARY');
                  setParentId('');
                  setSelectedDepartment('');
                  setLabel('');
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: allocateMode === 'SUBSIDIARY' ? '#ffffff' : 'transparent',
                  color: allocateMode === 'SUBSIDIARY' ? '#0f172a' : '#64748b',
                  boxShadow: allocateMode === 'SUBSIDIARY' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Subsidiary Budget
              </button>
              <button
                type="button"
                onClick={() => {
                  setAllocateMode('DEPARTMENT');
                  if (!parentId && activeTopLevelEnvelopes.length > 0) {
                    const match = activeTopLevelEnvelopes.find((e: any) => e.organizationId === organizationId) || activeTopLevelEnvelopes[0];
                    setParentId(match.id);
                    setOrganizationId(match.organizationId);
                  }
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: allocateMode === 'DEPARTMENT' ? '#ffffff' : 'transparent',
                  color: allocateMode === 'DEPARTMENT' ? '#0f172a' : '#64748b',
                  boxShadow: allocateMode === 'DEPARTMENT' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Department Allocation
              </button>
            </div>

            {allocateMode === 'SUBSIDIARY' && allocationBlocked && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 11.5, fontWeight: 600, lineHeight: 1.45 }}>
                {data?.funding?.paused
                  ? 'New commitments are blocked because the central company funding pool is currently paused.'
                  : `New commitments are blocked: free unallocated Monnify backing is ${walletMoney(String(freeMinorNum))} (verified balance ${walletMoney(String(data?.funding?.availableMinor ?? '0'))} is fully committed or short against unsettled approvals and fee reserves). Top up Monnify or reconcile before allocating.`}
              </div>
            )}

            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              {allocateMode === 'SUBSIDIARY'
                ? 'Locks central Monnify backing to the selected subsidiary. No manual budget name needed.'
                : 'Carves out a department allocation from an existing funded subsidiary budget.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
              {allocateMode === 'SUBSIDIARY' ? (
                <div>
                  <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Target Subsidiary *</label>
                  <select
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}
                  >
                    <option value="">Select subsidiary…</option>
                    {data?.organizations?.map((org: any) => (
                      <option key={org.id} value={org.id}>
                        {org.legalName} ({org.code})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Subsidiary Budget *</label>
                    <select
                      value={selectedParentEnv?.id || ''}
                      onChange={(e) => {
                        const env = activeTopLevelEnvelopes.find((x: any) => x.id === e.target.value);
                        setParentId(e.target.value);
                        if (env) setOrganizationId(env.organizationId);
                        setSelectedDepartment('');
                      }}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}
                    >
                      <option value="">Select funded subsidiary budget…</option>
                      {activeTopLevelEnvelopes.map((env: any) => (
                        <option key={env.id} value={env.id}>
                          {env.organizationName} ({walletMoney(env.remainingMinor)} available)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Department *</label>
                    {orgDepartments.length > 0 ? (
                      <select
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}
                      >
                        <option value="">Select department…</option>
                        {orgDepartments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name} ({d.code})
                          </option>
                        ))}
                        <option value="__CUSTOM__">Other / Custom Department…</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="e.g. Operations, Engineering, Finance"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff', boxSizing: 'border-box' }}
                      />
                    )}
                    {orgDepartments.length > 0 && selectedDepartment === '__CUSTOM__' && (
                      <input
                        type="text"
                        placeholder="Enter department name…"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        style={{ width: '100%', marginTop: 6, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                </>
              )}

              <div>
                <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Allocation Amount (₦) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 50000.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowAllocateModal(false)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() =>
                  run(async () => {
                    await api(
                      'envelopes',
                      {
                        organizationId: effectiveOrgId,
                        label: allocateMode === 'SUBSIDIARY' ? `${selectedOrg?.legalName || 'Subsidiary'} Budget` : resolvedDeptLabel,
                        parentId: allocateMode === 'DEPARTMENT' ? selectedParentEnv?.id : undefined,
                        amountMinor: nairaToMinor(amount),
                      },
                      undefined,
                      allocationKey.current
                    );
                    allocationKey.current = crypto.randomUUID();
                    setShowAllocateModal(false);
                    setNotice(allocateMode === 'SUBSIDIARY' ? 'Subsidiary budget funded successfully.' : `Allocated to ${resolvedDeptLabel} successfully.`);
                  })
                }
                style={{ padding: '6px 14px', borderRadius: 6, border: 0, background: effectiveBrandColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: !canSubmit ? 'not-allowed' : 'pointer', opacity: !canSubmit ? 0.5 : 1 }}
              >
                {allocateMode === 'SUBSIDIARY' ? 'Fund Subsidiary Budget' : 'Confirm Dept Allocation'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ADJUST MODAL (LIGHT THEME) */}
      {adjustment && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#ffffff', borderRadius: 12, padding: 20, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#17253d' }}>
                Adjust: {adjustment.label}
              </h3>
              <button onClick={() => setAdjustment(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              Current Remaining Capacity: <strong style={{ color: '#059669' }}>{walletMoney(adjustment.remainingMinor)}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
              <div>
                <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Operation</label>
                <select
                  value={adjustOperation}
                  onChange={(e) => setAdjustOperation(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff' }}
                >
                  <option value="INCREASE">Increase from Central Unallocated Pool</option>
                  <option value="REDUCE">Return Unused Funds to Central Pool</option>
                  <option value="REALLOCATE">Reallocate Unused Funds to Another Envelope</option>
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Adjustment Amount (₦) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 500000.00"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>

              {adjustOperation === 'REALLOCATE' && (
                <div>
                  <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Target Destination Envelope *</label>
                  <select
                    value={targetEnvelopeId}
                    onChange={(e) => setTargetEnvelopeId(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff' }}
                  >
                    <option value="">Select target envelope…</option>
                    {data?.envelopes
                      ?.filter((e: any) => e.status === 'ACTIVE' && e.id !== adjustment.id)
                      ?.map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.organizationName} · {e.label}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <button
                type="button"
                onClick={() => setAdjustment(null)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !adjustAmount || (adjustOperation === 'REALLOCATE' && !targetEnvelopeId)}
                onClick={() =>
                  run(async () => {
                    await api(
                      'envelopes/' + adjustment.id,
                      {
                        operation: adjustOperation,
                        amountMinor: nairaToMinor(adjustAmount),
                        targetEnvelopeId: targetEnvelopeId || undefined,
                        expectedVersion: adjustment.version,
                      },
                      'PATCH'
                    );
                    setAdjustment(null);
                    setNotice('Budget envelope adjusted successfully.');
                  })
                }
                style={{ padding: '6px 14px', borderRadius: 6, border: 0, background: effectiveBrandColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Apply Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VENDOR MODAL (LIGHT THEME) */}
      {showVendorModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#ffffff', borderRadius: 12, padding: 20, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#17253d', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Landmark size={14} color={effectiveBrandColor} /> Verify Supplier Bank Account
              </h3>
              <button onClick={() => setShowVendorModal(false)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
              <div>
                <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Supplier *</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff' }}
                >
                  <option value="">Select supplier…</option>
                  {data?.vendors?.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.verifiedBankAt ? '· (Verified)' : '· (Needs verification)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Bank *</label>
                <select
                  value={vendorBankCode}
                  onChange={(e) => setVendorBankCode(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff' }}
                >
                  <option value="">Select bank…</option>
                  {bankList.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>10-Digit NUBAN Account Number *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="0123456789"
                  value={vendorAccount}
                  onChange={(e) => setVendorAccount(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Executive Password *</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={vendorPassword}
                  onChange={(e) => setVendorPassword(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowVendorModal(false)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !vendorId || !vendorBankCode || !vendorPassword || !/^\d{10}$/.test(vendorAccount)}
                onClick={() =>
                  run(async () => {
                    try {
                      await api('vendors/' + vendorId + '/verify-bank', {
                        accountNumber: vendorAccount,
                        bankCode: vendorBankCode,
                        password: vendorPassword,
                      });
                      setShowVendorModal(false);
                      setNotice('Supplier bank account successfully verified.');
                    } finally {
                      setVendorPassword('');
                      setVendorAccount('');
                    }
                  })
                }
                style={{ padding: '6px 14px', borderRadius: 6, border: 0, background: effectiveBrandColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Verify & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL (GMD SIGN-OFF, LIGHT THEME) */}
      {confirmation && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#ffffff', borderRadius: 12, padding: 20, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: `1px solid ${effectiveBrandColor}40`, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={16} color={effectiveBrandColor} />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#17253d' }}>
                  {confirmation.operation || (confirmation.category === 'VENDOR' ? 'Approve Verified Supplier Payment' : 'Executive Release Approval')}
                </h3>
              </div>
              <button onClick={() => { setConfirmation(null); setPassword(''); }} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            {confirmation.amountMinor && (
              <div style={{ background: `${effectiveBrandColor}10`, border: `1px solid ${effectiveBrandColor}33`, borderRadius: 8, padding: '10px 14px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Total Authorized Release:</span>
                  <strong style={{ fontSize: 15, color: '#059669', fontFamily: 'monospace' }}>
                    {walletMoney(confirmation.amountMinor)}
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: 10, color: '#64748b' }}>
                  {confirmation.category === 'VENDOR'
                    ? 'Reserves budget capacity and queues direct provider payout to the verified vendor account.'
                    : 'GMD-authorized funds will be credited to staff internal wallets. Staff can withdraw anytime.'}
                </p>
              </div>
            )}

            {confirmation.items && (
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                  Beneficiaries Breakdown
                </span>
                {confirmation.items.map((i: any) => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 6, fontSize: 11, border: '1px solid #f1f5f9' }}>
                    <div>
                      <strong style={{ color: '#17253d' }}>{i.employeeName}</strong>
                      <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>({i.employeeNumber}) · {i.organizationName}</span>
                      {confirmation.sourceType === 'REQUEST_BATCH' && <div className="text-xs text-slate-600">{i.requestNumber} · {i.requestTitle} · {i.envelopeLabel}</div>}
                    </div>
                    <strong style={{ fontFamily: 'monospace', color: '#475569' }}>{walletMoney(i.amountMinor)}</strong>
                  </div>
                ))}
              </div>
            )}

            {confirmation.operation === 'ACKNOWLEDGE_ISSUE' && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reconciliation Note (min 10 characters) *</label>
                <input
                  type="text"
                  value={confirmation.note || ''}
                  onChange={(e) => setConfirmation({ ...confirmation, note: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {confirmation.operation ? <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: effectiveBrandColor, display: 'block', marginBottom: 4 }}>Enter Your Current Password to Authorize *</label>
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                placeholder="Enter password…"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${effectiveBrandColor}40`, fontSize: 12, background: '#fff', boxSizing: 'border-box', fontFamily: 'monospace' }}
              />
            </div> : <WalletReleaseAuthorization key={confirmation.id}
              payload={{ id: confirmation.id, confirmationHash: confirmation.confirmationHash }}
              onBusy={setBusy}
              onApproved={async () => {
                setConfirmation(null);
                setNotice(confirmation.category === 'VENDOR' ? 'Vendor payment approved and queued.' : 'Staff wallets credited.');
                await load();
              }} />}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setConfirmation(null); setPassword(''); }}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              {confirmation.operation && <button
                type="button"
                disabled={busy || !password || (confirmation.operation === 'ACKNOWLEDGE_ISSUE' && (confirmation.note || '').trim().length < 10)}
                onClick={handleConfirmAction}
                style={{ padding: '6px 14px', borderRadius: 6, border: 0, background: effectiveBrandColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                {busy ? 'Authenticating…' : 'Authorize Release →'}
              </button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
