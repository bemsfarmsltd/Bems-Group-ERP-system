'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  DollarSign,
  Users,
  Award,
  GitBranch,
  Layers,
  Plus,
} from 'lucide-react';
import { IssueStatusIcon, PriorityBars, AssigneeAvatarChip } from './pmUiPrimitives';

interface ProjectHubViewProps {
  project: any;
  workItems: any[];
  milestones: any[];
  ecosystem: any;
  onClose: () => void;
  onSelectWorkItem: (item: any) => void;
  onPatchWorkItem: (id: string, patch: Record<string, any>) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const fmtNgn = (n: number) =>
  `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default function ProjectHubView({
  project,
  workItems,
  milestones,
  ecosystem,
  onClose,
  onSelectWorkItem,
  onPatchWorkItem,
  onRefresh,
}: ProjectHubViewProps) {
  const [tab, setTab] = useState<'issues' | 'finance' | 'staff' | 'kpi' | 'dependencies'>('issues');
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundForm, setFundForm] = useState({
    title: '',
    amountNgn: '',
    category: 'OPERATIONS',
    justification: '',
    deliverable: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const projItems = useMemo(
    () => workItems.filter((w) => w.projectId === project.id),
    [workItems, project.id]
  );

  const projFinance = useMemo(
    () => (ecosystem?.projectFinance || []).find((f: any) => f.projectId === project.id),
    [ecosystem, project.id]
  );

  const projExpenditures = useMemo(
    () => (ecosystem?.expenditures || []).filter((e: any) => e.projectId === project.id),
    [ecosystem, project.id]
  );

  const kpis: any[] = ecosystem?.kpis || [];
  const staffScorecards: any[] = ecosystem?.staffScorecards || [];
  const leaves: any[] = ecosystem?.leaves || [];
  const attendanceToday: Record<string, any> = ecosystem?.attendanceToday || {};

  // Dependency graph nodes & edges
  const depEdges = useMemo(() => {
    const edges: Array<{ fromKey: string; fromTitle: string; toKey: string; toTitle: string; type: string }> = [];
    projItems.forEach((w) => {
      (w.blocksLinks || []).forEach((lnk: any) => {
        if (lnk.targetItem) {
          edges.push({
            fromKey: w.itemKey,
            fromTitle: w.title,
            toKey: lnk.targetItem.itemKey,
            toTitle: lnk.targetItem.title,
            type: lnk.dependencyType,
          });
        }
      });
    });
    return edges;
  }, [projItems]);

  const raiseFundRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects/ecosystem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RAISE_PROJECT_EXPENDITURE',
          projectId: project.id,
          ...fundForm,
          amountNgn: Number(fundForm.amountNgn),
        }),
      });
      if (res.ok) {
        setShowFundModal(false);
        setFundForm({ title: '', amountNgn: '', category: 'OPERATIONS', justification: '', deliverable: '' });
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const linkKpi = async (kpiDefinitionId: string) => {
    await fetch('/api/projects/ecosystem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'LINK_PROJECT_KPI',
        projectId: project.id,
        kpiDefinitionId: kpiDefinitionId || null,
      }),
    });
    await onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Hub Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-orange-700">{project.projectCode}</span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold text-slate-600">{project.organization?.legalName}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {project.status}
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900 mt-0.5">{project.title}</h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowFundModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> Raise Project Fund Request
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {([
            { id: 'issues', label: `Issues (${projItems.length})`, icon: Layers },
            { id: 'finance', label: `Finance & Burn (${projExpenditures.length})`, icon: DollarSign },
            { id: 'staff', label: 'Staff & Availability', icon: Users },
            { id: 'kpi', label: 'Performance & KPIs', icon: Award },
            { id: 'dependencies', label: `Dependency Map (${depEdges.length})`, icon: GitBranch },
          ] as const).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  tab === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'issues' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-2.5 px-4">Key</th>
                <th className="py-2.5 px-4">Title</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4">Assignee</th>
                <th className="py-2.5 px-4">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projItems.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td
                    onClick={() => onSelectWorkItem(w)}
                    className="py-2.5 px-4 font-mono font-bold text-orange-700 cursor-pointer"
                  >
                    {w.itemKey}
                  </td>
                  <td onClick={() => onSelectWorkItem(w)} className="py-2.5 px-4 font-semibold text-slate-900 cursor-pointer">
                    {w.title}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="inline-flex items-center gap-1.5">
                      <IssueStatusIcon status={w.status} size={13} />
                      <select
                        value={w.status}
                        onChange={(e) => onPatchWorkItem(w.id, { status: e.target.value })}
                        className="bg-transparent text-xs font-semibold"
                      >
                        {['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'QA_TESTING', 'BLOCKED', 'DONE'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <PriorityBars priority={w.priority} />
                  </td>
                  <td className="py-2.5 px-4 text-slate-700">{w.assignee?.legalName || 'Unassigned'}</td>
                  <td className="py-2.5 px-4 text-slate-500">{w.dueDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'finance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-500">Approved Budget</div>
              <div className="mt-1 text-xl font-black text-slate-900">{fmtNgn(projFinance?.budgetNgn || 0)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-500">Committed Requests</div>
              <div className="mt-1 text-xl font-black text-orange-700">{fmtNgn(projFinance?.committedNgn || 0)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-500">Disbursed Cash</div>
              <div className="mt-1 text-xl font-black text-emerald-700">{fmtNgn(projFinance?.disbursedNgn || 0)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-500">Burn vs Delivery</div>
              <div className="mt-1 text-sm font-black text-slate-900">
                {projFinance?.budgetBurnPct || 0}% Spent · {projFinance?.workCompletionPct || 0}% Done
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-2.5 px-4">Request #</th>
                  <th className="py-2.5 px-4">Title</th>
                  <th className="py-2.5 px-4">Requested By</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Approval</th>
                  <th className="py-2.5 px-4">Payment</th>
                  <th className="py-2.5 px-4">Accountability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projExpenditures.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No fund requests linked to this project yet. Click &ldquo;Raise Project Fund Request&rdquo; above.
                    </td>
                  </tr>
                ) : (
                  projExpenditures.map((e: any) => (
                    <tr key={e.id}>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-700">{e.requestNumber}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{e.title}</td>
                      <td className="py-2.5 px-4 text-slate-600">{e.requester?.legalName}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{fmtNgn(Number(e.amountMinor || 0) / 100)}</td>
                      <td className="py-2.5 px-4 font-semibold">{e.approvalStatus}</td>
                      <td className="py-2.5 px-4 font-semibold">{e.paymentStatus}</td>
                      <td className="py-2.5 px-4 font-semibold">{e.accountabilityStatus}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'staff' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Project Team, Attendance &amp; Leave Availability</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(project.members || []).map((m: any) => {
              const att = attendanceToday[m.employeeId];
              const empLeave = leaves.find((l: any) => l.employeeId === m.employeeId);
              return (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <AssigneeAvatarChip name={m.employee?.legalName || 'Member'} size={28} />
                    <div>
                      <div className="text-xs font-bold text-slate-900">{m.employee?.legalName}</div>
                      <div className="text-[11px] text-slate-500">
                        {m.projectRole} · {m.allocationPercent}% allocation
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {empLeave ? (
                      <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        Leave {empLeave.startDate} → {empLeave.endDate}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {att?.status || 'AVAILABLE'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'kpi' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Link Project to Strategic BEMS KPI</h4>
              <p className="text-xs text-slate-500">Connects project milestones and completion directly to HR Performance KPIs.</p>
            </div>
            <select
              value={project.kpiDefinitionId || ''}
              onChange={(e) => linkKpi(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
            >
              <option value="">No KPI linked</option>
              {kpis.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title} ({k.targetMetric})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {milestones.filter((m) => m.projectId === project.id).map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="font-bold text-slate-900">{m.title}</div>
                <div className="text-slate-500 mt-0.5">Weight: {m.weightPercent}% · {m.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'dependencies' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Work Item Dependency &amp; Blocker Map</h4>
          {depEdges.length === 0 ? (
            <p className="text-xs text-slate-500">
              No dependencies linked in this project yet. Open any work item to add &ldquo;Blocks / Blocked By&rdquo; links.
            </p>
          ) : (
            <div className="space-y-2">
              {depEdges.map((edge, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <span className="rounded-lg border border-orange-200 bg-white px-2.5 py-1 font-bold text-slate-900">
                    <span className="font-mono text-orange-700 mr-1">{edge.fromKey}</span>
                    {edge.fromTitle}
                  </span>
                  <span className="rounded bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    {edge.type.replace(/_/g, ' ')} →
                  </span>
                  <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-900">
                    <span className="font-mono text-slate-600 mr-1">{edge.toKey}</span>
                    {edge.toTitle}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <form onSubmit={raiseFundRequest} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Raise Project Fund Request ({project.projectCode})</h4>
            <input
              required
              value={fundForm.title}
              onChange={(e) => setFundForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Expense title (e.g. Server hardware or field deployment)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                type="number"
                min={1}
                value={fundForm.amountNgn}
                onChange={(e) => setFundForm((p) => ({ ...p, amountNgn: e.target.value }))}
                placeholder="Amount (NGN)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <select
                value={fundForm.category}
                onChange={(e) => setFundForm((p) => ({ ...p, category: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              >
                <option value="OPERATIONS">OPERATIONS</option>
                <option value="IT_SOFTWARE">IT &amp; SOFTWARE</option>
                <option value="ASSET">ASSET / HARDWARE</option>
                <option value="TRAVEL">TRAVEL</option>
                <option value="LOGISTICS">LOGISTICS</option>
                <option value="MARKETING">MARKETING</option>
              </select>
            </div>
            <input
              required
              value={fundForm.deliverable}
              onChange={(e) => setFundForm((p) => ({ ...p, deliverable: e.target.value }))}
              placeholder="Expected deliverable / milestone output"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <textarea
              required
              rows={2}
              value={fundForm.justification}
              onChange={(e) => setFundForm((p) => ({ ...p, justification: e.target.value }))}
              placeholder="Business justification..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowFundModal(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white">
                {submitting ? 'Submitting...' : 'Submit to GMD Approval'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

