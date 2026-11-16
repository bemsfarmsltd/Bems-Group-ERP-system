'use client';

import React, { useMemo, useState } from 'react';
import { RefreshCw, ArrowRight, ArrowLeft, Plus } from 'lucide-react';
import { IssueStatusIcon, PriorityBars, AssigneeAvatarChip } from './pmUiPrimitives';

interface ProjectCyclesCockpitProps {
  sprints: any[];
  workItems: any[];
  onPatchWorkItem: (id: string, patch: Record<string, any>) => Promise<void>;
  onCreateSprint: () => void;
  onCarryOver: (fromSprintId: string, toSprintId: string) => Promise<void>;
  onSelectWorkItem: (item: any) => void;
}

export default function ProjectCyclesCockpit({
  sprints,
  workItems,
  onPatchWorkItem,
  onCreateSprint,
  onCarryOver,
  onSelectWorkItem,
}: ProjectCyclesCockpitProps) {
  const [selectedSprintId, setSelectedSprintId] = useState<string>(
    sprints.find((s) => s.status === 'ACTIVE')?.id || sprints[0]?.id || ''
  );
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const activeSprint = sprints.find((s) => s.id === selectedSprintId) || sprints[0] || null;

  const backlogItems = useMemo(
    () => workItems.filter((w) => !w.sprintId && w.status !== 'ARCHIVED'),
    [workItems]
  );

  const cycleItems = useMemo(
    () => (activeSprint ? workItems.filter((w) => w.sprintId === activeSprint.id) : []),
    [workItems, activeSprint]
  );

  const committedPts = cycleItems.reduce((s, w) => s + (Number(w.storyPoints) || 1), 0);
  const completedPts = cycleItems
    .filter((w) => ['DONE', 'ACCEPTED'].includes(w.status))
    .reduce((s, w) => s + (Number(w.storyPoints) || 1), 0);
  const capacity = activeSprint?.capacityPoints || 40;
  const capacityPct = Math.min(100, Math.round((committedPts / Math.max(1, capacity)) * 100));
  const isOverloaded = committedPts > capacity;

  return (
    <div className="space-y-4">
      {/* Cycle Cockpit Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <RefreshCw className="h-4 w-4 text-orange-600" />
          <select
            value={activeSprint?.id || ''}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-900"
          >
            {sprints.length === 0 ? (
              <option value="">No Cycles Created</option>
            ) : (
              sprints.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name} ({sp.status})
                </option>
              ))
            )}
          </select>

          {activeSprint && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500">
                {activeSprint.startDate} → {activeSprint.endDate}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 font-bold ${
                  isOverloaded ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {committedPts} / {capacity} pts ({completedPts} done)
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSprint && activeSprint.status !== 'COMPLETED' && sprints.length > 1 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                onCarryOver(activeSprint.id, e.target.value);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            >
              <option value="">Complete &amp; carry over to...</option>
              {sprints
                .filter((s) => s.id !== activeSprint.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            onClick={onCreateSprint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> New Cycle
          </button>
        </div>
      </div>

      {/* Live Capacity Bar */}
      {activeSprint && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm space-y-1">
          <div className="flex justify-between text-[11px] font-bold">
            <span className="text-slate-600">Cycle Capacity Meter</span>
            <span className={isOverloaded ? 'text-red-600' : 'text-slate-800'}>
              {isOverloaded ? `Overbooked by ${committedPts - capacity} pts` : `${capacity - committedPts} pts remaining`}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isOverloaded ? 'bg-red-500' : 'bg-orange-500'}`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Split Drag-to-Plan Board: Backlog (Left) <-> Cycle Scope (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={async () => {
            if (!draggedItemId) return;
            const id = draggedItemId;
            setDraggedItemId(null);
            await onPatchWorkItem(id, { sprintId: null });
          }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5 min-h-[380px]"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900">Unscheduled Backlog ({backlogItems.length})</span>
            <span className="text-[11px] text-slate-400">Drag into cycle →</span>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {backlogItems.map((w) => (
              <div
                key={w.id}
                draggable
                onDragStart={() => setDraggedItemId(w.id)}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs hover:border-orange-300"
              >
                <div onClick={() => onSelectWorkItem(w)} className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <IssueStatusIcon status={w.status} size={13} />
                  <PriorityBars priority={w.priority} />
                  <span className="font-mono font-bold text-slate-500">{w.itemKey}</span>
                  <span className="font-semibold text-slate-900 truncate">{w.title}</span>
                </div>
                {activeSprint && (
                  <button
                    type="button"
                    onClick={() => onPatchWorkItem(w.id, { sprintId: activeSprint.id })}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:border-orange-300 hover:text-orange-700 shrink-0 inline-flex items-center gap-1"
                  >
                    Add <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={async () => {
            if (!draggedItemId || !activeSprint) return;
            const id = draggedItemId;
            setDraggedItemId(null);
            await onPatchWorkItem(id, { sprintId: activeSprint.id });
          }}
          className="rounded-2xl border border-orange-200 bg-orange-50/20 p-4 shadow-sm space-y-2.5 min-h-[380px]"
        >
          <div className="flex items-center justify-between pb-2 border-b border-orange-100">
            <span className="text-xs font-bold text-slate-900">
              {activeSprint ? `${activeSprint.name} Scope (${cycleItems.length})` : 'Select a Cycle'}
            </span>
            <span className="text-[11px] text-orange-700 font-semibold">Drop issues here</span>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {cycleItems.map((w) => (
              <div
                key={w.id}
                draggable
                onDragStart={() => setDraggedItemId(w.id)}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
              >
                <div onClick={() => onSelectWorkItem(w)} className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <IssueStatusIcon status={w.status} size={13} />
                  <span className="font-mono font-bold text-orange-700">{w.itemKey}</span>
                  <span className="font-semibold text-slate-900 truncate">{w.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {w.assignee?.legalName && <AssigneeAvatarChip name={w.assignee.legalName} size={18} />}
                  <span className="text-[10px] font-bold text-slate-500">{w.storyPoints || 1}p</span>
                  <button
                    type="button"
                    onClick={() => onPatchWorkItem(w.id, { sprintId: null })}
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-red-600"
                    title="Move back to backlog"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

