'use client';

import React, { useState } from 'react';
import { LayoutGrid, List as ListIcon, Plus, ArrowRight, Sparkles, GitBranch, Crown, FolderTree } from 'lucide-react';
import { AssigneeAvatarChip, PriorityBars } from './pmUiPrimitives';

interface ProjectsDirectoryViewProps {
  projects: any[];
  workItems: any[];
  ecosystem: any;
  onOpenProjectHub: (project: any) => void;
  onPatchProject: (id: string, patch: Record<string, any>) => Promise<void>;
  onOpenNewProject: (parentProjectId?: string) => void;
  onSeedStarter?: () => Promise<void>;
  seeding?: boolean;
}

const HEALTH_STYLE: Record<string, string> = {
  ON_TRACK: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  AT_RISK: 'bg-amber-50 border-amber-200 text-amber-700',
  OFF_TRACK: 'bg-red-50 border-red-200 text-red-700',
  PENDING_REVIEW: 'bg-slate-100 border-slate-200 text-slate-600',
};

const fmtNgn = (n: number) =>
  `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default function ProjectsDirectoryView({
  projects,
  workItems,
  ecosystem,
  onOpenProjectHub,
  onPatchProject,
  onOpenNewProject,
  onSeedStarter,
  seeding,
}: ProjectsDirectoryViewProps) {
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filtered = projects.filter((p) => statusFilter === 'ALL' || p.status === statusFilter);
  const financeMap = new Map<string, any>(
    (ecosystem?.projectFinance || []).map((f: any) => [f.projectId, f])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'ACTIVE', 'APPROVED_PLANNED', 'DRAFT_PROPOSAL', 'COMPLETED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === st ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? `All Projects (${projects.length})` : st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setView('cards')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                view === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                view === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" /> Table
            </button>
          </div>
          <button
            type="button"
            onClick={() => onOpenNewProject()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> New Project
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-3">
          <div className="text-sm font-bold text-slate-900">No projects in this workspace yet</div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create a template-driven project or load realistic BEMS starter projects, cycles, issues, and releases in one click.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {onSeedStarter && (
              <button
                type="button"
                disabled={seeding}
                onClick={onSeedStarter}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                {seeding ? 'Loading Starter Workspace...' : 'Load BEMS Starter Workspace'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenNewProject()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
            >
              <Plus className="h-3.5 w-3.5" /> Create Blank / Template Project
            </button>
          </div>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const pItems = workItems.filter((w) => w.projectId === p.id);
            const doneCount = pItems.filter((w) => ['DONE', 'ACCEPTED'].includes(w.status)).length;
            const fin = financeMap.get(p.id);
            const hStyle = HEALTH_STYLE[p.healthStatus] || HEALTH_STYLE.ON_TRACK;

            return (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-orange-300 hover:shadow transition flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PriorityBars priority={p.priority} />
                      <span className="font-mono text-xs font-bold text-orange-700">{p.projectCode}</span>
                    </div>
                    <select
                      value={p.healthStatus}
                      onChange={(e) => onPatchProject(p.id, { healthStatus: e.target.value })}
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${hStyle}`}
                    >
                      <option value="ON_TRACK">On track</option>
                      <option value="AT_RISK">At risk</option>
                      <option value="OFF_TRACK">Off track</option>
                      <option value="PENDING_REVIEW">Pending</option>
                    </select>
                  </div>

                  <div>
                    {p.parentProject && (
                      <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        <FolderTree className="h-3 w-3 text-orange-600" />
                        Sub-project of {p.parentProject.projectCode}
                      </div>
                    )}
                    <h4
                      onClick={() => onOpenProjectHub(p)}
                      className="text-base font-extrabold text-slate-900 cursor-pointer hover:text-orange-700"
                    >
                      {p.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {p.description || `${p.methodology} · ${p.organization?.legalName || 'BEMS'}`}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(p.teamLead?.legalName || p.manager?.legalName) && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                          <Crown className="h-3 w-3" />
                          Lead: {p.teamLead?.legalName || p.manager?.legalName}
                        </span>
                      )}
                      {p.githubRepoUrl && (
                        <a
                          href={p.githubRepoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:border-orange-300"
                        >
                          <GitBranch className="h-3 w-3 text-orange-600" /> GitHub
                        </a>
                      )}
                      {(p.subProjects?.length || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          <FolderTree className="h-3 w-3" /> {p.subProjects.length} Sub-projects
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenNewProject(p.id)}
                        className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-orange-400 hover:text-orange-600"
                      >
                        <Plus className="h-2.5 w-2.5" /> Sub-project
                      </button>
                    </div>
                  </div>

                  {/* Delivery & Budget Burn Progress */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="text-slate-600">
                        Delivery ({doneCount}/{pItems.length} issues)
                      </span>
                      <span className="font-bold text-slate-900">{p.progressPercent || 0}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, p.progressPercent || 0)}%` }}
                      />
                    </div>
                    {fin && fin.budgetNgn > 0 && (
                      <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
                        <span>Budget: {fmtNgn(fin.budgetNgn)}</span>
                        <span className="font-semibold text-orange-700">Burn: {fin.budgetBurnPct}%</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    {p.manager?.legalName && <AssigneeAvatarChip name={p.manager.legalName} size={22} />}
                    <span className="text-[11px] font-medium text-slate-500">
                      {p.targetDate ? `Due ${p.targetDate}` : 'No target date'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenProjectHub(p)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition"
                  >
                    Open Hub <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-2.5 px-4">Project</th>
                <th className="py-2.5 px-4">Health</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Progress</th>
                <th className="py-2.5 px-4">Target Date</th>
                <th className="py-2.5 px-4">Workspace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-bold text-slate-900">
                    <span className="font-mono text-orange-700 mr-2">{p.projectCode}</span>
                    {p.title}
                  </td>
                  <td className="py-2.5 px-4">
                    <select
                      value={p.healthStatus}
                      onChange={(e) => onPatchProject(p.id, { healthStatus: e.target.value })}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                    >
                      <option value="ON_TRACK">On track</option>
                      <option value="AT_RISK">At risk</option>
                      <option value="OFF_TRACK">Off track</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-700">{p.status}</td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">{p.progressPercent || 0}%</td>
                  <td className="py-2.5 px-4">
                    <input
                      type="date"
                      value={p.targetDate || ''}
                      onChange={(e) => onPatchProject(p.id, { targetDate: e.target.value || null })}
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() => onOpenProjectHub(p)}
                      className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-orange-600"
                    >
                      Open Hub
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

