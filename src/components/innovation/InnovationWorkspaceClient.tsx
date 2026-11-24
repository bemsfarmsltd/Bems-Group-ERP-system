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
import { InnovationDeepPanels } from './InnovationDeepPanels';
import { useGmdAccess } from '@/components/ai/useGmdAccess';

const FEATURE_STAGE_ORDER = [
  'IDEA',
  'DISCOVERY',
  'VALIDATED',
  'PRIORITIZED',
  'APPROVED',
  'DEVELOPMENT_READY',
  'IN_DEVELOPMENT',
  'VERIFIED',
  'RELEASED',
  'IMPACT_REVIEW',
] as const;
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

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: NavTabKey; label: string; subtitle: string; icon: string }>;
}> = [
  {
    label: 'PORTFOLIO & BOARDS',
    items: [
      { id: 'overview', label: 'Overview & Portfolios', subtitle: 'Executive KPIs & product registry', icon: '◈' },
      { id: 'product_board', label: 'Product Board & RICE', subtitle: '10-stage Kanban, RICE & PM handoff', icon: '☰' },
      { id: 'brainstorming', label: 'Brainstorming Canvas', subtitle: 'Infinite whiteboard & templates', icon: '✦' },
    ],
  },
  {
    label: 'DISCOVERY & PLANNING',
    items: [
      { id: 'ideas_discovery', label: 'Ideas & Discovery OST', subtitle: 'Ideas, voting, OST, feedback & research', icon: '◎' },
      { id: 'strategy_prds', label: 'Strategy, OKRs & PRDs', subtitle: 'Vision, OKRs, roadmaps & 14-section PRDs', icon: '▤' },
    ],
  },
  {
    label: 'DELIVERY & GOVERNANCE',
    items: [
      { id: 'delivery_releases', label: 'Experiments & Launch', subtitle: 'Designs, MVP pilots, releases & Go/No-Go', icon: '⚑' },
      { id: 'analytics_budget', label: 'Analytics & Budget', subtitle: 'Adoption telemetry & Finance ledger', icon: '◫' },
      { id: 'governance_approvals', label: 'Risks & Approvals', subtitle: 'Risk register, decisions & gate sign-off', icon: '✓' },
    ],
  },
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
  const [collapsed, setCollapsed] = useState(true);
  const [switcher, setSwitcher] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
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
  const activeSub = (data?.subsidiaries || []).find((s: any) => s.id === selectedOrgId) || null;
  const activeBusinessName = activeSub ? activeSub.legalName : 'BEMS Group';
  const activeBrandColor = activeSub?.brandColor || '#ea580c';
  const activeLogoUrl = activeSub?.logoUrl || '/bems-group-logo.png?v=20261024';
  const allNavItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentNavItem = allNavItems.find((i) => i.id === activeTab) || allNavItems[0];
  const actorInitials = (actorName || 'BG')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'BG';

  return (
    <div
      className={`app-shell ${collapsed ? 'collapsed' : ''} ${String(actorRole || '').toUpperCase() === 'GMD' ? 'gmd-view' : ''}`}
      style={{ '--brand-accent': activeBrandColor } as React.CSSProperties}
    >
      <style>{`
        :root, .app-shell, body {
          --brand-primary: ${activeBrandColor} !important;
          --brand-soft: ${activeBrandColor}14 !important;
          --brand-border: ${activeBrandColor}55 !important;
        }
        .sidebar {
          background-color: #070c16 !important;
          background: radial-gradient(circle at 18% 10%, ${activeBrandColor}30, transparent 42%),
                      linear-gradient(180deg, #070c16 0%, #0b111e 50%, #050811 100%) !important;
          position: sticky !important;
          top: 0 !important;
          height: 100vh !important;
          overflow: hidden !important;
        }
        .sidebar-circuit:before {
          border: 1.5px solid ${activeBrandColor}70 !important;
          box-shadow: 0 0 0 35px ${activeBrandColor}12, 0 0 0 85px ${activeBrandColor}05 !important;
        }
        .sidebar-glow i {
          background: ${activeBrandColor} !important;
        }
        .nav-item.active {
          background: linear-gradient(90deg, ${activeBrandColor}, ${activeBrandColor}cc) !important;
          box-shadow: inset 3px 0 #ffffff, 0 6px 16px ${activeBrandColor}40 !important;
        }
        .nav-group > p {
          color: ${activeBrandColor} !important;
        }
        .help-button > span {
          background: ${activeBrandColor} !important;
        }
        .topbar .avatar, .avatar {
          background: ${activeBrandColor}18 !important;
          color: ${activeBrandColor} !important;
          border-color: ${activeBrandColor}45 !important;
        }
      `}</style>

      {/* LEFT DARK ENTERPRISE SIDEBAR (matching Finance, HR, Projects & Operations) */}
      <aside className="sidebar">
        <div className="sidebar-circuit" aria-hidden="true" />
        <div className="sidebar-glow" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </div>
        <div
          className="side-brand"
          style={{ cursor: 'pointer' }}
          onClick={() => setCollapsed((c) => !c)}
          title="Toggle sidebar"
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: logoFailed ? activeBrandColor : '#ffffff',
              border: `1.5px solid ${activeBrandColor}50`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: logoFailed ? 0 : 2,
              flexShrink: 0,
              color: '#ffffff',
              fontWeight: 850,
              fontSize: 13,
            }}
          >
            {!logoFailed ? (
              <img
                src={activeLogoUrl}
                alt={activeBusinessName}
                onError={() => setLogoFailed(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              'BG'
            )}
          </span>
          <div className="brand-title-wrap" style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span
              className="brand-name"
              title={activeBusinessName}
              style={{
                display: 'block',
                fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
                fontSize: '15px',
                fontWeight: 850,
                letterSpacing: '-0.01em',
                color: '#ffffff',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 155,
              }}
            >
              {activeBusinessName}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            aria-label="Toggle sidebar"
            title="Collapse or expand sidebar"
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        <nav aria-label="Product Management navigation">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    title={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={isActive ? 'nav-item active' : 'nav-item'}
                    onClick={() => {
                      setActiveTab(item.id);
                      setSwitcher(false);
                    }}
                  >
                    <span>{item.icon}</span>
                    <b>{item.label}</b>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="help-button"
          onClick={() => setActiveTab('governance_approvals')}
        >
          <span>?</span>
          <div>
            <strong>Product Governance</strong>
            <small>Decisions &amp; gates</small>
          </div>
        </button>
      </aside>

      {/* MAIN WORKSPACE */}
      <section className="workspace" style={{ paddingBottom: 96 }}>
        <header className="topbar">
          {/* Subsidiary Switcher */}
          <div className="business-switch-wrap">
            <button
              type="button"
              className="business-switch"
              onClick={() => setSwitcher((s) => !s)}
            >
              <div style={{ textAlign: 'left' }}>
                <strong style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.25 }}>
                  {activeBusinessName}
                </strong>
                <small style={{ fontSize: 10.5, color: '#64748b', display: 'block', marginTop: 2 }}>
                  Product Management &amp; Innovation
                </small>
              </div>
              <b style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>⌄</b>
            </button>

            {switcher && (
              <div
                className="switch-menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: 300,
                  padding: 8,
                  borderRadius: 14,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 16px 40px -8px rgba(15, 23, 42, 0.16)',
                  zIndex: 60,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 10, fontWeight: 750, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
                    Select Subsidiary
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 650, color: '#94a3b8' }}>
                    {(data?.subsidiaries || []).length} entities
                  </span>
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto', padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrgId('');
                      setSelectedPortfolioId('');
                      setSelectedProductId('');
                      setLogoFailed(false);
                      setSwitcher(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: !selectedOrgId ? '#fff7ed' : 'transparent',
                      border: !selectedOrgId ? '1px solid #fed7aa' : '1px solid transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: '#0f172a',
                    }}
                  >
                    <img src="/bems-group-logo.png?v=20261024" alt="BEMS Group" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain', background: '#fff', border: '1px solid #e2e8f0' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>BEMS Group</div>
                      <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>All Subsidiaries · Holding</div>
                    </div>
                    {!selectedOrgId && <span style={{ color: '#ea580c', fontWeight: 900 }}>✓</span>}
                  </button>
                  {(data?.subsidiaries || []).map((sub: any) => (
                    <button
                      type="button"
                      key={sub.id}
                      onClick={() => {
                        setSelectedOrgId(sub.id);
                        setSelectedPortfolioId('');
                        setSelectedProductId('');
                        setLogoFailed(false);
                        setSwitcher(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 10,
                        background: selectedOrgId === sub.id ? `${sub.brandColor || '#ea580c'}14` : 'transparent',
                        border: selectedOrgId === sub.id ? `1px solid ${sub.brandColor || '#ea580c'}55` : '1px solid transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: '#0f172a',
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: sub.logoUrl ? '#ffffff' : (sub.brandColor || '#ea580c'),
                          border: '1px solid #e2e8f0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          color: '#ffffff',
                          fontSize: 10,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {sub.logoUrl ? (
                          <img src={sub.logoUrl} alt={sub.legalName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          sub.code?.slice(0, 2) || sub.legalName.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.legalName}</div>
                        <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>{sub.type} · {sub.code}</div>
                      </div>
                      {selectedOrgId === sub.id && <span style={{ color: sub.brandColor || '#ea580c', fontWeight: 900 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Global Search (⌘ K) */}
          <div className="global-search">
            <span>⌕</span>
            <input
              aria-label="Search Product Management workspace"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeBusinessName} Products, Features, Ideas...`}
            />
            <kbd>⌘ K</kbd>
          </div>

          {/* Top Actions (matching Finance, HR, Projects & Operations) */}
          <div className="top-actions">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              style={{
                height: '28px',
                padding: '0 8px',
                borderRadius: '8px',
                border: `1px solid ${activeBrandColor}45`,
                background: `${activeBrandColor}12`,
                fontSize: '11.5px',
                fontWeight: 700,
                color: activeBrandColor,
                maxWidth: 190,
              }}
            >
              <option value="">All Products ({products.length})</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.productCode} · {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowNewProductModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                height: '28px',
                borderRadius: '8px',
                background: activeBrandColor,
                border: 'none',
                color: '#ffffff',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Plus size={12} />
              <span>New Product</span>
            </button>

            <Link
              href="/staff/innovation"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                height: '28px',
                borderRadius: '8px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: '11.5px',
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span>Staff App View</span>
              <ArrowUpRight size={12} />
            </Link>

            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                height: '28px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#0f172a',
                fontSize: '11.5px',
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span>❖ All Systems</span>
            </Link>

            <button
              type="button"
              onClick={() => void fetchOverview()}
              title="Refresh live data"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>

            <span className="avatar" title={`${actorName} (${actorRole})`}>
              {actorInitials}
            </span>
          </div>
        </header>

        {/* Toast Notification Banner */}
        {notice && (
          <div
            style={{
              margin: '12px 24px 0',
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
        <main className="content-area" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Standard BEMS Module Title Banner */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: activeBrandColor }}>
                PRODUCT MANAGEMENT &amp; INNOVATION · {activeBusinessName.toUpperCase()}
              </div>
              <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {currentNavItem.label}
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b' }}>
                {currentNavItem.subtitle}
                {data?.dataAsOf && ` · Live data as of ${new Date(data.dataAsOf).toLocaleTimeString('en-GB')}`}
              </p>
            </div>
          </div>
        {/* Executive KPI Cards with 1-Click Drill-Down — Only on Overview & Portfolios */}
        {activeTab === 'overview' && (
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
              accent: activeBrandColor,
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
        )}

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
                      background: activeBrandColor,
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
              {products.length === 0 ? (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: 14,
                    padding: '32px 24px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 850, color: '#0f172a' }}>
                    No products registered yet for {activeBusinessName}
                  </div>
                  <p style={{ margin: '6px auto 16px', maxWidth: 460, fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
                    Register the first canonical product for {activeBusinessName} to unlock its 10-stage Product Board, RICE prioritization, infinite brainstorming canvas, versioned PRDs, and Finance-linked budgets.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewProductModal(true)}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 9,
                      border: 'none',
                      background: activeBrandColor,
                      color: '#ffffff',
                      fontSize: 12.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Plus size={14} /> Register First Product
                  </button>
                </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
                {products.map((prod: any) => {
                  const prodFeatures = (data?.features || []).filter((f: any) => f.productId === prod.id);
                  const prodIdeas = (data?.ideas || []).filter((i: any) => i.productId === prod.id);
                  const prodPrds = (data?.prds || []).filter((p: any) => p.productId === prod.id);

                  return (
                    <div
                      key={prod.id}
                      style={{
                        border: selectedProductId === prod.id ? `2px solid ${activeBrandColor}` : '1px solid #e2e8f0',
                        borderRadius: 14,
                        padding: 16,
                        background: selectedProductId === prod.id ? `${activeBrandColor}10` : '#f8fafc',
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
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: activeBrandColor, marginBottom: 6 }}>
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
              )}
            </div>

            {/* Portfolio Grouping & Strategic Health Overview */}
            {(data?.portfolios || []).length > 0 && (
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
                <div style={{ marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                    Strategic Product Portfolios ({(data?.portfolios || []).length})
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                    Executive grouping of products by business domain, strategic theme, and sponsor.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                  {(data?.portfolios || []).map((pf: any) => {
                    const pfProducts = products.filter((p: any) => p.portfolioId === pf.id);
                    return (
                      <div key={pf.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 10.5, fontWeight: 900, color: activeBrandColor }}>{pf.code}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155' }}>
                            {pfProducts.length} {pfProducts.length === 1 ? 'Product' : 'Products'}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 850, color: '#0f172a', marginTop: 6 }}>{pf.name}</div>
                        {pf.description && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#475569' }}>{pf.description}</p>}
                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 8 }}>
                          Lead: <strong style={{ color: '#0f172a' }}>{pf.leadName || 'Executive Product Office'}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                      background: activeBrandColor,
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
                          background: isApprovalGate ? `${activeBrandColor}10` : '#f8fafc',
                          border: `1px solid ${isApprovalGate ? `${activeBrandColor}44` : '#e2e8f0'}`,
                          borderRadius: 12,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 900, color: isApprovalGate ? activeBrandColor : '#0f172a' }}>
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
                              <span style={{ fontSize: 10, fontWeight: 900, color: activeBrandColor }}>
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
                                  border: `1px solid ${activeBrandColor}44`,
                                  background: `${activeBrandColor}12`,
                                  color: activeBrandColor,
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
                              <span style={{ color: activeBrandColor, marginRight: 6 }}>{feat.featureCode}</span>
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
                            {feat.moscowCategory} · <span style={{ color: activeBrandColor }}>{feat.roadmapHorizon}</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {feat.riceReach} × {feat.riceImpact} × {feat.riceConfidence}% ÷ {feat.riceEffort}m
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#1d4ed8', fontSize: 13 }}>
                            {feat.computedRiceScore}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: 11 }}>
                            {feat.manualOverrideRank ? (
                              <span style={{ color: activeBrandColor, fontWeight: 800 }}>
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
                                  border: `1px solid ${activeBrandColor}44`,
                                  background: `${activeBrandColor}12`,
                                  color: activeBrandColor,
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
            brandColor={activeBrandColor}
            onRefresh={() => void fetchOverview()}
            onNotice={showToast}
          />
        )}

        {/* =================================================================== */}
        {/* TABS 4–8: DEEP INTERACTIVE WORKSPACE PANELS (BRAND-THEMED & FULL CRUD) */}
        {/* =================================================================== */}
        {(activeTab === 'ideas_discovery' ||
          activeTab === 'strategy_prds' ||
          activeTab === 'delivery_releases' ||
          activeTab === 'analytics_budget' ||
          activeTab === 'governance_approvals') && (
          <InnovationDeepPanels
            activeTab={activeTab}
            data={data}
            products={products}
            activeProduct={activeProduct}
            selectedOrgId={selectedOrgId}
            selectedProductId={selectedProductId}
            brandColor={activeBrandColor}
            actorName={actorName}
            onRefresh={() => void fetchOverview()}
            onNotice={showToast}
            onOpenNewIdea={() => setShowNewIdeaModal(true)}
            onOpenNewPrd={() => setShowNewPrdModal(true)}
          />
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
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeBrandColor, color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
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
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeBrandColor, color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
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
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeBrandColor, color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
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
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeBrandColor, color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}>
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
          businessName={activeBusinessName}
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
      </section>
    </div>
  );
}
