'use client';

import React, { useState } from 'react';
import { Users, Repeat, Settings, Plus, Play, Trash2, Download, Shield } from 'lucide-react';
import { AssigneeAvatarChip } from './pmUiPrimitives';
import type { LabelRow, LoopRuleRow, SlaRuleRow, TeamRow } from './pmTypes';

interface ProjectTeamsLoopsSettingsProps {
  section: 'teams' | 'loops' | 'settings';
  teams: TeamRow[];
  labels: LabelRow[];
  slaRules: SlaRuleRow[];
  automations: LoopRuleRow[];
  workflows: any[];
  workItems: any[];
  staffOptions: any[];
  onRefresh: () => Promise<void>;
}

const LOOP_TEMPLATES = [
  {
    name: 'Project hygiene',
    triggerType: 'SCHEDULED_WEEKLY',
    actionType: 'PROJECT_HYGIENE_CHECK',
    description: 'Reviews active projects for overdue target dates and flags stale health statuses.',
    cadence: 'Weekly → Flag AT_RISK',
  },
  {
    name: 'Weekly wrap',
    triggerType: 'SCHEDULED_WEEKLY',
    actionType: 'WEEKLY_WRAP_DIGEST',
    description: 'Summarizes completed deliverables across teams for executive review.',
    cadence: 'Weekly → Compile digest',
  },
  {
    name: 'Escalate overdue priority',
    triggerType: 'SCHEDULED_DAILY',
    actionType: 'ESCALATE_OVERDUE_PRIORITY',
    description: 'Raises issue priority to URGENT when due dates pass without completion.',
    cadence: 'Daily → Raise priority',
  },
  {
    name: 'Triage queue routing',
    triggerType: 'ON_ISSUE_CREATED',
    actionType: 'TRIAGE_ROUTING',
    description: 'Evaluates new backlog/todo requests against team ownership and SLA rules.',
    cadence: 'Triage → Route & tag',
  },
];

