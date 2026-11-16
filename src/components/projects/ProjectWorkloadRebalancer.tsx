'use client';

import React, { useState } from 'react';
import { Users, CalendarOff } from 'lucide-react';
import { AssigneeAvatarChip, IssueStatusIcon, PriorityBars } from './pmUiPrimitives';

interface ProjectWorkloadRebalancerProps {
  staffOptions: any[];
  workItems: any[];
  ecosystem: any;
  onPatchWorkItem: (id: string, patch: Record<string, any>) => Promise<void>;
  onSelectWorkItem: (item: any) => void;
}

export default function ProjectWorkloadRebalancer({
  staffOptions,
  workItems,
  ecosystem,
  onPatchWorkItem,
  onSelectWorkItem,
}: ProjectWorkloadRebalancerProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const leaves: any[] = ecosystem?.leaves || [];
  const attendanceToday: Record<string, any> = ecosystem?.attendanceToday || {};

  const unassigned = workItems.filter(
    (w) => !w.assigneeId && !['DONE', 'ACCEPTED', 'ARCHIVED'].includes(w.status)
  );

  const handleDropOnEmployee = async (employeeId: string | null) => {
    if (!draggedId) return;
    const id = draggedId;
    setDraggedId(null);
    await onPatchWorkItem(id, { assigneeId: employeeId });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-orange-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">Workload Capacity &amp; Drag-to-Rebalance</h3>
            <p className="text-xs text-slate-500">
              Drag any issue chip between teammates to balance capacity. Leave &amp; attendance status is synced live from HR.
            </p>
          </div>
        </div>
      </div>

      {/* Unassigned Swimlane */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => handleDropOnEmployee(null)}
        className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 space-y-2"
      >
        <div className="text-xs font-bold text-slate-700">Unassigned Queue ({unassigned.length}) — Drag onto any teammate below</div>
        <div className="flex flex-wrap gap-2">
          {unassigned.map((w) => (
            <div
              key={w.id}
              draggable
              onDragStart={() => setDraggedId(w.id)}
              onClick={() => onSelectWorkItem(w)}
              className="cursor-grab rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-orange-300 inline-flex items-center gap-1.5"
            >
              <IssueStatusIcon status={w.status} size={12} />
              <span className="font-mono text-slate-500">{w.itemKey}</span>
              <span className="truncate max-w-[200px]">{w.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Staff Swimlanes */}
      <div className="space-y-3">
        {staffOptions.map((s) => {
          const items = workItems.filter(
            (w) => w.assigneeId === s.id && !['DONE', 'ACCEPTED', 'ARCHIVED'].includes(w.status)
          );
          const pts = items.reduce((sum, w) => sum + (Number(w.storyPoints) || 2), 0);
          const capacityPct = Math.min(100, Math.round((pts / 25) * 100));
          const empLeave = leaves.find((l) => l.employeeId === s.id);
          const att = attendanceToday[s.id];

          return (
            <div
              key={s.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOnEmployee(s.id)}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-orange-300 transition space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AssigneeAvatarChip name={s.legalName} size={28} />
                  <div>
                    <div className="text-xs font-bold text-slate-900">{s.legalName}</div>
                    <div className="text-[11px] text-slate-500">{s.jobTitle || 'Staff'}</div>
                  </div>
                  {empLeave ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      <CalendarOff className="h-3 w-3" /> Leave {empLeave.startDate} → {empLeave.endDate}
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {att?.status || 'AVAILABLE'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 min-w-[200px]">
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-slate-500">{items.length} open</span>
                      <span className={capacityPct > 85 ? 'text-red-600' : 'text-slate-700'}>{pts} / 25 pts</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          capacityPct > 85 ? 'bg-red-500' : capacityPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${capacityPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {items.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {items.map((w) => (
                    <div
                      key={w.id}
                      draggable
                      onDragStart={() => setDraggedId(w.id)}
                      onClick={() => onSelectWorkItem(w)}
                      className="cursor-grab rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:border-orange-300 inline-flex items-center gap-1.5"
                    >
                      <IssueStatusIcon status={w.status} size={12} />
                      <PriorityBars priority={w.priority} />
                      <span className="font-mono text-orange-700">{w.itemKey}</span>
                      <span className="truncate max-w-[180px]">{w.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

