'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, ShieldAlert, Wrench, Package, Truck, Repeat, Cpu, CheckCircle2 } from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';

interface PhasesPanelProps {
  mode: 'assurance' | 'resources' | 'governance';
  actorRole: string;
  subsidiaries: Array<{ id: string; legalName: string; code: string }>;
  sites: any[];
  staffOptions: Array<{ id: string; legalName: string; employeeNumber: string }>;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
}

export function OperationsPhasesPanel({
  mode,
  actorRole,
  subsidiaries,
  sites,
  staffOptions,
  onError,
  onNotice,
}: PhasesPanelProps) {
  const defaultOrgId = subsidiaries[0]?.id || '';
  const isGmd = String(actorRole || '').toUpperCase() === 'GMD';

  const [sops, setSops] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [aiBrief, setAiBrief] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Forms
  const [sopForm, setSopForm] = useState({ organizationId: defaultOrgId, title: '', version: '1.0', content: '' });
  const [inspForm, setInspForm] = useState({ organizationId: defaultOrgId, siteId: '', title: '', scorePct: 95, outcome: 'PASS', notes: '' });
  const [incForm, setIncForm] = useState({ organizationId: defaultOrgId, siteId: '', severity: 'MEDIUM', category: 'OPERATIONAL', title: '', description: '' });
  const [assetForm, setAssetForm] = useState({ organizationId: defaultOrgId, siteId: '', name: '', category: 'EQUIPMENT', custodianId: '' });
  const [stockForm, setStockForm] = useState({ organizationId: defaultOrgId, siteId: '', name: '', unit: 'PCS', quantityOnHand: 10, reorderLevel: 5 });
  const [fleetForm, setFleetForm] = useState({ organizationId: defaultOrgId, plateNumber: '', model: '', driverId: '', odometerKm: 0 });
  const [handoverForm, setHandoverForm] = useState({ organizationId: defaultOrgId, shiftLabel: 'Morning Shift', incomingOfficerId: '', openItemsSummary: '', criticalRisks: '' });
  const [reconForm, setReconForm] = useState({ organizationId: defaultOrgId, period: new Date().toISOString().slice(0, 7), sourceSystem: 'FINANCE', matchedCount: 0, exceptionCount: 0 });
  const [ruleForm, setRuleForm] = useState({ organizationId: defaultOrgId, name: '', triggerEvent: 'WORK_ORDER_OVERDUE', actionType: 'ESCALATE', targetRoleOrId: 'GMD' });

  const loadModeData = useCallback(async () => {
    try {
      if (mode === 'assurance') {
        const [a, b, c] = await Promise.all([
          fetch(resolveApiUrl('/api/operations/sops'), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl('/api/operations/inspections'), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl('/api/operations/incidents'), { credentials: 'include' }).then((r) => r.json()),
        ]);
        setSops(a.sops || []);
        setInspections(b.inspections || []);
        setIncidents(c.incidents || []);
      } else if (mode === 'resources') {
        const [a, b, c] = await Promise.all([
          fetch(resolveApiUrl('/api/operations/assets'), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl('/api/operations/stock'), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl('/api/operations/fleet'), { credentials: 'include' }).then((r) => r.json()),
        ]);
        setAssets(a.assets || []);
        setStockItems(b.items || []);
        setVehicles(c.vehicles || []);
      } else {
        const [a, b, c, d] = await Promise.all([
          fetch(resolveApiUrl('/api/operations/handovers'), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl('/api/operations/reconciliations'), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl('/api/operations/automation'), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl('/api/operations/analytics'), { credentials: 'include' }).then((r) => r.json()),
        ]);
        setHandovers(a.handovers || []);
        setReconciliations(b.runs || []);
        setRules(c.rules || []);
        setAnalytics(d);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not load operations data.');
    }
  }, [mode, onError]);

  useEffect(() => {
    void loadModeData();
  }, [loadModeData]);

  const submitPost = async (url: string, payload: Record<string, any>, successText: string, reset?: () => void) => {
    onError('');
    onNotice('');
    try {
      const res = await fetch(resolveApiUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, organizationId: payload.organizationId || defaultOrgId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed.');
      onNotice(successText);
      reset?.();
      await loadModeData();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Operation failed.');
    }
  };

  const handleCloseIncident = async (id: string) => {
    const rootCause = window.prompt('Root cause (required for HIGH/CRITICAL):') || '';
    const correctiveAction = window.prompt('Corrective action:') || '';
    try {
      const res = await fetch(resolveApiUrl('/api/operations/incidents'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status: 'CLOSED', rootCause, correctiveAction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not close incident.');
      onNotice('Incident closed.');
      await loadModeData();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to close incident.');
    }
  };

  const handleStockAdjust = async (stockItemId: string, movementType: 'IN' | 'OUT') => {
    const qtyStr = window.prompt(`Quantity for stock ${movementType}:`) || '0';
    const quantity = Number(qtyStr);
    if (!quantity || quantity <= 0) return;
    const reason = window.prompt('Reason for movement:') || `Manual ${movementType}`;
    await submitPost('/api/operations/stock', { stockItemId, movementType, quantity, reason }, `Stock ${movementType} recorded.`);
  };

  const handleGenerateGmdAiBrief = async () => {
    setLoadingAi(true);
    onError('');
    try {
      const res = await fetch(resolveApiUrl('/api/operations/ai-brief'), { method: 'POST', credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not generate AI Operations brief.');
      setAiBrief(json);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'AI brief failed.');
    } finally {
      setLoadingAi(false);
    }
  };

  if (mode === 'assurance') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <section style={cardStyle}>
          <h3 style={titleStyle}><ShieldAlert size={15} color="#ea580c" /> Incidents &amp; Root Cause</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/incidents', incForm, 'Incident logged.', () => setIncForm((p) => ({ ...p, title: '', description: '' }))); }} style={formColStyle}>
            <input required placeholder="Incident title" value={incForm.title} onChange={(e) => setIncForm({ ...incForm, title: e.target.value })} style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={incForm.severity} onChange={(e) => setIncForm({ ...incForm, severity: e.target.value })} style={inputStyle}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={incForm.siteId} onChange={(e) => setIncForm({ ...incForm, siteId: e.target.value })} style={inputStyle}>
                <option value="">Any Site</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <textarea required placeholder="Incident description" rows={2} value={incForm.description} onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} style={inputStyle} />
            <button type="submit" style={btnStyle}>Report Incident</button>
          </form>
          <div style={listColStyle}>
            {incidents.map((inc) => (
              <div key={inc.id} style={itemCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, color: '#dc2626' }}>
                  <span>{inc.incidentNumber} · {inc.severity}</span>
                  <span>{inc.status}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{inc.title}</div>
                {inc.status !== 'CLOSED' && (
                  <button type="button" onClick={() => void handleCloseIncident(inc.id)} style={{ ...smallBtnStyle, marginTop: 6 }}>Resolve &amp; Close</button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}><CheckCircle2 size={15} color="#059669" /> Quality Inspections</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/inspections', inspForm, 'Inspection recorded.', () => setInspForm((p) => ({ ...p, title: '', notes: '' }))); }} style={formColStyle}>
            <input required placeholder="Inspection title" value={inspForm.title} onChange={(e) => setInspForm({ ...inspForm, title: e.target.value })} style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" min={0} max={100} value={inspForm.scorePct} onChange={(e) => setInspForm({ ...inspForm, scorePct: Number(e.target.value) })} style={inputStyle} />
              <select value={inspForm.outcome} onChange={(e) => setInspForm({ ...inspForm, outcome: e.target.value })} style={inputStyle}>
                {['PASS', 'CONDITIONAL', 'FAIL'].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <button type="submit" style={btnStyle}>Record Inspection</button>
          </form>
          <div style={listColStyle}>
            {inspections.map((i) => (
              <div key={i.id} style={itemCardStyle}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{i.title}</div>
                <div style={{ fontSize: 11.5, color: '#64748b' }}>Outcome: <strong>{i.outcome}</strong> · Score: {i.scorePct}%</div>
              </div>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}>Standard Operating Procedures (SOPs)</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/sops', sopForm, 'SOP published.', () => setSopForm((p) => ({ ...p, title: '', content: '' }))); }} style={formColStyle}>
            <input required placeholder="SOP Title" value={sopForm.title} onChange={(e) => setSopForm({ ...sopForm, title: e.target.value })} style={inputStyle} />
            <textarea required placeholder="Procedure steps..." rows={3} value={sopForm.content} onChange={(e) => setSopForm({ ...sopForm, content: e.target.value })} style={inputStyle} />
            <button type="submit" style={btnStyle}>Publish SOP</button>
          </form>
          <div style={listColStyle}>
            {sops.map((s) => (
              <div key={s.id} style={itemCardStyle}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#ea580c' }}>{s.code} · v{s.version}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (mode === 'resources') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <section style={cardStyle}>
          <h3 style={titleStyle}><Wrench size={15} color="#ea580c" /> Assets &amp; Devices</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/assets', assetForm, 'Asset registered.', () => setAssetForm((p) => ({ ...p, name: '' }))); }} style={formColStyle}>
            <input required placeholder="Asset Name" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} style={inputStyle} />
            <select value={assetForm.custodianId} onChange={(e) => setAssetForm({ ...assetForm, custodianId: e.target.value })} style={inputStyle}>
              <option value="">Unassigned Custodian</option>
              {staffOptions.map((st) => <option key={st.id} value={st.id}>{st.legalName}</option>)}
            </select>
            <button type="submit" style={btnStyle}>Register Asset</button>
          </form>
          <div style={listColStyle}>
            {assets.map((a) => (
              <div key={a.id} style={itemCardStyle}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#ea580c' }}>{a.assetTag} · {a.status}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name} ({a.condition})</div>
              </div>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}><Package size={15} color="#0284c7" /> Inventory, Stock &amp; Stores</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/stock', stockForm, 'Stock SKU created.', () => setStockForm((p) => ({ ...p, name: '' }))); }} style={formColStyle}>
            <input required placeholder="Item Name" value={stockForm.name} onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })} style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" min={0} placeholder="Initial Qty" value={stockForm.quantityOnHand} onChange={(e) => setStockForm({ ...stockForm, quantityOnHand: Number(e.target.value) })} style={inputStyle} />
              <input type="number" min={0} placeholder="Reorder Level" value={stockForm.reorderLevel} onChange={(e) => setStockForm({ ...stockForm, reorderLevel: Number(e.target.value) })} style={inputStyle} />
            </div>
            <button type="submit" style={btnStyle}>Add Stock SKU</button>
          </form>
          <div style={listColStyle}>
            {stockItems.map((it) => (
              <div key={it.id} style={itemCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{it.name} <span style={{ fontSize: 11, color: '#64748b' }}>({it.sku})</span></div>
                    <div style={{ fontSize: 11.5, color: it.quantityOnHand <= it.reorderLevel ? '#dc2626' : '#475569' }}>
                      On Hand: <strong>{it.quantityOnHand} {it.unit}</strong> (Reorder ≤ {it.reorderLevel})
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => void handleStockAdjust(it.id, 'IN')} style={smallBtnStyle}>+IN</button>
                    <button type="button" onClick={() => void handleStockAdjust(it.id, 'OUT')} style={smallBtnStyle}>-OUT</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}><Truck size={15} color="#059669" /> Vehicles &amp; Fleet</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/fleet', fleetForm, 'Vehicle registered.', () => setFleetForm((p) => ({ ...p, plateNumber: '', model: '' }))); }} style={formColStyle}>
            <input required placeholder="Plate Number (e.g. ABC-123XY)" value={fleetForm.plateNumber} onChange={(e) => setFleetForm({ ...fleetForm, plateNumber: e.target.value })} style={inputStyle} />
            <input required placeholder="Vehicle Model" value={fleetForm.model} onChange={(e) => setFleetForm({ ...fleetForm, model: e.target.value })} style={inputStyle} />
            <button type="submit" style={btnStyle}>Register Vehicle</button>
          </form>
          <div style={listColStyle}>
            {vehicles.map((v) => (
              <div key={v.id} style={itemCardStyle}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#059669' }}>{v.plateNumber} · {v.status}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v.model} ({v.odometerKm} km)</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* GMD-ONLY AI INTELLIGENCE */}
      {isGmd && (
        <section style={{ ...cardStyle, borderColor: '#fed7aa', background: '#fff7ed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: '#c2410c' }}>
                <Sparkles size={16} /> AI-Assisted Operations Intelligence (GMD Exclusive)
              </div>
              <div style={{ fontSize: 12, color: '#7c2d12', marginTop: 2 }}>
                Advisory digest across group SLA breaches, critical incidents, stockouts, and handovers.
              </div>
            </div>
            <button type="button" disabled={loadingAi} onClick={() => void handleGenerateGmdAiBrief()} style={btnStyle}>
              {loadingAi ? 'Analyzing…' : 'Generate GMD Operations Brief'}
            </button>
          </div>
          {aiBrief && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#0f172a' }}>
              {(aiBrief.highlights || []).map((h: string, idx: number) => (
                <li key={idx} style={{ marginBottom: 4 }}>{h}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* CROSS-COMPANY ANALYTICS */}
      {analytics?.byCompany && (
        <section style={cardStyle}>
          <h3 style={titleStyle}>Cross-Company Operational Intelligence</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: 11 }}>
                  <th style={{ padding: 8 }}>Subsidiary</th>
                  <th style={{ padding: 8 }}>Work Orders</th>
                  <th style={{ padding: 8 }}>Completed</th>
                  <th style={{ padding: 8 }}>SLA Compliance</th>
                  <th style={{ padding: 8 }}>Open Incidents</th>
                  <th style={{ padding: 8 }}>Low Stock</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byCompany.map((row: any) => (
                  <tr key={row.organizationId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 8, fontWeight: 700 }}>{row.legalName}</td>
                    <td style={{ padding: 8 }}>{row.totalWorkOrders}</td>
                    <td style={{ padding: 8 }}>{row.completedWorkOrders}</td>
                    <td style={{ padding: 8, fontWeight: 700, color: row.slaCompliancePct >= 90 ? '#059669' : '#dc2626' }}>{row.slaCompliancePct}%</td>
                    <td style={{ padding: 8 }}>{row.openIncidents}</td>
                    <td style={{ padding: 8 }}>{row.lowStockItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <section style={cardStyle}>
          <h3 style={titleStyle}><Repeat size={15} color="#4f46e5" /> Shift Handovers</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/handovers', handoverForm, 'Shift handover logged.', () => setHandoverForm((p) => ({ ...p, openItemsSummary: '', criticalRisks: '' }))); }} style={formColStyle}>
            <input required placeholder="Shift Label (e.g. Night Shift)" value={handoverForm.shiftLabel} onChange={(e) => setHandoverForm({ ...handoverForm, shiftLabel: e.target.value })} style={inputStyle} />
            <select value={handoverForm.incomingOfficerId} onChange={(e) => setHandoverForm({ ...handoverForm, incomingOfficerId: e.target.value })} style={inputStyle}>
              <option value="">Incoming Officer (Optional)</option>
              {staffOptions.map((st) => <option key={st.id} value={st.id}>{st.legalName}</option>)}
            </select>
            <textarea required placeholder="Open items & handover notes" rows={2} value={handoverForm.openItemsSummary} onChange={(e) => setHandoverForm({ ...handoverForm, openItemsSummary: e.target.value })} style={inputStyle} />
            <button type="submit" style={btnStyle}>Submit Handover</button>
          </form>
          <div style={listColStyle}>
            {handovers.map((h) => (
              <div key={h.id} style={itemCardStyle}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{h.shiftLabel} · {h.acknowledgedAt ? 'Acknowledged' : 'Pending Ack'}</div>
                <div style={{ fontSize: 11.5, color: '#475569' }}>{h.openItemsSummary}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}>Reconciliations &amp; Exceptions</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/reconciliations', reconForm, 'Reconciliation run recorded.'); }} style={formColStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input required placeholder="Period (YYYY-MM)" value={reconForm.period} onChange={(e) => setReconForm({ ...reconForm, period: e.target.value })} style={inputStyle} />
              <select value={reconForm.sourceSystem} onChange={(e) => setReconForm({ ...reconForm, sourceSystem: e.target.value })} style={inputStyle}>
                {['FINANCE', 'STOCK', 'FLEET', 'DEVICE'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button type="submit" style={btnStyle}>Create Reconciliation Run</button>
          </form>
          <div style={listColStyle}>
            {reconciliations.map((r) => (
              <div key={r.id} style={itemCardStyle}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.sourceSystem} · {r.period} ({r.status})</div>
                <div style={{ fontSize: 11.5, color: '#64748b' }}>Matched: {r.matchedCount} · Exceptions: {r.exceptionCount}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}><Cpu size={15} color="#ea580c" /> Automation &amp; Escalation Rules</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/automation', ruleForm, 'Automation rule saved.', () => setRuleForm((p) => ({ ...p, name: '' }))); }} style={formColStyle}>
            <input required placeholder="Rule Name" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} style={inputStyle} />
            <select value={ruleForm.triggerEvent} onChange={(e) => setRuleForm({ ...ruleForm, triggerEvent: e.target.value })} style={inputStyle}>
              {['WORK_ORDER_OVERDUE', 'INCIDENT_CRITICAL', 'STOCK_LOW', 'HANDOVER_UNACKNOWLEDGED'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="submit" style={btnStyle}>Add Rule</button>
          </form>
          <div style={listColStyle}>
            {rules.map((rl) => (
              <div key={rl.id} style={itemCardStyle}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{rl.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{rl.triggerEvent} → {rl.actionType} ({rl.targetRoleOrId})</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 };
const titleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 };
const formColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 };
const listColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' };
const itemCardStyle: React.CSSProperties = { padding: 10, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc' };
const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 12.5, color: '#0f172a', width: '100%', boxSizing: 'border-box' };
const btnStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#ffffff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const smallBtnStyle: React.CSSProperties = { padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer' };
