'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bell,
  Bot,
  Building2,
  ChevronRight,
  Database,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Truck,
  UserPlus,
  Users,
  Wallet,
  FolderKanban,
} from 'lucide-react';
import { PeopleAccessWorkspaceModule } from '@/components/dashboard/gmd/PeopleAccessWorkspaceModule';
import { AiAccessControlPanel } from '@/components/control-center/AiAccessControlPanel';
import { WalletApprovalSecurityCard } from '@/components/control-center/WalletApprovalSecurityCard';
import { FundApprovalPolicyCard } from '@/components/control-center/FundApprovalPolicyCard';
import { SubsidiaryPortfolioView } from '@/components/dashboard/gmd/SubsidiaryPortfolioView';
import { hasCategoryAccess } from '@/lib/admin-permissions';
import {
  AuditLogsModule as LiveAuditLogsModule,
  WorkspaceSettingsModule as LiveWorkspaceSettingsModule,
} from '@/components/dashboard/gmd/BusinessModules';
import { CorporateSubsidiaryModal } from '@/components/dashboard/CorporateSubsidiaryModal';
import { EditSubsidiaryModal } from '@/components/dashboard/EditSubsidiaryModal';
import { useGmdAccess } from '@/components/ai/useGmdAccess';
import { useAiFinancialManager } from '@/components/ai/useAiFinancialManager';
import { AmbientBottomAiBar } from '@/components/ai/AmbientBottomAiBar';
import { AiFinancialManagerDrawer } from '@/components/ai/AiFinancialManagerDrawer';
import { notifyAiInteraction } from '@/components/ai/AiScreenEdgeGlow';

type ControlSection =
  | 'overview'
  | 'onboarding'
  | 'ai_control'
  | 'wallet_approval'
  | 'notifications'
  | 'data_retention'
  | 'mobile_apps'
  | 'org_structure'
  | 'audit_trail';

const NAV_ITEMS: Array<{ id: ControlSection; label: string; subtitle: string; icon: any }> = [
  { id: 'overview', label: 'Command Overview', subtitle: 'Cross-module health & quick jump', icon: Activity },
  { id: 'onboarding', label: 'Admin Onboarding', subtitle: 'GMD & Super Admin invitations', icon: UserPlus },
  { id: 'wallet_approval', label: 'Wallet Approvals', subtitle: 'Approvers, PIN recovery and email OTP', icon: ShieldCheck },
  { id: 'ai_control', label: 'AI Access Control', subtitle: '2-layer AI policy & governance', icon: Bot },
  { id: 'notifications', label: 'Notifications', subtitle: 'WhatsApp, Slack & alert channels', icon: Bell },
  { id: 'data_retention', label: 'Data & Retention', subtitle: 'Audit archival & data retention', icon: Database },
  { id: 'mobile_apps', label: 'Mobile Apps', subtitle: 'Staff & Executive APK releases', icon: Smartphone },
  { id: 'org_structure', label: 'Subsidiaries & Depts', subtitle: 'Shared org units across modules', icon: Building2 },
  { id: 'audit_trail', label: 'System Audit Log', subtitle: 'Cross-module security & audit trail', icon: ShieldCheck },
];

