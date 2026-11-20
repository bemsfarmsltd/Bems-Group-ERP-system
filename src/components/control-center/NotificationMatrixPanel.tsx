'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  MatrixRoleKey,
  NotificationCategoryKey,
  NotificationChannelConfig,
  NotificationChannelKey,
  NotificationEventDef,
  NotificationPolicyMatrix,
} from '@/lib/notifications/policy-matrix';

interface CustomProfileMeta {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
}

interface CategoryMeta {
  key: NotificationCategoryKey;
  label: string;
  description: string;
}

type RecipientTarget =
  | { kind: 'ROLE'; key: MatrixRoleKey; label: string; badge: string }
  | { kind: 'CUSTOM'; key: string; label: string; badge: string; memberCount: number };

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  accent = 'orange',
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  accent?: 'orange' | 'emerald' | 'sky';
}) {
  const activeBg =
    accent === 'emerald'
      ? 'bg-emerald-600'
      : accent === 'sky'
        ? 'bg-sky-600'
        : 'bg-[#ea580c]';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-50'
          : checked
            ? `${activeBg} border-transparent cursor-pointer`
            : 'border-slate-300 bg-slate-200 cursor-pointer'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function NotificationMatrixPanel({
  setNotice,
}: {
  setNotice: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [events, setEvents] = useState<NotificationEventDef[]>([]);
  const [customProfiles, setCustomProfiles] = useState<CustomProfileMeta[]>([]);
  const [matrix, setMatrix] = useState<NotificationPolicyMatrix | null>(null);
  const [dirty, setDirty] = useState(false);

  const [selectedTarget, setSelectedTarget] = useState<string>('ROLE:GMD');
  const [activeCategory, setActiveCategory] = useState<'ALL' | NotificationCategoryKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/control-center/notification-matrix', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load notification matrix.');
      setCategories(json.categories || []);
      setEvents(json.events || []);
      setCustomProfiles(json.customProfiles || []);
      setMatrix(json.matrix || null);
      setDirty(false);
    } catch (err: any) {
      setError(err?.message || 'Could not load notification matrix.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const targets: RecipientTarget[] = useMemo(() => {
    const base: RecipientTarget[] = [
      { kind: 'ROLE', key: 'GMD', label: 'The GMD', badge: 'Executive' },
      { kind: 'ROLE', key: 'SUPER_ADMIN', label: 'Super Admin', badge: 'Root Admin' },
      { kind: 'ROLE', key: 'STAFF', label: 'Staff', badge: 'All Staff' },
    ];
    for (const p of customProfiles) {
      base.push({
        kind: 'CUSTOM',
        key: p.id,
        label: p.name,
        badge: 'Custom Admin',
        memberCount: p.memberCount,
      });
    }
    return base;
  }, [customProfiles]);

  const activeTarget = useMemo(() => {
    const [kind, key] = selectedTarget.split(':');
    return { kind: kind as 'ROLE' | 'CUSTOM', key };
  }, [selectedTarget]);

  const getRoleMap = useCallback(
    (target: { kind: 'ROLE' | 'CUSTOM'; key: string }): Record<string, NotificationChannelConfig> => {
      if (!matrix) return {};
      if (target.kind === 'ROLE') {
        return matrix.roles[target.key as MatrixRoleKey] || {};
      }
      return matrix.customProfiles[target.key] || {};
    },
    [matrix]
  );

  const currentMap = useMemo(() => getRoleMap(activeTarget), [getRoleMap, activeTarget]);

  const updateEventChannel = (
    eventKey: string,
    channel: NotificationChannelKey,
    value: boolean
  ) => {
    if (!matrix) return;
    setMatrix((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const targetMap =
        activeTarget.kind === 'ROLE'
          ? next.roles[activeTarget.key as MatrixRoleKey]
          : (next.customProfiles[activeTarget.key] ||= {});
      const existing = targetMap[eventKey] || { inApp: true, email: false, bridge: false };
      targetMap[eventKey] = { ...existing, [channel]: value };
      return next;
    });
    setDirty(true);
  };

  const bulkToggleCategory = (
    categoryEvents: NotificationEventDef[],
    channel: NotificationChannelKey,
    value: boolean
  ) => {
    if (!matrix) return;
    setMatrix((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const targetMap =
        activeTarget.kind === 'ROLE'
          ? next.roles[activeTarget.key as MatrixRoleKey]
          : (next.customProfiles[activeTarget.key] ||= {});
      for (const evt of categoryEvents) {
        if (channel === 'bridge' && !evt.supportsBridge) continue;
        const existing = targetMap[evt.key] || { inApp: true, email: false, bridge: false };
        targetMap[evt.key] = { ...existing, [channel]: value };
      }
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!matrix) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/control-center/notification-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_MATRIX', matrix }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save notification matrix.');
      setMatrix(json.matrix);
      setDirty(false);
      setNotice('Enterprise Notification & Email Matrix saved and active across BEMS.');
    } catch (err: any) {
      setError(err?.message || 'Could not save notification matrix.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestDispatch = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch('/api/control-center/notification-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'TEST_DISPATCH', eventKey: 'REQUEST_SUBMITTED' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Test dispatch failed.');
      const d = json.delivery || {};
      setNotice(`Live Test Dispatched: ${d.inAppCount ?? 0} In-App notification(s), ${d.emailCount ?? 0} Email(s) sent via Resend.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to send test alert.');
    } finally {
      setTesting(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/control-center/notification-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET_DEFAULTS' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reset notification defaults.');
      setMatrix(json.matrix);
      setDirty(false);
      setNotice('Notification & Email Matrix restored to enterprise defaults.');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset defaults.');
    } finally {
      setSaving(false);
    }
  };

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((evt) => {
      if (activeCategory !== 'ALL' && evt.category !== activeCategory) return false;
      if (!q) return true;
      return (
        evt.label.toLowerCase().includes(q) ||
        evt.description.toLowerCase().includes(q) ||
        evt.key.toLowerCase().includes(q)
      );
    });
  }, [events, activeCategory, searchQuery]);

  const stats = useMemo(() => {
    let inAppOn = 0;
    let emailOn = 0;
    let bridgeOn = 0;
    for (const evt of events) {
      const cfg = currentMap[evt.key] || evt.defaults.STAFF;
      if (cfg.inApp) inAppOn++;
      if (cfg.email) emailOn++;
      if (evt.supportsBridge && cfg.bridge) bridgeOn++;
    }
    return { total: events.length, inAppOn, emailOn, bridgeOn };
  }, [events, currentMap]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs font-semibold text-slate-500">
        Loading Enterprise Notification &amp; Email Matrix…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Save Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#ea580c]">
              CONTROL CENTER · NOTIFICATION &amp; EMAIL GOVERNANCE
            </div>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">
              System-Wide Notification &amp; Email Matrix
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Configure In-App Bell, Email (Resend), and WhatsApp/Slack alerts for Staff, GMD, Super Admin, and every Custom Admin profile across all 28 system events.
            </p>
            {matrix?.updatedAt && (
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Last updated {new Date(matrix.updatedAt).toLocaleString()}
                {matrix.updatedByName ? ` by ${matrix.updatedByName}` : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTestDispatch}
              disabled={saving || testing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Bell className="h-3.5 w-3.5" />
              {testing ? 'Sending Test…' : 'Send Live Test Alert'}
            </button>
            <button
              type="button"
              onClick={loadMatrix}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold shadow-sm transition ${
                dirty
                  ? 'bg-[#ea580c] text-white hover:bg-orange-700'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving Matrix…' : dirty ? 'Save Configuration' : 'Saved'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        {/* Role & Custom Admin Selector */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-2">
            SELECT RECIPIENT ROLE OR CUSTOM ADMIN PROFILE
          </div>
          <div className="flex flex-wrap gap-2">
            {targets.map((t) => {
              const id = `${t.kind}:${t.key}`;
              const active = selectedTarget === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedTarget(id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                    active
                      ? 'border-[#ea580c] bg-[#fff7ed] text-[#c2410c] shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300'
                  }`}
                >
                  {t.kind === 'ROLE' ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                  <span>{t.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      active
                        ? 'bg-[#ea580c] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.kind === 'CUSTOM' ? `${t.memberCount} admin${t.memberCount === 1 ? '' : 's'}` : t.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total System Events', value: stats.total, sub: 'Tracked across all modules', icon: ShieldCheck, color: 'text-[#ea580c] bg-orange-50' },
          { label: 'In-App Bell Active', value: `${stats.inAppOn} / ${stats.total}`, sub: 'Web & Mobile notification center', icon: Bell, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Email (Resend) Active', value: `${stats.emailOn} / ${stats.total}`, sub: 'Instant email dispatch', icon: Mail, color: 'text-orange-600 bg-orange-50' },
          { label: 'WhatsApp / Slack Bridge', value: `${stats.bridgeOn} / ${events.filter((e) => e.supportsBridge).length}`, sub: 'Real-time executive channel', icon: MessageSquare, color: 'text-sky-600 bg-sky-50' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold text-slate-500">{card.label}</div>
                <div className="text-xl font-black text-slate-900 mt-0.5">{card.value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{card.sub}</div>
              </div>
              <div className={`rounded-xl p-2.5 ${card.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeCategory === 'ALL'
                ? 'bg-[#ea580c] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories ({events.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeCategory === cat.key
                  ? 'bg-[#ea580c] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[230px]">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notification event…"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:border-[#ea580c] focus:bg-white"
          />
        </div>
      </div>

      {/* Grouped Category Tables */}
      {categories
        .filter((cat) => activeCategory === 'ALL' || activeCategory === cat.key)
        .map((cat) => {
          const catEvents = filteredEvents.filter((e) => e.category === cat.key);
          if (catEvents.length === 0) return null;

          const allInApp = catEvents.every((e) => (currentMap[e.key]?.inApp ?? e.defaults.STAFF.inApp));
          const allEmail = catEvents.every((e) => (currentMap[e.key]?.email ?? e.defaults.STAFF.email));
          const bridgeable = catEvents.filter((e) => e.supportsBridge);
          const allBridge = bridgeable.length > 0 && bridgeable.every((e) => (currentMap[e.key]?.bridge ?? e.defaults.STAFF.bridge));

          return (
            <div key={cat.key} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">{cat.label}</h3>
                  <p className="text-[11px] text-slate-500">{cat.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => bulkToggleCategory(catEvents, 'inApp', !allInApp)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:border-emerald-400"
                  >
                    {allInApp ? 'Disable All In-App' : 'Enable All In-App'}
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkToggleCategory(catEvents, 'email', !allEmail)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:border-orange-400"
                  >
                    {allEmail ? 'Disable All Email' : 'Enable All Email'}
                  </button>
                  {bridgeable.length > 0 && (
                    <button
                      type="button"
                      onClick={() => bulkToggleCategory(catEvents, 'bridge', !allBridge)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:border-sky-400"
                    >
                      {allBridge ? 'Disable All Bridge' : 'Enable All Bridge'}
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {catEvents.map((evt) => {
                  const cfg = currentMap[evt.key] || evt.defaults.STAFF;
                  const sevBadge =
                    evt.severity === 'CRITICAL'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : evt.severity === 'HIGH'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200';

                  return (
                    <div
                      key={evt.key}
                      className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/50 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900">{evt.label}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold ${sevBadge}`}>
                            {evt.severity}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{evt.description}</p>
                      </div>

                      <div className="flex items-center gap-6 shrink-0">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                          <Bell className="h-3.5 w-3.5 text-emerald-600" />
                          <span>In-App</span>
                          <ToggleSwitch
                            checked={cfg.inApp}
                            accent="emerald"
                            onChange={(v) => updateEventChannel(evt.key, 'inApp', v)}
                          />
                        </label>

                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                          <Mail className="h-3.5 w-3.5 text-[#ea580c]" />
                          <span>Email</span>
                          <ToggleSwitch
                            checked={cfg.email}
                            accent="orange"
                            onChange={(v) => updateEventChannel(evt.key, 'email', v)}
                          />
                        </label>

                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 min-w-[115px]">
                          <MessageSquare className={`h-3.5 w-3.5 ${evt.supportsBridge ? 'text-sky-600' : 'text-slate-300'}`} />
                          <span className={evt.supportsBridge ? '' : 'text-slate-400'}>Bridge</span>
                          <ToggleSwitch
                            checked={evt.supportsBridge ? cfg.bridge : false}
                            disabled={!evt.supportsBridge}
                            accent="sky"
                            onChange={(v) => updateEventChannel(evt.key, 'bridge', v)}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}
