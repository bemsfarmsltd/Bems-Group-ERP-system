'use client';

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { IssueStatusIcon, PriorityBars } from './pmUiPrimitives';
import type { LabelRow, TeamRow } from './pmTypes';

interface QuickCreateIssueModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  projects: any[];
  teams: TeamRow[];
  sprints: any[];
  staffOptions: any[];
  labels: LabelRow[];
  workItems: any[];
  issueTemplates?: any[];
  leaveEmployeeIds?: string[];
  defaultProjectId?: string;
  defaultTeamId?: string;
  defaultStatus?: string;
  defaultDueDate?: string;
}

const STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'QA_TESTING', 'BLOCKED', 'DONE'];
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const TYPES = ['TASK', 'BUG', 'FEATURE', 'STORY', 'EPIC', 'IMPROVEMENT', 'SUBTASK'];

export default function QuickCreateIssueModal({
  open,
  onClose,
  onCreated,
  projects,
  teams,
  sprints,
  staffOptions,
  labels,
  workItems,
  issueTemplates = [],
  leaveEmployeeIds = [],
  defaultProjectId,
  defaultTeamId,
  defaultStatus,
  defaultDueDate,
}: QuickCreateIssueModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '');
  const [teamId, setTeamId] = useState(defaultTeamId || '');
  const [status, setStatus] = useState(defaultStatus || 'TODO');
  const [priority, setPriority] = useState('MEDIUM');
  const [itemType, setItemType] = useState('TASK');
  const [assigneeId, setAssigneeId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [parentId, setParentId] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate || '');
  const [storyPoints, setStoryPoints] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [createMore, setCreateMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const activeProjectId = projectId || projects[0]?.id || '';
  const activeTeam = teams.find((t) => t.id === teamId) || teams[0];

  const toggleLabel = (name: string) => {
    setSelectedLabels((prev) => (prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || !activeProjectId) {
      setError('Issue title and project are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/projects/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_WORK_ITEM',
          projectId: activeProjectId,
          teamId: teamId || activeTeam?.id || null,
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          itemType,
          assigneeId: assigneeId || null,
          sprintId: sprintId || null,
          parentId: parentId || null,
          dueDate: dueDate || null,
          storyPoints: storyPoints ? Number(storyPoints) : null,
          labelsJson: selectedLabels.length ? JSON.stringify(selectedLabels) : null,
          templateId: templateId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to create issue.');
        return;
      }
      await onCreated();
      setTitle('');
      setDescription('');
      if (!createMore) {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/35 pt-16 p-4 backdrop-blur-[1px]">
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 bg-slate-50/70">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded bg-orange-100 px-1.5 py-0.5 font-bold text-orange-700">
              {activeTeam?.key || 'BEMS'}
            </span>
            <span>›</span>
            <span className="text-slate-900 font-bold">New issue</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          {issueTemplates.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="text-[11px] font-bold text-slate-600">Blueprint:</span>
              <select
                value={templateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTemplateId(id);
                  const tpl = issueTemplates.find((t) => t.id === id);
                  if (tpl) {
                    setPriority(tpl.defaultPriority || 'MEDIUM');
                    if (tpl.defaultLabelsJson) {
                      try {
                        setSelectedLabels(JSON.parse(tpl.defaultLabelsJson));
                      } catch {}
                    }
                  }
                }}
                className="flex-1 bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value="">None (Blank Issue)</option>
                {issueTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.projectType})
                  </option>
                ))}
              </select>
            </div>
          )}

          <input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            className="w-full text-base font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />

          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description, acceptance criteria, or context..."
            className="w-full resize-none text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />

          {/* Linear-style inline property pills */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              <IssueStatusIcon status={status} size={13} />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="bg-transparent focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              <PriorityBars priority={priority} />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="bg-transparent focus:outline-none"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="">Assignee</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.legalName}
                  {leaveEmployeeIds.includes(s.id) ? ' [On Leave]' : ''}
                </option>
              ))}
            </select>

            <select
              value={activeProjectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none max-w-[180px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectCode} · {p.title}
                </option>
              ))}
            </select>

            {teams.length > 0 && (
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="">Team (Auto)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.key} · {t.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="">Cycle</option>
              {sprints.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>

            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none max-w-[160px]"
            >
              <option value="">Parent issue</option>
              {workItems.slice(0, 80).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.itemKey} · {w.title}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
              title="Due date"
            />

            <input
              type="number"
              min={0}
              max={100}
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              placeholder="Pts"
              className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
            />
          </div>

          {labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Labels:</span>
              {labels.map((lbl) => {
                const active = selectedLabels.includes(lbl.name);
                return (
                  <button
                    key={lbl.id}
                    type="button"
                    onClick={() => toggleLabel(lbl.name)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
                      active
                        ? 'border-orange-400 bg-orange-50 text-orange-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lbl.color }} />
                    {lbl.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createMore}
              onChange={(e) => setCreateMore(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            Create more
          </label>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-slate-400">⌘ + Enter</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {submitting ? 'Creating...' : 'Create issue'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

