'use client';

import { useEffect, useState } from 'react';
import { Layers, Check, Save } from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { STAFF_APP_MODULE_CATALOG, type StaffAppModuleKey } from '@/lib/staff-modules';

interface StaffAppModulesCardProps {
  employeeId: string;
  initialModules?: string[];
  onSaved?: (modules: StaffAppModuleKey[]) => void;
}

export function StaffAppModulesCard({
  employeeId,
  initialModules,
  onSaved,
}: StaffAppModulesCardProps) {
  const [selected, setSelected] = useState<StaffAppModuleKey[]>(
    Array.isArray(initialModules) && initialModules.length > 0
      ? (initialModules as StaffAppModuleKey[])
      : ['finance']
  );
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setSelected(
      Array.isArray(initialModules)
        ? (initialModules as StaffAppModuleKey[])
        : ['finance']
    );
    setStatusMsg(null);
  }, [employeeId, initialModules]);

  const toggle = (key: StaffAppModuleKey) => {
    setStatusMsg(null);
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(resolveApiUrl('/api/control-center/staff-modules'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ employeeId, modules: selected }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Could not update Staff App module access.');
      }
      const nextModules = (json.staffAppModules || selected) as StaffAppModuleKey[];
      setSelected(nextModules);
      setStatusMsg({ type: 'ok', text: 'Staff App module access saved.' });
      onSaved?.(nextModules);
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save module access.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={15} color="#ea580c" />
          <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
            Staff App Module Access
          </h4>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
          {selected.length}/{STAFF_APP_MODULE_CATALOG.length} active
        </span>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#64748b', lineHeight: 1.45 }}>
        Controls which enterprise modules appear for this staff member in the Staff App (<code>/staff-app/index.html</code> &amp; Mobile APK).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STAFF_APP_MODULE_CATALOG.map((mod) => {
          const checked = selected.includes(mod.key);
          return (
            <button
              key={mod.key}
              type="button"
              onClick={() => toggle(mod.key)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                textAlign: 'left',
                padding: '9px 10px',
                borderRadius: 9,
                border: checked ? '1px solid #fed7aa' : '1px solid #e2e8f0',
                background: checked ? '#fff7ed' : '#f8fafc',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 5,
                  flexShrink: 0,
                  marginTop: 1,
                  display: 'grid',
                  placeItems: 'center',
                  background: checked ? '#ea580c' : '#ffffff',
                  border: checked ? '1px solid #ea580c' : '1px solid #cbd5e1',
                  color: '#ffffff',
                }}
              >
                {checked && <Check size={12} strokeWidth={3} />}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                  {mod.label}
                </span>
                <span style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.35 }}>
                  {mod.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {statusMsg && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 11.5,
            fontWeight: 600,
            background: statusMsg.type === 'ok' ? '#ecfdf5' : '#fef2f2',
            color: statusMsg.type === 'ok' ? '#047857' : '#b91c1c',
            border: statusMsg.type === 'ok' ? '1px solid #a7f3d0' : '1px solid #fecaca',
          }}
        >
          {statusMsg.text}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        style={{
          marginTop: 12,
          width: '100%',
          height: 36,
          borderRadius: 8,
          border: 'none',
          background: '#ea580c',
          color: '#ffffff',
          fontSize: 12.5,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        <Save size={13} />
        <span>{saving ? 'Saving…' : 'Save Module Access'}</span>
      </button>
    </section>
  );
}
