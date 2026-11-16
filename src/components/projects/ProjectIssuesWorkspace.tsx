'use client';

import React, { useMemo, useState } from 'react';
import {
  LayoutGrid,
  List as ListIcon,
  Calendar as CalendarIcon,
  SlidersHorizontal,
  Filter,
  Plus,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CheckSquare,
  Trash2,
} from 'lucide-react';
import {
  IssueStatusIcon,
  PriorityBars,
  WorkItemTypeBadge,
  AssigneeAvatarChip,
  SubIssueRing,
  LabelDotPill,
} from './pmUiPrimitives';
import type {
  ActivityLogRow,
  DisplayConfig,
  FilterConfig,
  GroupByField,
  IssuesScopeTab,
  LabelRow,
  MyIssuesSubTab,
  ViewMode,
} from './pmTypes';

interface ProjectIssuesWorkspaceProps {
  mode: 'issues' | 'my_work' | 'backlog' | 'inbox';
  actorId: string;
  workItems: any[];
  projects: any[];
  sprints: any[];
  staffOptions: any[];
  labels: LabelRow[];
  subscribedWorkItemIds: string[];
  activityLogs: ActivityLogRow[];
  onPatchWorkItem: (id: string, patch: Record<string, any>) => Promise<void>;
  onBulkPatchWorkItems: (ids: string[], patch: Record<string, any>) => Promise<void>;
  onQuickCreateInline: (payload: { title: string; status: string; projectId: string; dueDate?: string }) => Promise<void>;
  onOpenCreateModal: (defaults?: { status?: string; dueDate?: string }) => void;
  onSelectWorkItem: (item: any) => void;
  onSaveView: (name: string, filters: FilterConfig, display: DisplayConfig) => Promise<void>;
  initialFilters?: Partial<FilterConfig>;
  initialDisplay?: Partial<DisplayConfig>;
}

