'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3, Download, TrendingUp, Activity, ShieldCheck } from 'lucide-react';
import type { ReleaseRow, TestCaseRow } from './pmTypes';

interface ProjectChartsAndReportsProps {
  projects: any[];
  workItems: any[];
  sprints: any[];
  staffOptions: any[];
  releases: ReleaseRow[];
  testCases: TestCaseRow[];
  onFilterByAssignee?: (employeeId: string) => void;
}

export default function ProjectChartsAndReports({
  projects,
  workItems,
  sprints,
  staffOptions,
  releases,
  testCases,
  onFilterByAssignee,
}: ProjectChartsAndReportsProps) {
  const [selectedSprintId, setSelectedSprintId] = useState<string>(sprints[0]?.id || 'ALL');

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {
      BACKLOG: 0,
      TODO: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      QA_TESTING: 0,
      BLOCKED: 0,
      DONE: 0,
    };
    workItems.forEach((w) => {
      const k = w.status === 'ACCEPTED' ? 'DONE' : w.status;
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, [workItems]);

  const totalItems = Math.max(1, workItems.length);

  // Cycle Burndown curve (Ideal vs Actual across 10 intervals)
  const burndownPoints = useMemo(() => {
    const items =
      selectedSprintId === 'ALL'
        ? workItems
        : workItems.filter((w) => w.sprintId === selectedSprintId);
    const totalPts = Math.max(
      10,
      items.reduce((sum, w) => sum + (Number(w.storyPoints) || 1), 0)
    );
    const donePts = items
      .filter((w) => ['DONE', 'ACCEPTED'].includes(w.status))
      .reduce((sum, w) => sum + (Number(w.storyPoints) || 1), 0);
    const remaining = Math.max(0, totalPts - donePts);

    const steps = 8;
    const ideal = Array.from({ length: steps + 1 }, (_, i) => Math.round(totalPts * (1 - i / steps)));
    const actual = Array.from({ length: steps + 1 }, (_, i) => {
      const progress = i / steps;
      const val = totalPts - (totalPts - remaining) * Math.pow(progress, 0.85);
      return Math.round(val);
    });
    return { totalPts, remaining, donePts, ideal, actual };
  }, [workItems, selectedSprintId]);

  // Velocity per sprint
  const velocityBars = useMemo(() => {
    return sprints.slice(0, 6).map((sp) => {
      const items = workItems.filter((w) => w.sprintId === sp.id);
      const planned = items.reduce((s, w) => s + (Number(w.storyPoints) || 1), 0);
      const completed = items
        .filter((w) => ['DONE', 'ACCEPTED'].includes(w.status))
        .reduce((s, w) => s + (Number(w.storyPoints) || 1), 0);
      return { name: sp.name, planned, completed };
    });
  }, [sprints, workItems]);

  // Workload per member
  const workloadRows = useMemo(() => {
    return staffOptions
      .map((s) => {
        const assigned = workItems.filter(
          (w) => w.assigneeId === s.id && !['DONE', 'ACCEPTED', 'ARCHIVED'].includes(w.status)
        );
        const pts = assigned.reduce((sum, w) => sum + (Number(w.storyPoints) || 2), 0);
        return { id: s.id, name: s.legalName, openCount: assigned.length, points: pts };
      })
      .filter((r) => r.openCount > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 8);
  }, [staffOptions, workItems]);

  // QA pass rate
  const qaStats = useMemo(() => {
    const pass = testCases.filter((t) => t.lastRunStatus === 'PASS').length;
    const fail = testCases.filter((t) => t.lastRunStatus === 'FAIL').length;
    const blocked = testCases.filter((t) => t.lastRunStatus === 'BLOCKED').length;
    const total = testCases.length;
    const passRate = total > 0 ? Math.round((pass / total) * 100) : 100;
    return { pass, fail, blocked, total, passRate };
  }, [testCases]);

  const handleExportCsv = () => {
    const headers = ['ItemKey', 'Title', 'Status', 'Priority', 'Type', 'Project', 'Assignee', 'DueDate', 'Points'];
    const rows = workItems.map((w) => [
      w.itemKey,
      `"${String(w.title || '').replace(/"/g, '""')}"`,
      w.status,
      w.priority,
      w.itemType,
      w.project?.projectCode || '',
      w.assignee?.legalName || 'Unassigned',
      w.dueDate || '',
      w.storyPoints ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bems-projects-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build SVG polyline points for burndown
  const chartW = 380;
  const chartH = 140;
  const toSvgPoints = (arr: number[], maxVal: number) =>
    arr
      .map((v, idx) => {
        const x = 20 + (idx / Math.max(1, arr.length - 1)) * (chartW - 40);
        const y = chartH - 16 - (v / Math.max(1, maxVal)) * (chartH - 30);
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-orange-600" />
          <h3 className="text-sm font-bold text-slate-900">Reports & Engineering Analytics</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedSprintId}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">All Work Items</option>
            {sprints.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 text-orange-600" /> Export CSV
          </button>
        </div>
      </div>

      {/* Top KPI Graphics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500">Completion Rate</div>
          <div className="mt-1 text-2xl font-black text-slate-900">
            {Math.round((statusBreakdown.DONE / totalItems) * 100)}%
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${Math.round((statusBreakdown.DONE / totalItems) * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500">Blocked Issues</div>
          <div className="mt-1 text-2xl font-black text-red-600">{statusBreakdown.BLOCKED}</div>
          <div className="mt-1 text-xs text-slate-500">Across {projects.length} projects</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500">QA Pass Rate</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{qaStats.passRate}%</div>
          <div className="mt-1 text-xs text-slate-500">
            {qaStats.pass} pass · {qaStats.fail} fail ({qaStats.total} cases)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500">Deployed Releases</div>
          <div className="mt-1 text-2xl font-black text-orange-600">
            {releases.filter((r) => ['DEPLOYED', 'VERIFIED', 'CLOSED'].includes(r.status)).length}
          </div>
          <div className="mt-1 text-xs text-slate-500">{releases.length} total tracked releases</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cycle Burndown SVG */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-600" />
              <h4 className="text-sm font-bold text-slate-900">Cycle Burndown (Story Points)</h4>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-300" /> Ideal
              </span>
              <span className="inline-flex items-center gap-1 text-orange-700">
                <span className="h-2 w-2 rounded-full bg-orange-600" /> Actual ({burndownPoints.remaining} pts left)
              </span>
            </div>
          </div>

          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-40">
            <line x1="20" y1={chartH - 16} x2={chartW - 20} y2={chartH - 16} stroke="#e2e8f0" strokeWidth="1" />
            <polyline
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="2"
              strokeDasharray="4 4"
              points={toSvgPoints(burndownPoints.ideal, burndownPoints.totalPts)}
            />
            <polyline
              fill="none"
              stroke="#ea580c"
              strokeWidth="2.5"
              points={toSvgPoints(burndownPoints.actual, burndownPoints.totalPts)}
            />
          </svg>
        </div>

        {/* Velocity Bar Chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-bold text-slate-900">Cycle Velocity (Planned vs Completed)</h4>
          </div>
          {velocityBars.length === 0 ? (
            <p className="text-xs text-slate-500">Create sprints/cycles and assign issues to view velocity bars.</p>
          ) : (
            <div className="space-y-2.5 pt-1">
              {velocityBars.map((b) => {
                const maxV = Math.max(1, ...velocityBars.map((x) => Math.max(x.planned, x.completed)));
                return (
                  <div key={b.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700 truncate">{b.name}</span>
                      <span className="text-slate-500">
                        {b.completed} / {b.planned} pts
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.round((b.completed / maxV) * 100)}%` }}
                      />
                      <div
                        className="h-full bg-slate-300"
                        style={{ width: `${Math.max(0, Math.round(((b.planned - b.completed) / maxV) * 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status Distribution Stacked Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-bold text-slate-900">Issue Pipeline Distribution</h4>
          </div>
          <div className="h-5 w-full rounded-full overflow-hidden flex bg-slate-100">
            {[
              { k: 'BACKLOG', c: '#94a3b8' },
              { k: 'TODO', c: '#64748b' },
              { k: 'IN_PROGRESS', c: '#f59e0b' },
              { k: 'IN_REVIEW', c: '#6366f1' },
              { k: 'QA_TESTING', c: '#0284c7' },
              { k: 'BLOCKED', c: '#dc2626' },
              { k: 'DONE', c: '#10b981' },
            ].map((seg) => {
              const pct = (statusBreakdown[seg.k] / totalItems) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={seg.k}
                  title={`${seg.k}: ${statusBreakdown[seg.k]}`}
                  style={{ width: `${pct}%`, backgroundColor: seg.c }}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
            {Object.entries(statusBreakdown).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 flex justify-between">
                <span className="font-semibold text-slate-600">{k.replace(/_/g, ' ')}</span>
                <span className="font-bold text-slate-900">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Clickable Workload Capacity Heatmap */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Team Workload Distribution (Click to Filter)</h4>
          {workloadRows.length === 0 ? (
            <p className="text-xs text-slate-500">No active assigned issues yet.</p>
          ) : (
            <div className="space-y-2">
              {workloadRows.map((r) => {
                const pct = Math.min(100, Math.round((r.points / 30) * 100));
                const barColor = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-orange-500';
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onFilterByAssignee && onFilterByAssignee(r.id)}
                    className="w-full text-left space-y-1 rounded-lg p-1.5 hover:bg-slate-50 transition"
                  >
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-800">{r.name}</span>
                      <span className="text-slate-500">
                        {r.openCount} issues · {r.points} pts
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

