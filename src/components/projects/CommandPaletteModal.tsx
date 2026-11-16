'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, FolderKanban, Sparkles, DollarSign, Layers, X } from 'lucide-react';
import type { ProjectSectionId, SavedViewRow, TeamRow } from './pmTypes';

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  projects: any[];
  workItems: any[];
  teams: TeamRow[];
  savedViews: SavedViewRow[];
  onNavigateSection: (sec: ProjectSectionId) => void;
  onOpenProjectHub: (project: any) => void;
  onOpenWorkItem: (item: any) => void;
  onOpenNewIssue: () => void;
  onOpenNewProject: () => void;
}

export default function CommandPaletteModal({
  open,
  onClose,
  projects,
  workItems,
  teams,
  savedViews,
  onNavigateSection,
  onOpenProjectHub,
  onOpenWorkItem,
  onOpenNewIssue,
  onOpenNewProject,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions = [
      { id: 'act-issue', label: 'Create New Issue', hint: 'Quick-create modal', icon: Plus, run: onOpenNewIssue },
      { id: 'act-proj', label: 'Create New Project', hint: 'Template-driven', icon: FolderKanban, run: onOpenNewProject },
      {
        id: 'act-eco',
        label: 'Open Ecosystem Intelligence (Finance, Staff & KPIs)',
        hint: 'Cross-ERP',
        icon: DollarSign,
        run: () => onNavigateSection('ecosystem' as ProjectSectionId),
      },
      {
        id: 'act-road',
        label: 'Open Timeline & Gantt Roadmap',
        hint: 'Schedule',
        icon: Layers,
        run: () => onNavigateSection('roadmaps'),
      },
      {
        id: 'act-rep',
        label: 'Open Reports & Burndown Analytics',
        hint: 'Charts & CSV',
        icon: Sparkles,
        run: () => onNavigateSection('reports'),
      },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));

    const matchedProjects = projects
      .filter((p) => !q || p.title?.toLowerCase().includes(q) || p.projectCode?.toLowerCase().includes(q))
      .slice(0, 6);

    const matchedItems = workItems
      .filter((w) => !q || w.title?.toLowerCase().includes(q) || w.itemKey?.toLowerCase().includes(q))
      .slice(0, 8);

    const matchedTeams = teams
      .filter((t) => !q || t.name?.toLowerCase().includes(q) || t.key?.toLowerCase().includes(q))
      .slice(0, 4);

    const matchedViews = savedViews
      .filter((v) => !q || v.name?.toLowerCase().includes(q))
      .slice(0, 4);

    return { actions, matchedProjects, matchedItems, matchedTeams, matchedViews };
  }, [query, projects, workItems, teams, savedViews, onNavigateSection, onOpenNewIssue, onOpenNewProject]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/35 pt-20 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Jump to project, issue (BEMS-101), team, or action..."
            className="flex-1 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2 space-y-3 text-xs">
          {results.actions.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Quick Actions
              </div>
              {results.actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      a.run();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-orange-50 hover:text-orange-900"
                  >
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                      <Icon className="h-3.5 w-3.5 text-orange-600" /> {a.label}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">{a.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {results.matchedProjects.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Project Workspaces
              </div>
              {results.matchedProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onOpenProjectHub(p);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                >
                  <span className="font-semibold text-slate-800 truncate">
                    <span className="font-mono text-orange-700 mr-2">{p.projectCode}</span>
                    {p.title}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{p.status}</span>
                </button>
              ))}
            </div>
          )}

          {results.matchedItems.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Issues &amp; Deliverables
              </div>
              {results.matchedItems.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    onOpenWorkItem(w);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                >
                  <span className="font-semibold text-slate-800 truncate">
                    <span className="font-mono text-slate-500 mr-2">{w.itemKey}</span>
                    {w.title}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{w.status}</span>
                </button>
              ))}
            </div>
          )}

          {(results.matchedTeams.length > 0 || results.matchedViews.length > 0) && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Teams &amp; Views
              </div>
              {results.matchedTeams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onNavigateSection('teams');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                >
                  <span className="font-semibold text-slate-800">
                    {t.key} · {t.name}
                  </span>
                  <span className="text-[10px] text-slate-400">Team</span>
                </button>
              ))}
              {results.matchedViews.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onNavigateSection('views');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                >
                  <span className="font-semibold text-slate-800">{v.name}</span>
                  <span className="text-[10px] text-slate-400">Saved View</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

