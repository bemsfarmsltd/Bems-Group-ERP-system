'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, X } from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { OperationsPhasesPanel } from '@/components/operations/OperationsPhasesPanel';

type TabKey = 'command' | 'work_orders' | 'dispatch' | 'assurance' | 'resources' | 'governance' | 'catalogue' | 'approvals';

interface OpsOverviewData {
  lastUpdatedAt: string;
  kpis: {
    totalWorkOrders: number;
    openCount: number;
    inProgressCount: number;
    blockedCount: number;
    completedCount: number;
    overdueCount: number;
    activeSitesCount: number;
    activeServicesCount: number;
    pendingApprovalsCount: number;
    todayDispatchesCount: number;
  };
  workOrders: any[];
  sites: any[];
  services: any[];
  recentFeed: any[];
  subsidiaries: Array<{ id: string; legalName: string; code: string; type: string; brandColor?: string | null; logoUrl?: string | null }>;
  staffOptions: Array<{ id: string; legalName: string; employeeNumber: string; jobTitle: string | null; role: string }>;
}

const OPS_NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: TabKey; label: string; subtitle: string; icon: string }>;
}> = [
  {
    label: 'COMMAND CENTRE',
    items: [
      { id: 'command', label: 'Overview', subtitle: 'Live operational KPIs & feed', icon: '◈' },
      { id: 'work_orders', label: 'Work Orders', subtitle: 'Cases & service requests', icon: '☰' },
      { id: 'dispatch', label: 'Dispatch & Plan', subtitle: 'Daily rosters & assignments', icon: '⌖' },
    ],
  },
  {
    label: 'ASSURANCE & RESOURCES',
    items: [
      { id: 'assurance', label: 'SOPs & Incidents', subtitle: 'Inspections, root cause & SOPs', icon: '⚑' },
      { id: 'resources', label: 'Assets, Stock & Fleet', subtitle: 'Custody, stores & vehicles', icon: '⚙' },
    ],
  },
  {
    label: 'GOVERNANCE & SETUP',
    items: [
      { id: 'governance', label: 'Handovers & Intel', subtitle: 'Reconciliation, rules & analytics', icon: '▤' },
      { id: 'catalogue', label: 'Sites & Services', subtitle: 'Operating units & SLA catalogue', icon: '◫' },
      { id: 'approvals', label: 'Approvals', subtitle: 'Operational decision register', icon: '✓' },
    ],
  },
];

