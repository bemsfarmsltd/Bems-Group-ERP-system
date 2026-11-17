'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { hasCategoryAccess } from '@/lib/admin-permissions';
import {
  FolderKanban,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Target,
  GitBranch,
  Users,
  ShieldAlert,
  FileText,
  BarChart3,
  Settings,
  X,
  Download,
  Calendar as CalendarIcon,
  List as ListIcon,
  LayoutGrid,
  GanttChart,
  MessageSquare,
  Timer,
  Lock,
  ChevronRight,
} from 'lucide-react';
import { TabErrorBoundary } from '@/components/layout/TabErrorBoundary';
import { useGmdAccess } from '@/components/ai/useGmdAccess';
import { useAiFinancialManager } from '@/components/ai/useAiFinancialManager';
import { AiFinancialManagerDrawer } from '@/components/ai/AiFinancialManagerDrawer';
import { AmbientBottomAiBar } from '@/components/ai/AmbientBottomAiBar';
import { AiChatHistoryDrawer } from '@/components/ai/AiChatHistoryDrawer';
import { AiScreenEdgeGlow } from '@/components/ai/AiScreenEdgeGlow';
import { AiMotionEntryScreen } from '@/components/ai/AiMotionEntryScreen';
import { UniversalClickToAskProvider } from '@/components/ai/UniversalClickToAskProvider';
import ProjectOverviewSection from '@/components/projects/ProjectOverviewSection';
import ProjectIssuesWorkspace from '@/components/projects/ProjectIssuesWorkspace';
import QuickCreateIssueModal from '@/components/projects/QuickCreateIssueModal';
import ProjectTimelineView from '@/components/projects/ProjectTimelineView';
import ProjectChartsAndReports from '@/components/projects/ProjectChartsAndReports';
import ProjectReleasesView from '@/components/projects/ProjectReleasesView';
import ProjectTeamsLoopsSettings from '@/components/projects/ProjectTeamsLoopsSettings';
import CommandPaletteModal from '@/components/projects/CommandPaletteModal';
import ProjectHubView from '@/components/projects/ProjectHubView';
import ProjectEcosystemSection from '@/components/projects/ProjectEcosystemSection';
import ProjectsDirectoryView from '@/components/projects/ProjectsDirectoryView';
import ProjectInboxTriageView from '@/components/projects/ProjectInboxTriageView';
import ProjectCyclesCockpit from '@/components/projects/ProjectCyclesCockpit';
import ProjectWorkloadRebalancer from '@/components/projects/ProjectWorkloadRebalancer';
import ProjectPortfoliosOkrView from '@/components/projects/ProjectPortfoliosOkrView';
import ProjectStaffTimelinesView from '@/components/projects/ProjectStaffTimelinesView';
import ProjectHandoverVaultView from '@/components/projects/ProjectHandoverVaultView';
import ProjectTeamsChatView from '@/components/projects/ProjectTeamsChatView';
import type {
  ActivityLogRow,
  DisplayConfig,
  FilterConfig,
  LabelRow,
  LoopRuleRow,
  ProjectSectionId,
  ReleaseRow,
  SavedViewRow,
  SlaRuleRow,
  TeamRow,
  TestCaseRow,
} from '@/components/projects/pmTypes';

type NavItemDef = {
  id: ProjectSectionId;
  label: string;
  subtitle: string;
  icon: string;
};

