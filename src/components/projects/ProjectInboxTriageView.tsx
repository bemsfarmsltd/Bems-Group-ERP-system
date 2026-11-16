'use client';

import React, { useMemo, useState } from 'react';
import { Inbox, CheckCircle2, ArrowRightCircle, AlertTriangle, Archive } from 'lucide-react';
import { IssueStatusIcon, PriorityBars, AssigneeAvatarChip, WorkItemTypeBadge } from './pmUiPrimitives';

interface ProjectInboxTriageViewProps {
  actorId: string;
  workItems: any[];
  sprints: any[];
  staffOptions: any[];
  onPatchWorkItem: (id: string, patch: Record<string, any>) => Promise<void>;
  onSelectWorkItem: (item: any) => void;
}

export default function ProjectInboxTriageView({
  actorId,
  workItems,
  sprints,
  staffOptions,
  onPatchWorkItem,
  onSelectWorkItem,
}: ProjectInboxTriageViewProps) {
  const triageQueue = useMemo(
    () =>
      workItems.filter(
        (w) =>
          w.status === 'BACKLOG' ||
          w.status === 'BLOCKED' ||
          !w.assigneeId ||
          w.reviewerId === actorId
      ),
    [workItems, actorId]
  );

  const [selectedId, setSelectedId] = useState<string>(triageQueue[0]?.id || '');
  const selectedItem = triageQueue.find((w) => w.id === selectedId) || triageQueue[0] || null;
  const activeSprint = sprints.find((s) => s.status === 'ACTIVE') || sprints[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[540px]">
      {/* Left Pane: Triage Queue */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-bold text-slate-900">Triage Queue ({triageQueue.length})</span>
          </div>
          <span className="text-[11px] text-slate-500">Unassigned · Backlog · Blocked</span>
        </div>

        <div className="divide-y divide-slate-100 overflow-y-auto max-h-[520px]">
          {triageQueue.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Triage inbox is clear! All incoming requests are assigned and active.
            </div>
          ) : (
            triageQueue.map((w) => {
              const isSelected = selectedItem?.id === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedId(w.id)}
                  className={`w-full text-left px-4 py-3 transition flex flex-col gap-1.5 ${
                    isSelected ? 'bg-orange-50/70 border-l-4 border-l-orange-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <IssueStatusIcon status={w.status} size={13} />
                      <span className="font-mono text-[11px] font-bold text-slate-500">{w.itemKey}</span>
                      <WorkItemTypeBadge type={w.itemType} />
                    </div>
                    <PriorityBars priority={w.priority} />
                  </div>
                  <div className="text-xs font-bold text-slate-900 line-clamp-1">{w.title}</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{w.project?.projectCode || 'Project'}</span>
                    <span>{w.assignee?.legalName || 'Unassigned'}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane: Decision & Quick Triage Actions */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
        {!selectedItem ? (
          <div className="m-auto text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
            <div className="text-sm font-bold text-slate-900">Inbox Zero</div>
            <p className="text-xs text-slate-500">Select any incoming item to triage, assign, or route into a cycle.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-orange-700">{selectedItem.itemKey}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-semibold text-slate-600">{selectedItem.project?.title}</span>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">{selectedItem.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectWorkItem(selectedItem)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Full Details →
              </button>
            </div>

            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl border border-slate-200 p-4">
              {selectedItem.description || 'No description provided. Use the triage actions below to route or assign.'}
            </p>

            {/* 1-Click Triage Action Strip */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">1-Click Triage Actions</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onPatchWorkItem(selectedItem.id, { status: 'TODO', assigneeId: actorId })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Accept &amp; Assign to Me
                </button>

                {activeSprint && (
                  <button
                    type="button"
                    onClick={() =>
                      onPatchWorkItem(selectedItem.id, { status: 'TODO', sprintId: activeSprint.id })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <ArrowRightCircle className="h-3.5 w-3.5 text-orange-400" /> Route to {activeSprint.name}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onPatchWorkItem(selectedItem.id, { priority: 'URGENT', status: 'TODO' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Escalate Urgent
                </button>

                <button
                  type="button"
                  onClick={() => onPatchWorkItem(selectedItem.id, { status: 'ARCHIVED' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <Archive className="h-3.5 w-3.5" /> Decline / Archive
                </button>
              </div>
            </div>

            {/* Direct Reassign & Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Assign to Teammate</label>
                <div className="flex items-center gap-2">
                  <AssigneeAvatarChip name={selectedItem.assignee?.legalName} size={24} />
                  <select
                    value={selectedItem.assigneeId || ''}
                    onChange={(e) =>
                      onPatchWorkItem(selectedItem.id, {
                        assigneeId: e.target.value || null,
                        status: selectedItem.status === 'BACKLOG' ? 'TODO' : selectedItem.status,
                      })
                    }
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold"
                  >
                    <option value="">Unassigned</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.legalName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Target Due Date</label>
                <input
                  type="date"
                  value={selectedItem.dueDate || ''}
                  onChange={(e) => onPatchWorkItem(selectedItem.id, { dueDate: e.target.value || null })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