const PRIORITY_BADGE: Record<string, { bg: string; fg: string; border: string }> = {
  CRITICAL: { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  HIGH: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
  MEDIUM: { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  LOW: { bg: '#f8fafc', fg: '#475569', border: '#e2e8f0' },
};

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  NEW: { bg: '#f1f5f9', fg: '#334155' },
  TRIAGED: { bg: '#e0f2fe', fg: '#0369a1' },
  ASSIGNED: { bg: '#eef2ff', fg: '#4338ca' },
  SCHEDULED: { bg: '#f5f3ff', fg: '#6d28d9' },
  IN_PROGRESS: { bg: '#fff7ed', fg: '#c2410c' },
  AWAITING_INPUT: { bg: '#fefce8', fg: '#a16207' },
  BLOCKED: { bg: '#fef2f2', fg: '#b91c1c' },
  REVIEW: { bg: '#ecfeff', fg: '#0e7490' },
  COMPLETED: { bg: '#ecfdf5', fg: '#047857' },
  CLOSED: { bg: '#f0fdf4', fg: '#166534' },
  CANCELLED: { bg: '#f8fafc', fg: '#64748b' },
};

export default function OperationsWorkspaceClient({ actorName, actorRole }: { actorName: string; actorRole: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('command');
  const [collapsed, setCollapsed] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<OpsOverviewData | null>(null);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Global Filters
  const [orgFilter, setOrgFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Modals / Drawers
  const [showNewWoModal, setShowNewWoModal] = useState(false);
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [selectedWoDetail, setSelectedWoDetail] = useState<{ workOrder: any; employeesById: Record<string, any> } | null>(null);
  const [woComment, setWoComment] = useState('');
  const [transitionReason, setTransitionReason] = useState('');

  const [woForm, setWoForm] = useState({
    organizationId: '',
    siteId: '',
    serviceId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    assigneeId: '',
    requiresApproval: false,
  });

  const [siteForm, setSiteForm] = useState({
    organizationId: '',
    code: '',
    name: '',
    siteType: 'OFFICE',
    stateRegion: '',
    address: '',
    contactName: '',
    contactPhone: '',
  });

  const [serviceForm, setServiceForm] = useState({
    organizationId: '',
    code: '',
    name: '',
    category: 'FIELD_SERVICE',
    slaAcknowledgeMins: 60,
    slaResolveHours: 24,
    requiresVerification: true,
    requiresApproval: false,
  });

  const [dispatchForm, setDispatchForm] = useState({
    workOrderId: '',
    assigneeId: '',
    plannedDate: new Date().toISOString().slice(0, 10),
    windowStart: '09:00',
    windowEnd: '17:00',
    notes: '',
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (orgFilter) qs.set('organizationId', orgFilter);
      if (siteFilter) qs.set('siteId', siteFilter);
      if (statusFilter) qs.set('status', statusFilter);
      if (priorityFilter) qs.set('priority', priorityFilter);

      const [ovRes, dispRes, appRes] = await Promise.all([
        fetch(resolveApiUrl(`/api/operations/overview?${qs.toString()}`), { credentials: 'include', cache: 'no-store' }),
        fetch(resolveApiUrl(`/api/operations/dispatch${orgFilter ? `?organizationId=${orgFilter}` : ''}`), {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch(resolveApiUrl('/api/operations/approvals'), { credentials: 'include', cache: 'no-store' }),
      ]);

      const ovJson = await ovRes.json();
      if (!ovRes.ok) throw new Error(ovJson?.error || 'Could not load Operations Command Centre.');
      setData(ovJson);

      if (ovJson.subsidiaries?.[0]?.id) {
        const firstSub = ovJson.subsidiaries[0].id;
        setWoForm((prev) => (prev.organizationId ? prev : { ...prev, organizationId: firstSub }));
        setSiteForm((prev) => (prev.organizationId ? prev : { ...prev, organizationId: firstSub }));
        setServiceForm((prev) => (prev.organizationId ? prev : { ...prev, organizationId: firstSub }));
      }

      if (dispRes.ok) {
        const dispJson = await dispRes.json();
        setDispatches(dispJson.dispatches || []);
      }
      if (appRes.ok) {
        const appJson = await appRes.json();
        setApprovals(appJson.approvals || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Operations workspace.');
    } finally {
      setLoading(false);
    }
  }, [orgFilter, siteFilter, statusFilter, priorityFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadWoDetail = useCallback(async (id: string) => {
    setSelectedWoId(id);
    try {
      const res = await fetch(resolveApiUrl(`/api/operations/work-orders/${encodeURIComponent(id)}`), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        setSelectedWoDetail(await res.json());
      }
    } catch {}
  }, []);

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setError('');
    try {
      const res = await fetch(resolveApiUrl('/api/operations/work-orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(woForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not create work order.');
      setShowNewWoModal(false);
      setWoForm((prev) => ({ ...prev, title: '', description: '', assigneeId: '' }));
      setNotice(`Work order ${json.workOrder.workOrderNumber} created.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create work order.');
    }
  };

  const handleTransitionWo = async (id: string, nextStatus: string) => {
    setError('');
    setNotice('');
    try {
      const res = await fetch(resolveApiUrl(`/api/operations/work-orders/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus, reason: transitionReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not update work order status.');
      setTransitionReason('');
      setNotice(`Updated work order to ${nextStatus}.`);
      await Promise.all([loadAll(), loadWoDetail(id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update work order.');
    }
  };

  const handleAddComment = async () => {
    if (!selectedWoId || !woComment.trim()) return;
    try {
      const res = await fetch(resolveApiUrl(`/api/operations/work-orders/${encodeURIComponent(selectedWoId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commentOnly: true, message: woComment.trim() }),
      });
      if (res.ok) {
        setWoComment('');
        await loadWoDetail(selectedWoId);
      }
    } catch {}
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(resolveApiUrl('/api/operations/sites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(siteForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not create site.');
      setSiteForm((prev) => ({ ...prev, code: '', name: '', stateRegion: '', address: '', contactName: '', contactPhone: '' }));
      setNotice(`Site ${json.site.name} registered.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site.');
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(resolveApiUrl('/api/operations/services'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(serviceForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not create service.');
      setServiceForm((prev) => ({ ...prev, code: '', name: '' }));
      setNotice(`Service ${json.service.name} added to catalogue.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create service.');
    }
  };

  const handleCreateDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(resolveApiUrl('/api/operations/dispatch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dispatchForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not schedule dispatch.');
      setDispatchForm((prev) => ({ ...prev, workOrderId: '', notes: '' }));
      setNotice('Dispatch scheduled.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule dispatch.');
    }
  };

  const handleApprovalDecision = async (id: string, decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED') => {
    setError('');
    try {
      const res = await fetch(resolveApiUrl('/api/operations/approvals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, decision }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not record approval decision.');
      setNotice(`Operational approval marked ${decision}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decide approval.');
    }
  };

  const safeActorName = String(actorName || 'Operations User').trim() || 'Operations User';
  const safeActorRole = String(actorRole || 'ADMIN');
  const activeSub = (data?.subsidiaries || []).find((s) => s.id === orgFilter) || null;
  const activeBusinessName = activeSub ? activeSub.legalName : 'BEMS Group';
  const activeBrandColor = activeSub?.brandColor || '#ea580c';
  const activeLogoUrl = activeSub?.logoUrl || '/bems-group-logo.png?v=20261024';
  const initials = safeActorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'OP';

  const allNavItems = useMemo(() => OPS_NAV_GROUPS.flatMap((g) => g.items), []);
  const currentNavItem = allNavItems.find((i) => i.id === activeTab) || allNavItems[0];
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allNavItems.filter((i) => i.label.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q));
  }, [search, allNavItems]);

  const openWorkOrders = useMemo(
    () => (data?.workOrders || []).filter((w) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(w.status)),
    [data]
  );

  return (
    <div
      className={`app-shell ${collapsed ? 'collapsed' : ''}`}
      style={{ '--brand-accent': activeBrandColor } as React.CSSProperties}
    >
      {/* LEFT DARK ENTERPRISE SIDEBAR (matching HR / Finance / Projects) */}
      <aside className="sidebar">
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
              background: '#ffffff',
              border: `1.5px solid ${activeBrandColor}50`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 2,
              flexShrink: 0,
            }}
          >
            <img src={activeLogoUrl} alt={activeBusinessName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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

        <nav aria-label="Operations navigation">
          {OPS_NAV_GROUPS.map((group) => (
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
          onClick={() => setActiveTab('assurance')}
        >
          <span>?</span>
          <div>
            <strong>SOPs &amp; Policies</strong>
            <small>Guides &amp; standards</small>
          </div>
        </button>
      </aside>

      {/* MAIN WORKSPACE */}
      <section className="workspace">
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
                  Operations Management &amp; Field Control
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
                      setOrgFilter('');
                      setSwitcher(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: !orgFilter ? '#fff7ed' : 'transparent',
                      border: !orgFilter ? '1px solid #fed7aa' : '1px solid transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: '#0f172a',
                    }}
                  >
                    BEMS Group (All Subsidiaries)
                  </button>
                  {(data?.subsidiaries || []).map((sub) => (
                    <button
                      type="button"
                      key={sub.id}
                      onClick={() => {
                        setOrgFilter(sub.id);
                        setSwitcher(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: orgFilter === sub.id ? '#fff7ed' : 'transparent',
                        border: orgFilter === sub.id ? '1px solid #fed7aa' : '1px solid transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: '#0f172a',
                      }}
                    >
                      {sub.legalName}
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
              ref={searchInputRef}
              aria-label="Search Operations workspace"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeBusinessName} Operations...`}
            />
            <kbd>⌘ K</kbd>
            {search && (
              <div className="search-results">
                {searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setSearch('');
                      }}
                    >
                      <span>→</span>
                      <div>
                        <strong>{item.label}</strong>
                        <small>{item.subtitle}</small>
                      </div>
                    </button>
                  ))
                ) : (
                  <p>No Operations screens matching &ldquo;{search}&rdquo;</p>
                )}
              </div>
            )}
          </div>

          {/* Top Actions */}
          <div className="top-actions">
            <button
              type="button"
              onClick={() => setShowNewWoModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                height: '28px',
                borderRadius: '8px',
                background: '#ea580c',
                border: 'none',
                color: '#ffffff',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Plus size={12} />
              <span>New Work Order</span>
            </button>

            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                height: '28px',
                borderRadius: '8px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '11.5px',
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: activeBrandColor, fontSize: '12px' }}>❖</span>
              <span>All Systems</span>
            </Link>

            <button
              type="button"
              onClick={() => void loadAll()}
              className="top-icon"
              title="Refresh Operations Data"
              aria-label="Refresh Operations"
            >
              <RefreshCw size={13} />
            </button>

            <div
              className="user-pill"
              title={`${safeActorName} (${safeActorRole})`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 999,
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#c2410c',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* STAGE CONTENT */}
        <main className="stage" style={{ padding: '20px 24px 48px' }}>
          {/* Page Header Banner matching HR module */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: '16px 20px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{currentNavItem.label}</h1>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
                {currentNavItem.subtitle} across <strong>{activeBusinessName}</strong>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} style={selectStyle}>
                <option value="">All Sites</option>
                {(data?.sites || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
                <option value="">All Statuses</option>
                {Object.keys(STATUS_BADGE).map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={selectStyle}>
                <option value="">All Priorities</option>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <span style={{ fontSize: 11, color: '#64748b', padding: '0 6px' }}>
                {data?.lastUpdatedAt ? `Synced ${new Date(data.lastUpdatedAt).toLocaleTimeString()}` : loading ? 'Syncing…' : ''}
              </span>
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}
          {notice && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13, fontWeight: 600 }}>
              {notice}
            </div>
          )}

          {/* TAB 1: COMMAND CENTRE */}
          {activeTab === 'command' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 12 }}>
                <KpiCard label="Open Work Orders" value={data?.kpis?.openCount ?? 0} sub="Awaiting execution" color="#0284c7" />
                <KpiCard label="In Progress" value={data?.kpis?.inProgressCount ?? 0} sub="Active field/office work" color="#ea580c" />
                <KpiCard label="SLA Overdue" value={data?.kpis?.overdueCount ?? 0} sub="Past due target" color="#dc2626" />
                <KpiCard label="Blocked" value={data?.kpis?.blockedCount ?? 0} sub="Needs escalation" color="#b91c1c" />
                <KpiCard label="Today's Dispatches" value={data?.kpis?.todayDispatchesCount ?? 0} sub={`${data?.kpis?.activeSitesCount ?? 0} active sites`} color="#4f46e5" />
                <KpiCard label="Completed / Closed" value={data?.kpis?.completedCount ?? 0} sub={`${data?.kpis?.pendingApprovalsCount ?? 0} pending approvals`} color="#059669" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 1fr)', gap: 16 }}>
                <section style={cardStyle}>
                  <div style={cardHeaderStyle}>
                    <h2 style={cardTitleStyle}>Active Work Orders Queue</h2>
                    <button type="button" onClick={() => setActiveTab('work_orders')} style={linkBtnStyle}>View All</button>
                  </div>
                  <WorkOrderTable workOrders={(data?.workOrders || []).slice(0, 10)} onSelect={(id) => void loadWoDetail(id)} />
                </section>

                <section style={cardStyle}>
                  <div style={cardHeaderStyle}>
                    <h2 style={cardTitleStyle}>Live Operational Feed</h2>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Audit &amp; state events</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(data?.recentFeed || []).length === 0 ? (
                      <div style={{ fontSize: 12.5, color: '#64748b', padding: '16px 0' }}>No operational activity recorded yet.</div>
                    ) : (
                      (data?.recentFeed || []).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => void loadWoDetail(item.workOrderId)}
                          style={{ textAlign: 'left', padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#ea580c' }}>
                            <span>{item.workOrderNumber} · {item.entryType}</span>
                            <span style={{ color: '#64748b' }}>{new Date(item.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{item.workOrderTitle}</div>
                          <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{item.actorName}: {item.message}</div>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: WORK ORDERS */}
          {activeTab === 'work_orders' && (
            <section style={cardStyle}>
              <div style={cardHeaderStyle}>
                <h2 style={cardTitleStyle}>Operational Work Orders &amp; Service Requests</h2>
                <button type="button" onClick={() => setShowNewWoModal(true)} style={primaryBtnStyle}>
                  <Plus size={13} /> New Work Order
                </button>
              </div>
              <WorkOrderTable workOrders={data?.workOrders || []} onSelect={(id) => void loadWoDetail(id)} />
            </section>
          )}

          {/* TAB 3: DISPATCH */}
          {activeTab === 'dispatch' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(290px, 360px) minmax(0, 1fr)', gap: 16 }}>
              <section style={cardStyle}>
                <h2 style={{ ...cardTitleStyle, marginBottom: 12 }}>Schedule Dispatch</h2>
                <form onSubmit={handleCreateDispatch} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <select required value={dispatchForm.workOrderId} onChange={(e) => setDispatchForm({ ...dispatchForm, workOrderId: e.target.value })} style={inputStyle}>
                    <option value="">Select Work Order…</option>
                    {openWorkOrders.map((w) => (
                      <option key={w.id} value={w.id}>{w.workOrderNumber} — {w.title}</option>
                    ))}
                  </select>
                  <select required value={dispatchForm.assigneeId} onChange={(e) => setDispatchForm({ ...dispatchForm, assigneeId: e.target.value })} style={inputStyle}>
                    <option value="">Select Staff Assignee…</option>
                    {(data?.staffOptions || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.legalName} ({s.employeeNumber})</option>
                    ))}
                  </select>
                  <input type="date" value={dispatchForm.plannedDate} onChange={(e) => setDispatchForm({ ...dispatchForm, plannedDate: e.target.value })} style={inputStyle} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input type="time" value={dispatchForm.windowStart} onChange={(e) => setDispatchForm({ ...dispatchForm, windowStart: e.target.value })} style={inputStyle} />
                    <input type="time" value={dispatchForm.windowEnd} onChange={(e) => setDispatchForm({ ...dispatchForm, windowEnd: e.target.value })} style={inputStyle} />
                  </div>
                  <textarea placeholder="Dispatch instructions…" rows={3} value={dispatchForm.notes} onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })} style={inputStyle} />
                  <button type="submit" style={primaryBtnStyle}>Assign &amp; Dispatch</button>
                </form>
              </section>

              <section style={cardStyle}>
                <h2 style={{ ...cardTitleStyle, marginBottom: 12 }}>Daily Dispatch Board</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dispatches.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#64748b' }}>No dispatches scheduled yet.</div>
                  ) : (
                    dispatches.map((d) => (
                      <div key={d.id} style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#ea580c' }}>
                            {d.workOrder?.workOrderNumber} · {d.dispatchStatus}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{d.workOrder?.title}</div>
                          <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                            Assignee: <strong>{d.assigneeName}</strong> · Date: {new Date(d.plannedDate).toLocaleDateString()} {d.windowStart ? `(${d.windowStart}–${d.windowEnd || ''})` : ''}
                          </div>
                        </div>
                        <button type="button" onClick={() => void loadWoDetail(d.workOrderId)} style={linkBtnStyle}>Open</button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'assurance' && (
            <OperationsPhasesPanel
              mode="assurance"
              actorRole={actorRole}
              subsidiaries={data?.subsidiaries || []}
              sites={data?.sites || []}
              staffOptions={data?.staffOptions || []}
              onError={setError}
              onNotice={setNotice}
            />
          )}
          {activeTab === 'resources' && (
            <OperationsPhasesPanel
              mode="resources"
              actorRole={actorRole}
              subsidiaries={data?.subsidiaries || []}
              sites={data?.sites || []}
              staffOptions={data?.staffOptions || []}
              onError={setError}
              onNotice={setNotice}
            />
          )}
          {activeTab === 'governance' && (
            <OperationsPhasesPanel
              mode="governance"
              actorRole={actorRole}
              subsidiaries={data?.subsidiaries || []}
              sites={data?.sites || []}
              staffOptions={data?.staffOptions || []}
              onError={setError}
              onNotice={setNotice}
            />
          )}

          {activeTab === 'catalogue' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <section style={cardStyle}>
                <h2 style={{ ...cardTitleStyle, marginBottom: 12 }}>Sites &amp; Operating Units</h2>
                <form onSubmit={handleCreateSite} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <select required value={siteForm.organizationId} onChange={(e) => setSiteForm({ ...siteForm, organizationId: e.target.value })} style={inputStyle}>
                    {(data?.subsidiaries || []).map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                  </select>
                  <input placeholder="Site Code (e.g. OPS-ABJ-01)" value={siteForm.code} onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} style={inputStyle} />
                  <input required placeholder="Site Name" value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} style={inputStyle} />
                  <select value={siteForm.siteType} onChange={(e) => setSiteForm({ ...siteForm, siteType: e.target.value })} style={inputStyle}>
                    {['OFFICE', 'BRANCH', 'WAREHOUSE', 'FIELD_SITE', 'HUB'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input placeholder="State / Region" value={siteForm.stateRegion} onChange={(e) => setSiteForm({ ...siteForm, stateRegion: e.target.value })} style={inputStyle} />
                  <button type="submit" style={primaryBtnStyle}>Register Site</button>
                </form>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(data?.sites || []).map((s) => (
                    <div key={s.id} style={{ padding: 10, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name} <span style={{ color: '#64748b', fontSize: 11 }}>({s.code})</span></div>
                        <div style={{ fontSize: 11.5, color: '#64748b' }}>{s.siteType} · {s.stateRegion || 'Nigeria'}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={{ ...cardTitleStyle, marginBottom: 12 }}>Service Catalogue &amp; SLA Targets</h2>
                <form onSubmit={handleCreateService} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <select required value={serviceForm.organizationId} onChange={(e) => setServiceForm({ ...serviceForm, organizationId: e.target.value })} style={inputStyle}>
                    {(data?.subsidiaries || []).map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                  </select>
                  <input placeholder="Service Code (e.g. SRV-MNT-01)" value={serviceForm.code} onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })} style={inputStyle} />
                  <input required placeholder="Service Name" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} style={inputStyle} />
                  <select value={serviceForm.category} onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })} style={inputStyle}>
                    {['FIELD_SERVICE', 'MAINTENANCE', 'LOGISTICS', 'ADMIN_SUPPORT', 'CLIENT_DELIVERY'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" min={1} placeholder="Resolve SLA (hrs)" value={serviceForm.slaResolveHours} onChange={(e) => setServiceForm({ ...serviceForm, slaResolveHours: Number(e.target.value) })} style={inputStyle} />
                  <button type="submit" style={primaryBtnStyle}>Add Service</button>
                </form>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(data?.services || []).map((srv) => (
                    <div key={srv.id} style={{ padding: 10, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{srv.name} <span style={{ color: '#64748b', fontSize: 11 }}>({srv.code})</span></div>
                        <div style={{ fontSize: 11.5, color: '#64748b' }}>{srv.category} · SLA {srv.slaResolveHours}h {srv.requiresVerification ? '· Independent Verification' : ''}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{srv.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'approvals' && (
            <section style={cardStyle}>
              <h2 style={{ ...cardTitleStyle, marginBottom: 12 }}>Operational Approvals &amp; Decision Register</h2>
              {approvals.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748b' }}>No operational approvals pending or recorded.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {approvals.map((a) => (
                    <div key={a.id} style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#ea580c' }}>{a.workOrder?.workOrderNumber} · {a.decision}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.workOrder?.title}</div>
                        <div style={{ fontSize: 11.5, color: '#64748b' }}>Initiator: {a.initiatorName} {a.approverName ? `· Decided by ${a.approverName}` : ''}</div>
                      </div>
                      {a.decision === 'PENDING' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => void handleApprovalDecision(a.id, 'APPROVED')} style={{ ...primaryBtnStyle, background: '#059669' }}>Approve</button>
                          <button type="button" onClick={() => void handleApprovalDecision(a.id, 'REJECTED')} style={{ ...primaryBtnStyle, background: '#dc2626' }}>Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </section>

      {/* NEW WORK ORDER MODAL */}
      {showNewWoModal && (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Create Operational Work Order</h3>
              <button type="button" onClick={() => setShowNewWoModal(false)} style={iconCloseBtnStyle}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateWorkOrder} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select required value={woForm.organizationId} onChange={(e) => setWoForm({ ...woForm, organizationId: e.target.value })} style={inputStyle}>
                {(data?.subsidiaries || []).map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
              </select>
              <input required placeholder="Work Order Title" value={woForm.title} onChange={(e) => setWoForm({ ...woForm, title: e.target.value })} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select value={woForm.siteId} onChange={(e) => setWoForm({ ...woForm, siteId: e.target.value })} style={inputStyle}>
                  <option value="">Site (Optional)</option>
                  {(data?.sites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={woForm.serviceId} onChange={(e) => setWoForm({ ...woForm, serviceId: e.target.value })} style={inputStyle}>
                  <option value="">Service (Optional)</option>
                  {(data?.services || []).map((srv) => <option key={srv.id} value={srv.id}>{srv.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select value={woForm.priority} onChange={(e) => setWoForm({ ...woForm, priority: e.target.value })} style={inputStyle}>
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={woForm.assigneeId} onChange={(e) => setWoForm({ ...woForm, assigneeId: e.target.value })} style={inputStyle}>
                  <option value="">Unassigned</option>
                  {(data?.staffOptions || []).map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                </select>
              </div>
              <textarea placeholder="Operational scope & instructions…" rows={3} value={woForm.description} onChange={(e) => setWoForm({ ...woForm, description: e.target.value })} style={inputStyle} />
              <button type="submit" style={primaryBtnStyle}>Create Work Order</button>
            </form>
          </div>
        </div>
      )}

      {/* WORK ORDER DETAIL DRAWER */}
      {selectedWoId && selectedWoDetail && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalCardStyle, maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#ea580c' }}>{selectedWoDetail.workOrder.workOrderNumber}</div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{selectedWoDetail.workOrder.title}</h3>
              </div>
              <button type="button" onClick={() => { setSelectedWoId(null); setSelectedWoDetail(null); }} style={iconCloseBtnStyle}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, color: '#475569', marginTop: 0 }}>{selectedWoDetail.workOrder.description || 'No description provided.'}</p>

            <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                Current Status: <strong style={{ color: '#0f172a' }}>{selectedWoDetail.workOrder.status}</strong>
              </div>
              <input
                placeholder="Reason / note (required for Blocked or Cancelled)…"
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                style={{ ...inputStyle, marginBottom: 8 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'COMPLETED', 'CLOSED', 'CANCELLED'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => void handleTransitionWo(selectedWoDetail.workOrder.id, st)}
                    style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input placeholder="Add work log note…" value={woComment} onChange={(e) => setWoComment(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={() => void handleAddComment()} style={primaryBtnStyle}>Post Note</button>
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Activity &amp; State Log</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(selectedWoDetail.workOrder.workLogs || []).map((log: any) => (
                <div key={log.id} style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>{selectedWoDetail.employeesById?.[log.actorId]?.legalName || 'System'}</span>{' '}
                  <span style={{ color: '#64748b' }}>({log.entryType})</span>: {log.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderTop: `3px solid ${color}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function WorkOrderTable({ workOrders, onSelect }: { workOrders: any[]; onSelect: (id: string) => void }) {
  if (workOrders.length === 0) {
    return <div style={{ fontSize: 13, color: '#64748b', padding: '16px 0' }}>No work orders match the current filters.</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: 11 }}>
            <th style={{ padding: '8px 6px' }}>Code</th>
            <th style={{ padding: '8px 6px' }}>Title</th>
            <th style={{ padding: '8px 6px' }}>Site</th>
            <th style={{ padding: '8px 6px' }}>Priority</th>
            <th style={{ padding: '8px 6px' }}>Status</th>
            <th style={{ padding: '8px 6px' }}>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {workOrders.map((w) => {
            const pBadge = PRIORITY_BADGE[w.priority] || PRIORITY_BADGE.MEDIUM;
            const sBadge = STATUS_BADGE[w.status] || STATUS_BADGE.NEW;
            return (
              <tr key={w.id} onClick={() => onSelect(w.id)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                <td style={{ padding: '10px 6px', fontWeight: 800, color: '#ea580c' }}>{w.workOrderNumber}</td>
                <td style={{ padding: '10px 6px', fontWeight: 700, color: '#0f172a' }}>{w.title}</td>
                <td style={{ padding: '10px 6px', color: '#475569' }}>{w.site?.name || '—'}</td>
                <td style={{ padding: '10px 6px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: pBadge.bg, color: pBadge.fg, border: `1px solid ${pBadge.border}` }}>
                    {w.priority}
                  </span>
                </td>
                <td style={{ padding: '10px 6px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: sBadge.bg, color: sBadge.fg }}>
                    {w.status}
                  </span>
                </td>
                <td style={{ padding: '10px 6px', color: '#475569' }}>{w.assigneeName || 'Unassigned'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 };
const cardHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 };
const cardTitleStyle: React.CSSProperties = { margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0f172a' };
const selectStyle: React.CSSProperties = { height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 12, color: '#0f172a' };
const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 12.5, color: '#0f172a', width: '100%', boxSizing: 'border-box' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#ffffff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const linkBtnStyle: React.CSSProperties = { padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' };
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 };
const modalCardStyle: React.CSSProperties = { width: '100%', maxWidth: 480, background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 };
const iconCloseBtnStyle: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#ffffff', display: 'grid', placeItems: 'center', cursor: 'pointer' };
