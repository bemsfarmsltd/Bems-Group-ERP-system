'use client';

import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, MessageSquarePlus } from 'lucide-react';
import { AssigneeAvatarChip, PriorityBars } from './pmUiPrimitives';

interface ProjectTimelineViewProps {
  projects: any[];
  milestones: any[];
  statusUpdates: any[];
  onPatchProject: (id: string, patch: Record<string, any>) => Promise<void>;
  onSelectProject?: (project: any) => void;
}

type ZoomLevel = 'week' | 'month' | 'quarter';

const HEALTH_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  ON_TRACK: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'On track' },
  AT_RISK: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'At risk' },
  OFF_TRACK: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Off track' },
  PENDING_REVIEW: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', label: 'Pending' },
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function ProjectTimelineView({
  projects,
  milestones,
  statusUpdates,
  onPatchProject,
}: ProjectTimelineViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  });
  const [updateProjectId, setUpdateProjectId] = useState<string | null>(null);
  const [updateHealth, setUpdateHealth] = useState('ON_TRACK');
  const [updateSummary, setUpdateSummary] = useState('');
  const [dragState, setDragState] = useState<{
    projectId: string;
    mode: 'move' | 'resize-left' | 'resize-right';
    originX: number;
    containerW: number;
    origStart: string;
    origEnd: string;
    deltaDays: number;
  } | null>(null);

  const startBarDrag = (
    e: React.PointerEvent,
    projectId: string,
    mode: 'move' | 'resize-left' | 'resize-right',
    origStart: string,
    origEnd: string
  ) => {
    e.stopPropagation();
    const track = (e.currentTarget as HTMLElement).closest('.gantt-track') as HTMLElement | null;
    const containerW = track?.getBoundingClientRect().width || 600;
    const originX = e.clientX;
    setDragState({ projectId, mode, originX, containerW, origStart, origEnd, deltaDays: 0 });

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - originX;
      const days = Math.round((dx / containerW) * totalDays);
      setDragState((prev) => (prev ? { ...prev, deltaDays: days } : null));
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const dx = ev.clientX - originX;
      const days = Math.round((dx / containerW) * totalDays);
      setDragState(null);
      if (days === 0) return;
      if (mode === 'move') {
        await onPatchProject(projectId, {
          startDate: addDays(origStart, days),
          targetDate: addDays(origEnd, days),
        });
      } else if (mode === 'resize-left') {
        await onPatchProject(projectId, { startDate: addDays(origStart, days) });
      } else {
        await onPatchProject(projectId, { targetDate: addDays(origEnd, days) });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const totalDays = zoom === 'week' ? 28 : zoom === 'month' ? 90 : 180;
  const startMs = windowStart.getTime();
  const endMs = startMs + totalDays * 86400000;
  const todayMs = Date.now();
  const todayPct = ((todayMs - startMs) / (endMs - startMs)) * 100;

  const tickLabels = useMemo(() => {
    const count = zoom === 'week' ? 4 : zoom === 'month' ? 6 : 6;
    const stepDays = Math.floor(totalDays / count);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(startMs + i * stepDays * 86400000);
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pct: (i / count) * 100,
      };
    });
  }, [startMs, totalDays, zoom]);

  const jumpToToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(totalDays * 0.25));
    setWindowStart(d);
  };

  const shiftWindow = (days: number) => {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + days);
    setWindowStart(d);
  };

  const submitHealthUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateProjectId || !updateSummary.trim()) return;
    await onPatchProject(updateProjectId, {
      healthStatus: updateHealth,
      healthSummary: updateSummary.trim(),
    });
    setUpdateProjectId(null);
    setUpdateSummary('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-600" />
          <h3 className="text-sm font-bold text-slate-900">Projects Timeline & Roadmap</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWindow(-14)}
            className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={jumpToToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftWindow(14)}
            className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 ml-2">
            {(['week', 'month', 'quarter'] as ZoomLevel[]).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                  zoom === z ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Horizontal Gantt Canvas */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="min-w-[920px]">
          {/* Timeline Header */}
          <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
            <div className="col-span-4 px-4 py-2.5 border-r border-slate-200">Project & Health</div>
            <div className="col-span-8 relative px-4 py-2.5">
              <div className="relative h-4">
                {tickLabels.map((t) => (
                  <span key={t.label} style={{ left: `${t.pct}%` }} className="absolute top-0">
                    {t.label}
                  </span>
                ))}
                {todayPct >= 0 && todayPct <= 100 && (
                  <span
                    style={{ left: `${todayPct}%` }}
                    className="absolute -top-0.5 -translate-x-1/2 rounded bg-orange-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white"
                  >
                    TODAY
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Project Rows */}
          <div className="divide-y divide-slate-100">
            {projects.map((p) => {
              const rawStart = p.startDate || p.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0];
              const rawEnd = p.targetDate || addDays(rawStart, 30);
              const activeDrag = dragState && dragState.projectId === p.id ? dragState : null;
              const isDraggingThis = Boolean(activeDrag);
              const pStart =
                activeDrag && (activeDrag.mode === 'move' || activeDrag.mode === 'resize-left')
                  ? addDays(rawStart, activeDrag.deltaDays)
                  : rawStart;
              const pEnd =
                activeDrag && (activeDrag.mode === 'move' || activeDrag.mode === 'resize-right')
                  ? addDays(rawEnd, activeDrag.deltaDays)
                  : rawEnd;
              const sMs = new Date(pStart).getTime();
              const eMs = Math.max(sMs + 86400000, new Date(pEnd).getTime());

              const rawLeft = ((sMs - startMs) / (endMs - startMs)) * 100;
              const rawRight = ((eMs - startMs) / (endMs - startMs)) * 100;
              const leftPct = Math.max(0, Math.min(96, rawLeft));
              const widthPct = Math.max(4, Math.min(100 - leftPct, rawRight - leftPct));
              const health = HEALTH_BADGE[p.healthStatus] || HEALTH_BADGE.ON_TRACK;
              const projMilestones = milestones.filter((m) => m.projectId === p.id);

              return (
                <div key={p.id} className="grid grid-cols-12 items-center hover:bg-slate-50/70">
                  <div className="col-span-4 px-4 py-3 border-r border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <PriorityBars priority={p.priority} />
                        <span className="font-mono text-[11px] font-bold text-slate-500">{p.projectCode}</span>
                        <span className="text-xs font-bold text-slate-900 truncate">{p.title}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUpdateProjectId(p.id);
                          setUpdateHealth(p.healthStatus || 'ON_TRACK');
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-orange-600"
                        title="Post status update"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={p.healthStatus}
                        onChange={(e) => onPatchProject(p.id, { healthStatus: e.target.value })}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${health.bg} ${health.text}`}
                      >
                        <option value="ON_TRACK">On track</option>
                        <option value="AT_RISK">At risk</option>
                        <option value="OFF_TRACK">Off track</option>
                        <option value="PENDING_REVIEW">Pending</option>
                      </select>

                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <input
                          type="date"
                          value={pStart}
                          onChange={(e) => onPatchProject(p.id, { startDate: e.target.value })}
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]"
                        />
                        <span>→</span>
                        <input
                          type="date"
                          value={pEnd}
                          onChange={(e) => onPatchProject(p.id, { targetDate: e.target.value })}
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-span-8 relative px-4 py-5">
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div
                        style={{ left: `${todayPct}%` }}
                        className="absolute top-0 bottom-0 w-px bg-orange-400/70 pointer-events-none"
                      />
                    )}
                    <div className="gantt-track relative h-7 w-full rounded-lg bg-slate-100/70 select-none">
                      <div
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        onPointerDown={(e) => startBarDrag(e, p.id, 'move', rawStart, rawEnd)}
                        title="Drag bar to shift dates, or drag edges to resize"
                        className="group absolute top-1 bottom-1 rounded-md border border-orange-300 bg-orange-50 px-2 flex items-center justify-between gap-2 shadow-sm cursor-grab active:cursor-grabbing"
                      >
                        <span
                          onPointerDown={(e) => startBarDrag(e, p.id, 'resize-left', rawStart, rawEnd)}
                          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l-md hover:bg-orange-400"
                          title="Drag to resize start date"
                        />
                        <span className="text-[10px] font-bold text-orange-900 truncate pl-1">
                          {p.title} ({p.progressPercent || 0}%)
                        </span>
                        <div className="flex items-center -space-x-1 shrink-0 pr-1">
                          {p.manager?.legalName && <AssigneeAvatarChip name={p.manager.legalName} size={18} />}
                        </div>
                        <span
                          onPointerDown={(e) => startBarDrag(e, p.id, 'resize-right', rawStart, rawEnd)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r-md hover:bg-orange-400"
                          title="Drag to resize target date"
                        />
                      </div>

                      {projMilestones.map((m) => {
                        if (!m.dueDate) return null;
                        const mMs = new Date(m.dueDate).getTime();
                        const mPct = ((mMs - startMs) / (endMs - startMs)) * 100;
                        if (mPct < 0 || mPct > 100) return null;
                        return (
                          <div
                            key={m.id}
                            style={{ left: `${mPct}%` }}
                            title={`Milestone: ${m.title} (${m.dueDate})`}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border border-slate-800 bg-amber-400"
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Project Status Updates Feed */}
      {statusUpdates.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Recent Project Health Updates</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {statusUpdates.slice(0, 6).map((u) => {
              const badge = HEALTH_BADGE[u.healthStatus] || HEALTH_BADGE.ON_TRACK;
              return (
                <div key={u.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      {u.project?.projectCode} · {u.project?.title}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">{u.summary}</p>
                  <div className="text-[10px] text-slate-400">
                    {u.author?.legalName} · {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {updateProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <form
            onSubmit={submitHealthUpdate}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-3"
          >
            <h4 className="text-sm font-bold text-slate-900">Post Project Health Update</h4>
            <select
              value={updateHealth}
              onChange={(e) => setUpdateHealth(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
            >
              <option value="ON_TRACK">On track</option>
              <option value="AT_RISK">At risk</option>
              <option value="OFF_TRACK">Off track</option>
            </select>
            <textarea
              required
              rows={3}
              value={updateSummary}
              onChange={(e) => setUpdateSummary(e.target.value)}
              placeholder="Summarize progress, blockers, or next milestone..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUpdateProjectId(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
              >
                Post Update
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

