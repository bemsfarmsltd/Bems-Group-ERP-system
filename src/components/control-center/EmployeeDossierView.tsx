'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Mail, Phone, Building2, ShieldCheck, Clock, Activity, Wallet, FileText, UserCheck } from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { walletMoney } from '@/components/wallet/WalletView';
import { StaffAppModulesCard } from '@/components/control-center/StaffAppModulesCard';

type DossierData = {
  profile: {
    id: string;
    employeeNumber: string;
    legalName: string;
    workEmail: string;
    phone: string;
    role: string;
    jobTitle: string | null;
    status: string;
    approvalStatus: string;
    emailVerified: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    lastActiveAt: string | null;
    activeSessionCount: number;
    subsidiaryName: string;
    departmentName: string;
    customAdminProfileName: string | null;
    staffAppModules?: string[];
    verifiedBank: { bankName: string; accountNumberMasked: string; accountName: string } | null;
  };
  summary: {
    totalRequestsCount: number;
    totalApprovedMinor: string;
    walletBalanceMinor: string;
    openAccountabilityCount: number;
  };
  activity: Array<{
    id: string;
    action: string;
    module: string;
    targetType: string;
    targetId: string;
    ipAddress: string | null;
    deviceLabel: string | null;
    metadata: string | null;
    createdAt: string;
  }>;
  requests: Array<{
    id: string;
    requestNumber: string;
    title: string;
    category: string;
    amountMinor: string;
    approvalStatus: string;
    paymentStatus: string;
    subsidiaryName: string;
    createdAt: string;
  }>;
  walletTransactions: Array<{
    id: string;
    direction: string;
    type: string;
    category: string;
    amountMinor: string;
    status: string;
    reference: string;
    createdAt: string;
  }>;
};

