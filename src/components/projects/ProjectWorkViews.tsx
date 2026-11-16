'use client';

import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, GanttChart, LayoutGrid, List as ListIcon, MessageSquare, Plus, Timer } from 'lucide-react';
import { AvatarChip, IssueStatusIcon, PriorityBars, WorkItemTypeBadge } from './pmUiPrimitives';

export type WorkViewMode = 'BOARD' | 'LIST' | 'TIMELINE' | 'CALENDAR';

interface ProjectWorkViewsProps {
  title: string;
  subtitle: string;
  items: any[];
  projects: any[];
  employees: any[];
  activeBrandColor: string;
  workView: WorkViewMode;
  onChangeWorkView: (v: WorkViewMode) => void;
  onSelectTask: (task: any) => void;
  onUpdateStatus: (task: any, nextStatus: string) => void;
  onQuickCreateTask: (title: string, projectId: string) => Promise<void>;
  onOpenFullCreateModal: () => void;
}

const STATUS_COLUMNS = [
  { key: 'BACKLOG', label: 'Backlog', accent: '#94a3b8' },
  { key: 'TODO', label: 'To Do', accent: '#64748b' },
  { key: 'IN_PROGRESS', label: 'In Progress', accent: '#f59e0b' },
  { key: 'IN_REVIEW', label: 'In Review', accent: '#6366f1' },
  { key: 'QA_TESTING', label: 'QA Testing', accent: '#0284c7' },
  { key: 'BLOCKED', label: 'Blocked', accent: '#dc2626' },
  { key: 'DONE', label: 'Done', accent: '#10b981' },
  { key: 'ACCEPTED', label: 'Accepted', accent: '#059669' },
] as const;

