'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Crown,
  FolderKanban,
  FolderTree,
  GitBranch,
  KeyRound,
  ListChecks,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import ProjectIssuesWorkspace from '@/components/projects/ProjectIssuesWorkspace';
import ProjectHandoverVaultView from '@/components/projects/ProjectHandoverVaultView';
import ProjectStaffTimelinesView from '@/components/projects/ProjectStaffTimelinesView';
import ProjectTeamsChatView from '@/components/projects/ProjectTeamsChatView';
import QuickCreateIssueModal from '@/components/projects/QuickCreateIssueModal';

type StaffTab = 'projects' | 'tasks' | 'chat' | 'handover' | 'team_lead';

function computeDaysDelta(targetDate?: string | null): { text: string; overdue: boolean } {
  if (!targetDate) return { text: 'No deadline set', overdue: false };
  const today = new Date().toISOString().split('T')[0];
  const diff = Math.round((new Date(targetDate).getTime() - new Date(today).getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { text: 'Due today', overdue: false };
  return { text: `${diff}d left`, overdue: false };
}

export default function StaffProjectsPortalClient() {
  const [tab, setTab] = useState<StaffTab>('projects');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{ status?: string; dueDate?: string }>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects?view=staff', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load your projects.');
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Failed to load your projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const actor = data?.actor || { id: '', legalName: 'Staff', role: 'STAFF' };
  const projects: any[] = data?.projects || [];
  const workItems: any[] = data?.workItems || [];
  const sprints: any[] = data?.sprints || [];
  const staffOptions: any[] = data?.staffOptions || [];
  const labels: any[] = data?.labels || [];
  const teams: any[] = data?.teams || [];
  const departments: any[] = data?.departments || [];
  const activityLogs: any[] = data?.activityLogs || [];
  const subscribedWorkItemIds: string[] = data?.subscribedWorkItemIds || [];

  const ledProjects = useMemo(
    () => projects.filter((p) => p.teamLeadId === actor.id),
    [projects, actor.id]
  );

  const myStats = useMemo(() => {
    const myOpenTasks = workItems.filter(
      (w) => w.assigneeId === actor.id && !['DONE', 'ACCEPTED', 'ARCHIVED'].includes(w.status)
    ).length;
    const overdueDeadlines = projects.filter((p) => {
      const me = (p.members || []).find((m: any) => m.employeeId === actor.id);
      return me && ['OVERDUE', 'COMPLETED_LATE'].includes(me.slaStatus);
    }).length;
    const pendingHandovers = projects.filter((p) => {
      const h = (p.staffHandovers || []).find((x: any) => x.employeeId === actor.id);
      return !h || h.submissionStatus === 'PENDING';
    }).length;
    return {
      assignedProjects: projects.length,
      myOpenTasks,
      overdueDeadlines,
      pendingHandovers,
    };
  }, [projects, workItems, actor.id]);

  const handleMarkMyDeliverableDone = async (memberId: string) => {
    await fetch('/api/projects/staff-timelines?view=staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, action: 'MARK_COMPLETED' }),
    });
    await loadData();
  };

  const handlePatchWorkItem = async (id: string, patch: Record<string, any>) => {
    await fetch('/api/projects/work-items?view=staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    await loadData();
  };

  const handleBulkPatchWorkItems = async (ids: string[], patch: Record<string, any>) => {
    await fetch('/api/projects/work-items?view=staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulkIds: ids, ...patch }),
    });
    await loadData();
  };

  const handleQuickCreateInline = async (payload: {
    title: string;
    status: string;
    projectId: string;
    dueDate?: string;
  }) => {
    await fetch('/api/projects/work-items?view=staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_WORK_ITEM',
        ...payload,
        assigneeId: actor.id,
      }),
    });
    await loadData();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Top Staff Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-6 py-3.5">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/staff"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Staff Portal
            </Link>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-orange-600" />
                My Projects &amp; Deliverables
              </h1>
              <p className="text-xs text-slate-500">
                Execution workspace for <strong>{actor.legalName}</strong> · Deadlines, tasks, handover docs &amp; credentials
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCreateDefaults({});
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
              >
                + New Task
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-5">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        {/* Staff KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-slate-500">Assigned Projects</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">{myStats.assignedProjects}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-slate-500">My Open Tasks</div>
            <div className="mt-1 text-2xl font-extrabold text-orange-600">{myStats.myOpenTasks}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-slate-500">Overdue Deadlines</div>
            <div className="mt-1 text-2xl font-extrabold text-rose-600">{myStats.overdueDeadlines}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-slate-500">Pending Handovers</div>
            <div className="mt-1 text-2xl font-extrabold text-amber-600">{myStats.pendingHandovers}</div>
          </div>
        </div>

        {/* Focused Staff Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {(
            [
              ['projects', 'My Projects & Timelines', CalendarClock],
              ['tasks', 'My Tasks & Board', ListChecks],
              ['chat', 'Project Chat', MessageSquare],
              ['handover', 'Handover, Tools, Vault & Media', KeyRound],
              ...(ledProjects.length > 0 ? [['team_lead', 'Team Lead Controls', Crown] as const] : []),
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as StaffTab)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
                tab === id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'projects' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.length === 0 ? (
              <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                You are not assigned to any active projects yet.
              </div>
            ) : (
              projects.map((p) => {
                const me = (p.members || []).find((m: any) => m.employeeId === actor.id);
                const delta = computeDaysDelta(me?.targetCompletionDate);
                const myHandover = (p.staffHandovers || []).find((h: any) => h.employeeId === actor.id);
                const isLead = p.teamLeadId === actor.id;
                return (
                  <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-orange-700">{p.projectCode}</span>
                          {p.parentProject && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              <FolderTree className="h-3 w-3" /> {p.parentProject.projectCode}
                            </span>
                          )}
                          {isLead && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                              <Crown className="h-3 w-3" /> Team Lead
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-extrabold text-slate-900 mt-1">{p.title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{p.description || p.projectType}</p>
                      </div>
                      {p.githubRepoUrl && (
                        <a
                          href={p.githubRepoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-orange-300"
                        >
                          <GitBranch className="h-3.5 w-3.5 text-orange-600" /> GitHub
                        </a>
                      )}
                    </div>

                    {me && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs space-y-0.5">
                          <div className="text-slate-500">
                            Role: <strong className="text-slate-900">{me.projectRole?.replace(/_/g, ' ')}</strong>
                          </div>
                          <div className="text-slate-500">
                            My Deadline:{' '}
                            <strong className="text-slate-900">{me.targetCompletionDate || 'Not set'}</strong>{' '}
                            {!me.completedAt && (
                              <span className={`ml-1 font-bold ${delta.overdue ? 'text-rose-600' : 'text-emerald-700'}`}>
                                ({delta.text})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              me.slaStatus === 'OVERDUE' || me.slaStatus === 'COMPLETED_LATE'
                                ? 'bg-rose-100 text-rose-700'
                                : me.slaStatus?.startsWith('COMPLETED')
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {me.slaStatus === 'OVERDUE' ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {String(me.slaStatus || 'ON_TRACK').replace(/_/g, ' ')}
                          </span>
                          {!me.completedAt && (
                            <button
                              type="button"
                              onClick={() => handleMarkMyDeliverableDone(me.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Done
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {me?.salaryDeductionFlagged && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                        <strong>SLA Penalty Notice:</strong> {me.performanceImpactNote || 'Missed deadline flagged for payroll review.'}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-500">
                        Handover Status:{' '}
                        <strong className={myHandover?.submissionStatus === 'VERIFIED' ? 'text-emerald-700' : 'text-amber-700'}>
                          {myHandover?.submissionStatus || 'PENDING SUBMISSION'}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setTab('handover')}
                        className="font-bold text-orange-600 hover:underline"
                      >
                        Submit Docs &amp; Credentials →
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'tasks' && (
          <ProjectIssuesWorkspace
            mode="my_work"
            actorId={actor.id}
            workItems={workItems}
            projects={projects}
            sprints={sprints}
            staffOptions={staffOptions}
            labels={labels}
            subscribedWorkItemIds={subscribedWorkItemIds}
            activityLogs={activityLogs}
            onPatchWorkItem={handlePatchWorkItem}
            onBulkPatchWorkItems={handleBulkPatchWorkItems}
            onQuickCreateInline={handleQuickCreateInline}
            onOpenCreateModal={(defs) => {
              setCreateDefaults(defs || {});
              setShowCreateModal(true);
            }}
            onSelectWorkItem={() => {}}
            onSaveView={async () => {}}
          />
        )}

        {tab === 'chat' && (
          <ProjectTeamsChatView
            projects={projects}
            departments={departments}
            workItems={workItems}
            actor={actor}
            isExecutive={false}
            onRefreshWorkspace={loadData}
          />
        )}

        {tab === 'handover' && (
          <ProjectHandoverVaultView
            projects={projects}
            actor={actor}
            isExecutive={false}
            onRefresh={loadData}
          />
        )}

        {tab === 'team_lead' && ledProjects.length > 0 && (
          <ProjectStaffTimelinesView
            projects={ledProjects}
            staffOptions={staffOptions}
            isExecutive={false}
            onRefresh={loadData}
          />
        )}
      </main>

      <QuickCreateIssueModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadData}
        projects={projects}
        teams={teams}
        sprints={sprints}
        staffOptions={staffOptions}
        labels={labels}
        workItems={workItems}
        issueTemplates={data?.issueTemplates || []}
        defaultProjectId={projects[0]?.id}
        defaultStatus={createDefaults.status}
        defaultDueDate={createDefaults.dueDate}
      />
    </div>
  );
}