function fmtDateTime(val?: string | null) {
  if (!val) return 'Never';
  return new Date(val).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function relativeTime(val?: string | null) {
  if (!val) return 'No activity yet';
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(val).getTime()) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function EmployeeDossierView({
  employeeId,
  onBack,
}: {
  employeeId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'activity' | 'requests' | 'wallet' | 'profile'>('activity');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(resolveApiUrl(`/api/admin/employees/${encodeURIComponent(employeeId)}/dossier`), {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load user dossier.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load user dossier.');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 28, fontSize: 13, color: '#64748b' }}>
        Loading individual user dossier…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, color: '#b91c1c', fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{error || 'User record unavailable.'}</div>
        <button type="button" onClick={onBack} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          ← Back to Directory
        </button>
      </div>
    );
  }

  const p = data.profile;
  const initials = p.legalName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '7px 11px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{p.legalName}</h2>
              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0' }}>
                {p.employeeNumber}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: p.status === 'ACTIVE' ? '#ecfdf5' : '#fef2f2', color: p.status === 'ACTIVE' ? '#047857' : '#b91c1c', border: `1px solid ${p.status === 'ACTIVE' ? '#a7f3d0' : '#fecaca'}` }}>
                {p.status}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
              Account created {fmtDateTime(p.createdAt)} &bull; Role: {p.role}
            </div>
          </div>
        </div>
      </div>

      {/* 2-COLUMN DOSSIER LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(270px, 310px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* LEFT PROFILE CARD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 999, background: 'linear-gradient(135deg, #ea580c, #f97316)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800 }}>
                {initials}
              </div>
              <h3 style={{ margin: '10px 0 2px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{p.legalName}</h3>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>{p.jobTitle || p.role}</div>
              {p.customAdminProfileName && (
                <span style={{ marginTop: 6, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                  Profile: {p.customAdminProfileName}
                </span>
              )}
            </div>

            {/* LAST ACTIVE & LAST LOGIN */}
            <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>LAST ACTIVE</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#059669' }}>{relativeTime(p.lastActiveAt)}</div>
                  <div style={{ fontSize: 10.5, color: '#64748b' }}>{fmtDateTime(p.lastActiveAt)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>LAST LOGIN</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{relativeTime(p.lastLoginAt)}</div>
                  <div style={{ fontSize: 10.5, color: '#64748b' }}>{fmtDateTime(p.lastLoginAt)}</div>
                </div>
              </div>
            </div>

            {/* CONTACT & ENTITY */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Phone size={13} color="#64748b" />
                <span>{p.phone || '—'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Mail size={13} color="#64748b" />
                <span style={{ wordBreak: 'break-all' }}>{p.workEmail}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={13} color="#64748b" />
                <span>{p.subsidiaryName} · {p.departmentName}</span>
              </div>
            </div>
          </section>

          {/* STAFF APP MODULE ACCESS */}
          <StaffAppModulesCard
            employeeId={p.id}
            initialModules={p.staffAppModules}
            onSaved={(modules) =>
              setData((prev) =>
                prev
                  ? { ...prev, profile: { ...prev.profile, staffAppModules: modules } }
                  : prev
              )
            }
          />

          {/* VALUE / ACTIVITY SUMMARY */}
          <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>
              Account Activity Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>REQUESTS</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{data.summary.totalRequestsCount}</div>
              </div>
              <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 10, border: '1px solid #a7f3d0' }}>
                <div style={{ fontSize: 10, color: '#047857', fontWeight: 700 }}>APPROVED</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#047857', marginTop: 2 }}>{walletMoney(data.summary.totalApprovedMinor)}</div>
              </div>
              <div style={{ background: '#fff7ed', borderRadius: 8, padding: 10, border: '1px solid #fed7aa' }}>
                <div style={{ fontSize: 10, color: '#c2410c', fontWeight: 700 }}>WALLET BAL.</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#c2410c', marginTop: 2 }}>{walletMoney(data.summary.walletBalanceMinor)}</div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>OPEN 72H</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{data.summary.openAccountabilityCount}</div>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT TABBED WORKSPACE */}
        <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            {[
              { id: 'activity', label: `Logins & Activity (${data.activity.length})`, icon: <Activity size={13} /> },
              { id: 'requests', label: `Fund Requests (${data.requests.length})`, icon: <FileText size={13} /> },
              { id: 'wallet', label: `Wallet & Bank (${data.walletTransactions.length})`, icon: <Wallet size={13} /> },
              { id: 'profile', label: 'Profile & Security', icon: <ShieldCheck size={13} /> },
            ].map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as any)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: active ? '1px solid #ea580c' : '1px solid transparent',
                    background: active ? '#fff' : 'transparent',
                    color: active ? '#ea580c' : '#475569',
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ padding: 16 }}>
            {tab === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.activity.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>No recorded activity events for this account yet.</p>
                ) : (
                  data.activity.map((ev) => (
                    <div key={ev.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid #f1f5f9', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, background: '#fff', border: '1px solid #cbd5e1', color: '#0f172a' }}>
                          {ev.module}
                        </span>
                        <strong style={{ fontSize: 12.5, color: '#0f172a' }}>{ev.action.replaceAll('_', ' ')}</strong>
                        {ev.deviceLabel && (
                          <span style={{ fontSize: 11, color: '#64748b' }}>&bull; {ev.deviceLabel}</span>
                        )}
                        {ev.ipAddress && (
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>({ev.ipAddress})</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        <span>{fmtDateTime(ev.createdAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'requests' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, color: '#64748b' }}>
                      <th style={{ padding: '8px 10px' }}>REQUEST #</th>
                      <th style={{ padding: '8px 10px' }}>TITLE</th>
                      <th style={{ padding: '8px 10px' }}>ENTITY</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>AMOUNT</th>
                      <th style={{ padding: '8px 10px' }}>APPROVAL</th>
                      <th style={{ padding: '8px 10px' }}>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requests.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No fund requests submitted by this user.</td></tr>
                    ) : (
                      data.requests.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{r.requestNumber}</td>
                          <td style={{ padding: '9px 10px', fontWeight: 600 }}>{r.title}</td>
                          <td style={{ padding: '9px 10px', color: '#475569' }}>{r.subsidiaryName}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{walletMoney(r.amountMinor)}</td>
                          <td style={{ padding: '9px 10px' }}>{r.approvalStatus}</td>
                          <td style={{ padding: '9px 10px', color: '#64748b' }}>{fmtDateTime(r.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'wallet' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, fontSize: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Verified Bank Account</div>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                    {p.verifiedBank ? `${p.verifiedBank.bankName} · ${p.verifiedBank.accountNumberMasked} (${p.verifiedBank.accountName})` : 'No verified bank account on file'}
                  </div>
                </div>
                {data.walletTransactions.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>No wallet credits or withdrawals recorded.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, color: '#64748b' }}>
                          <th style={{ padding: '8px 10px' }}>DIRECTION</th>
                          <th style={{ padding: '8px 10px' }}>TYPE</th>
                          <th style={{ padding: '8px 10px' }}>REFERENCE</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>AMOUNT</th>
                          <th style={{ padding: '8px 10px' }}>STATUS</th>
                          <th style={{ padding: '8px 10px' }}>DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.walletTransactions.map((w) => (
                          <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '9px 10px', fontWeight: 700, color: w.direction === 'CREDIT' ? '#059669' : '#c2410c' }}>{w.direction}</td>
                            <td style={{ padding: '9px 10px' }}>{w.type}</td>
                            <td style={{ padding: '9px 10px', fontFamily: 'monospace' }}>{w.reference}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{walletMoney(w.amountMinor)}</td>
                            <td style={{ padding: '9px 10px' }}>{w.status}</td>
                            <td style={{ padding: '9px 10px', color: '#64748b' }}>{fmtDateTime(w.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === 'profile' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: 12.5 }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Account &amp; Security Details</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>User ID:</span><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.id.slice(0, 12)}…</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Employee #:</span><strong>{p.employeeNumber}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Email Verified:</span><strong style={{ color: p.emailVerified ? '#059669' : '#d97706' }}>{p.emailVerified ? 'Verified ✓' : 'Pending'}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Registered:</span><strong>{fmtDateTime(p.createdAt)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Last Active:</span><strong>{fmtDateTime(p.lastActiveAt)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Last Login:</span><strong>{fmtDateTime(p.lastLoginAt)}</strong></div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Organizational Context</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>System Role:</span><strong>{p.role}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Subsidiary:</span><strong>{p.subsidiaryName}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Department:</span><strong>{p.departmentName}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Active Sessions:</span><strong>{p.activeSessionCount}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: '#64748b' }}>Account State:</span><strong style={{ color: '#059669' }}>{p.status} / {p.approvalStatus}</strong></div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
