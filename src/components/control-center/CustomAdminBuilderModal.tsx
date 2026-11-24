'use client';

import React, { useState } from 'react';
import {
  ADMIN_PERMISSION_CATALOG,
  type AdminModuleKey,
  type CustomAdminPermissionsMap,
  isReadOnlyActionKey,
  type ModulePermissionGrant,
} from '@/lib/admin-permissions';
import { Building2, CheckSquare, Layers, ShieldCheck, Square, X } from 'lucide-react';

interface SubsidiaryOption {
  id: string;
  legalName: string;
  code?: string;
}

export interface CustomAdminProfilePayload {
  id?: string;
  name: string;
  description: string;
  permissions: CustomAdminPermissionsMap;
}

interface CustomAdminBuilderModalProps {
  subsidiaries: SubsidiaryOption[];
  initialProfile?: CustomAdminProfilePayload | null;
  onCancel: () => void;
  onSaved: (profile: any) => void;
}

export function CustomAdminBuilderModal({
  subsidiaries,
  initialProfile,
  onCancel,
  onSaved,
}: CustomAdminBuilderModalProps) {
  const [name, setName] = useState(initialProfile?.name || '');
  const [description, setDescription] = useState(initialProfile?.description || '');
  const [permissions, setPermissions] = useState<CustomAdminPermissionsMap>(
    initialProfile?.permissions || {}
  );
  const [activeModule, setActiveModule] = useState<AdminModuleKey>('finance');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentModDef =
    ADMIN_PERMISSION_CATALOG.find((m) => m.key === activeModule) || ADMIN_PERMISSION_CATALOG[0];

  const getModuleGrant = (modKey: AdminModuleKey): ModulePermissionGrant => {
    return (
      permissions[modKey] || {
        enabled: false,
        subsidiaryScope: 'ONBOARDED',
        subsidiaryIds: [],
        categories: {},
      }
    );
  };

  const updateModuleGrant = (modKey: AdminModuleKey, next: ModulePermissionGrant) => {
    setPermissions((prev) => ({
      ...prev,
      [modKey]: next,
    }));
  };

  const toggleModuleEnabled = (modKey: AdminModuleKey) => {
    const cur = getModuleGrant(modKey);
    const modDef = ADMIN_PERMISSION_CATALOG.find((m) => m.key === modKey);
    if (!cur.enabled && Object.keys(cur.categories).length === 0 && modDef) {
      // Pre-populate first category view-only or empty ready for toggles
      updateModuleGrant(modKey, { ...cur, enabled: true });
    } else {
      updateModuleGrant(modKey, { ...cur, enabled: !cur.enabled });
    }
  };

  const grantReadOnlyModule = (modKey: AdminModuleKey) => {
    const modDef = ADMIN_PERMISSION_CATALOG.find((m) => m.key === modKey);
    if (!modDef) return;
    const cats: ModulePermissionGrant['categories'] = {};
    for (const c of modDef.categories) {
      const roActions = c.actions.filter((a) => isReadOnlyActionKey(a.key)).map((a) => a.key);
      if (roActions.length > 0) {
        cats[c.key] = {
          enabled: true,
          actions: roActions,
        };
      }
    }
    updateModuleGrant(modKey, {
      enabled: true,
      subsidiaryScope: 'ONBOARDED',
      subsidiaryIds: [],
      categories: cats,
    });
  };

  const grantFullModule = (modKey: AdminModuleKey) => {
    const modDef = ADMIN_PERMISSION_CATALOG.find((m) => m.key === modKey);
    if (!modDef) return;
    const cats: ModulePermissionGrant['categories'] = {};
    for (const c of modDef.categories) {
      cats[c.key] = {
        enabled: true,
        actions: c.actions.map((a) => a.key),
      };
    }
    updateModuleGrant(modKey, {
      enabled: true,
      subsidiaryScope: 'ONBOARDED',
      subsidiaryIds: [],
      categories: cats,
    });
  };

  const clearModule = (modKey: AdminModuleKey) => {
    updateModuleGrant(modKey, {
      enabled: false,
      subsidiaryScope: 'ALL',
      subsidiaryIds: [],
      categories: {},
    });
  };

  const toggleSubsidiaryId = (modKey: AdminModuleKey, subId: string) => {
    const cur = getModuleGrant(modKey);
    const exists = cur.subsidiaryIds.includes(subId);
    const nextIds = exists
      ? cur.subsidiaryIds.filter((id) => id !== subId)
      : [...cur.subsidiaryIds, subId];
    updateModuleGrant(modKey, {
      ...cur,
      subsidiaryScope: 'SELECTED',
      subsidiaryIds: nextIds,
    });
  };

  const toggleCategory = (modKey: AdminModuleKey, catKey: string, allActions: string[]) => {
    const cur = getModuleGrant(modKey);
    const existing = cur.categories[catKey];
    const nextEnabled = !(existing?.enabled);
    updateModuleGrant(modKey, {
      ...cur,
      enabled: true,
      categories: {
        ...cur.categories,
        [catKey]: {
          enabled: nextEnabled,
          actions: nextEnabled
            ? existing?.actions?.length
              ? existing.actions
              : allActions
            : [],
        },
      },
    });
  };

  const toggleAction = (modKey: AdminModuleKey, catKey: string, actionKey: string) => {
    const cur = getModuleGrant(modKey);
    const existing = cur.categories[catKey] || { enabled: true, actions: [] };
    const has = existing.actions.includes(actionKey);
    const nextActions = has
      ? existing.actions.filter((a) => a !== actionKey)
      : [...existing.actions, actionKey];
    updateModuleGrant(modKey, {
      ...cur,
      enabled: true,
      categories: {
        ...cur.categories,
        [catKey]: {
          enabled: nextActions.length > 0 ? true : existing.enabled,
          actions: nextActions,
        },
      },
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please give this custom admin profile a name.');
      return;
    }
    const hasAnyEnabled = Object.values(permissions).some((g) => Boolean(g?.enabled));
    if (!hasAnyEnabled) {
      setError('Please enable at least one module (e.g. click "Enable Read-Only" or "Enable Full Module") before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isEdit = Boolean(initialProfile?.id);
      const res = await fetch('/api/control-center/admin-profiles', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: initialProfile!.id } : {}),
          name: name.trim(),
          description: description.trim(),
          permissions,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save custom admin profile.');
      onSaved(json.profile);
    } catch (err: any) {
      setError(err?.message || 'Failed to save custom admin profile.');
    } finally {
      setSaving(false);
    }
  };

  const grant = getModuleGrant(currentModDef.key);
  const enabledModulesCount = ADMIN_PERMISSION_CATALOG.filter((m) => permissions[m.key]?.enabled).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-5xl max-h-[90vh] rounded-3xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-[#f8fafc]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                {initialProfile?.id ? 'Edit Custom Admin Profile' : 'Create Custom Admin Profile'}
              </h2>
              <p className="text-xs text-slate-500">
                Configure Module → Subsidiary → Left-Bar Category → In-Page Action permissions ({enabledModulesCount} modules enabled).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Name & Description */}
        <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white">
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
              Custom Admin Profile Name *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Abia Finance & Projects Controller"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 focus:border-orange-400 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
              Scope Summary (Optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Manages subsidiary budgets, project timelines & approvals"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:border-orange-400 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        {/* 4-Level Builder Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-y-auto md:overflow-hidden">
          {/* Level 1: Module List */}
          <div
            className="md:col-span-4 border-r border-slate-200 bg-[#f8fafc] p-3 pb-8 overflow-y-auto min-h-0 space-y-1.5"
            style={{ maxHeight: '60vh', WebkitOverflowScrolling: 'touch' }}
          >
            <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              1. Select Modules
            </div>
            {ADMIN_PERMISSION_CATALOG.map((mod) => {
              const g = getModuleGrant(mod.key);
              const isSelected = activeModule === mod.key;
              const enabledCats = Object.values(g.categories).filter((c) => c.enabled).length;
              return (
                <div
                  key={mod.key}
                  onClick={() => setActiveModule(mod.key)}
                  className={`cursor-pointer rounded-2xl border p-3 transition flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'border-orange-400 bg-white shadow-sm'
                      : 'border-slate-200/80 bg-white/70 hover:bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-slate-900">{mod.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {g.enabled ? `${enabledCats} categories · ${g.subsidiaryScope === 'ALL' ? 'All Subsidiaries' : `${g.subsidiaryIds.length} Subsidiaries`}` : 'Disabled'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggleModuleEnabled(mod.key);
                      setActiveModule(mod.key);
                    }}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                      g.enabled
                        ? 'bg-orange-600 text-white'
                        : 'border border-slate-200 bg-slate-100 text-slate-500'
                    }`}
                  >
                    {g.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Levels 2, 3, 4: Subsidiary Scope + Left-Bar Categories + In-Page Actions */}
          <div className="md:col-span-8 p-5 overflow-y-auto space-y-5 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">{currentModDef.label}</h3>
                <p className="text-xs text-slate-500">{currentModDef.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => grantReadOnlyModule(currentModDef.key)}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  Enable Read-Only
                </button>
                <button
                  type="button"
                  onClick={() => grantFullModule(currentModDef.key)}
                  className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-[11px] font-bold text-orange-700 hover:bg-orange-100"
                >
                  Enable Full Module
                </button>
                <button
                  type="button"
                  onClick={() => clearModule(currentModDef.key)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Level 2: Subsidiary Scope for this Module */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <Building2 className="h-4 w-4 text-orange-600" />
                  2. Subsidiary Access for {currentModDef.label}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      updateModuleGrant(currentModDef.key, {
                        ...grant,
                        enabled: true,
                        subsidiaryScope: 'ONBOARDED',
                        subsidiaryIds: [],
                      })
                    }
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      grant.subsidiaryScope === 'ONBOARDED'
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Onboarding Subsidiary
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateModuleGrant(currentModDef.key, {
                        ...grant,
                        enabled: true,
                        subsidiaryScope: 'ALL',
                      })
                    }
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      grant.subsidiaryScope === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    All Subsidiaries
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateModuleGrant(currentModDef.key, {
                        ...grant,
                        enabled: true,
                        subsidiaryScope: 'SELECTED',
                      })
                    }
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      grant.subsidiaryScope === 'SELECTED'
                        ? 'bg-orange-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Specific Subsidiaries
                  </button>
                </div>
              </div>

              {grant.subsidiaryScope === 'ONBOARDED' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11.5px] font-medium text-emerald-900">
                  Automatically uses the <strong>subsidiary selected during onboarding</strong> for each admin assigned to this profile — no manual subsidiary selection needed.
                </div>
              )}

              {grant.subsidiaryScope === 'SELECTED' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {subsidiaries.map((sub) => {
                    const checked = grant.subsidiaryIds.includes(sub.id);
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => toggleSubsidiaryId(currentModDef.key, sub.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                          checked
                            ? 'border-orange-400 bg-orange-50 text-orange-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="h-4 w-4 text-orange-600 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{sub.legalName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Levels 3 & 4: Left-Bar Categories & In-Page Action Toggles */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                <Layers className="h-4 w-4 text-orange-600" />
                3. Left-Bar Categories &amp; 4. Permitted In-Page Actions
              </div>

              <div className="space-y-2.5">
                {currentModDef.categories.map((cat) => {
                  const catState = grant.categories[cat.key] || { enabled: false, actions: [] };
                  const allActionKeys = cat.actions.map((a) => a.key);
                  return (
                    <div
                      key={cat.key}
                      className={`rounded-2xl border p-3.5 transition ${
                        catState.enabled
                          ? 'border-orange-200 bg-orange-50/30'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCategory(currentModDef.key, cat.key, allActionKeys)}
                          className="flex items-center gap-2 text-xs font-extrabold text-slate-900"
                        >
                          {catState.enabled ? (
                            <CheckSquare className="h-4 w-4 text-orange-600" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                          <span>{cat.label}</span>
                        </button>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {catState.actions.length} / {cat.actions.length} actions
                        </span>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1.5 pl-6">
                        {cat.actions.map((act) => {
                          const active = catState.actions.includes(act.key);
                          return (
                            <button
                              key={act.key}
                              type="button"
                              onClick={() => toggleAction(currentModDef.key, cat.key, act.key)}
                              className={`rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition ${
                                active
                                  ? 'border-orange-400 bg-orange-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                              }`}
                            >
                              {act.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-[#f8fafc] flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Note: <strong>AI Copilot Access</strong> is OFF by default and only enabled when toggled above; live Monnify disbursements remain strictly exclusive to the <strong>GMD</strong>.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialProfile?.id ? 'Save Profile Changes' : 'Save Custom Admin Profile'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

