'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  Plus,
  Search,
  Download,
  RefreshCw,
  ShieldCheck,
  X,
  Briefcase,
  Pencil,
  Trash2,
} from 'lucide-react';
import { HrLeaveRecord } from './hrTypes';
import { DEFAULT_LEAVE_POLICIES, type HrLeavePolicyItem } from '@/lib/hr-leave-policies';

interface HrLeavePanelProps {
  initialStatusFilter?: string;
  selectedSubsidiaryId?: string;
  activeBrandColor?: string;
  onRefreshOverview: () => void;
}

interface StaffSummary {
  id: string;
  legalName: string;
  employeeNumber: string;
  jobTitle?: string | null;
  primaryAssignment?: {
    subsidiary?: { legalName?: string };
    department?: { name?: string };
  } | null;
}

function countDaysInclusive(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

export default function HrLeavePanel({
  initialStatusFilter = 'ALL',
  selectedSubsidiaryId = '',
  activeBrandColor = '#ea580c',
  onRefreshOverview,
}: HrLeavePanelProps) {
  const [subTab, setSubTab] = useState<'desk' | 'balances' | 'policies'>('desk');
  const [leaves, setLeaves] = useState<HrLeaveRecord[]>([]);
  const [staffList, setStaffList] = useState<StaffSummary[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<HrLeavePolicyItem[]>(DEFAULT_LEAVE_POLICIES);
  const [annualQuota, setAnnualQuota] = useState(20);
  const [sickQuota, setSickQuota] = useState(10);

  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicyType, setEditingPolicyType] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState<HrLeavePolicyItem>({
    type: '',
    label: '',
    defaultDays: 10,
    paid: true,
    notice: '7 days prior notice',
    desc: '',
  });

  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    leaveType: 'ANNUAL',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: '',
    handoverNotes: '',
  });

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const staffQs = selectedSubsidiaryId ? `?subsidiaryId=${encodeURIComponent(selectedSubsidiaryId)}` : '';
      const [leaveRes, staffRes, cfgRes] = await Promise.all([
        fetch('/api/hr/leave', { cache: 'no-store' }),
        fetch(`/api/hr/staff${staffQs}`, { cache: 'no-store' }),
        fetch('/api/hr/config', { cache: 'no-store' }),
      ]);
      const leaveData = await leaveRes.json();
      const staffData = await staffRes.json();
      const cfgData = await cfgRes.json();

      if (leaveRes.ok && leaveData.success) {
        setLeaves(leaveData.leaves || []);
      } else {
        setBanner({ type: 'err', text: leaveData.error || 'Failed to load leave requests.' });
      }
      if (staffRes.ok && staffData.success) {
        setStaffList(staffData.staff || []);
      }
      if (cfgRes.ok && cfgData.policy) {
        setAnnualQuota(Number(cfgData.policy.annualLeaveDays ?? 20));
        setSickQuota(Number(cfgData.policy.sickLeaveDays ?? 10));
      }
      if (cfgRes.ok && Array.isArray(cfgData.leavePolicies) && cfgData.leavePolicies.length > 0) {
        setLeavePolicies(cfgData.leavePolicies);
      }
    } catch {
      setBanner({ type: 'err', text: 'Network error loading leave management data.' });
    } finally {
      setLoading(false);
    }
  }, [selectedSubsidiaryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLeaveDecision = async (leaveId: string, action: 'APPROVE' | 'REJECT') => {
    setBusyId(leaveId);
    setBanner(null);
    try {
      const res = await fetch('/api/hr/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          leaveRequestId: leaveId,
          reviewNote: action === 'APPROVE' ? 'Approved via HR Workspace' : 'Declined via HR Workspace',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'err', text: data.error || 'Failed to process leave decision.' });
      } else {
        setBanner({ type: 'ok', text: `Leave request ${action.toLowerCase()}d.` });
        await loadData();
        onRefreshOverview();
      }
    } catch {
      setBanner({ type: 'err', text: 'Network error updating leave.' });
    } finally {
      setBusyId(null);
    }
  };

  const persistLeavePolicies = async (nextPolicies: HrLeavePolicyItem[], successMsg: string) => {
    setSavingPolicy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hr/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SAVE_LEAVE_POLICIES',
          leavePolicies: nextPolicies,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'err', text: data.error || 'Failed to save leave policies.' });
        return false;
      }
      if (Array.isArray(data.leavePolicies)) {
        setLeavePolicies(data.leavePolicies);
        const ann = data.leavePolicies.find((p: HrLeavePolicyItem) => p.type === 'ANNUAL');
        const sck = data.leavePolicies.find((p: HrLeavePolicyItem) => p.type === 'SICK');
        if (ann) setAnnualQuota(ann.defaultDays);
        if (sck) setSickQuota(sck.defaultDays);
      }
      setBanner({ type: 'ok', text: successMsg });
      onRefreshOverview();
      return true;
    } catch {
      setBanner({ type: 'err', text: 'Network error saving leave policies.' });
      return false;
    } finally {
      setSavingPolicy(false);
    }
  };

  const openNewPolicyModal = () => {
    setEditingPolicyType(null);
    setPolicyForm({
      type: '',
      label: '',
      defaultDays: 5,
      paid: true,
      notice: '7 days prior notice',
      desc: '',
    });
    setShowPolicyModal(true);
  };

  const openEditPolicyModal = (p: HrLeavePolicyItem) => {
    setEditingPolicyType(p.type);
    setPolicyForm({
      ...p,
      defaultDays: p.type === 'ANNUAL' ? annualQuota : p.type === 'SICK' ? sickQuota : p.defaultDays,
    });
    setShowPolicyModal(true);
  };

  const handleSavePolicyForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = (editingPolicyType || policyForm.type)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!normalizedCode || !policyForm.label.trim()) {
      setBanner({ type: 'err', text: 'Policy code and display name are required.' });
      return;
    }
    const nextItem: HrLeavePolicyItem = {
      type: normalizedCode,
      label: policyForm.label.trim(),
      defaultDays: Math.max(0, Math.min(365, Number(policyForm.defaultDays) || 0)),
      paid: Boolean(policyForm.paid),
      notice: policyForm.notice.trim() || 'Standard notice',
      desc: policyForm.desc.trim(),
    };
    const nextList = editingPolicyType
      ? leavePolicies.map((item) => (item.type === editingPolicyType ? nextItem : item))
      : leavePolicies.some((item) => item.type === normalizedCode)
        ? leavePolicies.map((item) => (item.type === normalizedCode ? nextItem : item))
        : [...leavePolicies, nextItem];

    const ok = await persistLeavePolicies(
      nextList,
      editingPolicyType ? `Updated leave policy "${nextItem.label}".` : `Created leave policy "${nextItem.label}".`
    );
    if (ok) setShowPolicyModal(false);
  };

  const handleDeletePolicy = async (policyType: string, label: string) => {
    if (leavePolicies.length <= 1) {
      setBanner({ type: 'err', text: 'At least one leave policy must remain active.' });
      return;
    }
    if (!window.confirm(`Remove leave policy "${label}" (${policyType})? Existing historical requests will remain intact.`)) {
      return;
    }
    const nextList = leavePolicies.filter((p) => p.type !== policyType);
    await persistLeavePolicies(nextList, `Removed leave policy "${label}".`);
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hr/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE',
          ...form,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'err', text: data.error || 'Failed to create leave request.' });
      } else {
        setBanner({ type: 'ok', text: 'Leave request logged and routed for approval.' });
        setShowCreateModal(false);
        setForm({
          employeeId: '',
          leaveType: 'ANNUAL',
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          reason: '',
          handoverNotes: '',
        });
        await loadData();
        onRefreshOverview();
      }
    } catch {
      setBanner({ type: 'err', text: 'Network error creating leave request.' });
    } finally {
      setSubmitting(false);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  const metrics = useMemo(() => {
    const pending = leaves.filter((l) => l.status === 'PENDING').length;
    const approved = leaves.filter((l) => l.status === 'APPROVED').length;
    const onLeaveToday = leaves.filter(
      (l) => l.status === 'APPROVED' && l.startDate <= todayIso && l.endDate >= todayIso
    ).length;
    return { pending, approved, onLeaveToday, total: leaves.length };
  }, [leaves, todayIso]);

  const filteredLeaves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leaves.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && l.leaveType !== typeFilter) return false;
      if (!q) return true;
      return (
        (l.employeeName || '').toLowerCase().includes(q) ||
        (l.employeeNumber || '').toLowerCase().includes(q) ||
        (l.department || '').toLowerCase().includes(q) ||
        (l.reason || '').toLowerCase().includes(q)
      );
    });
  }, [leaves, statusFilter, typeFilter, searchQuery]);

  const staffBalances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return staffList
      .filter((s) => {
        if (!q) return true;
        return (
          s.legalName.toLowerCase().includes(q) ||
          (s.employeeNumber || '').toLowerCase().includes(q) ||
          (s.primaryAssignment?.department?.name || '').toLowerCase().includes(q)
        );
      })
      .map((s) => {
        const empLeaves = leaves.filter((l) => l.employeeId === s.id && l.status === 'APPROVED');
        const usedAnnual = empLeaves
          .filter((l) => l.leaveType === 'ANNUAL')
          .reduce((acc, l) => acc + countDaysInclusive(l.startDate, l.endDate), 0);
        const usedSick = empLeaves
          .filter((l) => l.leaveType === 'SICK')
          .reduce((acc, l) => acc + countDaysInclusive(l.startDate, l.endDate), 0);
        return {
          ...s,
          usedAnnual,
          remainingAnnual: Math.max(0, annualQuota - usedAnnual),
          usedSick,
          remainingSick: Math.max(0, sickQuota - usedSick),
        };
      });
  }, [staffList, leaves, annualQuota, sickQuota, searchQuery]);

  const exportCsv = () => {
    const rows = [
      ['Employee', 'Staff ID', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Reason'],
      ...filteredLeaves.map((l) => [
        l.employeeName,
        l.employeeNumber,
        l.department,
        l.leaveType,
        l.startDate,
        l.endDate,
        String(countDaysInclusive(l.startDate, l.endDate)),
        l.status,
        l.reason,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bems_leave_register.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium flex items-center justify-between ${
            banner.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 4 KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-t-2 border-t-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Approvals</span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{metrics.pending}</div>
          <p className="mt-1 text-xs text-slate-500">Awaiting HR or GMD review</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-t-2 border-t-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approved Leaves</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{metrics.approved}</div>
          <p className="mt-1 text-xs text-slate-500">{metrics.total} total requests logged</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-t-2 border-t-blue-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">On Leave Today</span>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{metrics.onLeaveToday}</div>
          <p className="mt-1 text-xs text-slate-500">Active approved absences ({todayIso})</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-t-2" style={{ borderTopColor: activeBrandColor }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Annual / Sick Quota</span>
            <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${activeBrandColor}15`, color: activeBrandColor }}>
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{annualQuota}d / {sickQuota}d</div>
          <p className="mt-1 text-xs text-slate-500">Synced with HR Policy Config</p>
        </div>
      </div>

      {/* Underline Sub-Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6 overflow-x-auto">
            {[
              { id: 'desk', label: 'Leave Approval Desk', count: leaves.length },
              { id: 'balances', label: 'Staff Leave Balances & Quotas', count: staffList.length },
              { id: 'policies', label: 'Leave Policies & Types', count: leavePolicies.length },
            ].map((t) => {
              const active = subTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id as typeof subTab)}
                  className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                    active ? 'text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  style={active ? { borderColor: activeBrandColor, color: activeBrandColor } : undefined}
                >
                  <span>{t.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pb-2">
            {subTab === 'policies' && (
              <button
                type="button"
                onClick={openNewPolicyModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" style={{ color: activeBrandColor }} /> New Leave Policy
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: activeBrandColor }}
            >
              <Plus className="h-3.5 w-3.5" /> Log Leave Request
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Export Toolbar */}
      {subTab !== 'policies' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee, ID, or department..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none"
              />
            </div>

            {subTab === 'desk' && (
              <>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="ALL">All Leave Types</option>
                  {leavePolicies.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      )}

      {/* Main Views */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading Leave Management telemetry...
        </div>
      ) : subTab === 'desk' ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Leave Type &amp; Dates</th>
                  <th className="px-4 py-3">Reason &amp; Handover</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <div className="text-sm font-semibold text-slate-700">No leave requests found</div>
                      <p className="text-xs text-slate-500 mt-1">
                        Staff requests submitted from the BEMS Staff App or logged by HR will appear here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLeaves.map((lv) => {
                    const isPending = lv.status === 'PENDING';
                    const days = countDaysInclusive(lv.startDate, lv.endDate);
                    return (
                      <tr key={lv.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900">{lv.employeeName}</div>
                          <div className="text-xs text-slate-500">
                            {lv.employeeNumber} · {lv.department}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900">
                            {lv.leaveType} <span className="text-xs font-medium text-slate-500">({days}d)</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {lv.startDate} → {lv.endDate}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="text-slate-800 truncate">{lv.reason}</div>
                          {lv.handoverNotes && (
                            <div className="text-xs text-slate-500 truncate">Handover: {lv.handoverNotes}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              lv.status === 'APPROVED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : lv.status === 'REJECTED'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {lv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {isPending ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyId === lv.id}
                                onClick={() => handleLeaveDecision(lv.id, 'APPROVE')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button
                                type="button"
                                disabled={busyId === lv.id}
                                onClick={() => handleLeaveDecision(lv.id, 'REJECT')}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">
                              {lv.reviewedByName ? `By ${lv.reviewedByName}` : 'Finalized'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : subTab === 'balances' ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Annual Leave ({annualQuota}d)</th>
                  <th className="px-4 py-3">Sick Leave ({sickQuota}d)</th>
                  <th className="px-4 py-3 text-right">Remaining Annual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffBalances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      No employees match your filter.
                    </td>
                  </tr>
                ) : (
                  staffBalances.map((s) => {
                    const pct = Math.min(100, Math.round((s.usedAnnual / Math.max(1, annualQuota)) * 100));
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{s.legalName}</div>
                          <div className="text-xs text-slate-500">{s.employeeNumber}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {s.primaryAssignment?.department?.name || 'General'} ·{' '}
                          {s.primaryAssignment?.subsidiary?.legalName || 'BEMS Group'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-28 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: activeBrandColor }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">
                              {s.usedAnnual} / {annualQuota}d
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                          {s.usedSick} / {sickQuota}d used
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                            {s.remainingAnnual} days left
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Configured Leave Policies &amp; Entitlements</div>
              <p className="text-xs text-slate-500">
                Create, edit, or remove leave categories. Changes automatically sync to Staff Balances and the BEMS Staff App.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewPolicyModal}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: activeBrandColor }}
            >
              <Plus className="h-3.5 w-3.5" /> New Leave Policy
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leavePolicies.map((p) => {
              const quota =
                p.type === 'ANNUAL' ? annualQuota : p.type === 'SICK' ? sickQuota : p.defaultDays;
              return (
                <div key={p.type} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                        {p.type}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          {quota} days / year
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditPolicyModal(p)}
                          title={`Edit ${p.label}`}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={savingPolicy}
                          onClick={() => void handleDeletePolicy(p.type, p.label)}
                          title={`Delete ${p.label}`}
                          className="rounded-lg border border-rose-200 bg-rose-50/60 p-1.5 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-900">{p.label}</h3>
                    <p className="mt-1 text-xs text-slate-500">{p.desc || 'Organization leave policy.'}</p>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className={`h-3.5 w-3.5 ${p.paid ? 'text-emerald-500' : 'text-amber-500'}`} /> {p.paid ? 'Paid Leave' : 'Unpaid Leave'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5 text-slate-400" /> {p.notice}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log Leave Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Log Staff Leave Request</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Employee</label>
                <select
                  required
                  value={form.employeeId}
                  onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Select staff member...</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.legalName} ({s.employeeNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Leave Type</label>
                <select
                  value={form.leaveType}
                  onChange={(e) => setForm((p) => ({ ...p, leaveType: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                >
                  {leavePolicies.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    required
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                <textarea
                  required
                  rows={2}
                  value={form.reason}
                  onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Brief reason for leave..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Handover Notes (Optional)</label>
                <input
                  type="text"
                  value={form.handoverNotes}
                  onChange={(e) => setForm((p) => ({ ...p, handoverNotes: e.target.value }))}
                  placeholder="Colleague covering duties..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: activeBrandColor }}
                >
                  {submitting ? 'Submitting...' : 'Submit Leave Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Leave Policy Modal */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingPolicyType ? `Edit Leave Policy (${editingPolicyType})` : 'Create New Leave Policy'}
              </h3>
              <button onClick={() => setShowPolicyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSavePolicyForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Policy Code</label>
                  <input
                    required
                    disabled={Boolean(editingPolicyType)}
                    type="text"
                    value={policyForm.type}
                    onChange={(e) => setPolicyForm((p) => ({ ...p, type: e.target.value.toUpperCase() }))}
                    placeholder="e.g. SABBATICAL"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Days / Year Quota</label>
                  <input
                    required
                    type="number"
                    min={0}
                    max={365}
                    value={policyForm.defaultDays}
                    onChange={(e) => setPolicyForm((p) => ({ ...p, defaultDays: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Policy Display Name</label>
                <input
                  required
                  type="text"
                  value={policyForm.label}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. Sabbatical / Research Leave"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Compensation Type</label>
                  <select
                    value={policyForm.paid ? 'PAID' : 'UNPAID'}
                    onChange={(e) => setPolicyForm((p) => ({ ...p, paid: e.target.value === 'PAID' }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="PAID">Paid Leave</option>
                    <option value="UNPAID">Unpaid Leave</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prior Notice Rule</label>
                  <input
                    required
                    type="text"
                    value={policyForm.notice}
                    onChange={(e) => setPolicyForm((p) => ({ ...p, notice: e.target.value }))}
                    placeholder="e.g. 14 days prior notice"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Policy Description</label>
                <textarea
                  rows={2}
                  value={policyForm.desc}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, desc: e.target.value }))}
                  placeholder="Eligibility criteria, required documentation, or approval rules..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPolicyModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPolicy}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: activeBrandColor }}
                >
                  {savingPolicy ? 'Saving...' : editingPolicyType ? 'Save Changes' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