export default function ProjectWorkViews({
  title,
  subtitle,
  items,
  projects,
  employees,
  activeBrandColor,
  workView,
  onChangeWorkView,
  onSelectTask,
  onUpdateStatus,
  onQuickCreateTask,
  onOpenFullCreateModal,
}: ProjectWorkViewsProps) {
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickProjectId, setQuickProjectId] = useState(projects[0]?.id || '');
  const [quickSaving, setQuickSaving] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (projectFilter && it.projectId !== projectFilter) return false;
      if (priorityFilter && it.priority !== priorityFilter) return false;
      if (assigneeFilter && it.assigneeId !== assigneeFilter) return false;
      return true;
    });
  }, [items, projectFilter, priorityFilter, assigneeFilter]);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPid = quickProjectId || projectFilter || projects[0]?.id;
    if (!quickTitle.trim() || !targetPid) return;
    setQuickSaving(true);
    try {
      await onQuickCreateTask(quickTitle.trim(), targetPid);
      setQuickTitle('');
    } finally {
      setQuickSaving(false);
    }
  };

  // Timeline 14-day window starting 3 days ago
  const timelineDays = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 3);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        iso: d.toISOString().split('T')[0],
        dayNum: d.getDate(),
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        isToday: d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0],
      };
    });
  }, []);

  // Calendar current month grid (35 cells)
  const calendarCells = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      return {
        iso,
        day: d.getDate(),
        inMonth: d.getMonth() === month,
        isToday: iso === new Date().toISOString().split('T')[0],
        tasks: filteredItems.filter((t) => t.dueDate && String(t.dueDate).slice(0, 10) === iso),
      };
    });
  }, [filteredItems]);

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Unified PM Toolbar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 850, color: '#0f172a' }}>{title}</h2>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                background: '#f1f5f9',
                fontSize: 11,
                fontWeight: 750,
                color: '#475569',
              }}
            >
              {filteredItems.length} issues
            </span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{subtitle}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Filters */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', background: '#ffffff' }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectCode} · {p.title}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', background: '#ffffff' }}
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', background: '#ffffff' }}
          >
            <option value="">All Assignees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.legalName}</option>
            ))}
          </select>

          {/* Segmented View Switcher */}
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
            {(
              [
                { id: 'BOARD', label: 'Board', icon: LayoutGrid },
                { id: 'LIST', label: 'List', icon: ListIcon },
                { id: 'TIMELINE', label: 'Timeline', icon: GanttChart },
                { id: 'CALENDAR', label: 'Calendar', icon: CalendarIcon },
              ] as const
            ).map((v) => {
              const Icon = v.icon;
              const active = workView === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChangeWorkView(v.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 7,
                    border: 'none',
                    background: active ? '#ffffff' : 'transparent',
                    color: active ? '#0f172a' : '#64748b',
                    fontSize: 11.5,
                    fontWeight: 750,
                    cursor: 'pointer',
                    boxShadow: active ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                  }}
                >
                  <Icon size={13} />
                  {v.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenFullCreateModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 12px',
              borderRadius: 9,
              border: 'none',
              background: activeBrandColor,
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 750,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> New Issue
          </button>
        </div>
      </div>

      {/* Linear-style Inline Quick-Create Bar */}
      {projects.length > 0 && (
        <form
          onSubmit={handleQuickSubmit}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Plus size={15} color={activeBrandColor} />
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Quick-create issue title (press Enter to add directly to selected project)..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 12.5,
              color: '#0f172a',
              background: 'transparent',
            }}
          />
          <select
            value={quickProjectId || projectFilter || projects[0]?.id || ''}
            onChange={(e) => setQuickProjectId(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11.5, color: '#475569', background: '#f8fafc' }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectCode}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={quickSaving || !quickTitle.trim()}
            style={{
              padding: '5px 12px',
              borderRadius: 7,
              border: 'none',
              background: quickTitle.trim() ? '#0f172a' : '#e2e8f0',
              color: quickTitle.trim() ? '#ffffff' : '#94a3b8',
              fontSize: 11.5,
              fontWeight: 750,
              cursor: quickTitle.trim() ? 'pointer' : 'default',
            }}
          >
            {quickSaving ? 'Adding...' : 'Add Issue'}
          </button>
        </form>
      )}

      {/* VIEW 1: JIRA / LINEAR BOARD */}
      {workView === 'BOARD' && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
          {STATUS_COLUMNS.map((col) => {
            const colItems = filteredItems.filter((it) => it.status === col.key);
            return (
              <div
                key={col.key}
                style={{
                  minWidth: 272,
                  maxWidth: 290,
                  flex: '0 0 272px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 10px', borderBottom: `2px solid ${col.accent}35`, marginBottom: 10 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <IssueStatusIcon status={col.key} size={14} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{col.label}</span>
                  </div>
                  <span style={{ padding: '1px 7px', borderRadius: 999, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 750, color: '#475569' }}>
                    {colItems.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colItems.length === 0 ? (
                    <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 11.5, color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: 10 }}>
                      Empty
                    </div>
                  ) : (
                    colItems.map((it) => {
                      const isOverdue = it.dueDate && String(it.dueDate).slice(0, 10) < todayIso && !['DONE', 'ACCEPTED'].includes(it.status);
                      return (
                        <div
                          key={it.id}
                          onClick={() => onSelectTask(it)}
                          style={{
                            background: '#ffffff',
                            border: it.isBlocked || it.status === 'BLOCKED' ? '1px solid #fecaca' : '1px solid #e2e8f0',
                            borderRadius: 11,
                            padding: 12,
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 750, color: '#64748b' }}>
                              {it.itemKey}
                            </span>
                            <WorkItemTypeBadge type={it.itemType} />
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.35, marginBottom: 8 }}>
                            {it.title}
                          </div>
                          {it.milestone?.title && (
                            <div style={{ marginBottom: 8 }}>
                              <span style={{ padding: '2px 7px', borderRadius: 5, background: '#f1f5f9', color: '#475569', fontSize: 10.5, fontWeight: 650 }}>
                                ◆ {it.milestone.title}
                              </span>
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <PriorityBars priority={it.priority} />
                              {it.storyPoints ? (
                                <span style={{ padding: '1px 6px', borderRadius: 5, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 10.5, fontWeight: 750, color: '#475569' }}>
                                  {it.storyPoints} pts
                                </span>
                              ) : null}
                              {(it._count?.comments || 0) > 0 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#64748b' }}>
                                  <MessageSquare size={11} /> {it._count.comments}
                                </span>
                              )}
                              {(it._count?.timeEntries || 0) > 0 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#64748b' }}>
                                  <Timer size={11} /> {it._count.timeEntries}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {it.dueDate && (
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: isOverdue ? '#dc2626' : '#64748b' }}>
                                  {String(it.dueDate).slice(5, 10)}
                                </span>
                              )}
                              <AvatarChip name={it.assignee?.legalName} size={20} />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: LINEAR-STYLE GROUPED ISSUE LIST */}
      {workView === 'LIST' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          {STATUS_COLUMNS.map((col) => {
            const colItems = filteredItems.filter((it) => it.status === col.key);
            if (colItems.length === 0) return null;
            const isCollapsed = !!collapsedGroups[col.key];
            return (
              <div key={col.key}>
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 16px',
                    background: '#f8fafc',
                    border: 'none',
                    borderBottom: '1px solid #e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <IssueStatusIcon status={col.key} size={14} />
                    {col.label}
                    <span style={{ padding: '1px 7px', borderRadius: 999, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
                      {colItems.length}
                    </span>
                  </span>
                </button>
                {!isCollapsed &&
                  colItems.map((it) => {
                    const isOverdue = it.dueDate && String(it.dueDate).slice(0, 10) < todayIso && !['DONE', 'ACCEPTED'].includes(it.status);
                    return (
                      <div
                        key={it.id}
                        onClick={() => onSelectTask(it)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          fontSize: 12.5,
                        }}
                      >
                        <PriorityBars priority={it.priority} />
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, fontWeight: 700, color: '#64748b', minWidth: 74 }}>
                          {it.itemKey}
                        </span>
                        <IssueStatusIcon status={it.status} size={14} />
                        <WorkItemTypeBadge type={it.itemType} />
                        <span style={{ flex: 1, fontWeight: 650, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.title}
                        </span>
                        {it.project?.projectCode && (
                          <span style={{ padding: '2px 7px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 10.5, fontWeight: 700, color: '#475569' }}>
                            {it.project.projectCode}
                          </span>
                        )}
                        {it.storyPoints ? (
                          <span style={{ padding: '1px 6px', borderRadius: 5, background: '#f1f5f9', fontSize: 10.5, fontWeight: 750, color: '#475569' }}>
                            {it.storyPoints}p
                          </span>
                        ) : null}
                        <span style={{ fontSize: 11.5, fontWeight: 650, color: isOverdue ? '#dc2626' : '#64748b', minWidth: 72, textAlign: 'right' }}>
                          {it.dueDate ? String(it.dueDate).slice(0, 10) : 'No date'}
                        </span>
                        <AvatarChip name={it.assignee?.legalName} size={22} />
                        <select
                          value={it.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onUpdateStatus(it, e.target.value)}
                          style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, color: '#334155', background: '#ffffff' }}
                        >
                          {STATUS_COLUMNS.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
              </div>
            );
          })}
          {filteredItems.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', fontSize: 13, color: '#64748b' }}>No work items match the current filters.</div>
          )}
        </div>
      )}

      {/* VIEW 3: ASANA-STYLE TRUE GANTT TIMELINE */}
      {workView === 'TIMELINE' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, overflowX: 'auto' }}>
          <div style={{ minWidth: 920 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '280px repeat(14, 1fr)', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                Issue / Schedule
              </div>
              {timelineDays.map((d) => (
                <div
                  key={d.iso}
                  style={{
                    padding: '6px 4px',
                    textAlign: 'center',
                    borderLeft: '1px solid #f1f5f9',
                    background: d.isToday ? `${activeBrandColor}12` : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: d.isToday ? activeBrandColor : '#94a3b8' }}>{d.weekday}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: d.isToday ? activeBrandColor : '#334155' }}>{d.dayNum}</div>
                </div>
              ))}
            </div>

            {filteredItems.slice(0, 30).map((it) => {
              const sStr = it.startDate ? String(it.startDate).slice(0, 10) : it.dueDate ? String(it.dueDate).slice(0, 10) : timelineDays[3].iso;
              const eStr = it.dueDate ? String(it.dueDate).slice(0, 10) : sStr;
              const startIdx = Math.max(0, timelineDays.findIndex((d) => d.iso >= sStr));
              const endIdxRaw = timelineDays.findIndex((d) => d.iso >= eStr);
              const endIdx = endIdxRaw === -1 ? 13 : Math.max(startIdx, endIdxRaw);
              const barColor =
                it.status === 'BLOCKED'
                  ? '#dc2626'
                  : ['DONE', 'ACCEPTED'].includes(it.status)
                  ? '#10b981'
                  : it.status === 'IN_PROGRESS'
                  ? '#f59e0b'
                  : activeBrandColor;

              return (
                <div
                  key={it.id}
                  onClick={() => onSelectTask(it)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '280px repeat(14, 1fr)',
                    alignItems: 'center',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    minHeight: 40,
                  }}
                >
                  <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <IssueStatusIcon status={it.status} size={13} />
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: '#64748b' }}>{it.itemKey}</span>
                    <span style={{ fontSize: 12, fontWeight: 650, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.title}
                    </span>
                  </div>
                  <div style={{ gridColumn: `${startIdx + 2} / ${endIdx + 3}`, padding: '4px 3px' }}>
                    <div
                      style={{
                        height: 22,
                        borderRadius: 6,
                        background: `${barColor}20`,
                        border: `1px solid ${barColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 8px',
                        fontSize: 10.5,
                        fontWeight: 750,
                        color: barColor,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.assignee?.legalName || it.status}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: CALENDAR GRID */}
      {workView === 'CALENDAR' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#64748b', textAlign: 'center' }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {calendarCells.map((cell) => (
              <div
                key={cell.iso}
                style={{
                  minHeight: 105,
                  padding: 8,
                  borderRight: '1px solid #f1f5f9',
                  borderBottom: '1px solid #f1f5f9',
                  background: cell.isToday ? `${activeBrandColor}08` : cell.inMonth ? '#ffffff' : '#f8fafc',
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: cell.isToday ? 850 : 650, color: cell.isToday ? activeBrandColor : cell.inMonth ? '#0f172a' : '#94a3b8', marginBottom: 5 }}>
                  {cell.day}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cell.tasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onSelectTask(t)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 6px',
                        borderRadius: 5,
                        border: '1px solid #e2e8f0',
                        background: '#ffffff',
                        fontSize: 10.5,
                        fontWeight: 650,
                        color: '#0f172a',
                        textAlign: 'left',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <IssueStatusIcon status={t.status} size={11} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                    </button>
                  ))}
                  {cell.tasks.length > 3 && (
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>+{cell.tasks.length - 3} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
