'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, MapPin, Monitor, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Trash2, Wifi } from 'lucide-react';

interface StationCalibrationItem {
  id: string;
  code: string;
  name: string;
  stateLocation?: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  starlinkIpAddresses?: string | null;
  calibrated: boolean;
  calibratedAt?: string | null;
  calibratedRouterIp?: string | null;
  deviceLabel?: string | null;
  resetAt?: string | null;
  resetByName?: string | null;
}

interface KioskSessionItem {
  id: string;
  stationCode: string;
  stationName: string;
  stateLocation?: string | null;
  deviceLabel: string;
  ipAddress: string;
  activatedBy: string;
  activatedAt: string;
  lastSeenAt: string;
  status: 'ACTIVE' | 'REVOKED';
  revokedAt?: string | null;
  revokedByName?: string | null;
}

export default function KioskAccessControlPanel() {
  const [loading, setLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [passwordUpdatedAt, setPasswordUpdatedAt] = useState<string | null>(null);
  const [passwordUpdatedByName, setPasswordUpdatedByName] = useState<string | null>(null);
  const [sessions, setSessions] = useState<KioskSessionItem[]>([]);
  const [stations, setStations] = useState<StationCalibrationItem[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [revokeExistingOnChange, setRevokeExistingOnChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [busyStationReset, setBusyStationReset] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/admin/kiosk-access', {
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setHasPassword(Boolean(json.hasPassword));
        setPasswordUpdatedAt(json.passwordUpdatedAt || null);
        setPasswordUpdatedByName(json.passwordUpdatedByName || null);
        setSessions(Array.isArray(json.sessions) ? json.sessions : []);
        setStations(Array.isArray(json.stations) ? json.stations : []);
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.trim().length < 4) {
      setNotice({ ok: false, text: 'Kiosk Access Password must be at least 4 characters.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/attendance/admin/kiosk-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'SET_PASSWORD',
          password: newPassword.trim(),
          revokeExisting: revokeExistingOnChange,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ ok: false, text: json.error || 'Could not update kiosk password.' });
      } else {
        setNewPassword('');
        setHasPassword(true);
        setPasswordUpdatedAt(json.passwordUpdatedAt || null);
        setPasswordUpdatedByName(json.passwordUpdatedByName || null);
        if (Array.isArray(json.sessions)) setSessions(json.sessions);
        setNotice({
          ok: true,
          text: revokeExistingOnChange
            ? 'Kiosk Access Password updated and all previous kiosk screens disabled.'
            : 'Kiosk Access Password updated successfully.',
        });
      }
    } catch {
      setNotice({ ok: false, text: 'Network error updating kiosk password.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setBusySessionId(sessionId);
    setNotice(null);
    try {
      const res = await fetch('/api/attendance/admin/kiosk-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'REVOKE_SESSION', sessionId }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.sessions)) {
        setSessions(json.sessions);
        setNotice({ ok: true, text: 'Kiosk device disabled. It will lock on its next QR refresh.' });
      } else {
        setNotice({ ok: false, text: json.error || 'Could not disable kiosk device.' });
      }
    } finally {
      setBusySessionId(null);
    }
  };

  const handleRevokeAll = async () => {
    if (!window.confirm('Disable all currently active kiosk screens? Every reception tablet will require the Kiosk Access Password to unlock again.')) {
      return;
    }
    setBusySessionId('ALL');
    setNotice(null);
    try {
      const res = await fetch('/api/attendance/admin/kiosk-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'REVOKE_ALL_SESSIONS' }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.sessions)) {
        setSessions(json.sessions);
        setNotice({ ok: true, text: 'All active kiosk screens have been disabled.' });
      }
    } finally {
      setBusySessionId(null);
    }
  };

  const handleResetCalibration = async (stationCode: string, stationLabel: string) => {
    const confirmMsg =
      stationCode === 'ALL'
        ? 'Reset Location & Router IP calibration for ALL office kiosks? Every reception kiosk will display the one-time GPS & Router setup modal again.'
        : `Reset Location & Router IP for "${stationLabel}"? That kiosk screen will immediately prompt to re-capture its GPS coordinates and Wi-Fi / Starlink router IP.`;
    if (!window.confirm(confirmMsg)) return;

    setBusyStationReset(stationCode);
    setNotice(null);
    try {
      const res = await fetch('/api/attendance/admin/kiosk-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'RESET_STATION_CALIBRATION', stationCode }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.stations)) {
        setStations(json.stations);
        setNotice({
          ok: true,
          text:
            stationCode === 'ALL'
              ? 'All kiosk stations unlocked for re-calibration. Open kiosks will prompt to set GPS & Router IP on their next refresh.'
              : `${stationLabel} unlocked for re-calibration. Its kiosk screen will prompt to set GPS & Router IP on its next refresh.`,
        });
      } else {
        setNotice({ ok: false, text: json.error || 'Could not reset station calibration.' });
      }
    } finally {
      setBusyStationReset(null);
    }
  };

  const activeSessions = sessions.filter((s) => s.status === 'ACTIVE');
  const revokedSessions = sessions.filter((s) => s.status === 'REVOKED').slice(0, 6);

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '20px',
        borderRadius: '14px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#fff7ed',
              color: '#ea580c',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <KeyRound size={20} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              Kiosk Access Password &amp; Active Kiosk Screens
            </h4>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
              Set a dedicated password to unlock reception kiosks, monitor every active location/device, and disable any kiosk remotely.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: '999px',
              background: hasPassword ? '#ecfdf5' : '#fef3c7',
              color: hasPassword ? '#047857' : '#b45309',
              border: `1px solid ${hasPassword ? '#a7f3d0' : '#fde68a'}`,
            }}
          >
            {hasPassword ? 'Kiosk Password Active' : 'No Kiosk Password Set'}
          </span>
          <button
            type="button"
            onClick={() => void loadData()}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 700,
            background: notice.ok ? '#ecfdf5' : '#fef2f2',
            color: notice.ok ? '#047857' : '#b91c1c',
            border: `1px solid ${notice.ok ? '#a7f3d0' : '#fecaca'}`,
          }}
        >
          {notice.text}
        </div>
      )}

      {/* Row 1: Set / Change Dedicated Kiosk Access Password */}
      <form
        onSubmit={handleSavePassword}
        style={{
          padding: '14px 16px',
          borderRadius: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
            {hasPassword ? 'Change Kiosk Access Password' : 'Set Dedicated Kiosk Access Password'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            {passwordUpdatedAt
              ? `Last updated ${new Date(passwordUpdatedAt).toLocaleString('en-GB')} by ${passwordUpdatedByName || 'Admin'}`
              : 'Front-desk tablets use this password to unlock /attendance/kiosk without needing an Executive login.'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={hasPassword ? 'Enter new kiosk password...' : 'Create kiosk password (min 4 chars)...'}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: '12.5px',
              color: '#0f172a',
              minWidth: '220px',
            }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={revokeExistingOnChange}
              onChange={(e) => setRevokeExistingOnChange(e.target.checked)}
            />
            Lock active kiosks on change
          </label>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: '#ea580c',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : hasPassword ? 'Update Password' : 'Save Password'}
          </button>
        </div>
      </form>

      {/* Row 2: One-Time Kiosk Location & Router IP Calibration Reset */}
      {stations.length > 0 && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
                <MapPin size={15} color="#ea580c" />
                <span>Kiosk Physical Location &amp; Router IP Calibration</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Each kiosk captures its exact reception GPS and Wi-Fi / Starlink router IP once after unlocking. Reset any station below if the office router or kiosk location changes.
              </div>
            </div>
            {stations.length > 1 && (
              <button
                type="button"
                disabled={busyStationReset === 'ALL'}
                onClick={() => void handleResetCalibration('ALL', 'All Stations')}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #fed7aa',
                  background: '#fff7ed',
                  color: '#c2410c',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <RotateCcw size={12} />
                <span>Reset All Locations &amp; Routers</span>
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '10px' }}>
            {stations.map((st) => (
              <div
                key={st.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: '11px',
                  border: `1px solid ${st.calibrated ? '#a7f3d0' : '#fde68a'}`,
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '12.5px', color: '#0f172a' }}>
                      {st.name} {st.stateLocation ? `(${st.stateLocation})` : ''}
                    </strong>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: st.calibrated ? '#ecfdf5' : '#fffbeb',
                        color: st.calibrated ? '#047857' : '#b45309',
                        border: `1px solid ${st.calibrated ? '#a7f3d0' : '#fde68a'}`,
                      }}
                    >
                      {st.calibrated ? 'Locked' : 'Awaiting Kiosk Setup'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
                    GPS: {st.latitude.toFixed(5)}, {st.longitude.toFixed(5)} ({st.radiusMeters}m)
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Wifi size={11} color="#0284c7" />
                    <span>Router IP: {st.calibratedRouterIp || st.starlinkIpAddresses || 'Not bound yet'}</span>
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                    {st.calibrated && st.calibratedAt
                      ? `Locked ${new Date(st.calibratedAt).toLocaleString('en-GB')}${st.deviceLabel ? ` · ${st.deviceLabel}` : ''}`
                      : st.resetAt
                        ? `Reset ${new Date(st.resetAt).toLocaleString('en-GB')} by ${st.resetByName || 'Admin'}`
                        : 'Will prompt on next kiosk unlock'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyStationReset === st.code}
                  onClick={() => void handleResetCalibration(st.code, st.name)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    flexShrink: 0,
                  }}
                  title="Trigger the one-time Location & Router IP setup modal on this kiosk again"
                >
                  <RotateCcw size={12} color="#ea580c" />
                  <span>{busyStationReset === st.code ? 'Resetting...' : 'Reset Location & IP'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 3: Active Kiosk Devices List with Remote Disable */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
            <Monitor size={15} color="#059669" />
            <span>Active Kiosk Screens ({activeSessions.length})</span>
          </div>
          {activeSessions.length > 0 && (
            <button
              type="button"
              disabled={busySessionId === 'ALL'}
              onClick={() => void handleRevokeAll()}
              style={{
                padding: '5px 10px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Disable All Active Kiosks
            </button>
          )}
        </div>

        {activeSessions.length === 0 ? (
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: '1px dashed #cbd5e1',
              background: '#f8fafc',
              textAlign: 'center',
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            No active kiosk screens unlocked via Kiosk Password yet. Once a reception tablet unlocks `/attendance/kiosk`, it will appear here with a remote Disable switch.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '10px' }}>
            {activeSessions.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: '11px',
                  border: '1px solid #a7f3d0',
                  background: '#f0fdf4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={14} color="#059669" />
                    <strong style={{ fontSize: '12.5px', color: '#0f172a' }}>
                      {s.stationName} {s.stateLocation ? `(${s.stateLocation})` : ''}
                    </strong>
                  </div>
                  <div style={{ fontSize: '11px', color: '#334155', marginTop: '3px', fontWeight: 600 }}>
                    {s.deviceLabel} · IP: {s.ipAddress}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                    Unlocked by {s.activatedBy} · Last seen {new Date(s.lastSeenAt).toLocaleString('en-GB')}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busySessionId === s.id}
                  onClick={() => void handleRevokeSession(s.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    background: '#ffffff',
                    color: '#dc2626',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={12} />
                  <span>{busySessionId === s.id ? '...' : 'Disable'}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {revokedSessions.length > 0 && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <ShieldAlert size={12} /> Recently Disabled Kiosks ({revokedSessions.length})
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {revokedSessions.map((r) => (
                <span
                  key={r.id}
                  style={{
                    fontSize: '10.5px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#64748b',
                  }}
                >
                  {r.stationName} · {r.deviceLabel} (Disabled by {r.revokedByName || 'Admin'})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