export default function EnterpriseControlCenterClient({ openWalletApprovals = false }: { openWalletApprovals?: boolean }) {
  const [section, setSection] = useState<ControlSection>(openWalletApprovals ? 'wallet_approval' : 'overview');
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Department Form
  const [deptOrgId, setDeptOrgId] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');

  // Subsidiary Modals (Moved from Finance into Control Center)
  const [addingSubsidiary, setAddingSubsidiary] = useState(false);
  const [editingSubsidiary, setEditingSubsidiary] = useState<any | null>(null);

  const loadControlCenter = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/control-center', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load Control Center.');
      setData(json);
      if (!deptOrgId && json.subsidiaries?.[0]?.id) {
        setDeptOrgId(json.subsidiaries[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Control Center.');
    } finally {
      setLoading(false);
    }
  }, [deptOrgId]);

  useEffect(() => {
    loadControlCenter();
  }, [loadControlCenter]);

  const postAction = async (payload: Record<string, any>, successMessage: string) => {
    setError(null);
    setNotice(null);
    const res = await fetch('/api/control-center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Action failed.');
      return false;
    }
    setNotice(successMessage);
    await loadControlCenter();
    return true;
  };

  const sidebarExpanded = !collapsed;
  const actor = data?.actor || { legalName: 'Executive', role: 'SUPER_ADMIN', customAdminPermissions: null };
  const metrics = data?.metrics || {};
  const subsidiaries: any[] = data?.subsidiaries || [];
  const departments: any[] = data?.departments || [];

  const categoryKeyFor = (id: ControlSection) => {
    if (id === 'onboarding' || id === 'mobile_apps' || id === 'org_structure' || id === 'audit_trail') {
      return id;
    }
    return 'overview';
  };

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    hasCategoryAccess(actor.role, actor.customAdminPermissions, 'control-center', categoryKeyFor(item.id))
  );

  useEffect(() => {
    if (data?.actor && visibleNavItems.length > 0 && !visibleNavItems.some((n) => n.id === section)) {
      setSection(visibleNavItems[0].id);
    }
  }, [data?.actor, visibleNavItems, section]);

  const activeNav = visibleNavItems.find((n) => n.id === section) || visibleNavItems[0] || NAV_ITEMS[0];
  const initials = String(actor.legalName || 'BG')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join('') || 'BG';

  const [searchQuery, setSearchQuery] = useState('');
  const activeBrandColor = '#ea580c';

  const isAiAuthorized = useGmdAccess(actor.role || 'STAFF');
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const aiManager = useAiFinancialManager({
    userName: actor.legalName || 'Executive',
    userRole: actor.role || 'SUPER_ADMIN',
    businessId: 'BEMS-GROUP',
    businessName: 'BEMS Group',
    currentPage: `Control Center · ${activeNav.label}`,
    moduleDomain: 'master',
  });

  return (
    <>
      <style>{`
        :root {
          --brand-primary: ${activeBrandColor};
          --brand-shadow-color: ${activeBrandColor}40;
        }
        .nav-item.active {
          background: linear-gradient(90deg, ${activeBrandColor}ee, ${activeBrandColor}dd) !important;
          box-shadow: inset 3px 0 #ffffff, 0 7px 15px ${activeBrandColor}40 !important;
        }
        .nav-item:hover {
          background: ${activeBrandColor}18 !important;
        }
        .nav-group > p {
          color: ${activeBrandColor} !important;
        }
        .help-button > span {
          background: ${activeBrandColor} !important;
          color: #ffffff !important;
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
        .sidebar-circuit {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.38 !important;
          overflow: hidden;
          z-index: 1;
        }
        .sidebar-circuit:before {
          content: '';
          position: absolute;
          left: -90px;
          top: 165px;
          width: 250px;
          height: 250px;
          border: 1.5px solid ${activeBrandColor}70 !important;
          border-radius: 50%;
          box-shadow: 0 0 0 35px ${activeBrandColor}12, 0 0 0 85px ${activeBrandColor}05 !important;
        }
      `}</style>
    <main className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-circuit" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </div>
        <div
          className="side-brand"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            if (typeof window !== 'undefined') window.location.href = '/';
          }}
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: '#ffffff',
              border: '1.5px solid #ea580c50',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 2,
              flexShrink: 0,
            }}
          >
            <img
              src="/bems-group-logo.png?v=20261024"
              alt="BEMS Group"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </span>
          <div
            className="brand-title-wrap"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minWidth: 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              margin: 0,
              padding: 0,
            }}
          >
            <span
              className="brand-name"
              style={{
                display: 'block',
                fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
                fontSize: '15px',
                fontWeight: 850,
                letterSpacing: '-0.01em',
                color: '#ffffff',
                lineHeight: 1.2,
                margin: 0,
                padding: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 155,
              }}
            >
              BEMS GROUP
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav aria-label="Control Center navigation">
          <div className="nav-group">
            <p>CONTROL CENTER</p>
            {visibleNavItems.filter((item) => ['overview', 'onboarding', 'wallet_approval', 'ai_control'].includes(item.id)).map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'nav-item active' : 'nav-item'}
                  onClick={() => setSection(item.id)}
                >
                  <span><Icon className="h-4 w-4" /></span>
                  <b>{item.label}</b>
                </button>
              );
            })}
          </div>

          <div className="nav-group">
            <p>PLATFORM &amp; GOVERNANCE</p>
            {visibleNavItems.filter((item) => !['overview', 'onboarding', 'wallet_approval', 'ai_control'].includes(item.id)).map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'nav-item active' : 'nav-item'}
                  onClick={() => setSection(item.id)}
                >
                  <span><Icon className="h-4 w-4" /></span>
                  <b>{item.label}</b>
                </button>
              );
            })}
          </div>
        </nav>

        <button
          type="button"
          className="help-button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
        >
          <span>?</span>
          <div>
            <strong>Need help?</strong>
            <small>Guides and support</small>
          </div>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div style={{ textAlign: 'left' }}>
            <strong style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.25 }}>
              BEMS Group
            </strong>
            <small style={{ fontSize: 10.5, color: '#64748b', display: 'block', marginTop: 2 }}>
              Enterprise Control Center · {activeNav.label}
            </small>
          </div>

          <div className="global-search hidden md:flex">
            <span>⌕</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                const lower = val.trim().toLowerCase();
                if (lower) {
                  const match = NAV_ITEMS.find(
                    (n) => n.label.toLowerCase().includes(lower) || n.subtitle.toLowerCase().includes(lower)
                  );
                  if (match) setSection(match.id);
                }
              }}
              placeholder="Search Control Center"
            />
            <kbd>⌘K</kbd>
          </div>

          <div className="top-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={loadControlCenter}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 28,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid #fed7aa',
                background: '#ffffff',
                color: '#c2410c',
                fontSize: 11.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 28,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid #fed7aa',
                background: '#fff7ed',
                color: '#ea580c',
                fontSize: 11.5,
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span>❖</span> All Systems
            </Link>
            <div
              title={`${actor.legalName} (${actor.role})`}
              style={{
                width: 28,
                height: 28,
                borderRadius: '999px',
                border: '1.5px solid #fdba74',
                background: '#fff7ed',
                color: '#c2410c',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
          </div>
        </header>

        <div className="content" style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
              {notice}
            </div>
          )}

          {section === 'overview' && (
            <div className="space-y-6">
              {/* Standard BEMS Welcome Row */}
              <div className="welcome-row">
                <div>
                  <p className="kicker">ENTERPRISE CONTROL CENTER · SYSTEM GOVERNANCE · {actor.role}</p>
                  <h1>Good afternoon, {String(actor.legalName || 'Executive').split(' ')[0]}.</h1>
                  <p>Centralized administration, subsidiaries, onboarding, mobile releases, and audit governance across BEMS Group.</p>
                </div>
              </div>

              {/* Signature BEMS KPI Cards (Orange Primary + Clean White Cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => setSection('org_structure')}
                  className="text-left rounded-2xl bg-[#ea580c] text-white p-5 shadow-sm hover:bg-orange-700 transition flex flex-col justify-between min-h-[132px]"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-orange-100">Subsidiaries &amp; Entities</span>
                    <span className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-xs shrink-0">↗</span>
                  </div>
                  <div className="w-full">
                    <div className="text-3xl font-black">{metrics.subsidiariesCount ?? 0}</div>
                    <div className="text-[11px] text-orange-100 mt-1">{metrics.departmentsCount ?? 0} shared departments</div>
                  </div>
                </button>

                {[
                  { label: 'Active Staff', value: metrics.activeStaffCount ?? 0, sub: 'Verified across group', target: 'onboarding' as ControlSection },
                  { label: 'GMD & Admins', value: metrics.leadersCount ?? 0, sub: 'Executive governance accounts', target: 'onboarding' as ControlSection },
                  { label: 'Active Projects', value: metrics.activeProjectsCount ?? 0, sub: `${metrics.openRequestsCount ?? 0} open fund requests`, target: 'audit_trail' as ControlSection },
                ].map((stat) => (
                  <button
                    key={stat.label}
                    type="button"
                    onClick={() => setSection(stat.target)}
                    className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-orange-300 transition flex flex-col justify-between min-h-[132px]"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-slate-600">{stat.label}</span>
                      <span className="h-7 w-7 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-500 shrink-0">↗</span>
                    </div>
                    <div className="w-full">
                      <span className="text-xs font-bold text-slate-600">{stat.label}</span>
                      <span className="h-7 w-7 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-500">↗</span>
                    </div>
                    <div>
                      <div className="text-3xl font-black text-slate-900">{stat.value}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{stat.sub}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Quick Jump Across All BEMS Modules */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">Module Command Directory</h2>
                    <p className="text-xs text-slate-500">Jump directly into any operational system or manage shared cross-system controls.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { title: 'Financial Management', desc: 'Budgets, Monnify wallets & disbursements', href: '/finance', icon: Wallet, color: 'text-orange-600 bg-orange-50' },
                    { title: 'Project Management', desc: 'Programs, sub-projects, timelines & chat', href: '/projects', icon: FolderKanban, color: 'text-sky-600 bg-sky-50' },
                    { title: 'Human Resources', desc: 'Staff directory, leave, attendance & payroll', href: '/hr', icon: Users, color: 'text-indigo-600 bg-indigo-50' },
                    { title: 'Operations System', desc: 'Field coordination, fleet & logistics', href: '/operations', icon: Truck, color: 'text-emerald-600 bg-emerald-50' },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <Link
                        key={m.href}
                        href={m.href}
                        className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 hover:border-orange-300 hover:bg-white transition flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`rounded-xl p-2.5 ${m.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-extrabold text-slate-900">{m.title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{m.desc}</div>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-orange-600">Open Module →</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {section === 'onboarding' && (
            <PeopleAccessWorkspaceModule
              mode="control-center"
              setNotice={(msg) => setNotice(msg)}
              onNavigate={(target) => {
                if (target === 'Audit logs') setSection('audit_trail');
                else if (target === 'Admin Settings' || target === 'Settings') setSection('ai_control');
                else if (target === 'Mobile App Settings') setSection('mobile_apps');
              }}
            />
          )}

          {section === 'wallet_approval' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-orange-600">
                    CONTROL CENTER · WALLET GOVERNANCE
                  </div>
                  <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
                    Wallet Approvals & Release Security
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Manage Monnify release authority, 8-digit approval PINs, GMD email OTP enforcement, and Super Admin lockout recovery.
                  </p>
                </div>
              </div>
              <FundApprovalPolicyCard setNotice={(msg) => setNotice(msg)} />
              <WalletApprovalSecurityCard setNotice={(msg) => setNotice(msg)} />
            </div>
          )}

          {section === 'ai_control' && <AiAccessControlPanel setNotice={setNotice} />}

          {section === 'notifications' && (
            <LiveWorkspaceSettingsModule
              key="Notifications"
              businessName="BEMS Group"
              setNotice={(msg) => setNotice(msg)}
              initialSection="Notifications"
              standalone
            />
          )}

          {section === 'data_retention' && (
            <LiveWorkspaceSettingsModule
              key="Data & retention"
              businessName="BEMS Group"
              setNotice={(msg) => setNotice(msg)}
              initialSection="Data & retention"
              standalone
            />
          )}

          {section === 'mobile_apps' && (
            <LiveWorkspaceSettingsModule
              key="Mobile App Settings"
              businessName="BEMS Group"
              setNotice={(msg) => setNotice(msg)}
              initialSection="Mobile App Settings"
              standalone
            />
          )}

          {section === 'org_structure' && (
            <SubsidiaryPortfolioView
              businessName="BEMS Group"
              userName={actor.legalName}
              onNavigate={(target) => {
                if (target === 'Admin Onboarding' || target === 'People & Access') setSection('onboarding');
                else if (target === 'Audit logs') setSection('audit_trail');
                else if (target === 'Settings') setSection('ai_control');
              }}
            />
          )}

          {section === 'audit_trail' && (
            <LiveAuditLogsModule scope="GROUP" setNotice={(msg) => setNotice(msg)} />
          )}
        </div>
      </section>

      {addingSubsidiary && (
        <CorporateSubsidiaryModal
          onCancel={() => setAddingSubsidiary(false)}
          onComplete={() => {
            setAddingSubsidiary(false);
            setNotice('Subsidiary created successfully.');
            void loadControlCenter();
          }}
        />
      )}

      {editingSubsidiary && (
        <EditSubsidiaryModal
          subsidiary={editingSubsidiary}
          onCancel={() => setEditingSubsidiary(null)}
          onComplete={() => {
            setEditingSubsidiary(null);
            setNotice('Subsidiary updated successfully.');
            void loadControlCenter();
          }}
        />
      )}

      {isAiAuthorized && (
        <>
          <AmbientBottomAiBar
            currentPage={`Control Center · ${activeNav.label}`}
            businessName="BEMS Group"
            userName={actor.legalName || 'Executive'}
            userRole={actor.role || 'SUPER_ADMIN'}
            messages={aiManager.messages}
            isTyping={aiManager.isTyping}
            agentMode={aiManager.agentMode as any}
            onSetAgentMode={aiManager.setAgentMode as any}
            onSendMessage={(text, el, attachments) => {
              notifyAiInteraction();
              void aiManager.sendMessage(text, el, attachments);
            }}
            onConfirmAction={(msgId, actionType, payload) => {
              void aiManager.handleConfirmAction(msgId, actionType, payload);
            }}
            onCancelAction={(msgId, stagedId) => {
              void aiManager.handleCancelAction(msgId, stagedId);
            }}
            onNewChat={aiManager.startNewChat}
            onOpenFullCockpit={(initialPrompt) => {
              notifyAiInteraction();
              setAiDrawerOpen(true);
              if (initialPrompt) void aiManager.sendMessage(initialPrompt);
            }}
          />
          <AiFinancialManagerDrawer
            isOpen={aiDrawerOpen}
            onClose={() => setAiDrawerOpen(false)}
            userRole={actor.role || 'SUPER_ADMIN'}
            userName={actor.legalName || 'Executive'}
            businessName="BEMS Group"
            businessId="BEMS-GROUP"
            currentPage={`Control Center · ${activeNav.label}`}
            sharedMessages={aiManager.messages}
            sharedIsTyping={aiManager.isTyping}
            agentMode={aiManager.agentMode as any}
            onSetAgentMode={aiManager.setAgentMode as any}
            onSendMessage={(text, el, attachments) => {
              notifyAiInteraction();
              void aiManager.sendMessage(text, el, attachments);
            }}
            onConfirmAction={(msgId, actionType, payload) => {
              void aiManager.handleConfirmAction(msgId, actionType, payload);
            }}
            onCancelAction={(msgId, stagedId) => {
              void aiManager.handleCancelAction(msgId, stagedId);
            }}
            onNewChat={aiManager.startNewChat}
          />
        </>
      )}
    </main>
    </>
  );
}

