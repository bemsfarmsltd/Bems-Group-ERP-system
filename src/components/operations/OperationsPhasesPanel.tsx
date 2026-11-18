'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  Wrench,
  Package,
  Truck,
  Repeat,
  Cpu,
  CheckCircle2,
  BookOpen,
  ClipboardCheck,
  Search,
} from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';

interface PhasesPanelProps {
  mode: 'assurance' | 'resources' | 'governance';
  actorRole: string;
  brandColor?: string;
  selectedOrgId?: string;
  subsidiaries: Array<{ id: string; legalName: string; code: string }>;
  sites: any[];
  staffOptions: Array<{ id: string; legalName: string; employeeNumber: string }>;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
}

export function OperationsPhasesPanel({
  mode,
  actorRole,
  brandColor = '#ea580c',
  selectedOrgId = '',
  subsidiaries,
  sites,
  staffOptions,
  onError,
  onNotice,
}: PhasesPanelProps) {
  const defaultOrgId = selectedOrgId || subsidiaries[0]?.id || '';
  const isGmd = String(actorRole || '').toUpperCase() === 'GMD';

  const [assuranceTab, setAssuranceTab] = useState<'incidents' | 'inspections' | 'sops'>('incidents');
  const [resourceTab, setResourceTab] = useState<'assets' | 'stock' | 'fleet'>('assets');
  const [filterText, setFilterText] = useState('');

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

  useEffect(() => {
    if (!defaultOrgId) return;
    setSopForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setInspForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setIncForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setAssetForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setStockForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setFleetForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setHandoverForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setReconForm((p) => ({ ...p, organizationId: defaultOrgId }));
    setRuleForm((p) => ({ ...p, organizationId: defaultOrgId }));
  }, [defaultOrgId]);

  const loadModeData = useCallback(async () => {
    try {
      const orgQs = selectedOrgId ? `?organizationId=${encodeURIComponent(selectedOrgId)}` : '';
      if (mode === 'assurance') {
        const [a, b, c] = await Promise.all([
          fetch(resolveApiUrl(`/api/operations/sops${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl(`/api/operations/inspections${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl(`/api/operations/incidents${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
        ]);
        setSops(a.sops || []);
        setInspections(b.inspections || []);
        setIncidents(c.incidents || []);
      } else if (mode === 'resources') {
        const [a, b, c] = await Promise.all([
          fetch(resolveApiUrl(`/api/operations/assets${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl(`/api/operations/stock${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl(`/api/operations/fleet${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
        ]);
        setAssets(a.assets || []);
        setStockItems(b.items || []);
        setVehicles(c.vehicles || []);
      } else {
        const [a, b, c, d] = await Promise.all([
          fetch(resolveApiUrl(`/api/operations/handovers${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl(`/api/operations/reconciliations${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl(`/api/operations/automation${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
          fetch(resolveApiUrl(`/api/operations/analytics${orgQs}`), { credentials: 'include' }).then((r) => r.json()),
        ]);
        setHandovers(a.handovers || []);
        setReconciliations(b.runs || []);
        setRules(c.rules || []);
        setAnalytics(d);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not load operations data.');
    }
  }, [mode, selectedOrgId, onError]);

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

  const primaryBtn: React.CSSProperties = {
    padding: '9px 14px',
    borderRadius: 9,
    border: 'none',
    background: brandColor,
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: `0 6px 14px -4px ${brandColor}55`,
  };

  const smallBtn: React.CSSProperties = {
    padding: '5px 10px',
    borderRadius: 7,
    border: `1px solid ${brandColor}45`,
    background: `${brandColor}12`,
    color: brandColor,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  };

  const q = filterText.trim().toLowerCase();

  const filteredIncidents = useMemo(
    () => incidents.filter((i) => !q || `${i.title} ${i.incidentNumber} ${i.severity}`.toLowerCase().includes(q)),
    [incidents, q]
  );
  const filteredInspections = useMemo(
    () => inspections.filter((i) => !q || `${i.title} ${i.outcome}`.toLowerCase().includes(q)),
    [inspections, q]
  );
  const filteredSops = useMemo(
    () => sops.filter((s) => !q || `${s.title} ${s.code} ${s.content || ''}`.toLowerCase().includes(q)),
    [sops, q]
  );
  const filteredAssets = useMemo(
    () => assets.filter((a) => !q || `${a.name} ${a.assetTag} ${a.category || ''}`.toLowerCase().includes(q)),
    [assets, q]
  );
  const filteredStock = useMemo(
    () => stockItems.filter((s) => !q || `${s.name} ${s.sku}`.toLowerCase().includes(q)),
    [stockItems, q]
  );
  const filteredVehicles = useMemo(
    () => vehicles.filter((v) => !q || `${v.plateNumber} ${v.model}`.toLowerCase().includes(q)),
    [vehicles, q]
  );

  if (mode === 'assurance') {
    const openIncCount = incidents.filter((i) => i.status !== 'CLOSED').length;
    const criticalIncCount = incidents.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity) && i.status !== 'CLOSED').length;
    const avgScore =
      inspections.length > 0
        ? Math.round(inspections.reduce((acc, i) => acc + Number(i.scorePct || 0), 0) / inspections.length)
        : 100;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MiniKpi label="Open Incidents" value={openIncCount} sub={`${incidents.length} total logged`} color={brandColor} />
          <MiniKpi label="High / Critical" value={criticalIncCount} sub="Needs root-cause closure" color="#dc2626" />
          <MiniKpi label="Inspection Avg Score" value={`${avgScore}%`} sub={`${inspections.length} site audits`} color="#059669" />
          <MiniKpi label="Published SOPs" value={sops.length} sub="Active operational standards" color="#4f46e5" />
        </div>

        {/* Subtab Navigation + Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={pillGroupStyle}>
            <SubTabPill active={assuranceTab === 'incidents'} color={brandColor} onClick={() => setAssuranceTab('incidents')}>
              <ShieldAlert size={13} /> Incidents &amp; Root Cause ({incidents.length})
            </SubTabPill>
            <SubTabPill active={assuranceTab === 'inspections'} color={brandColor} onClick={() => setAssuranceTab('inspections')}>
              <ClipboardCheck size={13} /> Site Inspections ({inspections.length})
            </SubTabPill>
            <SubTabPill active={assuranceTab === 'sops'} color={brandColor} onClick={() => setAssuranceTab('sops')}>
              <BookOpen size={13} /> SOP Library ({sops.length})
            </SubTabPill>
          </div>
          <SearchBox value={filterText} onChange={setFilterText} placeholder="Filter incidents, inspections, SOPs..." />
        </div>

        {assuranceTab === 'incidents' && (
          <div style={splitLayoutStyle}>
            <section style={cardStyle}>
              <h3 style={titleStyle}><ShieldAlert size={15} color={brandColor} /> Log Operational Incident</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPost('/api/operations/incidents', incForm, 'Incident logged.', () =>
                    setIncForm((p) => ({ ...p, title: '', description: '' }))
                  );
                }}
                style={formColStyle}
              >
                <Field label="Incident Title">
                  <input required placeholder="e.g. Cold-room generator trip" value={incForm.title} onChange={(e) => setIncForm({ ...incForm, title: e.target.value })} style={inputStyle} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Severity Level">
                    <select value={incForm.severity} onChange={(e) => setIncForm({ ...incForm, severity: e.target.value })} style={inputStyle}>
                      {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Operating Site">
                    <select value={incForm.siteId} onChange={(e) => setIncForm({ ...incForm, siteId: e.target.value })} style={inputStyle}>
                      <option value="">All / Group Site</option>
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Incident Details & Immediate Containment">
                  <textarea required placeholder="Describe what happened and immediate actions taken..." rows={3} value={incForm.description} onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} style={inputStyle} />
                </Field>
                <button type="submit" style={primaryBtn}>Report Incident</button>
              </form>
            </section>

            <section style={cardStyle}>
              <h3 style={titleStyle}>Incident &amp; Root Cause Register</h3>
              {filteredIncidents.length === 0 ? (
                <EmptyState text="No operational incidents recorded for this filter." />
              ) : (
                <div style={listColStyle}>
                  {filteredIncidents.map((inc) => (
                    <div key={inc.id} style={itemCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? '#dc2626' : brandColor }}>
                          {inc.incidentNumber} · {inc.severity}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: inc.status === 'CLOSED' ? '#ecfdf5' : '#fef2f2', color: inc.status === 'CLOSED' ? '#047857' : '#b91c1c' }}>
                          {inc.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{inc.title}</div>
                      {inc.description && <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>{inc.description}</div>}
                      {inc.rootCause && <div style={{ fontSize: 11.5, color: '#047857', marginTop: 4 }}>Root Cause: {inc.rootCause}</div>}
                      {inc.status !== 'CLOSED' && (
                        <button type="button" onClick={() => void handleCloseIncident(inc.id)} style={{ ...smallBtn, marginTop: 8 }}>
                          Resolve &amp; Close
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {assuranceTab === 'inspections' && (
          <div style={splitLayoutStyle}>
            <section style={cardStyle}>
              <h3 style={titleStyle}><CheckCircle2 size={15} color={brandColor} /> Record Quality / Safety Inspection</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPost('/api/operations/inspections', inspForm, 'Inspection recorded.', () =>
                    setInspForm((p) => ({ ...p, title: '', notes: '' }))
                  );
                }}
                style={formColStyle}
              >
                <Field label="Inspection Checklist / Title">
                  <input required placeholder="e.g. Weekly Warehouse Safety Walkthrough" value={inspForm.title} onChange={(e) => setInspForm({ ...inspForm, title: e.target.value })} style={inputStyle} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Compliance Score (%)">
                    <input type="number" min={0} max={100} value={inspForm.scorePct} onChange={(e) => setInspForm({ ...inspForm, scorePct: Number(e.target.value) })} style={inputStyle} />
                  </Field>
                  <Field label="Inspection Outcome">
                    <select value={inspForm.outcome} onChange={(e) => setInspForm({ ...inspForm, outcome: e.target.value })} style={inputStyle}>
                      {['PASS', 'CONDITIONAL', 'FAIL'].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Site / Facility">
                  <select value={inspForm.siteId} onChange={(e) => setInspForm({ ...inspForm, siteId: e.target.value })} style={inputStyle}>
                    <option value="">All / Group Site</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Findings & Observations">
                  <textarea placeholder="Key observations or non-conformities..." rows={2} value={inspForm.notes} onChange={(e) => setInspForm({ ...inspForm, notes: e.target.value })} style={inputStyle} />
                </Field>
                <button type="submit" style={primaryBtn}>Record Inspection</button>
              </form>
            </section>

            <section style={cardStyle}>
              <h3 style={titleStyle}>Site Inspection History</h3>
              {filteredInspections.length === 0 ? (
                <EmptyState text="No site inspections recorded yet." />
              ) : (
                <div style={listColStyle}>
                  {filteredInspections.map((i) => (
                    <div key={i.id} style={itemCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{i.title}</strong>
                        <span style={{ fontSize: 11, fontWeight: 800, color: i.outcome === 'PASS' ? '#059669' : i.outcome === 'FAIL' ? '#dc2626' : '#d97706' }}>
                          {i.outcome} · {i.scorePct}%
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', marginTop: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(0, Number(i.scorePct || 0)))}%`, height: '100%', background: i.scorePct >= 80 ? '#059669' : brandColor }} />
                      </div>
                      {i.notes && <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{i.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {assuranceTab === 'sops' && (
          <div style={splitLayoutStyle}>
            <section style={cardStyle}>
              <h3 style={titleStyle}><BookOpen size={15} color={brandColor} /> Publish Standard Operating Procedure</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPost('/api/operations/sops', sopForm, 'SOP published.', () =>
                    setSopForm((p) => ({ ...p, title: '', content: '' }))
                  );
                }}
                style={formColStyle}
              >
                <Field label="SOP Title">
                  <input required placeholder="e.g. Daily Cold-Chain Dispatch Protocol" value={sopForm.title} onChange={(e) => setSopForm({ ...sopForm, title: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Version">
                  <input required placeholder="1.0" value={sopForm.version} onChange={(e) => setSopForm({ ...sopForm, version: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Standard Procedure Steps">
                  <textarea required placeholder="Step-by-step execution checklist..." rows={4} value={sopForm.content} onChange={(e) => setSopForm({ ...sopForm, content: e.target.value })} style={inputStyle} />
                </Field>
                <button type="submit" style={primaryBtn}>Publish SOP</button>
              </form>
            </section>

            <section style={cardStyle}>
              <h3 style={titleStyle}>Controlled SOP Directory</h3>
              {filteredSops.length === 0 ? (
                <EmptyState text="No SOPs published yet." />
              ) : (
                <div style={listColStyle}>
                  {filteredSops.map((s) => (
                    <div key={s.id} style={itemCardStyle}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: brandColor }}>{s.code} · v{s.version}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{s.title}</div>
                      {s.content && <div style={{ fontSize: 12, color: '#475569', marginTop: 4, whiteSpace: 'pre-line' }}>{s.content}</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'resources') {
    const lowStockCount = stockItems.filter((it) => Number(it.quantityOnHand) <= Number(it.reorderLevel)).length;
    const activeVehiclesCount = vehicles.filter((v) => v.status === 'ACTIVE' || v.status === 'AVAILABLE').length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MiniKpi label="Registered Assets" value={assets.length} sub="Tools, equipment & devices" color={brandColor} />
          <MiniKpi label="Inventory SKUs" value={stockItems.length} sub="Tracked consumables" color="#0284c7" />
          <MiniKpi label="Low Stock Alerts" value={lowStockCount} sub="At or below reorder level" color={lowStockCount > 0 ? '#dc2626' : '#059669'} />
          <MiniKpi label="Fleet Vehicles" value={vehicles.length} sub={`${activeVehiclesCount} ready for dispatch`} color="#059669" />
        </div>

        {/* Subtab Navigation + Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={pillGroupStyle}>
            <SubTabPill active={resourceTab === 'assets'} color={brandColor} onClick={() => setResourceTab('assets')}>
              <Wrench size={13} /> Assets &amp; Custody ({assets.length})
            </SubTabPill>
            <SubTabPill active={resourceTab === 'stock'} color={brandColor} onClick={() => setResourceTab('stock')}>
              <Package size={13} /> Inventory &amp; Stores ({stockItems.length})
            </SubTabPill>
            <SubTabPill active={resourceTab === 'fleet'} color={brandColor} onClick={() => setResourceTab('fleet')}>
              <Truck size={13} /> Fleet &amp; Vehicles ({vehicles.length})
            </SubTabPill>
          </div>
          <SearchBox value={filterText} onChange={setFilterText} placeholder="Search assets, SKUs, plate numbers..." />
        </div>

        {resourceTab === 'assets' && (
          <div style={splitLayoutStyle}>
            <section style={cardStyle}>
              <h3 style={titleStyle}><Wrench size={15} color={brandColor} /> Register Operational Asset</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPost('/api/operations/assets', assetForm, 'Asset registered.', () =>
                    setAssetForm((p) => ({ ...p, name: '' }))
                  );
                }}
                style={formColStyle}
              >
                <Field label="Asset / Equipment Name">
                  <input required placeholder="e.g. Caterpillar 30kVA Generator" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Asset Category">
                  <select value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })} style={inputStyle}>
                    {['EQUIPMENT', 'IT_HARDWARE', 'POWER_SYSTEM', 'TOOLING', 'SAFETY_GEAR'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Assigned Custodian">
                  <select value={assetForm.custodianId} onChange={(e) => setAssetForm({ ...assetForm, custodianId: e.target.value })} style={inputStyle}>
                    <option value="">Unassigned (Central Store)</option>
                    {staffOptions.map((st) => <option key={st.id} value={st.id}>{st.legalName}</option>)}
                  </select>
                </Field>
                <button type="submit" style={primaryBtn}>Register Asset</button>
              </form>
            </section>

            <section style={cardStyle}>
              <h3 style={titleStyle}>Asset Custody Register</h3>
              {filteredAssets.length === 0 ? (
                <EmptyState text="No assets registered for this filter." />
              ) : (
                <div style={listColStyle}>
                  {filteredAssets.map((a) => (
                    <div key={a.id} style={itemCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: brandColor }}>{a.assetTag} · {a.category || 'EQUIPMENT'}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#334155' }}>{a.status}</span>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>{a.name}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Condition: {a.condition || 'GOOD'}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {resourceTab === 'stock' && (
          <div style={splitLayoutStyle}>
            <section style={cardStyle}>
              <h3 style={titleStyle}><Package size={15} color={brandColor} /> Add Store / Inventory SKU</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPost('/api/operations/stock', stockForm, 'Stock SKU created.', () =>
                    setStockForm((p) => ({ ...p, name: '' }))
                  );
                }}
                style={formColStyle}
              >
                <Field label="Item / Material Name">
                  <input required placeholder="e.g. Diesel Fuel Filters" value={stockForm.name} onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })} style={inputStyle} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <Field label="Opening Qty">
                    <input type="number" min={0} value={stockForm.quantityOnHand} onChange={(e) => setStockForm({ ...stockForm, quantityOnHand: Number(e.target.value) })} style={inputStyle} />
                  </Field>
                  <Field label="Reorder Level">
                    <input type="number" min={0} value={stockForm.reorderLevel} onChange={(e) => setStockForm({ ...stockForm, reorderLevel: Number(e.target.value) })} style={inputStyle} />
                  </Field>
                  <Field label="Unit">
                    <input placeholder="PCS" value={stockForm.unit} onChange={(e) => setStockForm({ ...stockForm, unit: e.target.value })} style={inputStyle} />
                  </Field>
                </div>
                <button type="submit" style={primaryBtn}>Add Stock SKU</button>
              </form>
            </section>

            <section style={cardStyle}>
              <h3 style={titleStyle}>Inventory &amp; Reorder Ledger</h3>
              {filteredStock.length === 0 ? (
                <EmptyState text="No stock SKUs recorded yet." />
              ) : (
                <div style={listColStyle}>
                  {filteredStock.map((it) => {
                    const isLow = Number(it.quantityOnHand) <= Number(it.reorderLevel);
                    return (
                      <div key={it.id} style={itemCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>
                              {it.name} <span style={{ fontSize: 11, color: '#64748b' }}>({it.sku})</span>
                            </div>
                            <div style={{ fontSize: 12, color: isLow ? '#dc2626' : '#475569', marginTop: 2 }}>
                              On Hand: <strong>{it.quantityOnHand} {it.unit}</strong> · Reorder ≤ {it.reorderLevel}
                              {isLow && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: '#b91c1c' }}>LOW STOCK</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => void handleStockAdjust(it.id, 'IN')} style={smallBtn}>+ IN</button>
                            <button type="button" onClick={() => void handleStockAdjust(it.id, 'OUT')} style={smallBtn}>- OUT</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {resourceTab === 'fleet' && (
          <div style={splitLayoutStyle}>
            <section style={cardStyle}>
              <h3 style={titleStyle}><Truck size={15} color={brandColor} /> Register Fleet Vehicle</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPost('/api/operations/fleet', fleetForm, 'Vehicle registered.', () =>
                    setFleetForm((p) => ({ ...p, plateNumber: '', model: '' }))
                  );
                }}
                style={formColStyle}
              >
                <Field label="License Plate Number">
                  <input required placeholder="e.g. ABC-123XY" value={fleetForm.plateNumber} onChange={(e) => setFleetForm({ ...fleetForm, plateNumber: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Vehicle Make & Model">
                  <input required placeholder="e.g. Toyota Hilux 4x4" value={fleetForm.model} onChange={(e) => setFleetForm({ ...fleetForm, model: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Current Odometer (km)">
                  <input type="number" min={0} value={fleetForm.odometerKm} onChange={(e) => setFleetForm({ ...fleetForm, odometerKm: Number(e.target.value) })} style={inputStyle} />
                </Field>
                <button type="submit" style={primaryBtn}>Register Vehicle</button>
              </form>
            </section>

            <section style={cardStyle}>
              <h3 style={titleStyle}>Active Fleet Directory</h3>
              {filteredVehicles.length === 0 ? (
                <EmptyState text="No fleet vehicles registered yet." />
              ) : (
                <div style={listColStyle}>
                  {filteredVehicles.map((v) => (
                    <div key={v.id} style={itemCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: brandColor }}>{v.plateNumber}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#ecfdf5', color: '#047857' }}>{v.status}</span>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>{v.model}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Odometer: {Number(v.odometerKm || 0).toLocaleString()} km</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    );
  }

  // GOVERNANCE MODE (Handovers, Reconciliations, Automation & Cross-Company Intelligence)
  const avgSla =
    analytics?.byCompany?.length > 0
      ? Math.round(
          analytics.byCompany.reduce((acc: number, r: any) => acc + Number(r.slaCompliancePct || 0), 0) /
            analytics.byCompany.length
        )
      : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MiniKpi label="Operating Entities" value={analytics?.byCompany?.length ?? subsidiaries.length} sub="Cross-company scorecards" color={brandColor} />
        <MiniKpi label="Group SLA Compliance" value={`${avgSla}%`} sub="On-time resolution rate" color="#059669" />
        <MiniKpi label="Shift Handovers" value={handovers.length} sub="Logged shift transitions" color="#4f46e5" />
        <MiniKpi label="Escalation Rules" value={rules.length} sub="Active SLA automations" color="#d97706" />
      </div>

      {/* GMD-ONLY AI INTELLIGENCE */}
      {isGmd && (
        <section style={{ ...cardStyle, borderColor: `${brandColor}45`, background: `${brandColor}0c` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: brandColor }}>
                <Sparkles size={16} /> AI-Assisted Operations Intelligence (GMD Exclusive)
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                Advisory digest across group SLA breaches, critical incidents, stockouts, and handovers.
              </div>
            </div>
            <button type="button" disabled={loadingAi} onClick={() => void handleGenerateGmdAiBrief()} style={primaryBtn}>
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
                  <th style={{ padding: 10 }}>Subsidiary</th>
                  <th style={{ padding: 10 }}>Work Orders</th>
                  <th style={{ padding: 10 }}>Completed</th>
                  <th style={{ padding: 10 }}>SLA Compliance</th>
                  <th style={{ padding: 10 }}>Open Incidents</th>
                  <th style={{ padding: 10 }}>Low Stock</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byCompany.map((row: any) => (
                  <tr key={row.organizationId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 10, fontWeight: 700, color: '#0f172a' }}>{row.legalName}</td>
                    <td style={{ padding: 10 }}>{row.totalWorkOrders}</td>
                    <td style={{ padding: 10 }}>{row.completedWorkOrders}</td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 64, height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ width: `${row.slaCompliancePct}%`, height: '100%', background: row.slaCompliancePct >= 90 ? '#059669' : '#dc2626' }} />
                        </div>
                        <span style={{ fontWeight: 700, color: row.slaCompliancePct >= 90 ? '#059669' : '#dc2626' }}>{row.slaCompliancePct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>{row.openIncidents}</td>
                    <td style={{ padding: 10 }}>{row.lowStockItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <section style={cardStyle}>
          <h3 style={titleStyle}><Repeat size={15} color={brandColor} /> Shift Handovers</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitPost('/api/operations/handovers', handoverForm, 'Shift handover logged.', () =>
                setHandoverForm((p) => ({ ...p, openItemsSummary: '', criticalRisks: '' }))
              );
            }}
            style={formColStyle}
          >
            <Field label="Shift Label">
              <input required placeholder="e.g. Night Shift" value={handoverForm.shiftLabel} onChange={(e) => setHandoverForm({ ...handoverForm, shiftLabel: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Incoming Duty Officer">
              <select value={handoverForm.incomingOfficerId} onChange={(e) => setHandoverForm({ ...handoverForm, incomingOfficerId: e.target.value })} style={inputStyle}>
                <option value="">Select Officer (Optional)</option>
                {staffOptions.map((st) => <option key={st.id} value={st.id}>{st.legalName}</option>)}
              </select>
            </Field>
            <Field label="Open Items & Handover Summary">
              <textarea required placeholder="Carry-over tasks, pending dispatches, site risks..." rows={2} value={handoverForm.openItemsSummary} onChange={(e) => setHandoverForm({ ...handoverForm, openItemsSummary: e.target.value })} style={inputStyle} />
            </Field>
            <button type="submit" style={primaryBtn}>Submit Handover</button>
          </form>
          <div style={listColStyle}>
            {handovers.length === 0 ? (
              <EmptyState text="No shift handovers submitted yet." />
            ) : (
              handovers.map((h) => (
                <div key={h.id} style={itemCardStyle}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{h.shiftLabel} · {h.acknowledgedAt ? 'Acknowledged' : 'Pending Ack'}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{h.openItemsSummary}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}>Reconciliations &amp; Exceptions</h3>
          <form onSubmit={(e) => { e.preventDefault(); void submitPost('/api/operations/reconciliations', reconForm, 'Reconciliation run recorded.'); }} style={formColStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Period (YYYY-MM)">
                <input required placeholder="2026-11" value={reconForm.period} onChange={(e) => setReconForm({ ...reconForm, period: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Source Ledger">
                <select value={reconForm.sourceSystem} onChange={(e) => setReconForm({ ...reconForm, sourceSystem: e.target.value })} style={inputStyle}>
                  {['FINANCE', 'STOCK', 'FLEET', 'DEVICE'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <button type="submit" style={primaryBtn}>Create Reconciliation Run</button>
          </form>
          <div style={listColStyle}>
            {reconciliations.length === 0 ? (
              <EmptyState text="No reconciliation runs recorded yet." />
            ) : (
              reconciliations.map((r) => (
                <div key={r.id} style={itemCardStyle}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{r.sourceSystem} · {r.period} ({r.status})</div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Matched: {r.matchedCount} · Exceptions: {r.exceptionCount}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={titleStyle}><Cpu size={15} color={brandColor} /> Automation &amp; Escalation Rules</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitPost('/api/operations/automation', ruleForm, 'Automation rule saved.', () =>
                setRuleForm((p) => ({ ...p, name: '' }))
              );
            }}
            style={formColStyle}
          >
            <Field label="Rule Name">
              <input required placeholder="e.g. Escalate Overdue Critical WOs" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Trigger Event">
              <select value={ruleForm.triggerEvent} onChange={(e) => setRuleForm({ ...ruleForm, triggerEvent: e.target.value })} style={inputStyle}>
                {['WORK_ORDER_OVERDUE', 'INCIDENT_CRITICAL', 'STOCK_LOW', 'HANDOVER_UNACKNOWLEDGED'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <button type="submit" style={primaryBtn}>Add Rule</button>
          </form>
          <div style={listColStyle}>
            {rules.length === 0 ? (
              <EmptyState text="No escalation rules configured yet." />
            ) : (
              rules.map((rl) => (
                <div key={rl.id} style={itemCardStyle}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{rl.name}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Trigger: {rl.triggerEvent} → {rl.actionType} ({rl.targetRoleOrId})</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, sub, color }: { label: string; value: number | string; sub: string; color: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderTop: `3px solid ${color}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 750, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 850, color: '#0f172a', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function SubTabPill({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 13px',
        borderRadius: 9,
        border: 'none',
        background: active ? color : 'transparent',
        color: active ? '#ffffff' : '#475569',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative', minWidth: 240 }}>
      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingLeft: 30, height: 34 }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 750, color: '#475569' }}>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: '22px 12px', textAlign: 'center', color: '#64748b', fontSize: 12.5, background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1' }}>
      {text}
    </div>
  );
}

const splitLayoutStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', gap: 16, alignItems: 'start' };
const pillGroupStyle: React.CSSProperties = { display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', flexWrap: 'wrap' };
const cardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 };
const titleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: 14.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 };
const formColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const listColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' };
const itemCardStyle: React.CSSProperties = { padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' };
const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 12.5, color: '#0f172a', width: '100%', boxSizing: 'border-box' };