export default function ProjectTeamsLoopsSettings({
  section,
  teams,
  labels,
  slaRules,
  automations,
  workflows,
  workItems,
  onRefresh,
}: ProjectTeamsLoopsSettingsProps) {
  const [settingsTab, setSettingsTab] = useState<'cycles' | 'labels' | 'slas' | 'workflows' | 'import_export'>('cycles');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: '', key: '', description: '', color: '#ea580c' });
  const [labelForm, setLabelForm] = useState({ name: '', color: '#3b82f6', scope: 'ISSUE' });
  const [slaForm, setSlaForm] = useState({ name: '', priority: 'URGENT', responseMinutes: '60', resolutionMinutes: '1440' });
  const [loopFeedback, setLoopFeedback] = useState('');

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/projects/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CREATE_TEAM', ...teamForm }),
    });
    setShowTeamModal(false);
    setTeamForm({ name: '', key: '', description: '', color: '#ea580c' });
    await onRefresh();
  };

  const toggleTeamCycleSetting = async (team: TeamRow, field: string, value: boolean) => {
    const current = (() => {
      try {
        return JSON.parse(team.cycleAutomationJson || '{}');
      } catch {
        return {};
      }
    })();
    if (field === 'cyclesEnabled') {
      await fetch('/api/projects/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: team.id, cyclesEnabled: value }),
      });
    } else {
      await fetch('/api/projects/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: team.id, cycleAutomationJson: { ...current, [field]: value } }),
      });
    }
    await onRefresh();
  };

  const createLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labelForm.name.trim()) return;
    await fetch('/api/projects/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CREATE_LABEL', ...labelForm }),
    });
    setLabelForm({ name: '', color: '#3b82f6', scope: 'ISSUE' });
    await onRefresh();
  };

  const createSla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slaForm.name.trim()) return;
    await fetch('/api/projects/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CREATE_SLA_RULE', ...slaForm }),
    });
    setSlaForm({ name: '', priority: 'URGENT', responseMinutes: '60', resolutionMinutes: '1440' });
    await onRefresh();
  };

  const activateLoopTemplate = async (tpl: (typeof LOOP_TEMPLATES)[number]) => {
    await fetch('/api/projects/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_LOOP',
        name: tpl.name,
        triggerType: tpl.triggerType,
        actionType: tpl.actionType,
      }),
    });
    await onRefresh();
  };

  const runLoopNow = async (id: string) => {
    const res = await fetch('/api/projects/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RUN_LOOP', id }),
    });
    const json = await res.json();
    if (json.summary) setLoopFeedback(json.summary);
    await onRefresh();
  };

  const toggleLoopActive = async (id: string, isActive: boolean) => {
    await fetch('/api/projects/loops', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    });
    await onRefresh();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ workItems, teams, labels }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bems-projects-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (section === 'teams') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-600" />
            <h3 className="text-sm font-bold text-slate-900">Teams Directory</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowTeamModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> Create Team
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-2.5 px-4">Team</th>
                <th className="py-2.5 px-4">Key</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Members</th>
                <th className="py-2.5 px-4">Active Projects</th>
                <th className="py-2.5 px-4">Cycles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No teams created yet. Create a team (e.g. BEM · BemsSoft Hub) to scope issues, cycles, and SLAs.
                  </td>
                </tr>
              ) : (
                teams.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-600">{t.key}</td>
                    <td className="py-2.5 px-4 text-slate-600">{t.description || '—'}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center -space-x-1">
                        {(t.members || []).slice(0, 6).map((m) => (
                          <AssigneeAvatarChip key={m.id} name={m.employee?.legalName || 'M'} size={22} />
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-700">{t._count?.projects ?? 0}</td>
                    <td className="py-2.5 px-4">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.cyclesEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {t.cyclesEnabled ? `Enabled (${t.cycleDurationDays}d)` : 'Off'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showTeamModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
            <form onSubmit={createTeam} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Create Team</h4>
              <div className="grid grid-cols-3 gap-2">
                <input
                  required
                  value={teamForm.name}
                  onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Team name"
                  className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                />
                <input
                  required
                  value={teamForm.key}
                  onChange={(e) => setTeamForm((p) => ({ ...p, key: e.target.value.toUpperCase() }))}
                  placeholder="KEY (BEM)"
                  maxLength={6}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono uppercase"
                />
              </div>
              <textarea
                rows={2}
                value={teamForm.description}
                onChange={(e) => setTeamForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Team scope & responsibilities..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowTeamModal(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white">
                  Create Team
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (section === 'loops') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-orange-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Loops & Automations</h3>
              <p className="text-xs text-slate-500">Automate recurring hygiene checks, priority escalation, and weekly wraps.</p>
            </div>
          </div>
          {loopFeedback && (
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {loopFeedback}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {LOOP_TEMPLATES.map((tpl) => (
            <div key={tpl.actionType} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase text-orange-600">{tpl.cadence}</div>
                <h4 className="mt-1 text-sm font-bold text-slate-900">{tpl.name}</h4>
                <p className="mt-1 text-xs text-slate-600">{tpl.description}</p>
              </div>
              <button
                type="button"
                onClick={() => activateLoopTemplate(tpl)}
                className="self-start rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-orange-50 hover:border-orange-300"
              >
                + Enable Loop
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Active Workspace Loops ({automations.length})</h4>
          {automations.length === 0 ? (
            <p className="text-xs text-slate-500">Enable any loop template above to start automating project hygiene.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {automations.map((rule) => (
                <div key={rule.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{rule.name}</div>
                    <div className="text-slate-500">
                      {rule.triggerType} · {rule.actionType}
                      {rule.lastTriggeredAt && ` · Last run ${new Date(rule.lastTriggeredAt).toLocaleString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runLoopNow(rule.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 font-bold text-orange-700 hover:bg-orange-100"
                    >
                      <Play className="h-3 w-3" /> Run Now
                    </button>
                    <label className="inline-flex items-center gap-1.5 font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.isActive}
                        onChange={(e) => toggleLoopActive(rule.id, e.target.checked)}
                        className="rounded border-slate-300 text-orange-600"
                      />
                      Active
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Settings
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-orange-600" />
          <h3 className="text-sm font-bold text-slate-900">Workspace & Team Settings</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['cycles', 'Cycles Automation'],
            ['labels', 'Labels'],
            ['slas', 'SLAs'],
            ['workflows', 'Statuses & Workflows'],
            ['import_export', 'Import & Export'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSettingsTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                settingsTab === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {settingsTab === 'cycles' && (
        <div className="space-y-3">
          {teams.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-500">
              Create a Team in the Teams tab to configure per-team Cycle automation toggles.
            </div>
          ) : (
            teams.map((t) => {
              const auto = (() => {
                try {
                  return JSON.parse(t.cycleAutomationJson || '{}');
                } catch {
                  return {};
                }
              })();
              return (
                <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{t.key} · {t.name} Cycles</h4>
                      <p className="text-xs text-slate-500">Short, time-boxed planning windows with automatic carry-over.</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.cyclesEnabled}
                        onChange={(e) => toggleTeamCycleSetting(t, 'cyclesEnabled', e.target.checked)}
                        className="rounded border-slate-300 text-orange-600"
                      />
                      Enable cycles
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 text-xs">
                    {[
                      ['autoAddActive', 'Auto-add active & due-date issues to current cycle'],
                      ['autoAddStarted', 'Auto-add started issues to current cycle'],
                      ['autoAddCompleted', 'Auto-add completed issues to current cycle'],
                      ['carryOverUnfinished', 'Carry over unfinished work when cycle closes'],
                    ].map(([field, label]) => (
                      <label key={field} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-700 cursor-pointer">
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(auto[field])}
                          onChange={(e) => toggleTeamCycleSetting(t, field, e.target.checked)}
                          className="rounded border-slate-300 text-orange-600"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {settingsTab === 'labels' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <form onSubmit={createLabel} className="flex flex-wrap items-center gap-2">
            <input
              required
              value={labelForm.name}
              onChange={(e) => setLabelForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="New label name (e.g. Backend, Eticket)..."
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs flex-1 min-w-[200px]"
            />
            <input
              type="color"
              value={labelForm.color}
              onChange={(e) => setLabelForm((p) => ({ ...p, color: e.target.value }))}
              className="h-8 w-10 rounded border border-slate-200"
            />
            <select
              value={labelForm.scope}
              onChange={(e) => setLabelForm((p) => ({ ...p, scope: e.target.value }))}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold"
            >
              <option value="ISSUE">Issue Label</option>
              <option value="PROJECT">Project Label</option>
            </select>
            <button type="submit" className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white">
              Add Label
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {labels.map((l) => (
              <div key={l.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-800">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                <span>{l.name}</span>
                <span className="text-[10px] text-slate-400">{l.scope}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/projects/teams?kind=label&id=${encodeURIComponent(l.id)}`, { method: 'DELETE' });
                    await onRefresh();
                  }}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {settingsTab === 'slas' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <form onSubmit={createSla} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <input
              required
              value={slaForm.name}
              onChange={(e) => setSlaForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="SLA Rule Name"
              className="sm:col-span-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            />
            <select
              value={slaForm.priority}
              onChange={(e) => setSlaForm((p) => ({ ...p, priority: e.target.value }))}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold"
            >
              <option value="URGENT">URGENT</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
            </select>
            <input
              type="number"
              value={slaForm.resolutionMinutes}
              onChange={(e) => setSlaForm((p) => ({ ...p, resolutionMinutes: e.target.value }))}
              placeholder="Resolution (mins)"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            />
            <button type="submit" className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white">
              Add SLA
            </button>
          </form>

          <div className="divide-y divide-slate-100 text-xs">
            {slaRules.map((r) => (
              <div key={r.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-orange-600" />
                  <span className="font-bold text-slate-900">{r.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold">{r.priority}</span>
                  <span className="text-slate-500">
                    Response {r.responseMinutes}m · Resolution {r.resolutionMinutes}m
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/projects/teams?kind=sla&id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
                    await onRefresh();
                  }}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {settingsTab === 'workflows' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {workflows.map((wf) => (
            <div key={wf.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="text-xs font-bold uppercase text-slate-500">{wf.departmentType}</div>
              <h4 className="font-bold text-slate-900">{wf.name}</h4>
              <div className="flex flex-wrap gap-1.5">
                {wf.statuses.map((st: string) => (
                  <span key={st} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    {st}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {settingsTab === 'import_export' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Import & Export Workspace Data</h4>
          <p className="text-xs text-slate-600">
            Export all active work items, teams, and labels as JSON for backup or external BI reporting.
          </p>
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" /> Download JSON Snapshot
          </button>
        </div>
      )}
    </div>
  );
}

