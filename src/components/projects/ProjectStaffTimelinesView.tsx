'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Crown,
  DollarSign,
  Plus,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { AssigneeAvatarChip } from '@/components/projects/pmUiPrimitives';

interface ProjectStaffTimelinesViewProps {
  projects: any[];
  staffOptions: Array<{ id: string; legalName: string; jobTitle?: string | null; employeeNumber?: string | null }>;
  isExecutive: boolean;
  onRefresh: () => Promise<void>;
}

const SLA_STYLES: Record<string, string> = {
  ON_TRACK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  AT_RISK: 'border-amber-200 bg-amber-50 text-amber-800',
  OVERDUE: 'border-rose-200 bg-rose-50 text-rose-700',
  COMPLETED_ON_TIME: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  COMPLETED_LATE: 'border-rose-300 bg-rose-100 text-rose-800',
};

const ROLE_OPTIONS = [
  'TEAM_LEAD',
  'DEVELOPER',
  'OPERATIONS_OFFICER',
  'MEDIA_PRODUCER',
  'QA_ENGINEER',
  'DESIGNER',
  'PRODUCT_OWNER',
  'PROJECT_MEMBER',
];

function computeDaysDelta(targetDate?: string | null): { text: string; overdue: boolean } {
  if (!targetDate) return { text: 'No deadline set', overdue: false };
  const today = new Date().toISOString().split('T')[0];
  const diff = Math.round((new Date(targetDate).getTime() - new Date(today).getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { text: 'Due today', overdue: false };
  return { text: `${diff}d left`, overdue: false };
}

export default function ProjectStaffTimelinesView({
  projects,
  staffOptions,
  isExecutive,
  onRefresh,
}: ProjectStaffTimelinesViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [assignEmpId, setAssignEmpId] = useState('');
  const [assignRole, setAssignRole] = useState('DEVELOPER');
  const [assignStart, setAssignStart] = useState(() => new Date().toISOString().split('T')[0]);
  const [assignTarget, setAssignTarget] = useState('');
  const [assignAlloc, setAssignAlloc] = useState(100);
  const [busy, setBusy] = useState(false);

  const [deductionModalMember, setDeductionModalMember] = useState<any | null>(null);
  const [deductionAmountNgn, setDeductionAmountNgn] = useState('5000');
  const [deductionReason, setDeductionReason] = useState('');

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const members = useMemo(() => activeProject?.members || [], [activeProject]);

  const summary = useMemo(() => {
    const total = members.length;
    const overdue = members.filter((m: any) => m.slaStatus === 'OVERDUE' || m.slaStatus === 'COMPLETED_LATE').length;
    const completed = members.filter((m: any) => String(m.slaStatus).startsWith('COMPLETED')).length;
    const flagged = members.filter((m: any) => m.salaryDeductionFlagged).length;
    return { total, overdue, completed, flagged };
  }, [members]);

  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject?.id || !assignEmpId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/projects/staff-timelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          employeeId: assignEmpId,
          projectRole: assignRole,
          assignedStartDate: assignStart,
          targetCompletionDate: assignTarget || null,
          allocationPercent: assignAlloc,
        }),
      });
      if (res.ok) {
        setAssignEmpId('');
        setAssignTarget('');
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateTimeline = async (memberId: string, patch: Record<string, any>) => {
    setBusy(true);
    try {
      await fetch('/api/projects/staff-timelines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, ...patch }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/projects/staff-timelines?memberId=${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleFlagDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductionModalMember) return;
    setBusy(true);
    try {
      await fetch('/api/projects/staff-timelines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: deductionModalMember.id,
          action: 'FLAG_DEDUCTION',
          deductionAmountNgn: Number(deductionAmountNgn || 0),
          reason: deductionReason.trim(),
        }),
      });
      setDeductionModalMember(null);
      setDeductionReason('');
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Project Selector & Team Lead Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Select Project / Sub-Project
            </label>
            <select
              value={activeProject?.id || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-400 focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.parentProject ? `↳ ${p.parentProject.projectCode} / ` : ''}
                  {p.projectCode} · {p.title}
                </option>
              ))}
            </select>
          </div>
          {activeProject && (
            <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
              <Crown className="h-4 w-4 text-orange-600" />
              <div className="text-xs">
                <div className="text-[10px] font-bold uppercase text-orange-700">Project Team Leader</div>
                <div className="font-bold text-slate-900">
                  {activeProject.teamLead?.legalName || activeProject.manager?.legalName || 'Not assigned'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-700">
            Assigned Staff: {summary.total}
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700">
            Completed: {summary.completed}
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700">
            Overdue / Late: {summary.overdue}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 font-bold text-amber-800">
            Deduction Flagged: {summary.flagged}
          </div>
        </div>
      </div>

      {/* Assign Staff & Set Completion Timeline */}
      {activeProject && (
        <form
          onSubmit={handleAssignStaff}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Staff Member</label>
            <select
              required
              value={assignEmpId}
              onChange={(e) => setAssignEmpId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900"
            >
              <option value="">Select staff...</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.legalName} {s.jobTitle ? `(${s.jobTitle})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Project Role</label>
            <select
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Date</label>
            <input
              type="date"
              value={assignStart}
              onChange={(e) => setAssignStart(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Completion Deadline</label>
            <input
              type="date"
              required
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Assign Timeline
          </button>
        </form>
      )}

      {/* Per-Staff Timeline & SLA Register */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4">Staff Member</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Start Date</th>
              <th className="py-3 px-4">Completion Deadline</th>
              <th className="py-3 px-4">SLA & Variance</th>
              <th className="py-3 px-4">Performance / Payroll Impact</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {members.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  No staff assigned to this project yet. Assign staff and set their completion deadlines above.
                </td>
              </tr>
            ) : (
              members.map((m: any) => {
                const delta = computeDaysDelta(m.targetCompletionDate);
                return (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <AssigneeAvatarChip name={m.employee?.legalName || 'Staff'} size={28} />
                        <div>
                          <div className="font-bold text-slate-900">{m.employee?.legalName}</div>
                          <div className="text-[11px] text-slate-500">{m.employee?.jobTitle || m.employee?.employeeNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={m.projectRole}
                        onChange={(e) => handleUpdateTimeline(m.id, { projectRole: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="date"
                        value={m.assignedStartDate || ''}
                        onChange={(e) => handleUpdateTimeline(m.id, { assignedStartDate: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="date"
                        value={m.targetCompletionDate || ''}
                        onChange={(e) => handleUpdateTimeline(m.id, { targetCompletionDate: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            SLA_STYLES[m.slaStatus] || 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          {m.slaStatus === 'OVERDUE' || m.slaStatus === 'COMPLETED_LATE' ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : m.slaStatus.startsWith('COMPLETED') ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {m.slaStatus.replace(/_/g, ' ')}
                        </span>
                        {!m.completedAt && (
                          <span className={`text-[11px] font-semibold ${delta.overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                            {delta.text}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-[240px]">
                      {m.salaryDeductionFlagged ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800">
                          <div className="font-bold">
                            Deduction Flagged: ₦{(Number(m.proposedDeductionMinor || 0) / 100).toLocaleString()}
                          </div>
                          {m.performanceImpactNote && (
                            <div className="text-[10px] text-rose-700 line-clamp-2 mt-0.5">{m.performanceImpactNote}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">No penalty flagged</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {!m.completedAt && (
                          <button
                            type="button"
                            onClick={() => handleUpdateTimeline(m.id, { action: 'MARK_COMPLETED' })}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                            title="Mark staff deliverable completed"
                          >
                            <UserCheck className="h-3.5 w-3.5" /> Done
                          </button>
                        )}
                        {isExecutive && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeductionModalMember(m);
                              setDeductionReason(
                                `Missed project completion deadline (${m.targetCompletionDate || 'N/A'}) on ${activeProject.projectCode}`
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                            title="Flag for performance review & payroll deduction"
                          >
                            <DollarSign className="h-3.5 w-3.5" /> SLA Penalty
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-rose-600 hover:border-rose-200"
                          title="Remove from project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Payroll Deduction & Performance Modal */}
      {deductionModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleFlagDeduction}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
          >
            <div className="flex items-center gap-2 text-rose-700">
              <CalendarClock className="h-5 w-5" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Flag SLA Breach for Performance & Payroll Deduction
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              Staff: <strong>{deductionModalMember.employee?.legalName}</strong> · Creates a{' '}
              <span className="font-mono font-semibold">PROPOSED</span> deduction in Payroll for executive review.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Proposed Deduction Amount (NGN)</label>
              <input
                type="number"
                min={0}
                required
                value={deductionAmountNgn}
                onChange={(e) => setDeductionAmountNgn(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Performance & Audit Reason</label>
              <textarea
                rows={3}
                required
                value={deductionReason}
                onChange={(e) => setDeductionReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeductionModalMember(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Submit Payroll Flag
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

