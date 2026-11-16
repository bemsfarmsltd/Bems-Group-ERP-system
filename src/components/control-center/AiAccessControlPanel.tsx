'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AI_ACCESS_SCOPES } from '@/lib/ai-access-scopes';
import { Bot, Check, Search, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';

interface AccountAiPolicy {
  aiEnabled: boolean;
  masterRead: boolean;
  masterWrite: boolean;
  scopes: Record<string, boolean>;
}

interface AiAccountItem {
  id: string;
  legalName: string;
  workEmail: string;
  employeeNumber: string;
  role: string;
  customAdminTitle?: string | null;
  jobTitle?: string | null;
  policy: AccountAiPolicy;
}

const CATEGORIES = [
  'Financial & Approvals',
  'People, Payroll & HR',
  'Corporate, Attendance & Operations',
  'Procurement, Intercompany & Governance',
] as const;

export function AiAccessControlPanel({
  setNotice,
}: {
  setNotice?: (msg: string) => void;
}) {
  const [accounts, setAccounts] = useState<AiAccountItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [filterGroup, setFilterGroup] = useState<'admins' | 'all'>('admins');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/control-center/ai-access', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load AI access controls.');
      const list: AiAccountItem[] = json.accounts || [];
      setAccounts(list);
      setSelectedId((prev) => prev || list[0]?.id || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load AI access controls.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      const roleUpper = String(a.role).toUpperCase();
      const isExec = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(roleUpper);
      if (filterGroup === 'admins' && !isExec) return false;
      if (filterGroup === 'all' && roleUpper !== 'STAFF') return false;
      if (!q) return true;
      return (
        a.legalName.toLowerCase().includes(q) ||
        a.workEmail.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        (a.customAdminTitle || '').toLowerCase().includes(q)
      );
    });
  }, [accounts, filterGroup, search]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedId) || filteredAccounts[0] || null,
    [accounts, filteredAccounts, selectedId]
  );

  const savePolicy = async (accountId: string, nextPolicy: AccountAiPolicy, message?: string) => {
    setSavingId(accountId);
    setError(null);
    // Optimistic update
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, policy: nextPolicy } : a))
    );
    try {
      const res = await fetch('/api/control-center/ai-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: accountId, policy: nextPolicy }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update AI access policy.');
      if (message && setNotice) setNotice(message);
    } catch (err: any) {
      setError(err?.message || 'Failed to update AI access policy.');
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const toggleAccountAi = (account: AiAccountItem) => {
    const nextEnabled = !account.policy.aiEnabled;
    const nextScopes = { ...(account.policy.scopes || {}) };
    let nextMasterRead = account.policy.masterRead;
    if (nextEnabled) {
      // Ensure chat context read is active when activating AI for an account so the AI can respond immediately
      if (!nextMasterRead && !Object.values(nextScopes).some(Boolean)) {
        nextMasterRead = true;
      }
      if (nextScopes['context.read'] === false || nextScopes['context.read'] === undefined) {
        nextScopes['context.read'] = true;
      }
    }
    void savePolicy(
      account.id,
      { ...account.policy, aiEnabled: nextEnabled, masterRead: nextMasterRead, scopes: nextScopes },
      `AI access ${nextEnabled ? 'activated' : 'disabled'} for ${account.legalName}.`
    );
  };

  const toggleScope = (key: string, kind: 'read' | 'write') => {
    if (!selectedAccount) return;
    const scopeKey = `${key}.${kind}`;
    const cur = selectedAccount.policy;
    const nextScopes = {
      ...cur.scopes,
      [scopeKey]: cur.scopes[scopeKey] === false ? true : !cur.scopes[scopeKey],
    };
    void savePolicy(selectedAccount.id, { ...cur, scopes: nextScopes });
  };

  const setBulk = (kind: 'read' | 'write', value: boolean) => {
    if (!selectedAccount) return;
    const cur = selectedAccount.policy;
    const nextScopes = { ...cur.scopes };
    for (const s of AI_ACCESS_SCOPES) {
      nextScopes[`${s.key}.${kind}`] = value;
    }
    void savePolicy(
      selectedAccount.id,
      {
        ...cur,
        ...(kind === 'read' ? { masterRead: value } : { masterWrite: value }),
        scopes: nextScopes,
      },
      `${value ? 'Enabled' : 'Disabled'} all AI ${kind.toUpperCase()} scopes for ${selectedAccount.legalName}.`
    );
  };

  return (
    <div className="space-y-5">
      {/* Light-Theme Header Banner */}
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50/70 via-white to-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange-700">
              2-Layer AI Governance
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-0.5">AI Access Control</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Layer 1:</strong> Activate AI for a specific admin or staff member.{' '}
              <strong>Layer 2:</strong> Choose exactly what they can read or write with the AI.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-orange-200 bg-white px-3 py-1 font-bold text-orange-700">
            {accounts.filter((a) => a.policy.aiEnabled).length} AI-Enabled Accounts
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs font-semibold text-slate-500">
          Loading AI access policies...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LAYER 1: Account AI Activation */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden h-fit">
            <div className="p-4 border-b border-slate-200 bg-[#f8fafc] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <UserCheck className="h-4 w-4 text-orange-600" />
                  Layer 1: Account AI Activation
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/70 p-1">
                <button
                  type="button"
                  onClick={() => setFilterGroup('admins')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                    filterGroup === 'admins' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Admins &amp; GMD
                </button>
                <button
                  type="button"
                  onClick={() => setFilterGroup('all')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                    filterGroup === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  All Staff ({accounts.filter((a) => String(a.role).toUpperCase() === 'STAFF').length})
                </button>
              </div>

              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search account by name or email..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-900 focus:border-orange-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {filteredAccounts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No matching accounts.</div>
              ) : (
                filteredAccounts.map((acc) => {
                  const isSelected = selectedAccount?.id === acc.id;
                  const isOn = acc.policy.aiEnabled;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedId(acc.id)}
                      className={`p-3.5 cursor-pointer transition flex items-center justify-between gap-3 ${
                        isSelected ? 'bg-orange-50/70 border-l-4 border-l-orange-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 truncate">{acc.legalName}</div>
                        <div className="text-[11px] text-slate-500 truncate">{acc.workEmail}</div>
                        <span className="inline-block mt-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {acc.customAdminTitle || acc.role}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={savingId === acc.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggleAccountAi(acc);
                        }}
                        className={`shrink-0 rounded-full px-3 py-1 text-[10.5px] font-extrabold transition ${
                          isOn
                            ? 'bg-orange-600 text-white'
                            : 'border border-slate-200 bg-slate-100 text-slate-500 hover:border-orange-300'
                        }`}
                      >
                        {isOn ? 'AI ON' : 'AI OFF'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* LAYER 2: Per-Account AI Capability Matrix */}
          <div className="lg:col-span-8 space-y-4">
            {!selectedAccount ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
                Select an account on the left to configure AI capabilities.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-orange-600" />
                        <h3 className="text-sm font-black text-slate-900">
                          Layer 2: AI Capabilities for {selectedAccount.legalName}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedAccount.workEmail} ·{' '}
                        <strong>{selectedAccount.customAdminTitle || selectedAccount.role}</strong> ·{' '}
                        {selectedAccount.policy.aiEnabled ? (
                          <span className="text-emerald-700 font-bold">AI Active</span>
                        ) : (
                          <span className="text-rose-600 font-bold">AI Disabled (Turn on Layer 1 to activate)</span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBulk('read', true)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                      >
                        All Read ON
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulk('read', false)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                      >
                        All Read OFF
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulk('write', true)}
                        className="rounded-lg bg-orange-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-orange-700"
                      >
                        All Write ON
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulk('write', false)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                      >
                        All Write OFF
                      </button>
                    </div>
                  </div>

                  {/* Master Read / Write Row (Light Theme) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#f8fafc] p-3 cursor-pointer">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900">Master AI Read Access</div>
                        <div className="text-[11px] text-slate-500">Allow AI queries &amp; summaries</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedAccount.policy.masterRead !== false}
                        onChange={(e) =>
                          void savePolicy(selectedAccount.id, {
                            ...selectedAccount.policy,
                            masterRead: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#f8fafc] p-3 cursor-pointer">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900">Master AI Write Access</div>
                        <div className="text-[11px] text-slate-500">Allow staging actions (requires human confirm)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedAccount.policy.masterWrite !== false}
                        onChange={(e) =>
                          void savePolicy(selectedAccount.id, {
                            ...selectedAccount.policy,
                            masterWrite: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-orange-600"
                      />
                    </label>
                  </div>
                </div>

                {CATEGORIES.map((cat) => {
                  const scopes = AI_ACCESS_SCOPES.filter((s) => s.category === cat);
                  return (
                    <div key={cat} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-200 bg-[#f8fafc] flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                          <ShieldCheck className="h-4 w-4 text-orange-600" />
                          <span>{cat}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500">{scopes.length} capabilities</span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {scopes.map((scope) => {
                          const readOn =
                            selectedAccount.policy.masterRead !== false &&
                            selectedAccount.policy.scopes[`${scope.key}.read`] === true;
                          const writeOn =
                            selectedAccount.policy.masterWrite !== false &&
                            selectedAccount.policy.scopes[`${scope.key}.write`] === true;
                          return (
                            <div
                              key={scope.key}
                              className="px-5 py-3 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-slate-900">{scope.label}</div>
                                <div className="text-[11px] text-slate-500">{scope.description}</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => toggleScope(scope.key, 'read')}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                                    readOn
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-slate-50 text-slate-500'
                                  }`}
                                >
                                  {readOn && <Check className="h-3 w-3" />}
                                  READ ({readOn ? 'ON' : 'OFF'})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleScope(scope.key, 'write')}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                                    writeOn
                                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                                      : 'border-slate-200 bg-slate-50 text-slate-500'
                                  }`}
                                >
                                  {writeOn && <Check className="h-3 w-3" />}
                                  WRITE ({writeOn ? 'ON' : 'OFF'})
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