const STATUS_COLUMNS = [
  { key: 'BACKLOG', label: 'Backlog', accent: '#94a3b8' },
  { key: 'TODO', label: 'To Do', accent: '#64748b' },
  { key: 'IN_PROGRESS', label: 'In Progress', accent: '#f59e0b' },
  { key: 'IN_REVIEW', label: 'In Review', accent: '#6366f1' },
  { key: 'QA_TESTING', label: 'QA Testing', accent: '#0284c7' },
  { key: 'BLOCKED', label: 'Blocked', accent: '#dc2626' },
  { key: 'DONE', label: 'Done', accent: '#10b981' },
];

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const PRIORITY_RANK: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function parseLabels(labelsJson?: string | null): string[] {
  if (!labelsJson) return [];
  try {
    const arr = JSON.parse(labelsJson);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function parseCustomFields(customFieldsJson?: string | null): Record<string, string> {
  if (!customFieldsJson) return {};
  try {
    const obj = JSON.parse(customFieldsJson);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export default function ProjectIssuesWorkspace({
  mode,
  actorId,
  workItems,
  projects,
  sprints,
  staffOptions,
  labels,
  subscribedWorkItemIds,
  activityLogs,
  onPatchWorkItem,
  onBulkPatchWorkItems,
  onQuickCreateInline,
  onOpenCreateModal,
  onSelectWorkItem,
  onSaveView,
  initialFilters,
  initialDisplay,
}: ProjectIssuesWorkspaceProps) {
  const [scopeTab, setScopeTab] = useState<IssuesScopeTab>(mode === 'backlog' ? 'backlog' : 'all');
  const [myTab, setMyTab] = useState<MyIssuesSubTab>('assigned');
  const [display, setDisplay] = useState<DisplayConfig>({
    viewMode: (initialDisplay?.viewMode as ViewMode) || 'board',
    groupBy: (initialDisplay?.groupBy as GroupByField) || 'status',
    showLabels: initialDisplay?.showLabels ?? true,
    showAssignee: initialDisplay?.showAssignee ?? true,
    showDueDate: initialDisplay?.showDueDate ?? true,
    showPoints: initialDisplay?.showPoints ?? true,
    showSubIssues: initialDisplay?.showSubIssues ?? true,
    showProjectBadge: initialDisplay?.showProjectBadge ?? true,
  });

  const [filters, setFilters] = useState<FilterConfig>({
    search: initialFilters?.search || '',
    status: initialFilters?.status || 'ALL',
    priority: initialFilters?.priority || 'ALL',
    assigneeId: initialFilters?.assigneeId || 'ALL',
    projectId: initialFilters?.projectId || 'ALL',
    sprintId: initialFilters?.sprintId || 'ALL',
    label: initialFilters?.label || 'ALL',
  });

  const [showDisplayPopover, setShowDisplayPopover] = useState(false);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<'updatedAt' | 'priority' | 'dueDate' | 'itemKey' | 'status'>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [columnAddKey, setColumnAddKey] = useState<string | null>(null);
  const [columnAddTitle, setColumnAddTitle] = useState('');
  const [savingView, setSavingView] = useState(false);

  // Bendable Board Columns (custom columns + per-column WIP limits)
  const [customColumns, setCustomColumns] = useState<Array<{ key: string; label: string; accent: string; wipLimit: number }>>(
    () => STATUS_COLUMNS.map((c) => ({ ...c, wipLimit: 0 }))
  );
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [editingWipKey, setEditingWipKey] = useState<string | null>(null);

  // Bendable Custom Fields for Table view
  const [customFieldDefs, setCustomFieldDefs] = useState<string[]>(['Client', 'Region']);
  const [newCustomField, setNewCustomField] = useState('');
  const [triggerColKey, setTriggerColKey] = useState<string | null>(null);
  const [triggerSavedMsg, setTriggerSavedMsg] = useState<string | null>(null);

  // Calendar state
  const [calMode, setCalMode] = useState<'month' | 'week'>('month');
  const [calCursor, setCalCursor] = useState<Date>(() => new Date());

  const labelColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    labels.forEach((l) => {
      map[l.name] = l.color;
    });
    return map;
  }, [labels]);

  const scopedItems = useMemo(() => {
    let base = [...workItems];

    if (mode === 'my_work') {
      if (myTab === 'assigned') {
        base = base.filter((w) => w.assigneeId === actorId || w.reviewerId === actorId);
      } else if (myTab === 'created') {
        base = base.filter((w) => w.reporterId === actorId);
      } else if (myTab === 'subscribed') {
        const subSet = new Set(subscribedWorkItemIds);
        base = base.filter((w) => subSet.has(w.id));
      }
    } else if (mode === 'inbox') {
      base = base.filter(
        (w) => w.status === 'BACKLOG' || w.status === 'BLOCKED' || w.assigneeId === actorId || w.reviewerId === actorId
      );
    } else {
      if (scopeTab === 'active') {
        base = base.filter((w) => ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'QA_TESTING', 'BLOCKED'].includes(w.status));
      } else if (scopeTab === 'backlog') {
        base = base.filter((w) => w.status === 'BACKLOG');
      }
    }

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      base = base.filter(
        (w) =>
          String(w.title || '').toLowerCase().includes(q) ||
          String(w.itemKey || '').toLowerCase().includes(q) ||
          String(w.project?.title || '').toLowerCase().includes(q)
      );
    }
    if (filters.status !== 'ALL') base = base.filter((w) => w.status === filters.status);
    if (filters.priority !== 'ALL') base = base.filter((w) => w.priority === filters.priority);
    if (filters.assigneeId !== 'ALL') {
      base =
        filters.assigneeId === 'UNASSIGNED'
          ? base.filter((w) => !w.assigneeId)
          : base.filter((w) => w.assigneeId === filters.assigneeId);
    }
    if (filters.projectId !== 'ALL') base = base.filter((w) => w.projectId === filters.projectId);
    if (filters.sprintId !== 'ALL') base = base.filter((w) => w.sprintId === filters.sprintId);
    if (filters.label !== 'ALL') {
      base = base.filter((w) => parseLabels(w.labelsJson).includes(filters.label));
    }

    base.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'priority') {
        cmp = (PRIORITY_RANK[a.priority] || 0) - (PRIORITY_RANK[b.priority] || 0);
      } else if (sortField === 'dueDate') {
        cmp = String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'));
      } else if (sortField === 'itemKey') {
        cmp = String(a.itemKey || '').localeCompare(String(b.itemKey || ''));
      } else if (sortField === 'status') {
        cmp = String(a.status || '').localeCompare(String(b.status || ''));
      } else {
        cmp = String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return base;
  }, [workItems, mode, myTab, scopeTab, actorId, subscribedWorkItemIds, filters, sortField, sortDir]);

  const boardColumns = useMemo(() => {
    if (display.groupBy === 'priority') {
      return PRIORITIES.map((p) => ({
        key: p,
        label: p,
        accent: p === 'URGENT' ? '#dc2626' : p === 'HIGH' ? '#ea580c' : p === 'MEDIUM' ? '#d97706' : '#64748b',
        items: scopedItems.filter((w) => w.priority === p),
        patchKey: 'priority',
      }));
    }
    if (display.groupBy === 'assignee') {
      const cols = staffOptions.slice(0, 8).map((s) => ({
        key: s.id,
        label: s.legalName,
        accent: '#0284c7',
        items: scopedItems.filter((w) => w.assigneeId === s.id),
        patchKey: 'assigneeId',
      }));
      cols.unshift({
        key: '',
        label: 'Unassigned',
        accent: '#94a3b8',
        items: scopedItems.filter((w) => !w.assigneeId),
        patchKey: 'assigneeId',
      });
      return cols;
    }
    if (display.groupBy === 'project') {
      return projects.slice(0, 8).map((p) => ({
        key: p.id,
        label: `${p.projectCode} · ${p.title}`,
        accent: '#ea580c',
        items: scopedItems.filter((w) => w.projectId === p.id),
        patchKey: 'projectId',
      }));
    }
    if (display.groupBy === 'sprint') {
      const cols = sprints.map((sp) => ({
        key: sp.id,
        label: sp.name,
        accent: '#7c3aed',
        items: scopedItems.filter((w) => w.sprintId === sp.id),
        patchKey: 'sprintId',
      }));
      cols.unshift({
        key: '',
        label: 'No Cycle',
        accent: '#94a3b8',
        items: scopedItems.filter((w) => !w.sprintId),
        patchKey: 'sprintId',
      });
      return cols;
    }
    return customColumns.map((c) => ({
      ...c,
      items: scopedItems.filter((w) => w.status === c.key),
      patchKey: 'status',
    }));
  }, [display.groupBy, scopedItems, staffOptions, projects, sprints, customColumns]);

  const handleAddBoardColumn = () => {
    const label = newColumnName.trim();
    if (!label) return;
    const key = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!key || customColumns.some((c) => c.key === key)) {
      setNewColumnName('');
      setAddingColumn(false);
      return;
    }
    const accents = ['#ea580c', '#0ea5e9', '#8b5cf6', '#14b8a6', '#ec4899'];
    const accent = accents[customColumns.length % accents.length];
    setCustomColumns((prev) => [...prev, { key, label, accent, wipLimit: 0 }]);
    setNewColumnName('');
    setAddingColumn(false);
  };

  const handleAddCustomField = () => {
    const field = newCustomField.trim();
    if (!field || customFieldDefs.includes(field)) {
      setNewCustomField('');
      return;
    }
    setCustomFieldDefs((prev) => [...prev, field]);
    setNewCustomField('');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === scopedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(scopedItems.map((w) => w.id));
    }
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleDropOnColumn = async (patchKey: string, value: string) => {
    if (!draggedId) return;
    const id = draggedId;
    setDraggedId(null);
    await onPatchWorkItem(id, { [patchKey]: value || null });
  };

  const handleInlineQuickAdd = async (statusKey: string) => {
    if (!columnAddTitle.trim() || !projects[0]?.id) return;
    const title = columnAddTitle.trim();
    setColumnAddTitle('');
    setColumnAddKey(null);
    await onQuickCreateInline({
      title,
      status: display.groupBy === 'status' ? statusKey : 'TODO',
      projectId: filters.projectId !== 'ALL' ? filters.projectId : projects[0].id,
    });
  };

  const handleSaveCurrentView = async () => {
    const name = window.prompt('Save current filter & display as View name:');
    if (!name?.trim()) return;
    setSavingView(true);
    try {
      await onSaveView(name.trim(), filters, display);
    } finally {
      setSavingView(false);
    }
  };

  // Calendar grid dates
  const calendarDays = useMemo(() => {
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    if (calMode === 'week') {
      const start = new Date(calCursor);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const start = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [calCursor, calMode]);

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      {/* Linear-style top bar: Sub-tabs + Display/Filter/Save View */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {mode === 'my_work' ? (
            (['assigned', 'created', 'subscribed', 'activity'] as MyIssuesSubTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMyTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                  myTab === t
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))
          ) : (
            (['active', 'backlog', 'all'] as IssuesScopeTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setScopeTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                  scopeTab === t
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t === 'all' ? 'All issues' : t}
              </button>
            ))
          )}
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {scopedItems.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 relative">
          <button
            type="button"
            onClick={() => setShowFilterBar((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              showFilterBar
                ? 'border-orange-300 bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>

          <button
            type="button"
            onClick={() => setShowDisplayPopover((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              showDisplayPopover
                ? 'border-orange-300 bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Display
          </button>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {([
              { id: 'board', icon: LayoutGrid, label: 'Board' },
              { id: 'list', icon: ListIcon, label: 'Table' },
              { id: 'calendar', icon: CalendarIcon, label: 'Calendar' },
            ] as const).map((v) => {
              const Icon = v.icon;
              const active = display.viewMode === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setDisplay((d) => ({ ...d, viewMode: v.id }))}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {v.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={savingView}
            onClick={handleSaveCurrentView}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Save as custom View"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-orange-600" /> Save View
          </button>

          {showDisplayPopover && (
            <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Display Options</span>
                <button
                  type="button"
                  onClick={() => setShowDisplayPopover(false)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-700"
                >
                  Done
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Group Board Columns By</label>
                <select
                  value={display.groupBy}
                  onChange={(e) => setDisplay((d) => ({ ...d, groupBy: e.target.value as GroupByField }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                >
                  <option value="status">Status</option>
                  <option value="priority">Priority</option>
                  <option value="assignee">Assignee</option>
                  <option value="project">Project</option>
                  <option value="sprint">Cycle / Sprint</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                {(
                  [
                    ['showLabels', 'Labels'],
                    ['showAssignee', 'Assignee'],
                    ['showDueDate', 'Due Date'],
                    ['showPoints', 'Story Points'],
                    ['showSubIssues', 'Sub-issues'],
                    ['showProjectBadge', 'Project Pill'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={display[key]}
                      onChange={(e) => setDisplay((d) => ({ ...d, [key]: e.target.checked }))}
                      className="rounded border-slate-300 text-orange-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      {showFilterBar && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search key or title..."
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium focus:outline-none"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">All Statuses</option>
            {customColumns.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={filters.assigneeId}
            onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">All Assignees</option>
            <option value="UNASSIGNED">Unassigned</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.legalName}
              </option>
            ))}
          </select>
          <select
            value={filters.projectId}
            onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} · {p.title}
              </option>
            ))}
          </select>
          <select
            value={filters.label}
            onChange={(e) => setFilters((f) => ({ ...f, label: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">All Labels</option>
            {labels.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-orange-900">
            <CheckSquare className="h-4 w-4 text-orange-600" />
            <span>{selectedIds.length} selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                onBulkPatchWorkItems(selectedIds, { status: e.target.value });
                setSelectedIds([]);
              }}
              className="rounded-lg border border-orange-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
            >
              <option value="">Set Status...</option>
              {customColumns.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                onBulkPatchWorkItems(selectedIds, { priority: e.target.value });
                setSelectedIds([]);
              }}
              className="rounded-lg border border-orange-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
            >
              <option value="">Set Priority...</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                onBulkPatchWorkItems(selectedIds, { assigneeId: e.target.value === 'NONE' ? null : e.target.value });
                setSelectedIds([]);
              }}
              className="rounded-lg border border-orange-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
            >
              <option value="">Assign to...</option>
              <option value="NONE">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.legalName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* My Work Activity Feed */}
      {mode === 'my_work' && myTab === 'activity' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Recent Issue Activity</h4>
          {activityLogs.length === 0 ? (
            <p className="text-xs text-slate-500">No activity recorded yet. Update any issue status, priority, or assignee to see live history.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {activityLogs.slice(0, 40).map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <AssigneeAvatarChip name={log.actor?.legalName || 'User'} size={22} />
                    <span>
                      <strong className="text-slate-900">{log.actor?.legalName}</strong>{' '}
                      <span className="text-slate-600">{log.action.toLowerCase().replace(/_/g, ' ')}</span>{' '}
                      {log.workItem && (
                        <span className="font-mono font-bold text-orange-700">
                          {log.workItem.itemKey}
                        </span>
                      )}
                      {log.newValue && (
                        <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                          {log.oldValue ? `${log.oldValue} → ` : ''}
                          {log.newValue}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : display.viewMode === 'board' ? (
        /* MANIPULABLE KANBAN BOARD */
        <div className="flex gap-3 overflow-x-auto pb-3 items-start">
          {boardColumns.map((col) => {
            const wipLimit = 'wipLimit' in col && typeof col.wipLimit === 'number' ? col.wipLimit : 0;
            const overWip = wipLimit > 0 && col.items.length > wipLimit;
            const atWip = wipLimit > 0 && col.items.length === wipLimit;
            return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOnColumn(col.patchKey, col.key)}
              className={`w-[310px] shrink-0 rounded-2xl border p-3 flex flex-col gap-2.5 ${
                overWip
                  ? 'border-rose-300 bg-rose-50/50'
                  : 'border-slate-200 bg-slate-50/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: col.accent }} />
                  <span className="text-xs font-bold text-slate-900 truncate">{col.label}</span>
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                      overWip
                        ? 'border-rose-300 bg-rose-100 text-rose-700'
                        : atWip
                        ? 'border-amber-300 bg-amber-100 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {col.items.length}{wipLimit > 0 ? `/${wipLimit}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {col.patchKey === 'status' && (
                    editingWipKey === col.key ? (
                      <input
                        type="number"
                        min={0}
                        max={99}
                        autoFocus
                        defaultValue={wipLimit}
                        onBlur={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setCustomColumns((prev) =>
                            prev.map((c) => (c.key === col.key ? { ...c, wipLimit: val } : c))
                          );
                          setEditingWipKey(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditingWipKey(null);
                        }}
                        className="w-12 rounded border border-orange-300 bg-white px-1 py-0.5 text-[10px] font-bold text-slate-800 focus:outline-none"
                        title="Set WIP limit (0 = unlimited)"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingWipKey(col.key)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold border transition ${
                          overWip
                            ? 'border-rose-300 bg-rose-100 text-rose-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-orange-300 hover:text-orange-600'
                        }`}
                        title="Click to set WIP limit"
                      >
                        {wipLimit > 0 ? `WIP ${wipLimit}` : 'WIP ∞'}
                      </button>
                    )
                  )}
                  {col.patchKey === 'status' && (
                    <button
                      type="button"
                      onClick={() => setTriggerColKey((prev) => (prev === col.key ? null : col.key))}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold border transition ${
                        triggerColKey === col.key
                          ? 'border-orange-400 bg-orange-50 text-orange-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-orange-300 hover:text-orange-600'
                      }`}
                      title="Attach column automation trigger"
                    >
                      ⚡
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setColumnAddKey(col.key);
                      setColumnAddTitle('');
                    }}
                    className="rounded p-1 text-slate-500 hover:bg-white hover:text-orange-600"
                    title="Quick add issue"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {triggerColKey === col.key && (
                <div className="rounded-xl border border-orange-200 bg-white p-2.5 shadow-sm space-y-1.5 text-[11px]">
                  <div className="font-bold text-slate-800">On enter &ldquo;{col.label}&rdquo;:</div>
                  <div className="flex flex-col gap-1">
                    {[
                      { actionType: 'ESCALATE_PRIORITY', label: 'Escalate Priority → URGENT', cfg: { priority: 'URGENT' } },
                      { actionType: 'FLAG_PROJECT_AT_RISK', label: 'Flag Project → AT RISK', cfg: {} },
                    ].map((opt) => (
                      <button
                        key={opt.actionType}
                        type="button"
                        onClick={async () => {
                          await fetch('/api/projects/loops', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'CREATE_LOOP',
                              name: `On ${col.label} → ${opt.label}`,
                              triggerType: 'COLUMN_ENTER',
                              conditionsJson: JSON.stringify({ status: col.key }),
                              actionType: opt.actionType,
                              actionConfigJson: JSON.stringify(opt.cfg),
                            }),
                          });
                          setTriggerColKey(null);
                          setTriggerSavedMsg(`Trigger saved for ${col.label}`);
                          setTimeout(() => setTriggerSavedMsg(null), 2500);
                        }}
                        className="text-left rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50"
                      >
                        ⚡ {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {triggerSavedMsg && triggerColKey === null && col.key === 'BACKLOG' && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700">
                  {triggerSavedMsg}
                </div>
              )}

              {columnAddKey === col.key && (
                <div className="rounded-xl border border-orange-300 bg-white p-2 shadow-sm space-y-1.5">
                  <input
                    autoFocus
                    value={columnAddTitle}
                    onChange={(e) => setColumnAddTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInlineQuickAdd(col.key);
                      if (e.key === 'Escape') setColumnAddKey(null);
                    }}
                    placeholder="Issue title + Enter..."
                    className="w-full text-xs font-semibold text-slate-900 focus:outline-none"
                  />
                </div>
              )}

              <div className="space-y-2 min-h-[120px]">
                {col.items.map((w) => {
                  const subTotal = w.subtasks?.length || 0;
                  const subDone = (w.subtasks || []).filter((s: any) => ['DONE', 'ACCEPTED'].includes(s.status)).length;
                  const itemLabels = parseLabels(w.labelsJson);
                  return (
                    <div
                      key={w.id}
                      draggable
                      onDragStart={() => setDraggedId(w.id)}
                      onClick={() => onSelectWorkItem(w)}
                      className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-orange-300 hover:shadow transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[11px] font-bold text-slate-500">{w.itemKey}</span>
                          {w.parent && (
                            <span className="truncate text-[10px] text-slate-400">
                              › {w.parent.itemKey}
                            </span>
                          )}
                        </div>
                        {display.showAssignee && w.assignee?.legalName && (
                          <AssigneeAvatarChip name={w.assignee.legalName} size={20} />
                        )}
                      </div>

                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <IssueStatusIcon status={w.status} size={15} />
                        </div>
                        <p className="text-xs font-semibold text-slate-900 leading-snug line-clamp-2">{w.title}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <div onClick={(e) => e.stopPropagation()}>
                          <PriorityBars priority={w.priority} />
                        </div>
                        <WorkItemTypeBadge type={w.itemType} />
                        {display.showProjectBadge && w.project && (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 truncate max-w-[130px]">
                            {w.project.projectCode}
                          </span>
                        )}
                        {display.showSubIssues && subTotal > 0 && <SubIssueRing done={subDone} total={subTotal} />}
                        {display.showLabels &&
                          itemLabels.map((lbl) => (
                            <LabelDotPill key={lbl} name={lbl} color={labelColorMap[lbl] || '#3b82f6'} />
                          ))}
                      </div>

                      {(display.showDueDate || display.showPoints) && (w.dueDate || w.storyPoints) && (
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                          <span>{display.showDueDate && w.dueDate ? `Due ${w.dueDate}` : ''}</span>
                          <span>{display.showPoints && w.storyPoints ? `${w.storyPoints} pts` : ''}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
          {display.groupBy === 'status' && (
            <div className="w-[240px] shrink-0 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-3">
              {addingColumn ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddBoardColumn();
                      if (e.key === 'Escape') {
                        setAddingColumn(false);
                        setNewColumnName('');
                      }
                    }}
                    placeholder="Stage name (e.g. Client Review)"
                    className="w-full rounded-lg border border-orange-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddBoardColumn}
                      className="rounded-lg bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-orange-700"
                    >
                      Add Column
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingColumn(false);
                        setNewColumnName('');
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumn(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-slate-600 hover:text-orange-600"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Custom Column
                </button>
              )}
            </div>
          )}
        </div>
      ) : display.viewMode === 'list' ? (
        /* MANIPULABLE INLINE-EDITABLE TABLE WITH CUSTOM FIELDS */
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                Custom Fields:
              </span>
              {customFieldDefs.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                >
                  {field}
                  <button
                    type="button"
                    onClick={() => setCustomFieldDefs((prev) => prev.filter((f) => f !== field))}
                    className="text-slate-400 hover:text-rose-600"
                    title={`Remove ${field} column`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={newCustomField}
                onChange={(e) => setNewCustomField(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustomField();
                }}
                placeholder="New column (e.g. Environment)"
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-orange-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomField}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-3 w-3" /> Add Field
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={scopedItems.length > 0 && selectedIds.length === scopedItems.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-orange-600"
                    />
                  </th>
                  <th className="py-2.5 px-3 cursor-pointer hover:text-slate-800" onClick={() => handleSort('itemKey')}>
                    <span className="inline-flex items-center gap-1">Key <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="py-2.5 px-3">Title & Labels</th>
                  <th className="py-2.5 px-3 cursor-pointer hover:text-slate-800" onClick={() => handleSort('status')}>
                    <span className="inline-flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="py-2.5 px-3 cursor-pointer hover:text-slate-800" onClick={() => handleSort('priority')}>
                    <span className="inline-flex items-center gap-1">Priority <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="py-2.5 px-3">Assignee</th>
                  <th className="py-2.5 px-3">Cycle</th>
                  <th className="py-2.5 px-3 cursor-pointer hover:text-slate-800" onClick={() => handleSort('dueDate')}>
                    <span className="inline-flex items-center gap-1">Due Date <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="py-2.5 px-3">Pts</th>
                  {customFieldDefs.map((field) => (
                    <th key={field} className="py-2.5 px-3 whitespace-nowrap">
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {scopedItems.map((w) => {
                  const checked = selectedIds.includes(w.id);
                  const itemLabels = parseLabels(w.labelsJson);
                  const customValues = parseCustomFields(w.customFieldsJson);
                  return (
                    <tr key={w.id} className={`hover:bg-slate-50/80 ${checked ? 'bg-orange-50/40' : ''}`}>
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(w.id)}
                          className="rounded border-slate-300 text-orange-600"
                        />
                      </td>
                      <td
                        onClick={() => onSelectWorkItem(w)}
                        className="py-2 px-3 font-mono font-bold text-slate-600 cursor-pointer hover:text-orange-600 whitespace-nowrap"
                      >
                        {w.itemKey}
                      </td>
                      <td onClick={() => onSelectWorkItem(w)} className="py-2 px-3 cursor-pointer min-w-[240px]">
                        <div className="font-semibold text-slate-900">{w.title}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <WorkItemTypeBadge type={w.itemType} />
                          {w.project && (
                            <span className="text-[10px] font-semibold text-slate-500">{w.project.projectCode}</span>
                          )}
                          {itemLabels.map((lbl) => (
                            <LabelDotPill key={lbl} name={lbl} color={labelColorMap[lbl] || '#3b82f6'} />
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="inline-flex items-center gap-1.5">
                          <IssueStatusIcon status={w.status} size={14} />
                          <select
                            value={w.status}
                            onChange={(e) => onPatchWorkItem(w.id, { status: e.target.value })}
                            className="rounded border border-transparent hover:border-slate-200 bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-800 focus:border-orange-300 focus:outline-none"
                          >
                            {customColumns.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    <td className="py-2 px-3">
                      <div className="inline-flex items-center gap-1.5">
                        <PriorityBars priority={w.priority} />
                        <select
                          value={w.priority}
                          onChange={(e) => onPatchWorkItem(w.id, { priority: e.target.value })}
                          className="rounded border border-transparent hover:border-slate-200 bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-800 focus:border-orange-300 focus:outline-none"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={w.assigneeId || ''}
                        onChange={(e) => onPatchWorkItem(w.id, { assigneeId: e.target.value || null })}
                        className="rounded border border-transparent hover:border-slate-200 bg-transparent px-1 py-0.5 text-xs font-medium text-slate-700 max-w-[140px] focus:border-orange-300 focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {staffOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.legalName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={w.sprintId || ''}
                        onChange={(e) => onPatchWorkItem(w.id, { sprintId: e.target.value || null })}
                        className="rounded border border-transparent hover:border-slate-200 bg-transparent px-1 py-0.5 text-xs font-medium text-slate-700 max-w-[120px] focus:border-orange-300 focus:outline-none"
                      >
                        <option value="">—</option>
                        {sprints.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="date"
                        value={w.dueDate || ''}
                        onChange={(e) => onPatchWorkItem(w.id, { dueDate: e.target.value || null })}
                        className="rounded border border-transparent hover:border-slate-200 bg-transparent px-1 py-0.5 text-xs text-slate-700 focus:border-orange-300 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={w.storyPoints ?? ''}
                        onChange={(e) =>
                          onPatchWorkItem(w.id, {
                            storyPoints: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        placeholder="—"
                        className="w-12 rounded border border-transparent hover:border-slate-200 bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-700 focus:border-orange-300 focus:outline-none"
                      />
                    </td>
                    {customFieldDefs.map((field) => {
                      const val = customValues[field] ?? '';
                      return (
                        <td key={field} className="py-2 px-3">
                          <input
                            key={`${w.id}-${field}-${val}`}
                            type="text"
                            defaultValue={val}
                            placeholder="—"
                            onBlur={(e) => {
                              const nextVal = e.target.value.trim();
                              if (nextVal === val) return;
                              const nextObj = { ...customValues, [field]: nextVal };
                              if (!nextVal) delete nextObj[field];
                              onPatchWorkItem(w.id, { customFieldsJson: JSON.stringify(nextObj) });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                            }}
                            className="w-28 rounded border border-transparent hover:border-slate-200 bg-transparent px-1.5 py-0.5 text-xs font-medium text-slate-700 focus:border-orange-300 focus:bg-white focus:outline-none"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        /* INTERACTIVE DRAG-AND-DROP CALENDAR */
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(calCursor);
                  d.setDate(d.getDate() - (calMode === 'week' ? 7 : 30));
                  setCalCursor(d);
                }}
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCalCursor(new Date())}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(calCursor);
                  d.setDate(d.getDate() + (calMode === 'week' ? 7 : 30));
                  setCalCursor(d);
                }}
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="ml-2 text-sm font-bold text-slate-900">
                {calCursor.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(['month', 'week'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCalMode(m)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                    calMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px rounded-xl border border-slate-200 bg-slate-200 overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-slate-50 py-1.5 px-2 text-[11px] font-bold uppercase text-slate-500">
                {day}
              </div>
            ))}
            {calendarDays.map((d) => {
              const iso = d.toISOString().split('T')[0];
              const dayItems = scopedItems.filter((w) => w.dueDate === iso);
              const isToday = iso === todayIso;
              return (
                <div
                  key={iso}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async () => {
                    if (!draggedId) return;
                    const id = draggedId;
                    setDraggedId(null);
                    await onPatchWorkItem(id, { dueDate: iso });
                  }}
                  className={`min-h-[108px] bg-white p-1.5 flex flex-col gap-1 ${
                    isToday ? 'ring-2 ring-inset ring-orange-500 bg-orange-50/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-bold ${
                        isToday ? 'text-orange-600' : 'text-slate-500'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenCreateModal({ dueDate: iso })}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-orange-600"
                      title={`Add issue due ${iso}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-1 overflow-y-auto max-h-[84px]">
                    {dayItems.map((w) => (
                      <div
                        key={w.id}
                        draggable
                        onDragStart={() => setDraggedId(w.id)}
                        onClick={() => onSelectWorkItem(w)}
                        className="cursor-pointer rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 hover:border-orange-300 truncate flex items-center gap-1"
                      >
                        <IssueStatusIcon status={w.status} size={11} />
                        <span className="font-mono text-slate-500">{w.itemKey}</span>
                        <span className="truncate">{w.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

