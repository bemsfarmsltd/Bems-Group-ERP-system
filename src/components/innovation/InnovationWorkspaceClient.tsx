'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  ThumbsUp,
  FileText,
  Rocket,
  ShieldAlert,
  BarChart3,
  GitBranch,
  Target,
  FlaskConical,
  Wallet,
  Compass,
  Kanban,
  Award,
  Check,
  X,
} from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { BrainstormingCanvasPanel } from './BrainstormingCanvasPanel';
import { FEATURE_STAGE_ORDER } from '@/lib/innovationRouteHelper';
import { useGmdAccess } from '@/components/ai/useGmdAccess';
import { useAiFinancialManager } from '@/components/ai/useAiFinancialManager';
import { AmbientBottomAiBar } from '@/components/ai/AmbientBottomAiBar';

type NavTabKey =
  | 'overview'
  | 'product_board'
  | 'brainstorming'
  | 'ideas_discovery'
  | 'strategy_prds'
  | 'delivery_releases'
  | 'analytics_budget'
  | 'governance_approvals';

const NAV_TABS: Array<{ id: NavTabKey; label: string; badgeKey?: string }> = [
  { id: 'overview', label: '1. Overview & Portfolios' },
  { id: 'product_board', label: '2. Product Board & RICE' },
  { id: 'brainstorming', label: '3. Brainstorming Canvas' },
  { id: 'ideas_discovery', label: '4. Ideas, Discovery & Research' },
  { id: 'strategy_prds', label: '5. Strategy, OKRs, Roadmaps & PRDs' },
  { id: 'delivery_releases', label: '6. Design, Experiments, PM Handoff & Launch' },
  { id: 'analytics_budget', label: '7. Analytics & Product Budget' },
  { id: 'governance_approvals', label: '8. Risks, Decisions & Approvals' },
];

