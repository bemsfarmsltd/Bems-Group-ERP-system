'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Camera, CheckCircle2, QrCode, RefreshCw, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';

interface HrFaceRegistryPanelProps {
  onModeChanged?: () => void;
}

export function HrFaceRegistryPanel({ onModeChanged }: HrFaceRegistryPanelProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'NOT_ENROLLED'>('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/attendance/face/admin', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateMode = async (patch: Record<string, any>) => {
    try {
      setBusyId('MODE');
      setFeedback(null);
      const res = await fetch('/api/attendance/face/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SET_MODE', ...patch }),
      });
      const json = await res.json();
      if (res.ok) {
        setFeedback(json.message || 'Attendance mode updated.');
        await loadData();
        onModeChanged?.();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleProfileAction = async (employeeId: string, action: 'APPROVE' | 'REJECT' | 'RESET') => {
    try {
      setBusyId(employeeId);
      setFeedback(null);
      const res = await fetch('/api/attendance/face/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, employeeId }),
      });
      const json = await res.json();
      if (res.ok) {
        setFeedback(json.message);
        await loadData();
      }
    } finally {
      setBusyId(null);
    }
  };

  const globalMode: 'QR' | 'FACE' = data?.modeConfig?.globalMode === 'FACE' ? 'FACE' : 'QR';
  const requireHrApproval: boolean = data?.modeConfig?.requireHrApproval !== false;
  const counts = data?.counts || { total: 0, approved: 0, pending: 0, rejected: 0, notEnrolled: 0 };
  const stations: any[] = data?.stations || [];
  const registry: any[] = (data?.registry || []).filter((r: any) =>
    filter === 'ALL' ? true : r.faceStatus === filter
  );

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '18px',
        padding: '20px',
        marginTop: '18px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
      }}
    >
      {/* Header & Dual Attendance System Mode Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          paddingBottom: '16px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#ea580c', letterSpacing: '0.06em' }}>
            DUAL ATTENDANCE SYSTEM & FACE ID REGISTRY
          </div>
          <h3 style={{ margin: '2px 0 4px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
            Active Kiosk Attendance Mode & Staff Face Enrollment
          </h3>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
            Toggle between Dynamic QR Code scanning and Reception Kiosk Face Recognition (globally or per office station).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Global QR vs Face Switcher */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '3px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              disabled={busyId === 'MODE'}
              onClick={() => updateMode({ globalMode: 'QR' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '9px',
                border: 'none',
                background: globalMode === 'QR' ? '#ea580c' : 'transparent',
                color: globalMode === 'QR' ? '#ffffff' : '#475569',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <QrCode size={14} /> QR Code + GPS Mode
            </button>
            <button
              type="button"
              disabled={busyId === 'MODE'}
              onClick={() => updateMode({ globalMode: 'FACE' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '9px',
                border: 'none',
                background: globalMode === 'FACE' ? '#ea580c' : 'transparent',
                color: globalMode === 'FACE' ? '#ffffff' : '#475569',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Camera size={14} /> Face Recognition Kiosk Mode
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '12.5px',
            fontWeight: 700,
          }}
        >
          {feedback}
        </div>
      )}

      {/* Per-Station Mode Override Cards (Abia / Edo) */}
      {stations.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px',
            marginTop: '14px',
          }}
        >
          {stations.map((st) => (
            <div
              key={st.code}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>{st.name}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Active Mode:{' '}
                  <strong style={{ color: st.effectiveMode === 'FACE' ? '#059669' : '#ea580c' }}>
                    {st.effectiveMode === 'FACE' ? 'Face Recognition Camera' : 'Dynamic QR Code'}
                  </strong>
                </div>
              </div>
              <select
                value={st.modeOverride || 'INHERIT'}
                onChange={(e) =>
                  updateMode({
                    stationOverrides: { [st.code]: e.target.value },
                  })
                }
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '11.5px',
                  fontWeight: 700,
                }}
              >
                <option value="INHERIT">Use Global ({globalMode})</option>
                <option value="QR">Force QR Code</option>
                <option value="FACE">Force Face Recognition</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Enrollment Filter & Approval Policy Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginTop: '16px',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: `All Staff (${counts.total})` },
            { key: 'PENDING_APPROVAL', label: `Pending Approval (${counts.pending})` },
            { key: 'APPROVED', label: `Approved Face ID (${counts.approved})` },
            { key: 'NOT_ENROLLED', label: `Not Enrolled (${counts.notEnrolled})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key as any)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: `1px solid ${filter === tab.key ? '#ea580c' : '#e2e8f0'}`,
                background: filter === tab.key ? '#fff7ed' : '#ffffff',
                color: filter === tab.key ? '#ea580c' : '#475569',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={requireHrApproval}
            onChange={(e) => updateMode({ requireHrApproval: e.target.checked })}
          />
          Require HR Approval for new self-service Face IDs
        </label>
      </div>

      {/* Staff Face Registry Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Staff Member</th>
              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Subsidiary</th>
              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Face Snapshot</th>
              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Face ID Status</th>
              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>
                  Loading staff Face ID registry...
                </td>
              </tr>
            ) : registry.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>
                  No staff records match this filter.
                </td>
              </tr>
            ) : (
              registry.map((row: any) => (
                <tr key={row.employeeId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.legalName}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{row.employeeNumber}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#334155', fontWeight: 600 }}>
                    {row.subsidiaryName}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {row.referencePhotoUrl ? (
                      <img
                        src={row.referencePhotoUrl}
                        alt={row.legalName}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          objectFit: 'cover',
                          border: '1px solid #cbd5e1',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {row.faceStatus === 'APPROVED' && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: '#ecfdf5',
                          color: '#047857',
                          border: '1px solid #a7f3d0',
                        }}
                      >
                        <ShieldCheck size={12} /> Approved ({row.sampleCount} angles)
                      </span>
                    )}
                    {row.faceStatus === 'PENDING_APPROVAL' && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                        }}
                      >
                        Pending HR Approval
                      </span>
                    )}
                    {row.faceStatus === 'REJECTED' && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                        }}
                      >
                        Rejected
                      </span>
                    )}
                    {row.faceStatus === 'NOT_ENROLLED' && (
                      <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                        Not Enrolled
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {row.faceStatus === 'PENDING_APPROVAL' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === row.employeeId}
                            onClick={() => handleProfileAction(row.employeeId, 'APPROVE')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#059669',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <CheckCircle2 size={12} /> Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.employeeId}
                            onClick={() => handleProfileAction(row.employeeId, 'REJECT')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '8px',
                              border: '1px solid #fecaca',
                              background: '#fef2f2',
                              color: '#b91c1c',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <XCircle size={12} /> Reject
                          </button>
                        </>
                      )}
                      {row.faceStatus !== 'NOT_ENROLLED' && (
                        <button
                          type="button"
                          disabled={busyId === row.employeeId}
                          onClick={() => handleProfileAction(row.employeeId, 'RESET')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#334155',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <RotateCcw size={12} /> Reset Face ID
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
