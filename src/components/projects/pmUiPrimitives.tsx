'use client';

import React from 'react';

export function IssueStatusIcon({ status, size = 15 }: { status: string; size?: number }) {
  const s = String(status || 'TODO').toUpperCase();

  if (s === 'BACKLOG') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label="Backlog">
        <circle cx="8" cy="8" r="6" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
      </svg>
    );
  }
  if (s === 'TODO') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label="To Do">
        <circle cx="8" cy="8" r="6" stroke="#64748b" strokeWidth="1.6" />
      </svg>
    );
  }
  if (s === 'IN_PROGRESS') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label="In Progress">
        <circle cx="8" cy="8" r="6" stroke="#f59e0b" strokeWidth="1.6" />
        <path d="M8 2 A6 6 0 0 1 8 14 Z" fill="#f59e0b" />
      </svg>
    );
  }
  if (s === 'IN_REVIEW' || s === 'QA_TESTING') {
    const color = s === 'QA_TESTING' ? '#0284c7' : '#6366f1';
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label={s}>
        <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.6" />
        <circle cx="8" cy="8" r="2.6" fill={color} />
      </svg>
    );
  }
  if (s === 'BLOCKED') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label="Blocked">
        <circle cx="8" cy="8" r="6.5" fill="#fef2f2" stroke="#dc2626" strokeWidth="1.5" />
        <path d="M8 4.8V8.5M8 10.9V11.1" stroke="#dc2626" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (s === 'DONE' || s === 'ACCEPTED' || s === 'COMPLETED') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label={s}>
        <circle cx="8" cy="8" r="6.5" fill="#10b981" />
        <path d="M5.2 8.2L7.1 10.1L11 6.1" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label={s}>
      <circle cx="8" cy="8" r="6" stroke="#94a3b8" strokeWidth="1.6" />
    </svg>
  );
}

export function PriorityBars({ priority }: { priority: string }) {
  const p = String(priority || 'MEDIUM').toUpperCase();
  if (p === 'URGENT' || p === 'CRITICAL') {
    return (
      <span
        title="Urgent Priority"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 4,
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          fontSize: 11,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        !
      </span>
    );
  }
  const activeBars = p === 'HIGH' ? 3 : p === 'MEDIUM' ? 2 : 1;
  const activeColor = p === 'HIGH' ? '#ea580c' : p === 'MEDIUM' ? '#d97706' : '#64748b';
  return (
    <span
      title={`${p} Priority`}
      style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1.5, height: 12 }}
    >
      <span style={{ width: 2.5, height: 5, borderRadius: 1, background: activeBars >= 1 ? activeColor : '#e2e8f0' }} />
      <span style={{ width: 2.5, height: 8, borderRadius: 1, background: activeBars >= 2 ? activeColor : '#e2e8f0' }} />
      <span style={{ width: 2.5, height: 11, borderRadius: 1, background: activeBars >= 3 ? activeColor : '#e2e8f0' }} />
    </span>
  );
}

export function WorkItemTypeBadge({ type }: { type: string }) {
  const t = String(type || 'TASK').toUpperCase();
  const styles: Record<string, { bg: string; border: string; text: string; label: string }> = {
    BUG: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', label: 'BUG' },
    STORY: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', label: 'STORY' },
    EPIC: { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9', label: 'EPIC' },
    SUBTASK: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'SUB' },
    TASK: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'TASK' },
  };
  const cfg = styles[t] || styles.TASK;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: '0.04em',
      }}
    >
      {cfg.label}
    </span>
  );
}

export function RagBadge({ rag }: { rag: string }) {
  const r = String(rag || 'GREEN').toUpperCase();
  const map: Record<string, { bg: string; border: string; dot: string; text: string; label: string }> = {
    GREEN: { bg: '#ecfdf5', border: '#a7f3d0', dot: '#10b981', text: '#065f46', label: 'On Track' },
    AMBER: { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', text: '#92400e', label: 'At Risk' },
    RED: { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', text: '#991b1b', label: 'Off Track' },
  };
  const cfg = map[r] || map.GREEN;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 999,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '999px', background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

export function AvatarChip({ name, size = 22 }: { name?: string | null; size?: number }) {
  const label = name || 'Unassigned';
  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0]?.toUpperCase())
        .join('')
    : '—';
  const palette = ['#ea580c', '#0284c7', '#6366f1', '#0d9488', '#7c3aed', '#b45309'];
  const hash = label.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const bg = name ? palette[hash % palette.length] : '#e2e8f0';
  const fg = name ? '#ffffff' : '#64748b';
  return (
    <span
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: bg,
        color: fg,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1.5px solid #ffffff',
        boxShadow: '0 0 0 1px #e2e8f0',
      }}
    >
      {initials}
    </span>
  );
}

export const AssigneeAvatarChip = AvatarChip;

export function SubIssueRing({ done, total }: { done: number; total: number }) {
  if (!total) return null;
  const pct = Math.min(1, Math.max(0, done / total));
  const r = 5.5;
  const circ = 2 * Math.PI * r;
  return (
    <span
      title={`${done}/${total} sub-issues completed`}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
    >
      <svg width={13} height={13} viewBox="0 0 14 14" className="-rotate-90">
        <circle cx="7" cy="7" r={r} fill="none" stroke="#e2e8f0" strokeWidth="2" />
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke={pct >= 1 ? '#10b981' : '#ea580c'}
          strokeWidth="2"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
        />
      </svg>
      <span>
        {done}/{total}
      </span>
    </span>
  );
}

export function LabelDotPill({ name, color = '#3b82f6' }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate max-w-[110px]">{name}</span>
    </span>
  );
}

