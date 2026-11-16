'use client';

import React from 'react';
import { DollarSign, Users, Award, AlertTriangle, CalendarOff } from 'lucide-react';
import { AssigneeAvatarChip } from './pmUiPrimitives';

interface ProjectEcosystemSectionProps {
  ecosystem: any;
  projects: any[];
  onOpenProjectHub: (project: any) => void;
  onFilterByAssignee: (employeeId: string) => void;
}

const fmtNgn = (n: number) =>
  `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default function ProjectEcosystemSection({
  ecosystem,
  projects,
  onOpenProjectHub,
  onFilterByAssignee,
}: ProjectEcosystemSectionProps) {
  const projectFinance: any[] = ecosystem?.projectFinance || [];
  const staffScorecards: any[] = ecosystem?.staffScorecards || [];
  const leaves: any[] = ecosystem?.leaves || [];

  const totalBudget = projectFinance.reduce((s, p) => s + Number(p.budgetNgn || 0), 0);
  const totalCommitted = projectFinance.reduce((s, p) => s + Number(p.committedNgn || 0), 0);
  const totalDisbursed = projectFinance.reduce((s, p) => s + Number(p.disbursedNgn || 0), 0);
  const overBurning = projectFinance.filter((p) => p.burnVariance >= 20).length;

  return (
    <div className="space-y-5">
      {/* Top Ecosystem KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500">
            <DollarSign className="h-3.5 w-3.5 text-orange-600" /> Approved Project Budgets
          </div>
          <div className="mt-1 text-xl font-black text-slate-900">{fmtNgn(totalBudget)}</div>
          <div className="mt-1 text-xs text-slate-500">Committed: {fmtNgn(totalCommitted)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Disbursed to Projects
          </div>
          <div className="mt-1 text-xl font-black text-emerald-700">{fmtNgn(totalDisbursed)}</div>
          <div className="mt-1 text-xs text-slate-500">Live from BEMS Finance</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Over-Burn Alerts
          </div>
          <div className="mt-1 text-xl font-black text-amber-700">{overBurning}</div>
          <div className="mt-1 text-xs text-slate-500">Spend % &gt; Delivery % by 20%+</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500">
            <CalendarOff className="h-3.5 w-3.5 text-blue-600" /> Staff on Leave (14d)
          </div>
          <div className="mt-1 text-xl font-black text-slate-900">{leaves.length}</div>
          <div className="mt-1 text-xs text-slate-500">Live from HR Leave Requests</div>
        </div>
      </div>

      {/* Finance vs. Delivery Earned-Value Matrix */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Finance vs. Delivery Matrix (Earned Value)</h3>
            <p className="text-xs text-slate-500">Click any project to open its full Hub, raise fund requests, or inspect expenditures.</p>
          </div>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
              <th className="py-2.5 px-4">Project</th>
              <th className="py-2.5 px-4">Budget</th>
              <th className="py-2.5 px-4">Committed / Disbursed</th>
              <th className="py-2.5 px-4">Budget Burn % vs Work Done %</th>
              <th className="py-2.5 px-4">Linked KPI</th>
              <th className="py-2.5 px-4">Accountability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projectFinance.map((pf) => {
              const projObj = projects.find((p) => p.id === pf.projectId);
              const isOverBurn = pf.burnVariance >= 20;
              return (
                <tr
                  key={pf.projectId}
                  onClick={() => projObj && onOpenProjectHub(projObj)}
                  className="hover:bg-orange-50/40 cursor-pointer"
                >
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-slate-900">
                      <span className="font-mono text-orange-700 mr-1.5">{pf.projectCode}</span>
                      {pf.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{pf.organizationName}</div>
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{fmtNgn(pf.budgetNgn)}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-slate-900">{fmtNgn(pf.committedNgn)}</div>
                    <div className="text-[10px] text-emerald-700">Paid: {fmtNgn(pf.disbursedNgn)}</div>
                  </td>
                  <td className="py-2.5 px-4 min-w-[220px]">
                    <div className="flex justify-between text-[11px] font-semibold mb-1">
                      <span className={isOverBurn ? 'text-red-600 font-bold' : 'text-slate-600'}>
                        Burn {pf.budgetBurnPct}%
                      </span>
                      <span className="text-emerald-700">Done {pf.workCompletionPct}%</span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isOverBurn ? 'bg-red-500' : 'bg-orange-500'}`}
                          style={{ width: `${Math.min(100, pf.budgetBurnPct)}%` }}
                        />
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, pf.workCompletionPct)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    {pf.kpiDefinition ? (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        {pf.kpiDefinition.title}
                      </span>
                    ) : (
                      <span className="text-slate-400">Not linked</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    {pf.pendingAccountability > 0 ? (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        {pf.pendingAccountability} pending
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">Clear</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Staff Delivery Performance & Leave/Attendance Radar */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
          <Award className="h-4 w-4 text-orange-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">Staff Delivery Scorecards, Attendance &amp; Leave Radar</h3>
            <p className="text-xs text-slate-500">Live delivery metrics feeding BEMS HR Performance &amp; KPIs. Click a row to view their issues.</p>
          </div>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
              <th className="py-2.5 px-4">Staff Member</th>
              <th className="py-2.5 px-4">Today&apos;s Status / Leave</th>
              <th className="py-2.5 px-4">Open Load</th>
              <th className="py-2.5 px-4">Shipped</th>
              <th className="py-2.5 px-4">On-Time Rate</th>
              <th className="py-2.5 px-4">Logged Hrs</th>
              <th className="py-2.5 px-4">HR Appraisal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staffScorecards.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Assign work items to staff to populate live delivery scorecards.
                </td>
              </tr>
            ) : (
              staffScorecards.map((st) => (
                <tr
                  key={st.employeeId}
                  onClick={() => onFilterByAssignee(st.employeeId)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="py-2.5 px-4 flex items-center gap-2">
                    <AssigneeAvatarChip name={st.legalName} size={24} />
                    <div>
                      <div className="font-bold text-slate-900">{st.legalName}</div>
                      <div className="text-[10px] text-slate-500">{st.jobTitle}</div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                        st.attendanceStatus === 'ON_LEAVE'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : st.attendanceStatus === 'PRESENT'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      {st.attendanceStatus.replace(/_/g, ' ')}
                    </span>
                    {st.upcomingLeaves?.length > 0 && (
                      <div className="text-[10px] text-blue-700 mt-0.5">
                        Leave: {st.upcomingLeaves[0].startDate} → {st.upcomingLeaves[0].endDate}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800">
                    {st.openTasks} tasks ({st.openPoints} pts)
                    {st.overdueOpenTasks > 0 && (
                      <span className="ml-1 text-red-600 font-bold">· {st.overdueOpenTasks} overdue</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-emerald-700">
                    {st.completedTasks} ({st.completedPoints} pts)
                  </td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">{st.onTimeRate}%</td>
                  <td className="py-2.5 px-4 text-slate-700">{st.loggedHours.toFixed(1)}h</td>
                  <td className="py-2.5 px-4">
                    {st.latestEval ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                        {st.latestEval.rating || st.latestEval.finalScore}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