function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function InnovationWorkspaceClient({
  actorName,
  actorRole,
  actorEmail = '',
}: {
  actorName: string;
  actorRole: string;
  actorEmail?: string;
}) {
  const isAiAuthorized = useGmdAccess(actorRole);
  const [activeTab, setActiveTab] = useState<NavTabKey>('overview');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sub-views
  const [boardLayout, setBoardLayout] = useState<'KANBAN' | 'RICE_MATRIX' | 'LIST'>('KANBAN');
  const [discoverySubTab, setDiscoverySubTab] = useState<'IDEAS' | 'OST' | 'FEEDBACK' | 'RESEARCH'>('IDEAS');
  const [selectedPrdId, setSelectedPrdId] = useState<string>('');

  // Quick Modals
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showNewFeatureModal, setShowNewFeatureModal] = useState(false);
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);
  const [showNewPrdModal, setShowNewPrdModal] = useState(false);

  // Form states
  const [prodForm, setProdForm] = useState({
    name: '',
    category: 'SAAS',
    productType: 'SAAS',
    summary: '',
    vision: '',
    targetMarket: '',
    valueProposition: '',
    lifecycleStage: 'DISCOVERY',
    strategicPriority: 'HIGH',
  });

  const [featForm, setFeatForm] = useState({
    title: '',
    problemStatement: '',
    valueProposition: '',
    intendedUser: 'Field & Enterprise Users',
    priority: 'HIGH',
    moscowCategory: 'MUST_HAVE',
    roadmapHorizon: 'NOW',
    riceReach: 600,
    riceImpact: 2.0,
    riceConfidence: 85,
    riceEffort: 2.0,
    acceptanceCriteria: '',
  });

  const [ideaForm, setIdeaForm] = useState({
    title: '',
    problemStatement: '',
    description: '',
    expectedValue: '',
    category: 'NEW_CAPABILITY',
    urgency: 'HIGH',
  });

  const [prdForm, setPrdForm] = useState({
    title: '',
    overview: '',
    problemStatement: '',
    targetOutcomes: '',
    personas: '',
    inScope: '',
    outOfScope: '',
    userStories: '',
    functionalReqs: '',
    nonFunctionalReqs: '',
    securityPrivacy: '',
    acceptanceCriteria: '',
    changeSummary: 'Updated specification revision',
  });

  const aiManager = useAiFinancialManager({
    userRole: actorRole,
    userName: actorName,
    businessName: 'BEMS Group Product & Innovation',
    businessId: selectedOrgId || 'BEMS-GROUP',
    currentPage: 'Product Management & Innovation System',
    moduleDomain: 'innovation',
  });

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOrgId) params.set('organizationId', selectedOrgId);
      if (selectedPortfolioId) params.set('portfolioId', selectedPortfolioId);
      if (selectedProductId) params.set('productId', selectedProductId);
      const res = await fetch(resolveApiUrl(`/api/innovation/overview?${params.toString()}`), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (!selectedPrdId && json.prds?.length > 0) {
          setSelectedPrdId(json.prds[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedPortfolioId, selectedProductId, selectedPrdId]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const products = data?.products || [];
  const activeProduct = useMemo(
    () => products.find((p: any) => p.id === selectedProductId) || products[0] || null,
    [products, selectedProductId]
  );

  const filteredFeatures = useMemo(() => {
    const list = data?.features || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((f: any) => {
      if (selectedProductId && f.productId !== selectedProductId) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.featureCode.toLowerCase().includes(q) ||
        (f.problemStatement || '').toLowerCase().includes(q)
      );
    });
  }, [data?.features, selectedProductId, searchQuery]);

  const activePrd = useMemo(() => {
    const list = data?.prds || [];
    return list.find((p: any) => p.id === selectedPrdId) || list[0] || null;
  }, [data?.prds, selectedPrdId]);

  // Actions
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(resolveApiUrl('/api/innovation/products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'PRODUCT',
        organizationId: selectedOrgId || undefined,
        portfolioId: selectedPortfolioId || data?.portfolios?.[0]?.id,
        ...prodForm,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setShowNewProductModal(false);
      setProdForm({
        name: '',
        category: 'SAAS',
        productType: 'SAAS',
        summary: '',
        vision: '',
        targetMarket: '',
        valueProposition: '',
        lifecycleStage: 'DISCOVERY',
        strategicPriority: 'HIGH',
      });
      showToast(`Created product ${json.product?.productCode}: ${json.product?.name}`);
      void fetchOverview();
    } else {
      showToast(json.error || 'Could not create product.');
    }
  };

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProdId = selectedProductId || activeProduct?.id;
    if (!targetProdId) return;
    const res = await fetch(resolveApiUrl('/api/innovation/features'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        productId: targetProdId,
        ...featForm,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setShowNewFeatureModal(false);
      showToast(`Created feature ${json.feature?.featureCode} (RICE Score: ${json.feature?.computedRiceScore})`);
      void fetchOverview();
    } else {
      showToast(json.error || 'Could not create feature.');
    }
  };

  const handleMoveFeatureStage = async (featureId: string, nextStage: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/features'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: featureId, workflowStage: nextStage }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast(`Moved ${json.feature?.featureCode} to ${nextStage}.`);
      void fetchOverview();
    } else {
      showToast(json.error || 'Stage transition rejected by workflow gate.');
    }
  };

  const handleEngineeringHandoff = async (featureId: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/features'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: featureId, action: 'ENGINEERING_HANDOFF' }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast(
        json.idempotentExisting
          ? json.message
          : `Handed off ${json.feature?.featureCode} to Project Management as Epic ${json.feature?.linkedWorkItemCode} (bound to PRD v${json.feature?.linkedPrdVersion || 1}).`
      );
      void fetchOverview();
    } else {
      showToast(json.error || 'Engineering handoff failed.');
    }
  };

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(resolveApiUrl('/api/innovation/ideas'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        productId: selectedProductId || activeProduct?.id,
        clientSubmissionId: `ent-idea-${Date.now()}`,
        ...ideaForm,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setShowNewIdeaModal(false);
      setIdeaForm({ title: '', problemStatement: '', description: '', expectedValue: '', category: 'NEW_CAPABILITY', urgency: 'HIGH' });
      showToast(`Submitted idea ${json.idea?.ideaNumber}.`);
      void fetchOverview();
    }
  };

  const handleIdeaAction = async (ideaId: string, action: string, extra?: Record<string, any>) => {
    const res = await fetch(resolveApiUrl('/api/innovation/ideas'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: ideaId, action, productId: selectedProductId || activeProduct?.id, ...extra }),
    });
    const json = await res.json();
    if (res.ok) {
      if (action === 'CONVERT_TO_FEATURE') {
        showToast(`Converted idea to Product Feature ${json.feature?.featureCode}.`);
      } else if (action === 'CONVERT_TO_OPPORTUNITY') {
        showToast(`Converted idea to Discovery Opportunity ${json.opportunity?.opportunityCode}.`);
      } else {
        showToast('Updated idea record.');
      }
      void fetchOverview();
    } else {
      showToast(json.error || 'Action failed.');
    }
  };

  const handleCreatePrd = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProdId = selectedProductId || activeProduct?.id;
    if (!targetProdId) return;
    const res = await fetch(resolveApiUrl('/api/innovation/prds'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'PRD',
        productId: targetProdId,
        ...prdForm,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setShowNewPrdModal(false);
      setSelectedPrdId(json.prd?.id || '');
      showToast(`Created PRD ${json.prd?.prdCode} (v1 Draft).`);
      void fetchOverview();
    }
  };

  const handlePrdRevisionOrApprove = async (prdId: string, mode: 'NEW_VERSION' | 'APPROVE') => {
    const res = await fetch(resolveApiUrl('/api/innovation/prds'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id: prdId,
        action: mode === 'APPROVE' ? 'APPROVE_PRD' : 'UPDATE',
        createNewVersion: mode === 'NEW_VERSION',
        changeSummary:
          mode === 'APPROVE'
            ? `Formal PRD version snapshot approved by ${actorName}`
            : `Created new revision snapshot preserving prior approved version`,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast(
        mode === 'APPROVE'
          ? `Approved immutable snapshot v${json.prd?.approvedVersion} of ${json.prd?.prdCode}.`
          : `Created new draft revision v${json.prd?.currentVersion} of ${json.prd?.prdCode} (prior approved snapshot preserved).`
      );
      void fetchOverview();
    } else {
      showToast(json.error || 'PRD action failed.');
    }
  };

  const handleApprovalDecision = async (approvalId: string, status: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') => {
    let note = 'Approved through Product Governance Gate.';
    if (status !== 'APPROVED') {
      const input = window.prompt(`Enter mandatory reason for ${status}:`, 'Requires updated evidence or PRD alignment');
      if (!input) return;
      note = input;
    }
    const res = await fetch(resolveApiUrl('/api/innovation/delivery'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'APPROVAL',
        id: approvalId,
        status,
        decisionNote: note,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast(`Recorded ${status} decision on ${json.approval?.approvalCode}.`);
      void fetchOverview();
    } else {
      showToast(json.error || 'Approval decision blocked.');
    }
  };

  const kpis = data?.kpis || {};

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
        paddingBottom: 96,
      }}
    >
      {/* Top Enterprise Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 8,
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={13} /> All Systems
            </Link>

            <img
              src="/bems-group-logo.png?v=20261024"
              alt="BEMS"
              style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #fed7aa', padding: 2 }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                  Product Management &amp; Innovation System
                </strong>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 99,
                    background: '#fff7ed',
                    color: '#ea580c',
                    border: '1px solid #fed7aa',
                  }}
                >
                  ENTERPRISE COMMAND CENTER
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Portfolios · Product Boards · Real-Time Canvas · Discovery OST · RICE Scoring · Versioned PRDs · PM Handoff · Releases
                {data?.dataAsOf && ` · Data as of ${new Date(data.dataAsOf).toLocaleTimeString('en-GB')}`}
              </div>
            </div>
          </div>

          {/* Right Filters & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              style={{
                padding: '7px 11px',
                borderRadius: 9,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: 12,
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              <option value="">All Subsidiaries (BEMS Group)</option>
              {(data?.subsidiaries || []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.legalName} ({s.code})
                </option>
              ))}
            </select>

            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              style={{
                padding: '7px 11px',
                borderRadius: 9,
                border: '1px solid #fed7aa',
                background: '#fff7ed',
                fontSize: 12,
                fontWeight: 800,
                color: '#9a3412',
              }}
            >
              <option value="">All Active Products ({products.length})</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.productCode} · {p.name} [{p.lifecycleStage}]
                </option>
              ))}
            </select>

            <Link
              href="/staff/innovation"
              style={{
                padding: '7px 12px',
                borderRadius: 9,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>Staff Product Workspace</span>
              <ArrowUpRight size={13} />
            </Link>

            <button
              type="button"
              onClick={() => void fetchOverview()}
              style={{
                padding: '7px 11px',
                borderRadius: 9,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#334155',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Navigation Pill Ribbon (Section 64) */}
        <div
          style={{
            maxWidth: 1440,
            margin: '10px auto 0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {NAV_TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '7px 13px',
                  borderRadius: 9,
                  border: active ? '1px solid #ea580c' : '1px solid #e2e8f0',
                  background: active ? '#ea580c' : '#f8fafc',
                  color: active ? '#ffffff' : '#334155',
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
                {t.id === 'governance_approvals' && kpis.pendingApprovalsCount > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      borderRadius: 99,
                      background: active ? '#ffffff' : '#ea580c',
                      color: active ? '#ea580c' : '#ffffff',
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    {kpis.pendingApprovalsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Toast Notification Banner */}
      {notice && (
        <div
          style={{
            maxWidth: 1440,
            margin: '12px auto 0',
            padding: '10px 16px',
            borderRadius: 12,
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: 12.5,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={15} color="#059669" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#065f46', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Container */}
      <main style={{ maxWidth: 1440, margin: '18px auto 0', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Executive KPI Cards with 1-Click Drill-Down (Section 3) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {[
            {
              label: 'ACTIVE PRODUCTS',
              value: kpis.activeProductsCount ?? 0,
              sub: `${kpis.totalPortfoliosCount ?? 0} Group Portfolios`,
              accent: '#ea580c',
              tab: 'overview' as NavTabKey,
            },
            {
              label: 'IN-FLIGHT DISCOVERY',
              value: kpis.discoveryItemsCount ?? 0,
              sub: `${kpis.validatedOpportunitiesCount ?? 0} Validated Opportunities`,
              accent: '#0284c7',
              tab: 'ideas_discovery' as NavTabKey,
            },
            {
              label: 'PRODUCT BOARD FEATURES',
              value: kpis.totalFeaturesCount ?? 0,
              sub: `${kpis.approvedFeaturesCount ?? 0} Approved / In Delivery`,
              accent: '#059669',
              tab: 'product_board' as NavTabKey,
            },
            {
              label: 'BRAINSTORMING CANVASES',
              value: kpis.activeBoardsCount ?? 0,
              sub: `${kpis.totalIdeasCount ?? 0} Total Submitted Ideas`,
              accent: '#7c3aed',
              tab: 'brainstorming' as NavTabKey,
            },
            {
              label: 'EXPERIMENTS & RELEASES',
              value: `${kpis.activeExperimentsCount ?? 0} / ${kpis.releasesCount ?? 0}`,
              sub: 'Active Pilots / Versioned Releases',
              accent: '#0891b2',
              tab: 'delivery_releases' as NavTabKey,
            },
            {
              label: 'PENDING GATE APPROVALS',
              value: kpis.pendingApprovalsCount ?? 0,
              sub: `${kpis.blockersCount ?? 0} Launch-Blocking Risks`,
              accent: kpis.pendingApprovalsCount > 0 ? '#dc2626' : '#475569',
              tab: 'governance_approvals' as NavTabKey,
            },
          ].map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => setActiveTab(card.tab)}
              style={{
                textAlign: 'left',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: '14px 16px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', letterSpacing: '0.04em' }}>
                {card.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: card.accent, marginTop: 4 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 2, fontWeight: 600 }}>
                {card.sub}
              </div>
            </button>
          ))}
        </div>

        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW, PORTFOLIOS & PRODUCT REGISTRY (SECTIONS 2–4, 28, 33) */}
        {/* =================================================================== */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                    Authoritative Product &amp; Portfolio Registry
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                    Company → Portfolio → Product → Initiative / Opportunity → Feature hierarchy across BEMS Group.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowNewProductModal(true)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 9,
                      border: 'none',
                      background: '#ea580c',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Plus size={14} /> Register New Product
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewFeatureModal(true)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 9,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Plus size={14} /> Propose Feature
                  </button>
                </div>
              </div>

              {/* Product Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
                {products.map((prod: any) => {
                  const prodFeatures = (data?.features || []).filter((f: any) => f.productId === prod.id);
                  const prodIdeas = (data?.ideas || []).filter((i: any) => i.productId === prod.id);
                  const prodPrds = (data?.prds || []).filter((p: any) => p.productId === prod.id);

                  return (
                    <div
                      key={prod.id}
                      style={{
                        border: selectedProductId === prod.id ? '2px solid #ea580c' : '1px solid #e2e8f0',
                        borderRadius: 14,
                        padding: 16,
                        background: selectedProductId === prod.id ? '#fff7ed' : '#f8fafc',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 900,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#0f172a',
                            }}
                          >
                            {prod.productCode} · {prod.productType}
                          </span>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 99,
                              background: '#ecfdf5',
                              color: '#047857',
                              border: '1px solid #a7f3d0',
                            }}
                          >
                            {prod.lifecycleStage} · Health {prod.healthScore}%
                          </span>
                        </div>

                        <h3 style={{ margin: '10px 0 4px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                          {prod.name}
                        </h3>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#ea580c', marginBottom: 6 }}>
                          {prod.organizationName} {prod.portfolio?.name ? `· ${prod.portfolio.name}` : ''}
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                          {prod.summary}
                        </p>

                        {prod.vision && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: '8px 10px',
                              borderRadius: 8,
                              background: '#ffffff',
                              border: '1px solid #e2e8f0',
                              fontSize: 11,
                              color: '#334155',
                            }}
                          >
                            <strong>Vision:</strong> {prod.vision}
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#64748b', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                          <span>Owner: <strong style={{ color: '#0f172a' }}>{prod.ownerName}</strong></span>
                          <span>
                            <strong>{prodFeatures.length}</strong> Features · <strong>{prodIdeas.length}</strong> Ideas · <strong>{prodPrds.length}</strong> PRDs
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductId(prod.id);
                              setActiveTab('product_board');
                            }}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 7,
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              color: '#0f172a',
                              cursor: 'pointer',
                            }}
                          >
                            Open Product Board
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductId(prod.id);
                              setActiveTab('brainstorming');
                            }}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 7,
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              color: '#7c3aed',
                              cursor: 'pointer',
                            }}
                          >
                            Brainstorm Canvas
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductId(prod.id);
                              setActiveTab('strategy_prds');
                            }}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 7,
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              color: '#0284c7',
                              cursor: 'pointer',
                            }}
                          >
                            Strategy &amp; PRDs
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: MASTER PRODUCT BOARD & RICE PRIORITIZATION (SECTIONS 5, 14, 15, 22) */}
        {/* =================================================================== */}
        {activeTab === 'product_board' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                    Master Product Board &amp; Prioritization Engine
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                    Idea → Discovery → Validated → Prioritized → Approved → Development Ready → In Development → Verified → Released → Impact Review
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 3, borderRadius: 9, border: '1px solid #e2e8f0' }}>
                    {[
                      { id: 'KANBAN', label: 'Kanban Stages' },
                      { id: 'RICE_MATRIX', label: 'RICE & Scoring Table' },
                      { id: 'LIST', label: 'Backlog & PM Handoff' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setBoardLayout(v.id as any)}
                        style={{
                          padding: '5px 11px',
                          borderRadius: 7,
                          border: 'none',
                          background: boardLayout === v.id ? '#ffffff' : 'transparent',
                          color: boardLayout === v.id ? '#0f172a' : '#64748b',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: boardLayout === v.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter features..."
                    style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}
                  />

                  <button
                    type="button"
                    onClick={() => setShowNewFeatureModal(true)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 9,
                      border: 'none',
                      background: '#ea580c',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Plus size={14} /> New Feature
                  </button>
                </div>
              </div>

              {/* VIEW A: 10-STAGE KANBAN PRODUCT BOARD */}
              {boardLayout === 'KANBAN' && (
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                  {FEATURE_STAGE_ORDER.map((stage) => {
                    const stageItems = filteredFeatures.filter((f: any) => f.workflowStage === stage);
                    const isApprovalGate = stage === 'APPROVED' || stage === 'RELEASED';
                    return (
                      <div
                        key={stage}
                        style={{
                          minWidth: 270,
                          maxWidth: 270,
                          background: isApprovalGate ? '#fff7ed' : '#f8fafc',
                          border: `1px solid ${isApprovalGate ? '#fed7aa' : '#e2e8f0'}`,
                          borderRadius: 12,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 900, color: isApprovalGate ? '#c2410c' : '#0f172a' }}>
                            {stage.replace(/_/g, ' ')} {isApprovalGate ? '🔒' : ''}
                          </span>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              padding: '1px 7px',
                              borderRadius: 99,
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            {stageItems.length}
                          </span>
                        </div>

                        {stageItems.map((feat: any) => (
                          <div
                            key={feat.id}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e2e8f0',
                              borderRadius: 10,
                              padding: 12,
                              boxShadow: '0 2px 6px rgba(15,23,42,0.04)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 900, color: '#ea580c' }}>
                                {feat.featureCode}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                }}
                              >
                                RICE: {feat.computedRiceScore}
                              </span>
                            </div>

                            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
                              {feat.title}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                              {feat.problemStatement}
                            </div>

                            {feat.linkedWorkItemCode && (
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  padding: '3px 7px',
                                  borderRadius: 5,
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  border: '1px solid #a7f3d0',
                                }}
                              >
                                ⚙️ Linked PM Epic: {feat.linkedWorkItemCode} ({feat.engineeringStatus})
                              </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 6, borderTop: '1px dashed #e2e8f0' }}>
                              <select
                                value={feat.workflowStage}
                                onChange={(e) => void handleMoveFeatureStage(feat.id, e.target.value)}
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: '3px 6px',
                                  borderRadius: 6,
                                  border: '1px solid #cbd5e1',
                                  background: '#f8fafc',
                                  maxWidth: 140,
                                }}
                              >
                                {FEATURE_STAGE_ORDER.map((s) => (
                                  <option key={s} value={s}>
                                    → {s.replace(/_/g, ' ')}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={() => void handleEngineeringHandoff(feat.id)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  border: '1px solid #fed7aa',
                                  background: '#fff7ed',
                                  color: '#ea580c',
                                  fontSize: 10,
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                                title="Idempotent handoff to Project Management Epic"
                              >
                                {feat.linkedWorkItemCode ? 'Synced ✓' : 'PM Handoff →'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* VIEW B & C: RICE PRIORITIZATION & ENGINEERING HANDOFF TABLE (SECTIONS 15 & 22) */}
              {(boardLayout === 'RICE_MATRIX' || boardLayout === 'LIST') && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>CODE &amp; FEATURE</th>
                        <th style={{ padding: '10px 12px' }}>PRODUCT</th>
                        <th style={{ padding: '10px 12px' }}>STAGE</th>
                        <th style={{ padding: '10px 12px' }}>MoSCoW / HORIZON</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>REACH × IMPACT × CONF ÷ EFFORT</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>COMPUTED RICE</th>
                        <th style={{ padding: '10px 12px' }}>OVERRIDE RANK</th>
                        <th style={{ padding: '10px 12px' }}>PM EPIC HANDOFF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFeatures.map((feat: any, idx: number) => (
                        <tr key={feat.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>
                              <span style={{ color: '#ea580c', marginRight: 6 }}>{feat.featureCode}</span>
                              {feat.title}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{feat.problemStatement}</div>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#334155' }}>{feat.productName}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', fontWeight: 800, fontSize: 10.5 }}>
                              {feat.workflowStage}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>
                            {feat.moscowCategory} · <span style={{ color: '#ea580c' }}>{feat.roadmapHorizon}</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {feat.riceReach} × {feat.riceImpact} × {feat.riceConfidence}% ÷ {feat.riceEffort}m
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#1d4ed8', fontSize: 13 }}>
                            {feat.computedRiceScore}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: 11 }}>
                            {feat.manualOverrideRank ? (
                              <span style={{ color: '#c2410c', fontWeight: 800 }}>
                                Rank #{feat.manualOverrideRank} ({feat.overrideReason || 'Manager override'})
                              </span>
                            ) : (
                              <span style={{ color: '#64748b' }}>Auto #{idx + 1} (Computed preserved)</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {feat.linkedWorkItemCode ? (
                              <span style={{ padding: '4px 8px', borderRadius: 6, background: '#ecfdf5', color: '#047857', fontWeight: 800, fontSize: 11 }}>
                                ✓ {feat.linkedWorkItemCode} (PRD v{feat.linkedPrdVersion || 1})
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleEngineeringHandoff(feat.id)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 7,
                                  border: '1px solid #fed7aa',
                                  background: '#fff7ed',
                                  color: '#ea580c',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                              >
                                Handoff to PM Epic →
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: REAL-TIME INFINITE BRAINSTORMING CANVAS (SECTIONS 6, 7, 59)  */}
        {/* =================================================================== */}
        {activeTab === 'brainstorming' && (
          <BrainstormingCanvasPanel
            boards={data?.boards || []}
            products={products}
            isStaffMode={false}
            onRefresh={() => void fetchOverview()}
            onNotice={showToast}
          />
        )}

        {/* =================================================================== */}
        {/* TAB 4: IDEAS, DISCOVERY OST, FEEDBACK & RESEARCH (SECTIONS 8–11, 19) */}
        {/* =================================================================== */}
        {activeTab === 'ideas_discovery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { id: 'IDEAS', label: `Idea Management Board (${(data?.ideas || []).length})` },
                    { id: 'OST', label: `Discovery & Opportunity Solution Tree (${(data?.opportunities || []).length})` },
                    { id: 'FEEDBACK', label: `Customer & Staff Feedback Repository (${(data?.feedbackItems || []).length})` },
                    { id: 'RESEARCH', label: `User Research, Personas & Competitors (${(data?.researchRecords || []).length})` },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setDiscoverySubTab(st.id as any)}
                      style={{
                        padding: '7px 13px',
                        borderRadius: 9,
                        border: discoverySubTab === st.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
                        background: discoverySubTab === st.id ? '#0f172a' : '#f8fafc',
                        color: discoverySubTab === st.id ? '#ffffff' : '#334155',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewIdeaModal(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9,
                    border: 'none',
                    background: '#ea580c',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Plus size={14} /> Submit New Idea
                </button>
              </div>

              {/* SUB-VIEW 1: IDEA MANAGEMENT BOARD */}
              {discoverySubTab === 'IDEAS' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                  {(data?.ideas || []).map((idea: any) => (
                    <div
                      key={idea.id}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 900, color: '#ea580c' }}>
                            {idea.ideaNumber} · {idea.productName}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: idea.status === 'APPROVED' ? '#ecfdf5' : '#fff7ed',
                              color: idea.status === 'APPROVED' ? '#047857' : '#c2410c',
                            }}
                          >
                            {idea.status}
                          </span>
                        </div>
                        <h4 style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                          {idea.title}
                        </h4>
                        <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}>
                          <strong>Problem:</strong> {idea.problemStatement}
                        </div>
                        {idea.expectedValue && (
                          <div style={{ fontSize: 11, color: '#047857', fontWeight: 700 }}>
                            Expected Value: {idea.expectedValue}
                          </div>
                        )}
                        {idea.publicDecisionNote && (
                          <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 7, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 11, color: '#334155' }}>
                            <strong>Decision Note:</strong> {idea.publicDecisionNote}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 10.5, color: '#64748b' }}>
                          By <strong>{idea.submitterName}</strong> · Score: <strong>{idea.rubricScore ?? '—'}</strong>
                        </span>

                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => void handleIdeaAction(idea.id, 'VOTE')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <ThumbsUp size={11} color="#ea580c" /> {idea.votesCount}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleIdeaAction(idea.id, 'CONVERT_TO_OPPORTUNITY')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid #bfdbfe',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: 10.5,
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            → Opportunity
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleIdeaAction(idea.id, 'CONVERT_TO_FEATURE')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid #fed7aa',
                              background: '#fff7ed',
                              color: '#ea580c',
                              fontSize: 10.5,
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            → Feature
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SUB-VIEW 2: DISCOVERY OPPORTUNITIES (OST) */}
              {discoverySubTab === 'OST' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                  {(data?.opportunities || []).map((opp: any) => (
                    <div key={opp.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: '#0284c7' }}>
                          {opp.opportunityCode} · {opp.productName}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                          Confidence {opp.confidenceScore}% · {opp.decision}
                        </span>
                      </div>
                      <h4 style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 800 }}>{opp.title}</h4>
                      <p style={{ margin: '0 0 6px', fontSize: 11.5, color: '#334155' }}>
                        <strong>Problem:</strong> {opp.problemStatement}
                      </p>
                      {opp.hypothesis && (
                        <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                          <strong>Hypothesis:</strong> {opp.hypothesis}
                        </div>
                      )}
                      {opp.evidenceSummary && (
                        <div style={{ padding: '6px 8px', borderRadius: 7, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 11, color: '#0f172a' }}>
                          <strong>Evidence:</strong> {opp.evidenceSummary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* SUB-VIEW 3: CUSTOMER & STAFF FEEDBACK REPOSITORY */}
              {discoverySubTab === 'FEEDBACK' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                  {(data?.feedbackItems || []).map((fb: any) => (
                    <div key={fb.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: '#ea580c' }}>
                          {fb.feedbackCode} · {fb.category}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                          {fb.status}
                        </span>
                      </div>
                      <h4 style={{ margin: '8px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{fb.title}</h4>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>{fb.description}</p>
                      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 8 }}>
                        Channel: <strong>{fb.sourceChannel}</strong> · Segment: <strong>{fb.customerSegment || 'Staff'}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SUB-VIEW 4: USER RESEARCH & PERSONAS */}
              {discoverySubTab === 'RESEARCH' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                  {(data?.researchRecords || []).map((resRec: any) => (
                    <div key={resRec.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: '#7c3aed' }}>
                          {resRec.researchCode} · {resRec.researchType}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                          {resRec.status} · Consent ✓
                        </span>
                      </div>
                      <h4 style={{ margin: '8px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{resRec.title}</h4>
                      <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}>
                        <strong>Research Question:</strong> {resRec.researchQuestion}
                      </div>
                      {resRec.findingsSummary && (
                        <div style={{ padding: '6px 8px', borderRadius: 7, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 11, color: '#0f172a' }}>
                          <strong>Verified Findings:</strong> {resRec.findingsSummary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: STRATEGY, OKRs, ROADMAPS & VERSIONED PRD EDITOR (SECTIONS 12, 13, 16, 17) */}
        {/* =================================================================== */}
        {activeTab === 'strategy_prds' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* OKRs & Roadmaps Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
              {/* Product OKRs */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  Product Objectives &amp; Key Results (OKRs — Section 13)
                </h3>
                {(data?.goals || []).map((g: any) => (
                  <div key={g.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                      {g.objectiveTitle} ({g.measurementCycle})
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{g.purpose}</div>
                    {(g.keyResults || []).map((kr: any) => {
                      const pct = Math.min(100, Math.max(0, Math.round((kr.actualValue / (kr.targetValue || 1)) * 100)));
                      return (
                        <div key={kr.id} style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
                            <span>{kr.metricName}</span>
                            <span style={{ color: '#059669' }}>
                              {kr.actualValue}{kr.unit} / {kr.targetValue}{kr.unit} (Baseline: {kr.baselineValue}{kr.unit})
                            </span>
                          </div>
                          <div style={{ height: 7, borderRadius: 99, background: '#e2e8f0', marginTop: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#10b981' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Roadmaps: Now / Next / Later */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  Strategic Product Roadmap (Now / Next / Later — Section 16)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(data?.roadmapItems || []).map((rm: any) => (
                    <div
                      key={rm.id}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 11,
                        padding: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 7px', borderRadius: 5, background: '#ea580c', color: '#ffffff' }}>
                            {rm.horizon} · {rm.quarterLabel}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 5,
                              background: rm.commitmentLevel === 'APPROVED_COMMITMENT' ? '#ecfdf5' : '#fff7ed',
                              color: rm.commitmentLevel === 'APPROVED_COMMITMENT' ? '#047857' : '#c2410c',
                            }}
                          >
                            {rm.commitmentLevel}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 5 }}>{rm.title}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {rm.productName} · Dependencies: {rm.dependenciesNote || 'None'}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a' }}>{rm.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 14-Section Version-Controlled PRD Editor (Section 17) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                    Version-Controlled PRD &amp; Requirements Specification Editor (Section 17)
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                    Engineering handoffs reference an immutable approved PRD version snapshot — editing creates a new revision without overwriting prior approvals.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={activePrd?.id || ''}
                    onChange={(e) => setSelectedPrdId(e.target.value)}
                    style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12, fontWeight: 700 }}
                  >
                    {(data?.prds || []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.prdCode} · {p.title} (v{p.currentVersion} · {p.status})
                      </option>
                    ))}
                  </select>

                  {activePrd && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handlePrdRevisionOrApprove(activePrd.id, 'NEW_VERSION')}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        + Draft New Version (v{(activePrd.currentVersion || 1) + 1})
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePrdRevisionOrApprove(activePrd.id, 'APPROVE')}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#059669',
                          color: '#ffffff',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ✓ Approve Snapshot v{activePrd.currentVersion}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowNewPrdModal(true)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#ea580c',
                      color: '#ffffff',
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    + New PRD
                  </button>
                </div>
              </div>

              {activePrd && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                  {[
                    { label: '1. Overview & Context', val: activePrd.overview },
                    { label: '2. Problem Statement', val: activePrd.problemStatement },
                    { label: '3. Target Outcomes & Metrics', val: activePrd.targetOutcomes },
                    { label: '4. Target Personas', val: activePrd.personas },
                    { label: '5. In-Scope Capabilities', val: activePrd.inScope },
                    { label: '6. Out-of-Scope Exclusions', val: activePrd.outOfScope },
                    { label: '7. User Stories', val: activePrd.userStories },
                    { label: '8. User Flows', val: activePrd.userFlows },
                    { label: '9. Functional Requirements', val: activePrd.functionalReqs },
                    { label: '10. Non-Functional Requirements', val: activePrd.nonFunctionalReqs },
                    { label: '11. Data Model & Schema Notes', val: activePrd.dataModelNotes },
                    { label: '12. Security, Privacy & Compliance', val: activePrd.securityPrivacy },
                    { label: '13. Dependencies & Risks', val: activePrd.dependenciesRisks },
                    { label: '14. Acceptance Criteria', val: activePrd.acceptanceCriteria },
                  ].map((sec) => (
                    <div
                      key={sec.label}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 11,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', marginBottom: 4 }}>
                        {sec.label}
                      </div>
                      <div style={{ fontSize: 12, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {sec.val || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Immutable Version Snapshot History */}
              {activePrd?.versions?.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                    Immutable Version Snapshot Trail ({activePrd.versions.length} versions)
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {activePrd.versions.map((v: any) => (
                      <div
                        key={v.id}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: v.status === 'APPROVED' ? '#ecfdf5' : '#f8fafc',
                          border: `1px solid ${v.status === 'APPROVED' ? '#a7f3d0' : '#e2e8f0'}`,
                          fontSize: 11,
                        }}
                      >
                        <strong>v{v.versionNumber} ({v.status})</strong> · {v.changeSummary} · by {v.createdByName}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 6: DESIGN, EXPERIMENTS, RELEASES & LAUNCH GO/NO-GO (SECTIONS 18, 20–24) */}
        {/* =================================================================== */}
        {activeTab === 'delivery_releases' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
            {/* Experiments & MVP Pilot Control */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                Experiments, Validation &amp; MVP Pilot Graduation (Sections 20 &amp; 21)
              </h3>
              {(data?.experiments || []).map((ex: any) => (
                <div key={ex.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: '#0891b2' }}>
                      {ex.experimentCode} · {ex.experimentType}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                      {ex.outcomeDecision} · {ex.pilotGraduation}
                    </span>
                  </div>
                  <h4 style={{ margin: '6px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{ex.title}</h4>
                  <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 4 }}>
                    <strong>Hypothesis:</strong> {ex.hypothesis}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#047857', fontWeight: 700, marginBottom: 4 }}>
                    <strong>Results ({ex.sampleSize}):</strong> {ex.resultsSummary}
                  </div>
                  <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a' }}>
                    <strong>Declared Limitations (Section 20 Control):</strong> {ex.limitationsNote}
                  </div>
                </div>
              ))}
            </div>

            {/* Releases & Go/No-Go Launch Board */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                Product Releases &amp; Commercial Go/No-Go Launch Board (Sections 23 &amp; 24)
              </h3>
              {(data?.releases || []).map((rel: any) => (
                <div key={rel.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: '#ea580c' }}>
                      {rel.releaseCode} · {rel.versionTag}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8' }}>
                      {rel.workflowStage} · QA: {rel.qaStatus}
                    </span>
                  </div>
                  <h4 style={{ margin: '6px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{rel.title}</h4>
                  <div style={{ fontSize: 11.5, color: '#475569' }}>
                    <strong>Release Notes:</strong> {rel.externalReleaseNotes}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    <strong>Rollback Plan:</strong> {rel.rollbackPlan}
                  </div>
                </div>
              ))}

              {(data?.launchChecklists || []).map((lc: any) => (
                <div key={lc.id} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12.5, color: '#9a3412' }}>{lc.launchCode} · {lc.title}</strong>
                    <span style={{ fontSize: 10.5, fontWeight: 900, padding: '2px 8px', borderRadius: 6, background: '#ffffff', color: '#ea580c' }}>
                      Go/No-Go: {lc.goNoGoDecision}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {[
                      { label: 'Product Readiness', ok: lc.productReadinessOk },
                      { label: 'Docs & Training', ok: lc.docsTrainingOk },
                      { label: 'Support & Ops', ok: lc.supportOpsOk },
                      { label: 'Marketing & Sales', ok: lc.marketingSalesOk },
                      { label: 'Legal & Privacy', ok: lc.legalPrivacyOk },
                      { label: 'Technical Security', ok: lc.technicalSecurityOk },
                    ].map((s) => (
                      <span
                        key={s.label}
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: s.ok ? '#ecfdf5' : '#fef2f2',
                          color: s.ok ? '#047857' : '#dc2626',
                          border: `1px solid ${s.ok ? '#a7f3d0' : '#fecaca'}`,
                        }}
                      >
                        {s.ok ? '✓' : '✕'} {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 7: ADOPTION ANALYTICS & PRODUCT BUDGETS (SECTIONS 25 & 27)      */}
        {/* =================================================================== */}
        {activeTab === 'analytics_budget' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Adoption & Performance Analytics */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                Traceable Product Adoption, Retention &amp; Performance Analytics (Section 25)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {(data?.metrics || []).map((m: any) => (
                  <div key={m.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b' }}>
                        {m.productName} · {m.category}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#ecfdf5', color: '#047857' }}>
                        {m.verificationState} ({m.confidence}%)
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 6 }}>{m.metricName}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#ea580c', marginTop: 2 }}>
                      {m.actualValue.toLocaleString()} {m.unit}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      Prior: {m.priorPeriodValue} {m.unit} · Target: {m.targetValue ?? '—'} {m.unit}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, fontFamily: 'monospace' }}>
                      Formula: {m.formula} · Source: {m.sourceSystem}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Product Budget & Finance Governance Link (Section 27) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  Product Investment &amp; Budget Ledger (Finance Authoritative — Section 27)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Control Rule: Proposed funding is not available cash; approved product budget is not a disbursement. All payouts remain governed by Finance.
                </p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>CODE &amp; PRODUCT</th>
                      <th style={{ padding: '10px 12px' }}>PERIOD</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>PROPOSED INVESTMENT</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>APPROVED CAPEX + OPEX</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>COMMITTED / ACTUAL</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ATTRIBUTABLE REVENUE</th>
                      <th style={{ padding: '10px 12px' }}>METHODOLOGY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.budgets || []).map((b: any) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 800 }}>
                          <span style={{ color: '#ea580c', marginRight: 6 }}>{b.budgetCode}</span>
                          {b.productName}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{b.fiscalPeriod}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatNaira(b.proposedInvestmentNaira)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                          {formatNaira(b.approvedCapexNaira + b.approvedOpexNaira)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#047857', fontWeight: 800 }}>
                          {formatNaira(b.committedSpendNaira)} / {formatNaira(b.actualSpendNaira)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>
                          {formatNaira(b.attributableRevNaira)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>{b.allocationMethodology}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 8: RISKS, DECISION REGISTER & VERSION-BOUND APPROVALS (SECTIONS 29, 31, 32) */}
        {/* =================================================================== */}
        {activeTab === 'governance_approvals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Version-Bound Approval Queue */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                Version-Bound Product Approval Queue (Section 32)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                {(data?.approvals || []).map((apr: any) => (
                  <div
                    key={apr.id}
                    style={{
                      background: apr.status === 'PENDING' ? '#fff7ed' : '#f8fafc',
                      border: `1px solid ${apr.status === 'PENDING' ? '#fed7aa' : '#e2e8f0'}`,
                      borderRadius: 12,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: '#ea580c' }}>
                          {apr.approvalCode} · {apr.gateType} (v{apr.targetVersion})
                        </span>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: apr.status === 'APPROVED' ? '#ecfdf5' : '#ffffff',
                            color: apr.status === 'APPROVED' ? '#047857' : '#c2410c',
                          }}
                        >
                          {apr.status}
                        </span>
                      </div>
                      <h4 style={{ margin: '6px 0 4px', fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>{apr.title}</h4>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>{apr.summary}</p>
                      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 6 }}>
                        Product: <strong>{apr.productName}</strong> · Target: <strong>{apr.targetRecordCode}</strong> · Requested by <strong>{apr.requesterName}</strong>
                      </div>
                    </div>

                    {apr.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid #fed7aa' }}>
                        <button
                          type="button"
                          onClick={() => void handleApprovalDecision(apr.id, 'APPROVED')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 7,
                            border: 'none',
                            background: '#059669',
                            color: '#ffffff',
                            fontSize: 11.5,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Approve Gate
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApprovalDecision(apr.id, 'CHANGES_REQUESTED')}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 7,
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#334155',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Request Changes
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApprovalDecision(apr.id, 'REJECTED')}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 7,
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            color: '#dc2626',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Register & Decision Register Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
              {/* Product Risk, Privacy & Security Register */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  Product Risk, Privacy &amp; Compliance Register (Section 29)
                </h3>
                {(data?.risks || []).map((rk: any) => (
                  <div key={rk.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#dc2626' }}>
                        {rk.riskCode} · {rk.category} (Impact: {rk.impact})
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                        {rk.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{rk.title}</div>
                    <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                      <strong>Mitigation:</strong> {rk.mitigationPlan}
                    </div>
                  </div>
                ))}
              </div>

              {/* Canonical Decision Register */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  Product Decision Register &amp; Audit Provenance (Section 31)
                </h3>
                {(data?.decisions || []).map((dc: any) => (
                  <div key={dc.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#047857' }}>
                        {dc.decisionCode} · {dc.targetRecordType} ({dc.targetRecordCode}) v{dc.recordVersion}
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b' }}>
                        {new Date(dc.decidedAt).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{dc.title}</div>
                    <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}>
                      <strong>Rationale:</strong> {dc.rationale}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>
                      Approved by <strong>{dc.decidedByName}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: REGISTER NEW PRODUCT */}
      {showNewProductModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <form
            onSubmit={handleCreateProduct}
            style={{ width: '100%', maxWidth: 520, background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Register Canonical Product</h3>
            <input
              type="text"
              required
              placeholder="Product Name (e.g., SmartAIRS Taxpayer Portal)"
              value={prodForm.name}
              onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select
                value={prodForm.productType}
                onChange={(e) => setProdForm({ ...prodForm, productType: e.target.value })}
                style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, background: '#f8fafc' }}
              >
                <option value="SAAS">Externally Marketed SaaS</option>
                <option value="INTERNAL">Internal Enterprise Platform</option>
                <option value="PUBLIC_SECTOR">Public-Sector Platform</option>
                <option value="HARDWARE">Hardware-Integrated Solution</option>
              </select>
              <select
                value={prodForm.lifecycleStage}
                onChange={(e) => setProdForm({ ...prodForm, lifecycleStage: e.target.value })}
                style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, background: '#f8fafc' }}
              >
                <option value="IDEA">Idea</option>
                <option value="DISCOVERY">Discovery</option>
                <option value="VALIDATION">Validation</option>
                <option value="DEVELOPMENT">Development</option>
                <option value="PILOT">Pilot</option>
                <option value="GROWTH">Growth</option>
              </select>
            </div>
            <textarea
              required
              rows={2}
              placeholder="Executive Summary..."
              value={prodForm.summary}
              onChange={(e) => setProdForm({ ...prodForm, summary: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <input
              type="text"
              placeholder="Product Vision & Value Proposition..."
              value={prodForm.vision}
              onChange={(e) => setProdForm({ ...prodForm, vision: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setShowNewProductModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
                Create Product
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: CREATE FEATURE WITH RICE SCORING */}
      {showNewFeatureModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <form
            onSubmit={handleCreateFeature}
            style={{ width: '100%', maxWidth: 540, background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Propose Product Feature &amp; Calculate RICE Score</h3>
            <input
              type="text"
              required
              placeholder="Feature Title"
              value={featForm.title}
              onChange={(e) => setFeatForm({ ...featForm, title: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <textarea
              required
              rows={2}
              placeholder="Verified User Problem Statement..."
              value={featForm.problemStatement}
              onChange={(e) => setFeatForm({ ...featForm, problemStatement: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700 }}>Reach (Users)</label>
                <input
                  type="number"
                  value={featForm.riceReach}
                  onChange={(e) => setFeatForm({ ...featForm, riceReach: Number(e.target.value) })}
                  style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700 }}>Impact (0.5–3)</label>
                <input
                  type="number"
                  step="0.5"
                  value={featForm.riceImpact}
                  onChange={(e) => setFeatForm({ ...featForm, riceImpact: Number(e.target.value) })}
                  style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700 }}>Confidence (%)</label>
                <input
                  type="number"
                  value={featForm.riceConfidence}
                  onChange={(e) => setFeatForm({ ...featForm, riceConfidence: Number(e.target.value) })}
                  style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700 }}>Effort (Months)</label>
                <input
                  type="number"
                  step="0.5"
                  value={featForm.riceEffort}
                  onChange={(e) => setFeatForm({ ...featForm, riceEffort: Number(e.target.value) })}
                  style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="Acceptance Criteria..."
              value={featForm.acceptanceCriteria}
              onChange={(e) => setFeatForm({ ...featForm, acceptanceCriteria: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setShowNewFeatureModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
                Save Feature
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: SUBMIT NEW IDEA */}
      {showNewIdeaModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <form
            onSubmit={handleSubmitIdea}
            style={{ width: '100%', maxWidth: 480, background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Submit Product Idea</h3>
            <input
              type="text"
              required
              placeholder="Idea Title"
              value={ideaForm.title}
              onChange={(e) => setIdeaForm({ ...ideaForm, title: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <textarea
              required
              rows={2}
              placeholder="User Pain Point / Problem Statement..."
              value={ideaForm.problemStatement}
              onChange={(e) => setIdeaForm({ ...ideaForm, problemStatement: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <input
              type="text"
              placeholder="Expected Value / Outcome..."
              value={ideaForm.expectedValue}
              onChange={(e) => setIdeaForm({ ...ideaForm, expectedValue: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setShowNewIdeaModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
                Submit Idea
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: CREATE VERSIONED PRD */}
      {showNewPrdModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <form
            onSubmit={handleCreatePrd}
            style={{ width: '100%', maxWidth: 540, background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Create Version-Controlled PRD (v1)</h3>
            <input
              type="text"
              required
              placeholder="PRD Document Title"
              value={prdForm.title}
              onChange={(e) => setPrdForm({ ...prdForm, title: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <textarea
              required
              rows={2}
              placeholder="1. Overview & Problem Statement..."
              value={prdForm.problemStatement}
              onChange={(e) => setPrdForm({ ...prdForm, problemStatement: e.target.value, overview: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <textarea
              required
              rows={2}
              placeholder="5. In-Scope Capabilities & Functional Requirements..."
              value={prdForm.inScope}
              onChange={(e) => setPrdForm({ ...prdForm, inScope: e.target.value, functionalReqs: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <textarea
              required
              rows={2}
              placeholder="14. Verifiable Acceptance Criteria..."
              value={prdForm.acceptanceCriteria}
              onChange={(e) => setPrdForm({ ...prdForm, acceptanceCriteria: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setShowNewPrdModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
                Create PRD v1
              </button>
            </div>
          </form>
        </div>
      )}

      {/* GMD-Exclusive AI Product Copilot Bar (Section 35 + Workspace Rule) */}
      {isAiAuthorized && (
        <AmbientBottomAiBar
          currentPage="Product Management & Innovation System"
          businessName="BEMS Group"
          userName={actorName}
          userRole={actorRole}
          messages={aiManager.messages}
          isTyping={aiManager.isTyping}
          onSendMessage={aiManager.sendMessage}
          onConfirmAction={aiManager.handleConfirmAction}
          onCancelAction={aiManager.handleCancelAction}
          onNewChat={aiManager.startNewChat}
          onOpenFullCockpit={() => {}}
        />
      )}
    </div>
  );
}