const NAV_GROUPS: { label: string; items: NavItemDef[] }[] = [
  {
    label: 'WORKSPACE VIEWS',
    items: [
      { id: 'overview', label: 'Overview', subtitle: 'Customizable project & portfolio dashboard', icon: '⌂' },
      { id: 'my_work', label: 'My Issues', subtitle: 'Assigned, created, subscribed & activity', icon: '✓' },
      { id: 'views', label: 'Saved Views', subtitle: 'Custom filtered views & boards', icon: '◧' },
      { id: 'templates', label: 'Templates', subtitle: 'Template-driven project creation', icon: '✦' },
    ],
  },
  {
    label: 'INITIATE & STRUCTURE',
    items: [
      { id: 'portfolios', label: 'Portfolios & Goals', subtitle: 'Strategic objectives & OKRs', icon: '◎' },
      { id: 'projects', label: 'Projects & Sub-Projects', subtitle: 'Programs, sub-projects, Team Lead & GitHub', icon: '▤' },
      { id: 'teams', label: 'Teams & Scopes', subtitle: 'Teams, keys, members & cycle scopes', icon: '👥' },
      { id: 'staff_timelines', label: 'Staff & Timelines', subtitle: 'Assign staff, deadlines, SLA & payroll penalties', icon: '⏱' },
      { id: 'handover_vault', label: 'Docs, Vault & Media', subtitle: 'Staff docs, tech/tools, credentials & photos', icon: '🔐' },
    ],
  },
  {
    label: 'PLAN & EXECUTE',
    items: [
      { id: 'inbox', label: 'Intake & Triage', subtitle: 'Incoming requests & triage queue', icon: '✉' },
      { id: 'project_chat', label: 'Project Chat (Teams)', subtitle: 'Department & group chats, threads & pins', icon: '💬' },
      { id: 'backlog', label: 'Backlog & Blueprints', subtitle: 'Planned work & issue blueprints', icon: '◫' },
      { id: 'sprints', label: 'Sprints & Cycles', subtitle: 'Cycle cockpit, capacity & velocity', icon: '↻' },
      { id: 'issues', label: 'Issues, Board & Table', subtitle: 'Custom columns, WIP limits & custom fields', icon: '☷' },
      { id: 'roadmaps', label: 'Timeline & Roadmap', subtitle: 'Interactive Gantt, milestones & health', icon: '▬' },
    ],
  },
  {
    label: 'GOVERN & OPTIMIZE',
    items: [
      { id: 'workload', label: 'Workload & Rebalance', subtitle: 'Drag-to-rebalance, leave & attendance', icon: '◔' },
      { id: 'approvals', label: 'Approvals & Reviews', subtitle: 'Decisions & deliverable acceptance', icon: '✔' },
      { id: 'releases', label: 'Releases & QA', subtitle: 'Releases, environments & QA test matrix', icon: '⚑' },
      { id: 'risks', label: 'Risks & Changes', subtitle: 'Blockers, risks & scope changes', icon: '⚠' },
      { id: 'loops', label: 'Loops & Triggers', subtitle: 'Column triggers, digests & escalations', icon: '∞' },
      { id: 'ecosystem', label: 'Ecosystem & Finance', subtitle: 'Finance burn, staff leave & KPIs', icon: '⚡' },
      { id: 'reports', label: 'Reports & Analytics', subtitle: 'Burndown, velocity, CFD & workload charts', icon: '▥' },
      { id: 'settings', label: 'Settings', subtitle: 'Cycles, labels, SLAs, workflows & export', icon: '⚙' },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const WORK_ITEM_TYPES = [
  'TASK',
  'SUBTASK',
  'EPIC',
  'STORY',
  'BUG',
  'FEATURE',
  'IMPROVEMENT',
  'SPIKE',
  'INCIDENT',
  'CHANGE_REQUEST',
  'APPROVAL_ITEM',
  'OPERATIONAL_ACTION',
  'RECURRING_TASK',
] as const;

const WORK_STATUSES = [
  { key: 'BACKLOG', label: 'Backlog' },
  { key: 'TODO', label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'QA_TESTING', label: 'QA Testing' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'DONE', label: 'Done' },
  { key: 'ACCEPTED', label: 'Accepted' },
] as const;

function formatNaira(amount: number) {
  return `₦${Math.round(amount || 0).toLocaleString()}`;
}

export default function ProjectWorkspaceClient() {
  const [activeSection, setActiveSection] = useState<ProjectSectionId>('overview');
  const [selectedSubsidiaryId, setSelectedSubsidiaryId] = useState<string>('');
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [isInspectMode, setIsInspectMode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [data, setData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [workView, setWorkView] = useState<'BOARD' | 'LIST' | 'TIMELINE' | 'CALENDAR'>('BOARD');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedWorkItem, setSelectedWorkItem] = useState<any | null>(null);
  const [selectedProjectDossier, setSelectedProjectDossier] = useState<any | null>(null);

  // Modals
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showCreateRiskModal, setShowCreateRiskModal] = useState(false);
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [showCreatePortfolioModal, setShowCreatePortfolioModal] = useState(false);
  const [showCreateGoalModal, setShowCreateGoalModal] = useState(false);

  const [pinnedWidgets, setPinnedWidgets] = useState<string[]>([
    'subprojects',
    'sla_alerts',
    'handover_compliance',
  ]);
  const togglePinnedWidget = (key: string) => {
    setPinnedWidgets((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const [projectForm, setProjectForm] = useState({
    title: '',
    organizationId: '',
    departmentId: '',
    parentProjectId: '',
    teamLeadId: '',
    githubRepoUrl: '',
    githubBranch: 'main',
    templateKey: 'SOFTWARE_DEV',
    projectType: 'SOFTWARE',
    methodology: 'SCRUM',
    priority: 'HIGH',
    visibility: 'COMPANY',
    proposedBudget: '0',
    startDate: new Date().toISOString().split('T')[0],
    targetDate: '',
    description: '',
    objectives: '',
    submitForApproval: true,
  });

  const [taskForm, setTaskForm] = useState({
    projectId: '',
    itemType: 'TASK',
    title: '',
    description: '',
    priority: 'MEDIUM',
    status: 'TODO',
    assigneeId: '',
    sprintId: '',
    dueDate: '',
    storyPoints: '3',
    estimatedHours: '4',
    acceptanceCriteria: '',
  });

  const [riskForm, setRiskForm] = useState({
    projectId: '',
    recordType: 'RISK',
    title: '',
    description: '',
    severity: 'HIGH',
    mitigationPlan: '',
  });

  const [sprintForm, setSprintForm] = useState({
    projectId: '',
    name: '',
    goal: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    capacityPoints: '40',
  });

  const [portfolioForm, setPortfolioForm] = useState({ name: '', description: '' });
  const [goalForm, setGoalForm] = useState({ title: '', measurementPeriod: 'Q4 2026', targetValue: '100', unit: '%' });
  const [commentText, setCommentText] = useState('');
  const [timeHours, setTimeHours] = useState('2');
  const [timeDesc, setTimeDesc] = useState('');

  const [ecosystemData, setEcosystemData] = useState<any>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = selectedSubsidiaryId ? `?subsidiaryId=${encodeURIComponent(selectedSubsidiaryId)}` : '';
      // Fetch ecosystem data independently so it never blocks core workspace rendering
      fetch(`/api/projects/ecosystem${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((ecoJson) => {
          if (ecoJson) setEcosystemData(ecoJson);
        })
        .catch(() => {});

      const res = await fetch(`/api/projects${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load Project Management workspace');
      setData(json);
      if (json.subsidiaries?.length > 0 && !projectForm.organizationId) {
        setProjectForm((p) => ({ ...p, organizationId: selectedSubsidiaryId || json.subsidiaries[0].id }));
      }
      if (json.projects?.length > 0 && !taskForm.projectId) {
        setTaskForm((p) => ({ ...p, projectId: json.projects[0].id }));
        setRiskForm((p) => ({ ...p, projectId: json.projects[0].id }));
        setSprintForm((p) => ({ ...p, projectId: json.projects[0].id }));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load Project Management workspace');
    } finally {
      setLoading(false);
    }
  }, [selectedSubsidiaryId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const subsidiaries: any[] = data?.subsidiaries || [];
  const activeSub = useMemo(
    () => (selectedSubsidiaryId ? subsidiaries.find((s) => s.id === selectedSubsidiaryId) || null : null),
    [subsidiaries, selectedSubsidiaryId]
  );

  const activeBrandColor = activeSub?.brandColor || '#ea580c';
  const activeBusinessName = activeSub?.legalName || 'BEMS Group';
  const activeLogoUrl = activeSub ? activeSub.logoUrl || null : '/bems-group-logo.png?v=20261024';

  const actorRoleUpper = String(data?.actor?.role || 'STAFF').toUpperCase();
  const userName = data?.actor?.legalName || 'Team Member';
  const isAiAuthorized = useGmdAccess(actorRoleUpper);

  const aiManager = useAiFinancialManager({
    userName,
    userRole: actorRoleUpper,
    businessId: activeSub?.id || 'BEMS-GROUP',
    currentPage: `Projects · ${ALL_NAV_ITEMS.find((i) => i.id === activeSection)?.label || 'Overview'}`,
    businessName: activeBusinessName,
    moduleDomain: 'projects',
  });

  const postAction = async (url: string, payload: Record<string, unknown>, successMessage: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      setToast(successMessage);
      setTimeout(() => setToast(null), 4000);
      await loadWorkspace();
      return true;
    } catch (e: any) {
      setError(e.message || 'Action failed');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const projects: any[] = data?.projects || [];
  const workItems: any[] = data?.workItems || [];
  const milestones: any[] = data?.milestones || [];
  const sprints: any[] = data?.sprints || [];
  const portfolios: any[] = data?.portfolios || [];
  const goals: any[] = data?.goals || [];
  const risks: any[] = data?.risks || [];
  const approvals: any[] = data?.approvals || [];
  const timeEntries: any[] = data?.timeEntries || [];
  const staffOptions: any[] = data?.staffOptions || [];
  const departments: any[] = data?.departments || [];
  const templates: any[] = data?.templates || [];
  const workflows: any[] = data?.workflows || [];
  const teams: TeamRow[] = data?.teams || [];
  const labels: LabelRow[] = data?.labels || [];
  const savedViews: SavedViewRow[] = data?.savedViews || [];
  const slaRules: SlaRuleRow[] = data?.slaRules || [];
  const releases: ReleaseRow[] = data?.releases || [];
  const testCases: TestCaseRow[] = data?.testCases || [];
  const automations: LoopRuleRow[] = data?.automations || [];
  const activityLogs: ActivityLogRow[] = data?.activityLogs || [];
  const statusUpdates: any[] = data?.statusUpdates || [];
  const subscribedWorkItemIds: string[] = data?.subscribedWorkItemIds || [];

  const [quickCreateDefaults, setQuickCreateDefaults] = useState<{ status?: string; dueDate?: string }>({});
  const [activeViewPreset, setActiveViewPreset] = useState<{
    filters?: Partial<FilterConfig>;
    display?: Partial<DisplayConfig>;
  }>({});

  const patchWorkItem = async (id: string, patch: Record<string, any>) => {
    await fetch('/api/projects/work-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    await loadWorkspace();
  };

  const bulkPatchWorkItems = async (bulkIds: string[], patch: Record<string, any>) => {
    await fetch('/api/projects/work-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulkIds, ...patch }),
    });
    setToast(`Updated ${bulkIds.length} issues.`);
    setTimeout(() => setToast(null), 3000);
    await loadWorkspace();
  };

  const patchProject = async (id: string, patch: Record<string, any>) => {
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    await loadWorkspace();
  };

  const [seeding, setSeeding] = useState(false);

  const seedStarterWorkspace = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/projects/seed', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load starter workspace');
      setToast('BEMS Starter Workspace loaded with projects, teams, cycle, and issues!');
      setTimeout(() => setToast(null), 4000);
      await loadWorkspace();
    } catch (e: any) {
      setError(e.message || 'Failed to load starter workspace');
    } finally {
      setSeeding(false);
    }
  };

  const saveView = async (name: string, filters: FilterConfig, display: DisplayConfig) => {
    await fetch('/api/projects/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, filtersJson: filters, displayJson: display }),
    });
    setToast(`Saved view "${name}".`);
    setTimeout(() => setToast(null), 3000);
    await loadWorkspace();
  };
  const metrics = data?.metrics || {
    totalProjects: 0,
    activeProjects: 0,
    awaitingApproval: 0,
    openTasks: 0,
    blockedTasks: 0,
    dueThisWeek: 0,
    myTasks: 0,
    pendingApprovals: 0,
    openRisks: 0,
  };

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.projectCode.toLowerCase().includes(q) ||
        (p.organization?.legalName || '').toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const filteredWorkItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workItems.filter((w) => {
      if (selectedProjectId !== 'ALL' && w.projectId !== selectedProjectId) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        w.itemKey.toLowerCase().includes(q) ||
        (w.assignee?.legalName || '').toLowerCase().includes(q)
      );
    });
  }, [workItems, selectedProjectId, searchQuery]);

  const departmentCompletion = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const w of workItems) {
      const dept = w.department?.name || 'General';
      const entry = map.get(dept) || { total: 0, done: 0 };
      entry.total += 1;
      if (['DONE', 'ACCEPTED'].includes(w.status)) entry.done += 1;
      map.set(dept, entry);
    }
    if (map.size === 0) {
      return [
        { name: 'Engineering', pct: 0, total: 0 },
        { name: 'Operations', pct: 0, total: 0 },
        { name: 'Finance', pct: 0, total: 0 },
        { name: 'Admin', pct: 0, total: 0 },
        { name: 'Infrastructure', pct: 0, total: 0 },
      ];
    }
    return Array.from(map.entries())
      .slice(0, 6)
      .map(([name, val]) => ({
        name,
        pct: val.total > 0 ? Math.round((val.done / val.total) * 100) : 0,
        total: val.total,
      }));
  }, [workItems]);

  const activeNav = ALL_NAV_ITEMS.find((i) => i.id === activeSection) || ALL_NAV_ITEMS[0];

  const handleQuickCreateTask = async (title: string, projectId: string) => {
    await postAction(
      '/api/projects/work-items',
      {
        action: 'CREATE_WORK_ITEM',
        projectId,
        title,
        itemType: 'TASK',
        priority: 'MEDIUM',
      },
      'Issue created'
    );
  };

  const handleUpdateTaskStatus = async (task: any, nextStatus: string) => {
    await postAction(
      '/api/projects/work-items',
      {
        action: 'UPDATE_WORK_ITEM',
        id: task.id,
        status: nextStatus,
        version: task.version,
      },
      `Moved ${task.itemKey} to ${nextStatus.replace(/_/g, ' ')}`
    );
  };

  const handleExportCsv = () => {
    const rows = [
      ['Project Code', 'Title', 'Subsidiary', 'Type', 'Status', 'Priority', 'Health', 'Approved Budget', 'Committed Spend'],
      ...filteredProjects.map((p) => [
        p.projectCode,
        `"${String(p.title).replace(/"/g, '""')}"`,
        `"${String(p.organization?.legalName || '').replace(/"/g, '""')}"`,
        p.projectType,
        p.status,
        p.priority,
        p.healthStatus,
        String(p.approvedBudgetNgn || p.proposedBudgetNgn || 0),
        String(p.committedSpendNgn || 0),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BEMS_Projects_Portfolio_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <UniversalClickToAskProvider
      currentPage={`Projects · ${ALL_NAV_ITEMS.find((i) => i.id === activeSection)?.label || 'Overview'}`}
      businessName={activeBusinessName}
      isInspectMode={isInspectMode}
      onToggleInspectMode={() => setIsInspectMode((prev) => !prev)}
      onAskContextualQuestion={(question) => aiManager.sendMessage(question)}
    >
      <main
        className={collapsed && !sidebarHovered ? 'app-shell collapsed' : 'app-shell'}
        style={{ background: '#f8fafc', minHeight: '100vh' }}
      >
        <style>{`
          :root {
            --brand-primary: ${activeBrandColor} !important;
            --brand-tint: ${activeBrandColor}15 !important;
            --brand-shadow-color: ${activeBrandColor}45 !important;
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
          .nav-item.active {
            background: linear-gradient(90deg, ${activeBrandColor}, ${activeBrandColor}cc) !important;
            box-shadow: inset 3px 0 #ffffff, 0 6px 16px ${activeBrandColor}40 !important;
          }
          .nav-group > p {
            color: ${activeBrandColor} !important;
          }
        `}</style>

        {isAiAuthorized && showWelcome && (
          <AiMotionEntryScreen
            userName={userName}
            userRole={actorRoleUpper}
            businessName={activeBusinessName}
            brandColor={activeBrandColor}
            onComplete={() => setShowWelcome(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className="sidebar"
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <div className="sidebar-circuit" aria-hidden="true">
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
                background: activeLogoUrl ? '#ffffff' : activeBrandColor,
                border: `1.5px solid ${activeBrandColor}50`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: activeLogoUrl ? 2 : 0,
                flexShrink: 0,
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '12px',
              }}
            >
              {activeLogoUrl ? (
                <img src={activeLogoUrl} alt={activeBusinessName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                (activeSub?.code?.replace(/^BEMS-/, '') || activeBusinessName.slice(0, 3)).toUpperCase()
              )}
            </span>
            <div className="brand-title-wrap" style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <span className="brand-name" style={{ fontSize: '15px', fontWeight: 850, color: '#ffffff', maxWidth: 155, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeBusinessName.toUpperCase()}
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

          <nav aria-label="Project navigation">
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) =>
                !['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN'].includes(actorRoleUpper) ||
                hasCategoryAccess(actorRoleUpper, data?.actor?.customAdminPermissions, 'projects', item.id)
              );
              if (items.length === 0) return null;
              return (
              <div className="nav-group" key={group.label}>
                <p>{group.label}</p>
                {items.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`nav-item${isActive ? ' active' : ''}`}
                      onClick={() => setActiveSection(item.id)}
                      title={item.label}
                    >
                      <span>{item.icon}</span>
                      <b>{item.label}</b>
                    </button>
                  );
                })}
              </div>
              );
            })}
          </nav>

          <button
            type="button"
            className="help-button"
            onClick={() => setActiveSection('settings')}
          >
            <span>⚙</span>
            <div>
              <strong>Workflows &amp; Rules</strong>
              <small>{actorRoleUpper}</small>
            </div>
          </button>
        </aside>

        {/* Main Workspace */}
        <section className="workspace" style={{ flex: 1, minWidth: 0, paddingBottom: isAiAuthorized ? '96px' : '32px' }}>
          {/* Native BEMS ERP Topbar */}
          <header className="topbar">
            <div className="business-switch-wrap">
              <button
                type="button"
                className="business-switch"
                onClick={() => setWorkspaceMenuOpen((v) => !v)}
              >
                <div style={{ textAlign: 'left' }}>
                  <strong style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.25 }}>
                    {activeBusinessName}
                  </strong>
                  <small style={{ fontSize: 10.5, color: '#64748b', display: 'block', marginTop: 2 }}>
                    Project, Product &amp; Work Management
                  </small>
                </div>
                <b style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>⌄</b>
              </button>

              {workspaceMenuOpen && (
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
                      Select Workspace
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 650, color: '#94a3b8' }}>
                      {subsidiaries.length} entities
                    </span>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto', padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubsidiaryId('');
                        setWorkspaceMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: !selectedSubsidiaryId ? `1px solid ${activeBrandColor}35` : '1px solid transparent',
                        background: !selectedSubsidiaryId ? `${activeBrandColor}12` : 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 7,
                          background: '#ffffff',
                          border: `1px solid ${!selectedSubsidiaryId ? activeBrandColor : '#e2e8f0'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          padding: 2,
                          flexShrink: 0,
                        }}
                      >
                        <img src="/bems-group-logo.png?v=20261024" alt="BEMS Group" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          BEMS Group
                        </div>
                        <div style={{ fontSize: 10.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          All Subsidiaries · Group Holding
                        </div>
                      </div>
                      {!selectedSubsidiaryId && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: activeBrandColor, flexShrink: 0 }}>✓</span>
                      )}
                    </button>
                    {subsidiaries
                      .filter((sub) => String(sub.code || '').toUpperCase() !== 'BEMS-GROUP')
                      .map((sub) => {
                      const isSelected = selectedSubsidiaryId === sub.id;
                      const subColor = sub.brandColor || activeBrandColor;
                      const initials = String(sub.code || sub.legalName || 'SUB').replace('BEMS-', '').slice(0, 3).toUpperCase();
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setSelectedSubsidiaryId(sub.id);
                            setWorkspaceMenuOpen(false);
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: isSelected ? `1px solid ${subColor}35` : '1px solid transparent',
                            background: isSelected ? `${subColor}12` : 'transparent',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 7,
                              background: '#ffffff',
                              border: `1px solid ${isSelected ? subColor : '#e2e8f0'}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10.5,
                              fontWeight: 800,
                              color: subColor,
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {sub.legalName}
                            </div>
                            <div style={{ fontSize: 10.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {sub.code}
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{ fontSize: 12, fontWeight: 800, color: subColor, flexShrink: 0 }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="global-search">
              <span>⌕</span>
              <input
                aria-label="Search Project workspace"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeBusinessName} projects, issues, BEMS-101...`}
              />
              <kbd>⌘ K</kbd>
            </div>

            <div className="top-actions">
              {isAiAuthorized && (
                <button
                  type="button"
                  onClick={() => setShowWelcome(true)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${activeBrandColor}35`,
                    background: `${activeBrandColor}12`,
                    color: activeBrandColor,
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  AI Welcome
                </button>
              )}
              <Link
                href="/"
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                All Systems
              </Link>
              <button
                type="button"
                onClick={handleExportCsv}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Download size={13} /> Export
              </button>
              <button
                type="button"
                onClick={loadWorkspace}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Refresh workspace"
              >
                <RefreshCw size={13} />
              </button>
              <button
                type="button"
                onClick={() => setShowCreateProjectModal(true)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeBrandColor,
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                + New Project
              </button>
            </div>
          </header>

          {/* Content Container */}
          <div className="content">
            {activeSection !== 'overview' && !['projects', 'my_work', 'backlog', 'inbox'].includes(activeSection) && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${activeBrandColor}`,
                  borderRadius: '16px',
                  padding: '16px 20px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 850, color: '#0f172a' }}>{activeNav.label}</h1>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                    {activeNav.subtitle} · <strong>{activeBusinessName}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateTaskModal(true)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0f172a',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + New Issue
                </button>
              </div>
            )}

            {toast && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 flex items-center justify-between">
                <span>{toast}</span>
                <button onClick={() => setToast(null)}><X className="h-4 w-4" /></button>
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
              </div>
            )}

            {loading && (
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Syncing live workspace data...</span>
              </div>
            )}

            <TabErrorBoundary>
              {selectedProjectDossier ? (
                <ProjectHubView
                  project={selectedProjectDossier}
                  workItems={workItems}
                  milestones={milestones}
                  ecosystem={ecosystemData}
                  onClose={() => setSelectedProjectDossier(null)}
                  onSelectWorkItem={(item) => setSelectedWorkItem(item)}
                  onPatchWorkItem={patchWorkItem}
                  onRefresh={loadWorkspace}
                />
              ) : activeSection === 'overview' ? (
                <div className="space-y-4">
                  {/* Customizable Overview Widget Pinning Bar */}
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Pinned Overview Widgets:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        ['subprojects', 'Sub-Projects Rollup'],
                        ['sla_alerts', 'Staff SLA Alerts'],
                        ['handover_compliance', 'Handover & Vault'],
                      ].map(([key, label]) => {
                        const active = pinnedWidgets.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => togglePinnedWidget(key)}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition ${
                              active
                                ? 'border-orange-300 bg-orange-50 text-orange-800'
                                : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {active ? '📌 ' : '+ '}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {pinnedWidgets.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {pinnedWidgets.includes('subprojects') && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Programs & Sub-Projects</div>
                          <div className="mt-1 text-2xl font-extrabold text-slate-900">
                            {filteredProjects.filter((p) => p.parentProjectId).length} Sub-projects
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSection('projects')}
                            className="mt-2 text-xs font-bold text-orange-600 hover:underline"
                          >
                            Manage Hierarchy →
                          </button>
                        </div>
                      )}
                      {pinnedWidgets.includes('sla_alerts') && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Staff Timeline SLA Alerts</div>
                          <div className="mt-1 text-2xl font-extrabold text-rose-600">
                            {filteredProjects.reduce(
                              (acc, p) =>
                                acc +
                                (p.members || []).filter((m: any) =>
                                  ['OVERDUE', 'AT_RISK', 'COMPLETED_LATE'].includes(m.slaStatus)
                                ).length,
                              0
                            )}{' '}
                            Flagged
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSection('staff_timelines')}
                            className="mt-2 text-xs font-bold text-orange-600 hover:underline"
                          >
                            Review Staff Timelines →
                          </button>
                        </div>
                      )}
                      {pinnedWidgets.includes('handover_compliance') && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Handover & Vault</div>
                          <div className="mt-1 text-2xl font-extrabold text-slate-900">
                            {filteredProjects.reduce((acc, p) => acc + (p.staffHandovers?.length || 0), 0)} Submissions
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSection('handover_vault')}
                            className="mt-2 text-xs font-bold text-orange-600 hover:underline"
                          >
                            Open Vault & Media →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                <ProjectOverviewSection
                  userName={userName}
                  activeBusinessName={activeBusinessName}
                  activeBrandColor={activeBrandColor}
                  metrics={{
                    totalProjects: metrics.totalProjects || projects.length,
                    activeProjects: metrics.activeProjects || 0,
                    awaitingApproval: metrics.awaitingApproval || 0,
                    totalWorkItems: workItems.length,
                    openTasks: metrics.openTasks || 0,
                    blockedTasks: metrics.blockedTasks || 0,
                    overdueTasks: workItems.filter(
                      (w) => w.dueDate && String(w.dueDate).slice(0, 10) < new Date().toISOString().split('T')[0] && !['DONE', 'ACCEPTED'].includes(w.status)
                    ).length,
                    completedTasks: workItems.filter((w) => ['DONE', 'ACCEPTED'].includes(w.status)).length,
                    myTasks: metrics.myTasks || 0,
                    pendingApprovals: metrics.pendingApprovals || 0,
                    openRisks: metrics.openRisks || 0,
                    totalApprovedBudgetNgn: projects.reduce((acc, pr) => acc + Number(pr.approvedBudgetNgn || pr.proposedBudgetNgn || 0), 0),
                    totalCommittedSpendNgn: projects.reduce((acc, pr) => acc + Number(pr.committedSpendNgn || 0), 0),
                    totalLoggedHours: timeEntries.reduce((acc, te) => acc + Number(te.hours || 0), 0),
                  }}
                  projects={filteredProjects}
                  workItems={workItems}
                  approvals={approvals}
                  risks={risks}
                  milestones={milestones}
                  departmentStats={departmentCompletion.map((d) => ({ name: d.name, count: d.total }))}
                  onNavigate={(sec) => setActiveSection(sec)}
                  onSelectProjectDossier={(proj) => setSelectedProjectDossier(proj)}
                  onSelectTaskDrawer={(task) => setSelectedWorkItem(task)}
                  onOpenNewProject={() => setShowCreateProjectModal(true)}
                  onOpenNewTask={() => setShowCreateTaskModal(true)}
                />
                </div>
              ) : activeSection === 'projects' ? (
                <ProjectsDirectoryView
                  projects={filteredProjects}
                  workItems={filteredWorkItems}
                  ecosystem={ecosystemData}
                  onOpenProjectHub={(proj) => setSelectedProjectDossier(proj)}
                  onPatchProject={patchProject}
                  onOpenNewProject={(parentId) => {
                    setProjectForm((p) => ({ ...p, parentProjectId: parentId || '' }));
                    setShowCreateProjectModal(true);
                  }}
                  onSeedStarter={seedStarterWorkspace}
                  seeding={seeding}
                />
              ) : activeSection === 'staff_timelines' ? (
                <ProjectStaffTimelinesView
                  projects={filteredProjects}
                  staffOptions={staffOptions}
                  isExecutive={Boolean(data?.actor?.role && ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(String(data.actor.role).toUpperCase()))}
                  onRefresh={loadWorkspace}
                />
              ) : activeSection === 'handover_vault' ? (
                <ProjectHandoverVaultView
                  projects={filteredProjects}
                  actor={data?.actor || { id: '', legalName: userName, role: 'STAFF' }}
                  isExecutive={Boolean(data?.actor?.role && ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(String(data.actor.role).toUpperCase()))}
                  onRefresh={loadWorkspace}
                />
              ) : activeSection === 'project_chat' ? (
                <ProjectTeamsChatView
                  projects={filteredProjects}
                  departments={departments}
                  workItems={filteredWorkItems}
                  actor={data?.actor || { id: '', legalName: userName, role: 'GMD' }}
                  isExecutive={Boolean(data?.actor?.role && ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(String(data.actor.role).toUpperCase()))}
                  onRefreshWorkspace={loadWorkspace}
                />
              ) : activeSection === 'inbox' ? (
                <ProjectInboxTriageView
                  actorId={data?.actor?.id || ''}
                  workItems={filteredWorkItems}
                  sprints={sprints}
                  staffOptions={staffOptions}
                  onPatchWorkItem={patchWorkItem}
                  onSelectWorkItem={(item) => setSelectedWorkItem(item)}
                />
              ) : activeSection === 'issues' || activeSection === 'my_work' || activeSection === 'backlog' ? (
                <ProjectIssuesWorkspace
                  mode={
                    activeSection === 'my_work'
                      ? 'my_work'
                      : activeSection === 'backlog'
                      ? 'backlog'
                      : 'issues'
                  }
                  actorId={data?.actor?.id || ''}
                  workItems={filteredWorkItems}
                  projects={projects}
                  sprints={sprints}
                  staffOptions={staffOptions}
                  labels={labels}
                  subscribedWorkItemIds={subscribedWorkItemIds}
                  activityLogs={activityLogs}
                  onPatchWorkItem={patchWorkItem}
                  onBulkPatchWorkItems={bulkPatchWorkItems}
                  onQuickCreateInline={async (payload) => {
                    await postAction(
                      '/api/projects/work-items',
                      { action: 'CREATE_WORK_ITEM', ...payload },
                      'Issue created.'
                    );
                  }}
                  onOpenCreateModal={(defaults) => {
                    setQuickCreateDefaults(defaults || {});
                    setShowCreateTaskModal(true);
                  }}
                  onSelectWorkItem={(item) => setSelectedWorkItem(item)}
                  onSaveView={saveView}
                  initialFilters={activeViewPreset.filters}
                  initialDisplay={activeViewPreset.display}
                />
              ) : activeSection === 'views' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Saved Custom Views ({savedViews.length})</h3>
                    <button
                      type="button"
                      onClick={() => setActiveSection('issues')}
                      className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Open Issues to Create View
                    </button>
                  </div>
                  {savedViews.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                      No saved views yet. Use &ldquo;Save View&rdquo; in Issues to bookmark custom filters &amp; layouts.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {savedViews.map((sv) => (
                        <div key={sv.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase text-orange-600">{sv.visibility}</div>
                            <h4 className="text-sm font-bold text-slate-900 mt-0.5">{sv.name}</h4>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  setActiveViewPreset({
                                    filters: JSON.parse(sv.filtersJson || '{}'),
                                    display: JSON.parse(sv.displayJson || '{}'),
                                  });
                                } catch {
                                  setActiveViewPreset({});
                                }
                                setActiveSection('issues');
                              }}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                            >
                              Open View →
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/projects/views?id=${encodeURIComponent(sv.id)}`, { method: 'DELETE' });
                                await loadWorkspace();
                              }}
                              className="text-xs font-semibold text-slate-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeSection === 'sprints' ? (
                <ProjectCyclesCockpit
                  sprints={sprints}
                  workItems={filteredWorkItems}
                  onPatchWorkItem={patchWorkItem}
                  onCreateSprint={() => setShowCreateSprintModal(true)}
                  onCarryOver={async (fromSprintId, toSprintId) => {
                    await postAction(
                      '/api/projects/teams',
                      { action: 'CARRY_OVER_CYCLE', fromSprintId, toSprintId },
                      'Cycle completed and unfinished work carried over.'
                    );
                  }}
                  onSelectWorkItem={(item) => setSelectedWorkItem(item)}
                />
              ) : activeSection === 'roadmaps' ? (
                <ProjectTimelineView
                  projects={filteredProjects}
                  milestones={milestones}
                  statusUpdates={statusUpdates}
                  onPatchProject={patchProject}
                />
              ) : activeSection === 'portfolios' ? (
                <ProjectPortfoliosOkrView
                  portfolios={portfolios}
                  goals={goals}
                  projects={filteredProjects}
                  onOpenNewPortfolio={() => setShowCreatePortfolioModal(true)}
                  onOpenNewGoal={() => setShowCreateGoalModal(true)}
                  onOpenProjectHub={(proj) => setSelectedProjectDossier(proj)}
                  onRefresh={loadWorkspace}
                />
              ) : activeSection === 'approvals' ? (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm text-slate-900">
                    Project Approvals &amp; Deliverable Reviews ({approvals.length})
                  </div>
                  <div className="divide-y divide-slate-100">
                    {approvals.length === 0 ? (
                      <div className="p-10 text-center text-sm text-slate-500">No pending project approvals.</div>
                    ) : (
                      approvals.map((a) => (
                        <div key={a.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{a.title}</div>
                            <div className="text-xs text-slate-500">{a.category} · {a.project?.projectCode}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold">{a.status}</span>
                            {a.status === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() =>
                                    postAction('/api/projects/governance', { action: 'DECIDE_APPROVAL', approvalId: a.id, decision: 'APPROVED' }, 'Approval granted.')
                                  }
                                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() =>
                                    postAction('/api/projects/governance', { action: 'DECIDE_APPROVAL', approvalId: a.id, decision: 'REJECTED' }, 'Submission rejected.')
                                  }
                                  className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : activeSection === 'risks' ? (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCreateRiskModal(true)}
                      className="rounded-lg px-3.5 py-2 text-xs font-bold text-white"
                      style={{ background: activeBrandColor }}
                    >
                      + Log Risk / Issue / Blocker
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Code &amp; Type</th>
                          <th className="px-4 py-3">Title &amp; Project</th>
                          <th className="px-4 py-3">Severity</th>
                          <th className="px-4 py-3">Owner</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {risks.length === 0 ? (
                          <tr><td colSpan={6} className="p-8 text-center text-slate-500">No risks, issues, or blockers logged.</td></tr>
                        ) : (
                          risks.map((r) => (
                            <tr key={r.id}>
                              <td className="px-4 py-3 text-xs font-bold">{r.riskCode} · {r.recordType}</td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-900">{r.title}</div>
                                <div className="text-xs text-slate-500">{r.project?.projectCode}</div>
                              </td>
                              <td className="px-4 py-3 text-xs font-bold">{r.severity}</td>
                              <td className="px-4 py-3 text-xs">{r.owner?.legalName || '—'}</td>
                              <td className="px-4 py-3 text-xs">{r.status}</td>
                              <td className="px-4 py-3 text-right">
                                {r.status !== 'RESOLVED' && (
                                  <button
                                    type="button"
                                    onClick={() => postAction('/api/projects/governance', { action: 'RESOLVE_RISK', id: r.id, status: 'RESOLVED' }, `${r.riskCode} resolved.`)}
                                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold"
                                  >
                                    Resolve
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : activeSection === 'workload' ? (
                <ProjectWorkloadRebalancer
                  staffOptions={staffOptions}
                  workItems={filteredWorkItems}
                  ecosystem={ecosystemData}
                  onPatchWorkItem={patchWorkItem}
                  onSelectWorkItem={(item) => setSelectedWorkItem(item)}
                />
              ) : activeSection === 'templates' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((tpl) => (
                    <div key={tpl.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase text-slate-500">{tpl.projectType} · {tpl.methodology}</div>
                        <h4 className="mt-1 text-base font-bold text-slate-900">{tpl.name}</h4>
                        <p className="mt-1 text-xs text-slate-600">{tpl.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProjectForm((p) => ({
                            ...p,
                            templateKey: tpl.key,
                            projectType: tpl.projectType,
                            methodology: tpl.methodology,
                            description: tpl.description,
                          }));
                          setShowCreateProjectModal(true);
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
                      >
                        Use Template →
                      </button>
                    </div>
                  ))}
                </div>
              ) : activeSection === 'releases' ? (
                <ProjectReleasesView
                  projects={projects}
                  releases={releases}
                  testCases={testCases}
                  onRefresh={loadWorkspace}
                />
              ) : activeSection === 'ecosystem' ? (
                <ProjectEcosystemSection
                  ecosystem={ecosystemData}
                  projects={filteredProjects}
                  onOpenProjectHub={(proj) => setSelectedProjectDossier(proj)}
                  onFilterByAssignee={(empId) => {
                    setActiveViewPreset({ filters: { assigneeId: empId } });
                    setActiveSection('issues');
                  }}
                />
              ) : activeSection === 'reports' ? (
                <ProjectChartsAndReports
                  projects={filteredProjects}
                  workItems={filteredWorkItems}
                  sprints={sprints}
                  staffOptions={staffOptions}
                  releases={releases}
                  testCases={testCases}
                  onFilterByAssignee={(empId) => {
                    setActiveViewPreset({ filters: { assigneeId: empId } });
                    setActiveSection('issues');
                  }}
                />
              ) : activeSection === 'teams' || activeSection === 'loops' || activeSection === 'settings' ? (
                <ProjectTeamsLoopsSettings
                  section={activeSection}
                  teams={teams}
                  labels={labels}
                  slaRules={slaRules}
                  automations={automations}
                  workflows={workflows}
                  workItems={filteredWorkItems}
                  staffOptions={staffOptions}
                  onRefresh={loadWorkspace}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-2">
                  <h3 className="text-base font-bold text-slate-900">{activeNav.label}</h3>
                  <p className="text-sm text-slate-600">
                    {activeNav.subtitle} for <strong>{activeBusinessName}</strong>. Core records are synchronized with your active projects, tasks, and approvals.
                  </p>
                </div>
              )}
            </TabErrorBoundary>
          </div>
        </section>

        {/* Create Project Modal */}
        {showCreateProjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Create Project (Template-Driven)</h3>
                <button onClick={() => setShowCreateProjectModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await postAction('/api/projects', { action: 'CREATE_PROJECT', ...projectForm }, 'Project created!');
                  if (ok) setShowCreateProjectModal(false);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
                    <input
                      required
                      value={projectForm.title}
                      onChange={(e) => setProjectForm((p) => ({ ...p, title: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="e.g. Lagos Revenue Portal v2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Owning Subsidiary</label>
                    <select
                      value={projectForm.organizationId}
                      onChange={(e) => setProjectForm((p) => ({ ...p, organizationId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {subsidiaries.map((s) => (
                        <option key={s.id} value={s.id}>{s.legalName}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Template</label>
                    <select
                      value={projectForm.templateKey}
                      onChange={(e) => {
                        const tpl = templates.find((t) => t.key === e.target.value);
                        setProjectForm((p) => ({
                          ...p,
                          templateKey: e.target.value,
                          projectType: tpl?.projectType || p.projectType,
                          methodology: tpl?.methodology || p.methodology,
                        }));
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {templates.map((t) => (
                        <option key={t.key} value={t.key}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Methodology</label>
                    <select
                      value={projectForm.methodology}
                      onChange={(e) => setProjectForm((p) => ({ ...p, methodology: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {['SCRUM', 'KANBAN', 'AGILE', 'WATERFALL', 'HYBRID'].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Proposed Budget (NGN)</label>
                    <input
                      type="number"
                      min="0"
                      value={projectForm.proposedBudget}
                      onChange={(e) => setProjectForm((p) => ({ ...p, proposedBudget: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                    <select
                      value={projectForm.priority}
                      onChange={(e) => setProjectForm((p) => ({ ...p, priority: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                    <input type="date" value={projectForm.startDate} onChange={(e) => setProjectForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Target Date</label>
                    <input type="date" value={projectForm.targetDate} onChange={(e) => setProjectForm((p) => ({ ...p, targetDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Parent Project (Optional — for Sub-Projects)</label>
                    <select
                      value={projectForm.parentProjectId}
                      onChange={(e) => setProjectForm((p) => ({ ...p, parentProjectId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">None (Top-level Program / Project)</option>
                      {projects.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.projectCode} · {pr.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Project Team Leader</label>
                    <select
                      value={projectForm.teamLeadId}
                      onChange={(e) => setProjectForm((p) => ({ ...p, teamLeadId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Select Team Leader...</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.legalName} {s.jobTitle ? `(${s.jobTitle})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">GitHub Repository URL (Optional — Tech Projects)</label>
                    <input
                      value={projectForm.githubRepoUrl}
                      onChange={(e) => setProjectForm((p) => ({ ...p, githubRepoUrl: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="https://github.com/org/repo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Branch</label>
                    <input
                      value={projectForm.githubBranch}
                      onChange={(e) => setProjectForm((p) => ({ ...p, githubBranch: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="main"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description &amp; Objectives</label>
                  <textarea
                    rows={3}
                    value={projectForm.description}
                    onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={projectForm.submitForApproval}
                    onChange={(e) => setProjectForm((p) => ({ ...p, submitForApproval: e.target.checked }))}
                  />
                  Submit immediately for Executive / GMD Approval
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowCreateProjectModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Cancel</button>
                  <button type="submit" disabled={submitting} className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: activeBrandColor }}>
                    {submitting ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Global Cmd+K Command Palette */}
        <CommandPaletteModal
          open={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          projects={projects}
          workItems={workItems}
          teams={teams}
          savedViews={savedViews}
          onNavigateSection={(sec) => {
            setSelectedProjectDossier(null);
            setActiveSection(sec);
          }}
          onOpenProjectHub={(proj) => setSelectedProjectDossier(proj)}
          onOpenWorkItem={(item) => setSelectedWorkItem(item)}
          onOpenNewIssue={() => setShowCreateTaskModal(true)}
          onOpenNewProject={() => setShowCreateProjectModal(true)}
        />

        {/* Compact Linear-Style Quick-Create Issue Modal */}
        <QuickCreateIssueModal
          open={showCreateTaskModal}
          onClose={() => setShowCreateTaskModal(false)}
          onCreated={loadWorkspace}
          projects={projects}
          teams={teams}
          sprints={sprints}
          staffOptions={staffOptions}
          labels={labels}
          workItems={workItems}
          issueTemplates={data?.issueTemplates || []}
          leaveEmployeeIds={(ecosystemData?.leaves || []).map((l: any) => l.employeeId)}
          defaultProjectId={taskForm.projectId || projects[0]?.id}
          defaultStatus={quickCreateDefaults.status}
          defaultDueDate={quickCreateDefaults.dueDate}
        />

        {/* Work Item Detail Drawer */}
        {selectedWorkItem && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
            <div className="w-full max-w-xl bg-white h-full overflow-y-auto p-6 shadow-2xl space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-mono font-bold text-slate-500">{selectedWorkItem.itemKey} · {selectedWorkItem.itemType}</div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedWorkItem.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await postAction(
                        '/api/projects/work-items',
                        { action: 'TOGGLE_SUBSCRIPTION', workItemId: selectedWorkItem.id },
                        subscribedWorkItemIds.includes(selectedWorkItem.id) ? 'Unsubscribed from issue.' : 'Subscribed to issue updates.'
                      );
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                      subscribedWorkItemIds.includes(selectedWorkItem.id)
                        ? 'border-orange-300 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {subscribedWorkItemIds.includes(selectedWorkItem.id) ? '★ Subscribed' : '☆ Subscribe'}
                  </button>
                  <button onClick={() => setSelectedWorkItem(null)}><X className="h-5 w-5 text-slate-400" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block mb-1">Status</span>
                  <select
                    value={selectedWorkItem.status}
                    onChange={async (e) => {
                      const next = e.target.value;
                      setSelectedWorkItem((p: any) => ({ ...p, status: next }));
                      await patchWorkItem(selectedWorkItem.id, { status: next });
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-800"
                  >
                    {['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'QA_TESTING', 'BLOCKED', 'DONE', 'ACCEPTED'].map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Priority</span>
                  <select
                    value={selectedWorkItem.priority}
                    onChange={async (e) => {
                      const next = e.target.value;
                      setSelectedWorkItem((p: any) => ({ ...p, priority: next }));
                      await patchWorkItem(selectedWorkItem.id, { priority: next });
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-800"
                  >
                    {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((pr) => (
                      <option key={pr} value={pr}>{pr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Assignee</span>
                  <select
                    value={selectedWorkItem.assigneeId || ''}
                    onChange={async (e) => {
                      const next = e.target.value || null;
                      setSelectedWorkItem((p: any) => ({ ...p, assigneeId: next }));
                      await patchWorkItem(selectedWorkItem.id, { assigneeId: next });
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-800"
                  >
                    <option value="">Unassigned</option>
                    {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                  </select>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Due Date</span>
                  <input
                    type="date"
                    value={selectedWorkItem.dueDate || ''}
                    onChange={async (e) => {
                      const next = e.target.value || null;
                      setSelectedWorkItem((p: any) => ({ ...p, dueDate: next }));
                      await patchWorkItem(selectedWorkItem.id, { dueDate: next });
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-800"
                  />
                </div>
              </div>
              {selectedWorkItem.acceptanceCriteria && (
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500 mb-1">Acceptance Criteria</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedWorkItem.acceptanceCriteria}</p>
                </div>
              )}
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="text-xs font-bold uppercase text-slate-500">Log Work Time</div>
                <div className="flex gap-2">
                  <input type="number" step="0.5" value={timeHours} onChange={(e) => setTimeHours(e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" placeholder="Hrs" />
                  <input value={timeDesc} onChange={(e) => setTimeDesc(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" placeholder="What did you work on?" />
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await postAction('/api/projects/work-items', {
                        action: 'LOG_TIME',
                        projectId: selectedWorkItem.projectId,
                        workItemId: selectedWorkItem.id,
                        hours: Number(timeHours),
                        description: timeDesc,
                      }, 'Time entry logged.');
                      if (ok) setTimeDesc('');
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                    style={{ background: activeBrandColor }}
                  >
                    Log
                  </button>
                </div>
              </div>
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="text-xs font-bold uppercase text-slate-500">Add Comment</div>
                <div className="flex gap-2">
                  <input value={commentText} onChange={(e) => setCommentText(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" placeholder="Write a comment or @mention..." />
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await postAction('/api/projects/work-items', {
                        action: 'ADD_COMMENT',
                        projectId: selectedWorkItem.projectId,
                        workItemId: selectedWorkItem.id,
                        body: commentText,
                      }, 'Comment added.');
                      if (ok) setCommentText('');
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Project Dossier Drawer */}
        {selectedProjectDossier && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
            <div className="w-full max-w-2xl bg-white h-full overflow-y-auto p-6 shadow-2xl space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-slate-500">{selectedProjectDossier.projectCode} · {selectedProjectDossier.methodology}</div>
                  <h3 className="text-xl font-extrabold text-slate-900 mt-1">{selectedProjectDossier.title}</h3>
                  <p className="text-xs text-slate-500">{selectedProjectDossier.organization?.legalName} · Status: {selectedProjectDossier.status}</p>
                </div>
                <button onClick={() => setSelectedProjectDossier(null)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-semibold text-slate-500">Approved / Proposed</div>
                  <div className="text-base font-bold text-slate-900">{formatNaira(selectedProjectDossier.approvedBudgetNgn || selectedProjectDossier.proposedBudgetNgn)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-semibold text-slate-500">Committed Spend</div>
                  <div className="text-base font-bold text-slate-900">{formatNaira(selectedProjectDossier.committedSpendNgn)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-semibold text-slate-500">Available Budget</div>
                  <div className="text-base font-bold text-emerald-700">{formatNaira(selectedProjectDossier.availableBudgetNgn)}</div>
                </div>
              </div>
              {selectedProjectDossier.description && (
                <p className="text-sm text-slate-700">{selectedProjectDossier.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {['ACTIVE', 'ON_HOLD', 'DELIVERY_ACCEPTANCE', 'COMPLETED'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={async () => {
                      const ok = await postAction('/api/projects', { action: 'ADVANCE_PROJECT_STATUS', projectId: selectedProjectDossier.id, status: st }, `Project moved to ${st}`);
                      if (ok) setSelectedProjectDossier(null);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    Move → {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Risk Modal */}
        {showCreateRiskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Log Risk / Issue / Blocker</h3>
                <button onClick={() => setShowCreateRiskModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await postAction('/api/projects/governance', { action: 'CREATE_RISK', ...riskForm }, 'Risk logged.');
                  if (ok) setShowCreateRiskModal(false);
                }}
                className="space-y-3"
              >
                <select required value={riskForm.projectId} onChange={(e) => setRiskForm((p) => ({ ...p, projectId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Select project...</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.projectCode} — {p.title}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <select value={riskForm.recordType} onChange={(e) => setRiskForm((p) => ({ ...p, recordType: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="RISK">RISK</option>
                    <option value="ISSUE">ISSUE</option>
                    <option value="BLOCKER">BLOCKER</option>
                  </select>
                  <select value={riskForm.severity} onChange={(e) => setRiskForm((p) => ({ ...p, severity: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <input required value={riskForm.title} onChange={(e) => setRiskForm((p) => ({ ...p, title: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Title" />
                <textarea required rows={3} value={riskForm.description} onChange={(e) => setRiskForm((p) => ({ ...p, description: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Description & impact" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateRiskModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Cancel</button>
                  <button type="submit" className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: activeBrandColor }}>Save</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Sprint Modal */}
        {showCreateSprintModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Create Sprint / Cycle</h3>
                <button onClick={() => setShowCreateSprintModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await postAction('/api/projects', { action: 'CREATE_SPRINT', ...sprintForm }, 'Sprint created.');
                  if (ok) setShowCreateSprintModal(false);
                }}
                className="space-y-3"
              >
                <input required value={sprintForm.name} onChange={(e) => setSprintForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Sprint 1 — Core API" />
                <input value={sprintForm.goal} onChange={(e) => setSprintForm((p) => ({ ...p, goal: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Sprint goal" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm((p) => ({ ...p, startDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm((p) => ({ ...p, endDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateSprintModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Cancel</button>
                  <button type="submit" className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: activeBrandColor }}>Create Sprint</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Portfolio Modal */}
        {showCreatePortfolioModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-3">Create Portfolio</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await postAction('/api/projects', { action: 'CREATE_PORTFOLIO', ...portfolioForm }, 'Portfolio created.');
                  if (ok) setShowCreatePortfolioModal(false);
                }}
                className="space-y-3"
              >
                <input required value={portfolioForm.name} onChange={(e) => setPortfolioForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Portfolio name" />
                <textarea rows={2} value={portfolioForm.description} onChange={(e) => setPortfolioForm((p) => ({ ...p, description: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Description" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreatePortfolioModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Cancel</button>
                  <button type="submit" className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: activeBrandColor }}>Create</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Goal Modal */}
        {showCreateGoalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-3">Create Strategic Goal / OKR</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await postAction('/api/projects', { action: 'CREATE_GOAL', ...goalForm }, 'Goal created.');
                  if (ok) setShowCreateGoalModal(false);
                }}
                className="space-y-3"
              >
                <input required value={goalForm.title} onChange={(e) => setGoalForm((p) => ({ ...p, title: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Goal title" />
                <input value={goalForm.measurementPeriod} onChange={(e) => setGoalForm((p) => ({ ...p, measurementPeriod: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. Q4 2026" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateGoalModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Cancel</button>
                  <button type="submit" className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: activeBrandColor }}>Create</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* GMD-Only BEMi Ambient AI Bar */}
        {isAiAuthorized && (
          <>
            <AiScreenEdgeGlow isActive={true} isProcessing={aiManager.isTyping} brandColor={activeBrandColor} />
            <AmbientBottomAiBar
              currentPage={`Projects · ${activeNav.label}`}
              businessName={activeBusinessName}
              userName={userName}
              userRole={actorRoleUpper}
              messages={aiManager.messages}
              isTyping={aiManager.isTyping}
              isInspectMode={isInspectMode}
              agentMode={aiManager.agentMode}
              onSetAgentMode={aiManager.setAgentMode}
              onToggleInspectMode={() => setIsInspectMode((v) => !v)}
              onSendMessage={aiManager.sendMessage}
              onConfirmAction={aiManager.handleConfirmAction}
              onCancelAction={aiManager.handleCancelAction}
              onNewChat={aiManager.startNewChat}
              onOpenHistory={() => aiManager.setIsHistoryOpen(true)}
              onOpenFullCockpit={() => setAiDrawerOpen(true)}
              onNavigate={(tab) => {
                const match = ALL_NAV_ITEMS.find((i) => i.label.toLowerCase() === tab.toLowerCase());
                if (match) setActiveSection(match.id);
              }}
            />
            <AiChatHistoryDrawer
              isOpen={aiManager.isHistoryOpen}
              onClose={() => aiManager.setIsHistoryOpen(false)}
              sessions={aiManager.sessions}
              activeSessionId={aiManager.activeSessionId}
              onSelectSession={(session) => aiManager.loadSession(session)}
              onNewChat={aiManager.startNewChat}
              onDeleteSession={(id) => aiManager.deleteSession(id)}
            />
            <AiFinancialManagerDrawer
              isOpen={aiDrawerOpen}
              onClose={() => setAiDrawerOpen(false)}
              userRole={actorRoleUpper}
              userName={userName}
              businessId={activeSub?.id || 'BEMS-GROUP'}
              currentPage={`Projects · ${activeNav.label}`}
              businessName={activeBusinessName}
              sharedMessages={aiManager.messages}
              sharedIsTyping={aiManager.isTyping}
              onSendMessage={aiManager.sendMessage}
              onConfirmAction={aiManager.handleConfirmAction}
              onCancelAction={aiManager.handleCancelAction}
              onNewChat={aiManager.startNewChat}
            />
          </>
        )}
      </main>
    </UniversalClickToAskProvider>
  );
}
