'use client';

import React from 'react';
import { Target, Layers, Plus } from 'lucide-react';

interface ProjectPortfoliosOkrViewProps {
  portfolios: any[];
  goals: any[];
  projects: any[];
  onOpenNewPortfolio: () => void;
  onOpenNewGoal: () => void;
  onOpenProjectHub: (project: any) => void;
  onRefresh: () => Promise<void>;
}

export default function ProjectPortfoliosOkrView({
  portfolios,
  goals,
  projects,
  onOpenNewPortfolio,
  onOpenNewGoal,
  onOpenProjectHub,
  onRefresh,
}: ProjectPortfoliosOkrViewProps) {
  const updateGoalProgress = async (id: string, currentValue: number) => {
    await fetch('/api/projects/governance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'UPDATE_GOAL', id, currentValue }),
    });
    await onRefresh();
  };

  const linkProjectToGoal = async (projectId: string, goalId: string) => {
    await fetch('/api/projects/governance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'LINK_PROJECT_GOAL', projectId, goalId: goalId || null }),
    });
    await onRefresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-orange-600" />
          <h3 className="text-sm font-bold text-slate-900">Portfolios &amp; Interactive OKR Tree</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenNewPortfolio}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> New Portfolio
          </button>
          <button
            type="button"
            onClick={onOpenNewGoal}
            className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> New Goal / OKR
          </button>
        </div>
      </div>

      {/* Interactive OKRs with Live Progress Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
            No strategic goals yet. Create an OKR to track live progress and link projects directly to company objectives.
          </div>
        ) : (
          goals.map((g) => {
            const pct = Math.min(100, Math.round((Number(g.currentValue || 0) / Math.max(1, Number(g.targetValue || 100))) * 100));
            const linkedProjects = projects.filter((p) => p.goalId === g.id);
            return (
              <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                      {g.measurementPeriod}
                    </span>
                    <h4 className="mt-1 text-sm font-extrabold text-slate-900">{g.title}</h4>
                  </div>
                  <span className="text-lg font-black text-emerald-700">
                    {g.currentValue}/{g.targetValue}
                    {g.unit}
                  </span>
                </div>

                {/* Interactive Slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={Number(g.targetValue || 100)}
                    value={Number(g.currentValue || 0)}
                    onChange={(e) => updateGoalProgress(g.id, Number(e.target.value))}
                    className="w-full accent-orange-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                    <span>Drag slider to update OKR progress</span>
                    <span>{pct}% complete</span>
                  </div>
                </div>

                {/* Linked Projects */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-slate-500">
                      Linked Projects ({linkedProjects.length})
                    </span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) linkProjectToGoal(e.target.value, g.id);
                      }}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold"
                    >
                      <option value="">+ Link Project...</option>
                      {projects
                        .filter((p) => p.goalId !== g.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.projectCode} · {p.title}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {linkedProjects.map((lp) => (
                      <button
                        key={lp.id}
                        type="button"
                        onClick={() => onOpenProjectHub(lp)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:border-orange-300"
                      >
                        {lp.projectCode} · {lp.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Portfolios */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-orange-600" />
          <h4 className="text-sm font-bold text-slate-900">Portfolios &amp; Strategic Programs ({portfolios.length})</h4>
        </div>
        {portfolios.length === 0 ? (
          <p className="text-xs text-slate-500">No portfolios yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {portfolios.map((pf) => (
              <div key={pf.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1">
                <div className="text-xs font-extrabold text-slate-900">{pf.name}</div>
                <p className="text-[11px] text-slate-500">{pf.description || 'Strategic program'}</p>
                <div className="text-[11px] font-bold text-orange-700 pt-1">{pf._count?.projects || 0} linked projects</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

