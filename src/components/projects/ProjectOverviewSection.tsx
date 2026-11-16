'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FolderKanban,
  Layers,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { AvatarChip, IssueStatusIcon, RagBadge } from './pmUiPrimitives';

interface ProjectOverviewSectionProps {
  userName: string;
  activeBusinessName: string;
  activeBrandColor: string;
  metrics: {
    totalProjects: number;
    activeProjects: number;
    awaitingApproval: number;
    totalWorkItems: number;
    openTasks: number;
    blockedTasks: number;
    overdueTasks: number;
    completedTasks: number;
    myTasks: number;
    pendingApprovals: number;
    openRisks: number;
    totalApprovedBudgetNgn: number;
    totalCommittedSpendNgn: number;
    totalLoggedHours: number;
  };
  projects: any[];
  workItems: any[];
  approvals: any[];
  risks: any[];
  milestones: any[];
  departmentStats: Array<{ name: string; count: number }>;
  onNavigate: (section: any) => void;
  onSelectProjectDossier: (project: any) => void;
  onSelectTaskDrawer: (task: any) => void;
  onOpenNewProject: () => void;
  onOpenNewTask: () => void;
}

function formatNaira(amount: number) {
  return `₦${Math.round(amount || 0).toLocaleString()}`;
}

export default function ProjectOverviewSection({
  userName,
  activeBusinessName,
  activeBrandColor,
  metrics,
  projects,
  workItems,
  approvals,
  risks,
  milestones,
  departmentStats,
  onNavigate,
  onSelectProjectDossier,
  onSelectTaskDrawer,
  onOpenNewProject,
  onOpenNewTask,
}: ProjectOverviewSectionProps) {
  const [breakdownTab, setBreakdownTab] = useState<'STATUS' | 'DEPARTMENT'>('STATUS');

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const shortName = userName.split(' ')[0] || 'Executive';

  const greenCount = projects.filter((p) => (p.ragStatus || 'GREEN') === 'GREEN').length;
  const amberCount = projects.filter((p) => p.ragStatus === 'AMBER').length;
  const redCount = projects.filter((p) => p.ragStatus === 'RED').length;

  const completionPct =
    metrics.totalWorkItems > 0
      ? Math.round((metrics.completedTasks / metrics.totalWorkItems) * 100)
      : 0;

  const budgetUtilPct =
    metrics.totalApprovedBudgetNgn > 0
      ? Math.min(100, Math.round((metrics.totalCommittedSpendNgn / metrics.totalApprovedBudgetNgn) * 100))
      : 0;

  const statusBuckets = [
    { key: 'BACKLOG', label: 'Backlog', color: '#94a3b8' },
    { key: 'TODO', label: 'To Do', color: '#64748b' },
    { key: 'IN_PROGRESS', label: 'In Progress', color: '#f59e0b' },
    { key: 'IN_REVIEW', label: 'In Review', color: '#6366f1' },
    { key: 'QA_TESTING', label: 'QA Testing', color: '#0284c7' },
    { key: 'BLOCKED', label: 'Blocked', color: '#dc2626' },
    { key: 'DONE', label: 'Done & Accepted', color: '#10b981' },
  ].map((b) => ({
    ...b,
    count:
      b.key === 'DONE'
        ? workItems.filter((w) => ['DONE', 'ACCEPTED'].includes(w.status)).length
        : workItems.filter((w) => w.status === b.key).length,
  }));

  const maxStatusCount = Math.max(1, ...statusBuckets.map((b) => b.count));
  const maxDeptCount = Math.max(1, ...departmentStats.map((d) => d.count));

  const todayIso = new Date().toISOString().split('T')[0];
  const overdueMilestones = milestones.filter(
    (m) => m.status !== 'COMPLETED' && m.dueDate && String(m.dueDate).slice(0, 10) < todayIso
  ).length;
  const pendingApprovalsCount = approvals.filter((a) => a.status === 'PENDING').length;
  const highRisksCount = risks.filter(
    (r) => r.status !== 'CLOSED' && ['HIGH', 'CRITICAL'].includes(String(r.severity || '').toUpperCase())
  ).length;

  const blockedItems = workItems.filter((w) => w.status === 'BLOCKED' || w.isBlocked).slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Executive Greeting Hero Strip (matching HR & Finance ERP style) */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
        }}
      >
        <div style={{ minWidth: 260, flex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                background: `${activeBrandColor}12`,
                border: `1px solid ${activeBrandColor}30`,
                color: activeBrandColor,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Project &amp; Work Command
            </span>
            <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
              {activeBusinessName}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 850, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Good {timeGreeting}, {shortName}.
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            {metrics.activeProjects} active {metrics.activeProjects === 1 ? 'project' : 'projects'} ·{' '}
            <strong style={{ color: '#0f172a' }}>{completionPct}%</strong> overall task completion ·{' '}
            <strong style={{ color: metrics.blockedTasks > 0 ? '#dc2626' : '#059669' }}>
              {metrics.blockedTasks} blocked
            </strong>{' '}
            · {metrics.totalLoggedHours.toFixed(1)}h logged.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onNavigate('my_work')}
            style={{
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            My Work ({metrics.myTasks})
          </button>
          <button
            type="button"
            onClick={onOpenNewTask}
            style={{
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid #0f172a',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + New Issue
          </button>
          <button
            type="button"
            onClick={onOpenNewProject}
            style={{
              padding: '9px 16px',
              borderRadius: 10,
              border: 'none',
              background: activeBrandColor,
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 750,
              cursor: 'pointer',
              boxShadow: `0 4px 12px ${activeBrandColor}30`,
            }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* 4-Card KPI Strip (1 Brand-Tinted Featured Card + 3 Light Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {/* Featured Card */}
        <button
          type="button"
          onClick={() => onNavigate('projects')}
          style={{
            textAlign: 'left',
            borderRadius: 16,
            padding: 18,
            border: `1px solid ${activeBrandColor}40`,
            background: `linear-gradient(135deg, ${activeBrandColor} 0%, ${activeBrandColor}dd 100%)`,
            color: '#ffffff',
            cursor: 'pointer',
            boxShadow: `0 8px 20px ${activeBrandColor}25`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.9 }}>
              Portfolio Health
            </span>
            <FolderKanban size={16} style={{ opacity: 0.9 }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 30, fontWeight: 850, lineHeight: 1.1 }}>
            {metrics.activeProjects}
            <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.85, marginLeft: 6 }}>
              / {metrics.totalProjects} projects
            </span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 700 }}>
            <span>● {greenCount} Green</span>
            <span>● {amberCount} Amber</span>
            <span>● {redCount} Red</span>
          </div>
        </button>

        {/* Open Work Items */}
        <button
          type="button"
          onClick={() => onNavigate('backlog')}
          style={{
            textAlign: 'left',
            borderRadius: 16,
            padding: 18,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: 11, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Execution Queue
            </span>
            <Layers size={16} color="#0284c7" />
          </div>
          <div style={{ marginTop: 10, fontSize: 30, fontWeight: 850, color: '#0f172a', lineHeight: 1.1 }}>
            {metrics.openTasks}
            <span style={{ fontSize: 13, fontWeight: 650, color: '#10b981', marginLeft: 8 }}>
              {completionPct}% done
            </span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: '#64748b' }}>
            {metrics.completedTasks} completed · {metrics.myTasks} assigned to you
          </div>
        </button>

        {/* Blockers & Overdue */}
        <button
          type="button"
          onClick={() => onNavigate('risks')}
          style={{
            textAlign: 'left',
            borderRadius: 16,
            padding: 18,
            border: metrics.blockedTasks + metrics.overdueTasks > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
            background: '#ffffff',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: 11, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Blockers &amp; Schedule Risk
            </span>
            <ShieldAlert size={16} color={metrics.blockedTasks > 0 ? '#dc2626' : '#f59e0b'} />
          </div>
          <div style={{ marginTop: 10, fontSize: 30, fontWeight: 850, color: metrics.blockedTasks > 0 ? '#dc2626' : '#0f172a', lineHeight: 1.1 }}>
            {metrics.blockedTasks}
            <span style={{ fontSize: 13, fontWeight: 650, color: '#64748b', marginLeft: 8 }}>
              {metrics.overdueTasks} overdue
            </span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: '#64748b' }}>
            {metrics.openRisks} open risks · {overdueMilestones} overdue milestones
          </div>
        </button>

        {/* Project Budget */}
        <button
          type="button"
          onClick={() => onNavigate('projects')}
          style={{
            textAlign: 'left',
            borderRadius: 16,
            padding: 18,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: 11, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Project Budget
            </span>
            <Wallet size={16} color="#0d9488" />
          </div>
          <div style={{ marginTop: 10, fontSize: 26, fontWeight: 850, color: '#0f172a', lineHeight: 1.15 }}>
            {formatNaira(metrics.totalApprovedBudgetNgn)}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#64748b' }}>
            <span>Committed: {formatNaira(metrics.totalCommittedSpendNgn)}</span>
            <strong style={{ color: '#0f172a' }}>{budgetUtilPct}%</strong>
          </div>
        </button>
      </div>

      {/* 2-Column Analytics & PM Action Centre */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 16,
        }}
      >
        {/* Left: Workflow Distribution / Department Load */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                Work Distribution
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                Live pipeline throughput across {activeBusinessName}
              </p>
            </div>
            <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
              {(['STATUS', 'DEPARTMENT'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setBreakdownTab(tab)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 7,
                    border: 'none',
                    background: breakdownTab === tab ? '#ffffff' : 'transparent',
                    color: breakdownTab === tab ? '#0f172a' : '#64748b',
                    fontSize: 11,
                    fontWeight: 750,
                    cursor: 'pointer',
                    boxShadow: breakdownTab === tab ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                  }}
                >
                  {tab === 'STATUS' ? 'By Stage' : 'By Dept'}
                </button>
              ))}
            </div>
          </div>

          {breakdownTab === 'STATUS' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {statusBuckets.map((b) => {
                const pct = Math.round((b.count / maxStatusCount) * 100);
                return (
                  <div key={b.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 650, color: '#334155' }}>
                        <IssueStatusIcon status={b.key} size={13} />
                        {b.label}
                      </span>
                      <span style={{ fontWeight: 750, color: '#0f172a' }}>{b.count}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: b.color, transition: 'width 240ms ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : departmentStats.length === 0 ? (
            <div style={{ padding: '28px 12px', textAlign: 'center', fontSize: 12.5, color: '#64748b' }}>
              No department-assigned tasks yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {departmentStats.slice(0, 7).map((d) => {
                const pct = Math.round((d.count / maxDeptCount) * 100);
                return (
                  <div key={d.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ fontWeight: 650, color: '#334155' }}>{d.name}</span>
                      <span style={{ fontWeight: 750, color: '#0f172a' }}>{d.count} items</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: activeBrandColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: PM Action Centre */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>PM Action Centre</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Items needing review, unblocking, or sign-off</p>
            </div>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: 11,
                fontWeight: 750,
                color: '#334155',
              }}
            >
              {pendingApprovalsCount + metrics.blockedTasks + highRisksCount} queued
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              {
                label: 'Pending Approvals & Sign-offs',
                count: pendingApprovalsCount,
                color: '#6366f1',
                icon: CheckCircle2,
                target: 'approvals',
              },
              {
                label: 'Blocked Work Items',
                count: metrics.blockedTasks,
                color: '#dc2626',
                icon: AlertTriangle,
                target: 'backlog',
              },
              {
                label: 'High / Critical Project Risks',
                count: highRisksCount,
                color: '#ea580c',
                icon: ShieldAlert,
                target: 'risks',
              },
              {
                label: 'Overdue Milestones',
                count: overdueMilestones,
                color: '#d97706',
                icon: Clock,
                target: 'roadmaps',
              },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <button
                  key={row.label}
                  type="button"
                  onClick={() => onNavigate(row.target)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 11,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                    <Icon size={15} color={row.color} />
                    {row.label}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: row.count > 0 ? row.color : '#64748b' }}>
                    {row.count}
                    <ArrowUpRight size={14} />
                  </span>
                </button>
              );
            })}
          </div>

          {blockedItems.length > 0 && (
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 11, fontWeight: 750, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Active Blockers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {blockedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTaskDrawer(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 9px',
                      borderRadius: 8,
                      border: '1px solid #fecaca',
                      background: '#fef2f2',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <code style={{ marginRight: 6, fontSize: 11 }}>{item.itemKey}</code>
                      {item.title}
                    </span>
                    <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>Inspect →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio & Project Health Register (Asana-style Clean Matrix) */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '15px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              Active Project Portfolio Register
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Click any project to inspect its Dossier, deliverables, milestones, and linked spend
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            View All Projects →
          </button>
        </div>

        {projects.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 750, color: '#0f172a' }}>No projects in this workspace yet</div>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '6px 0 14px' }}>
              Launch from one of the 11 BEMS templates (Software Engineering, GovTech, Procurement, Construction, Event Ops).
            </p>
            <button
              type="button"
              onClick={onOpenNewProject}
              style={{
                padding: '9px 16px',
                borderRadius: 10,
                border: 'none',
                background: activeBrandColor,
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 750,
                cursor: 'pointer',
              }}
            >
              + Create First Project
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 750, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 18px' }}>Project</th>
                  <th style={{ padding: '10px 14px' }}>Lead</th>
                  <th style={{ padding: '10px 14px' }}>Health</th>
                  <th style={{ padding: '10px 14px' }}>Stage</th>
                  <th style={{ padding: '10px 14px', minWidth: 140 }}>Progress</th>
                  <th style={{ padding: '10px 14px' }}>Budget</th>
                  <th style={{ padding: '10px 18px', textAlign: 'right' }}>Target End</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 10).map((p) => {
                  const pct = Math.min(100, Math.max(0, Number(p.progressPercent || 0)));
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectProjectDossier(p)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 12.5 }}
                    >
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: 11,
                              fontWeight: 750,
                              color: '#334155',
                            }}
                          >
                            {p.projectCode}
                          </span>
                          <div>
                            <div style={{ fontWeight: 750, color: '#0f172a' }}>{p.title}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {p.organization?.legalName || activeBusinessName} · {p._count?.workItems || 0} tasks
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <AvatarChip name={p.manager?.legalName} size={22} />
                          <span style={{ color: '#334155', fontWeight: 600 }}>{p.manager?.legalName || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <RagBadge rag={p.ragStatus} />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#334155',
                          }}
                        >
                          {String(p.status || 'PROPOSED').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: activeBrandColor, borderRadius: 999 }} />
                          </div>
                          <span style={{ fontSize: 11.5, fontWeight: 750, color: '#0f172a', minWidth: 32 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                        {formatNaira(p.approvedBudgetNgn || p.proposedBudgetNgn)}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>
                        {p.targetEndDate ? String(p.targetEndDate).slice(0, 10) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
