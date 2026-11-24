'use client';

import React, { useState } from 'react';
import {
  Plus,
  ThumbsUp,
  CheckCircle2,
  AlertTriangle,
  Rocket,
  ShieldAlert,
  BarChart3,
  FileText,
  FlaskConical,
  Layers,
  Wallet,
  Compass,
  Check,
  ExternalLink,
} from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';

function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

interface DeepPanelProps {
  activeTab:
    | 'ideas_discovery'
    | 'strategy_prds'
    | 'delivery_releases'
    | 'analytics_budget'
    | 'governance_approvals';
  data: any;
  products: any[];
  activeProduct: any;
  selectedOrgId: string;
  selectedProductId: string;
  brandColor: string;
  actorName: string;
  onRefresh: () => void;
  onNotice: (msg: string) => void;
  onOpenNewIdea: () => void;
  onOpenNewPrd: () => void;
}

export function InnovationDeepPanels({
  activeTab,
  data,
  products,
  activeProduct,
  selectedOrgId,
  selectedProductId,
  brandColor,
  actorName,
  onRefresh,
  onNotice,
  onOpenNewIdea,
  onOpenNewPrd,
}: DeepPanelProps) {
  const [discoverySubTab, setDiscoverySubTab] = useState<'IDEAS' | 'OST' | 'FEEDBACK' | 'RESEARCH'>('IDEAS');
  const [selectedPrdId, setSelectedPrdId] = useState<string>(data?.prds?.[0]?.id || '');

  // Inline creation drawer/modal toggle
  const [modalType, setModalType] = useState<
    | null
    | 'OPPORTUNITY'
    | 'FEEDBACK'
    | 'RESEARCH'
    | 'OKR'
    | 'ROADMAP'
    | 'DESIGN'
    | 'EXPERIMENT'
    | 'RELEASE'
    | 'LAUNCH'
    | 'METRIC'
    | 'BUDGET'
    | 'RISK'
    | 'DECISION'
    | 'APPROVAL'
  >(null);

  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  const defaultProdId = selectedProductId || activeProduct?.id || products[0]?.id || '';
  const activePrd = (data?.prds || []).find((p: any) => p.id === selectedPrdId) || data?.prds?.[0] || null;

  const openModal = (type: NonNullable<typeof modalType>, defaults: Record<string, any> = {}) => {
    setForm({ productId: defaultProdId, ...defaults });
    setModalType(type);
  };

  const handleIdeaAction = async (ideaId: string, action: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/ideas'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: ideaId, action, productId: defaultProdId }),
    });
    const json = await res.json();
    if (res.ok) {
      if (action === 'CONVERT_TO_FEATURE') onNotice(`Converted idea to Product Feature ${json.feature?.featureCode}.`);
      else if (action === 'CONVERT_TO_OPPORTUNITY') onNotice(`Converted idea to Discovery Opportunity ${json.opportunity?.opportunityCode}.`);
      else onNotice('Updated idea record.');
      onRefresh();
    } else {
      onNotice(json.error || 'Action failed.');
    }
  };

  const handleRouteFeedbackToEngineering = async (feedbackId: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/discovery'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ entityType: 'FEEDBACK', id: feedbackId, routeToEngineering: true }),
    });
    const json = await res.json();
    if (res.ok) {
      onNotice(`Routed feedback to Project Management Engineering Triage (${json.feedback?.linkedWorkItemId || 'Linked'}).`);
      onRefresh();
    }
  };

  const handlePrdAction = async (prdId: string, mode: 'NEW_VERSION' | 'APPROVE') => {
    const res = await fetch(resolveApiUrl('/api/innovation/prds'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id: prdId,
        action: mode === 'APPROVE' ? 'APPROVE_PRD' : 'UPDATE',
        createNewVersion: mode === 'NEW_VERSION',
        changeSummary:
          mode === 'APPROVE'
            ? `Formal PRD snapshot approved by ${actorName}`
            : `Drafted new revision preserving immutable prior approved snapshot`,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      onNotice(
        mode === 'APPROVE'
          ? `Approved immutable PRD snapshot v${json.prd?.approvedVersion}.`
          : `Created new PRD revision v${json.prd?.currentVersion}.`
      );
      onRefresh();
    } else {
      onNotice(json.error || 'PRD action failed.');
    }
  };

  const handleToggleLaunchStream = async (lc: any, field: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/delivery'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'LAUNCH',
        id: lc.id,
        [field]: !lc[field],
      }),
    });
    if (res.ok) {
      onNotice('Updated Go/No-Go readiness stream.');
      onRefresh();
    }
  };

  const handleSetLaunchDecision = async (launchId: string, decision: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/delivery'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'LAUNCH',
        id: launchId,
        goNoGoDecision: decision,
        decisionNotes: `Go/No-Go decision set to ${decision} by ${actorName}`,
      }),
    });
    if (res.ok) {
      onNotice(`Recorded Go/No-Go decision: ${decision}.`);
      onRefresh();
    }
  };

  const handleUpdateDesignStage = async (designId: string, stage: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/prds'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ entityType: 'DESIGN', id: designId, workflowStage: stage }),
    });
    if (res.ok) {
      onNotice(`Design artifact moved to ${stage}.`);
      onRefresh();
    }
  };

  const handleApprovalDecision = async (approvalId: string, status: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') => {
    let note = `Approved through Product Governance Gate by ${actorName}.`;
    if (status !== 'APPROVED') {
      const input = window.prompt(`Enter mandatory reason for ${status}:`, 'Requires updated evidence or PRD alignment');
      if (!input) return;
      note = input;
    }
    const res = await fetch(resolveApiUrl('/api/innovation/delivery'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ entityType: 'APPROVAL', id: approvalId, status, decisionNote: note }),
    });
    const json = await res.json();
    if (res.ok) {
      onNotice(`Recorded ${status} decision on ${json.approval?.approvalCode}.`);
      onRefresh();
    } else {
      onNotice(json.error || 'Approval decision rejected.');
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalType) return;
    setBusy(true);
    try {
      let endpoint = '/api/innovation/delivery';
      let payload: Record<string, any> = { ...form, organizationId: selectedOrgId || undefined };

      if (modalType === 'OPPORTUNITY' || modalType === 'FEEDBACK' || modalType === 'RESEARCH') {
        endpoint = '/api/innovation/discovery';
        payload.entityType = modalType;
      } else if (modalType === 'OKR') {
        endpoint = '/api/innovation/products';
        payload.entityType = 'GOAL';
      } else if (modalType === 'ROADMAP') {
        endpoint = '/api/innovation/features';
        payload.entityType = 'ROADMAP_ITEM';
      } else if (modalType === 'DESIGN') {
        endpoint = '/api/innovation/prds';
        payload.entityType = 'DESIGN';
      } else {
        endpoint = '/api/innovation/delivery';
        payload.entityType = modalType === 'APPROVAL' ? 'APPROVAL_REQUEST' : modalType;
      }

      const res = await fetch(resolveApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        setModalType(null);
        setForm({});
        onNotice(`Saved new ${modalType.replace(/_/g, ' ').toLowerCase()} record.`);
        onRefresh();
      } else {
        onNotice(json.error || 'Could not save record.');
      }
    } finally {
      setBusy(false);
    }
  };

  const primaryBtnStyle: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 9,
    border: 'none',
    background: brandColor,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  };

  const softBadgeStyle: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 900,
    padding: '2px 8px',
    borderRadius: 6,
    background: `${brandColor}14`,
    color: brandColor,
    border: `1px solid ${brandColor}35`,
  };

  const EmptyBlock = ({ title, subtitle, actionLabel, onAction }: { title: string; subtitle: string; actionLabel: string; onAction: () => void }) => (
    <div
      style={{
        padding: '28px 20px',
        borderRadius: 12,
        border: '1px dashed #cbd5e1',
        background: '#f8fafc',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{title}</strong>
      <p style={{ margin: 0, fontSize: 12, color: '#64748b', maxWidth: 440 }}>{subtitle}</p>
      <button type="button" onClick={onAction} style={{ ...primaryBtnStyle, marginTop: 4 }}>
        <Plus size={13} /> {actionLabel}
      </button>
    </div>
  );

  return (
    <>
      {/* =================================================================== */}
      {/* TAB 4: IDEAS, DISCOVERY OST, FEEDBACK & USER RESEARCH               */}
      {/* =================================================================== */}
      {activeTab === 'ideas_discovery' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'IDEAS', label: `Idea Board (${(data?.ideas || []).length})` },
                { id: 'OST', label: `Discovery OST (${(data?.opportunities || []).length})` },
                { id: 'FEEDBACK', label: `Customer & Staff Feedback (${(data?.feedbackItems || []).length})` },
                { id: 'RESEARCH', label: `Research, Personas & Competitors (${(data?.researchRecords || []).length})` },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setDiscoverySubTab(st.id as any)}
                  style={{
                    padding: '7px 13px',
                    borderRadius: 9,
                    border: discoverySubTab === st.id ? `1px solid ${brandColor}` : '1px solid #e2e8f0',
                    background: discoverySubTab === st.id ? brandColor : '#f8fafc',
                    color: discoverySubTab === st.id ? '#ffffff' : '#334155',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {discoverySubTab === 'IDEAS' && (
                <button type="button" onClick={onOpenNewIdea} style={primaryBtnStyle}>
                  <Plus size={14} /> Submit New Idea
                </button>
              )}
              {discoverySubTab === 'OST' && (
                <button type="button" onClick={() => openModal('OPPORTUNITY')} style={primaryBtnStyle}>
                  <Plus size={14} /> New Discovery Opportunity
                </button>
              )}
              {discoverySubTab === 'FEEDBACK' && (
                <button type="button" onClick={() => openModal('FEEDBACK', { category: 'FEATURE_REQUEST', severity: 'MEDIUM' })} style={primaryBtnStyle}>
                  <Plus size={14} /> Log Feedback / Defect
                </button>
              )}
              {discoverySubTab === 'RESEARCH' && (
                <button type="button" onClick={() => openModal('RESEARCH', { researchType: 'USER_INTERVIEW' })} style={primaryBtnStyle}>
                  <Plus size={14} /> New Research / Persona
                </button>
              )}
            </div>
          </div>

          {/* IDEAS */}
          {discoverySubTab === 'IDEAS' &&
            ((data?.ideas || []).length === 0 ? (
              <EmptyBlock
                title="No ideas submitted for this subsidiary yet"
                subtitle="Capture employee, executive, or customer product ideas with problem statements and expected business outcomes."
                actionLabel="Submit First Idea"
                onAction={onOpenNewIdea}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                {(data?.ideas || []).map((idea: any) => (
                  <div key={idea.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={softBadgeStyle}>{idea.ideaNumber} · {idea.productName}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: idea.status === 'APPROVED' ? '#ecfdf5' : '#ffffff', border: '1px solid #cbd5e1', color: idea.status === 'APPROVED' ? '#047857' : '#334155' }}>
                          {idea.status}
                        </span>
                      </div>
                      <h4 style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{idea.title}</h4>
                      <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}>
                        <strong>Problem:</strong> {idea.problemStatement}
                      </div>
                      {idea.expectedValue && <div style={{ fontSize: 11, color: '#047857', fontWeight: 700 }}>Expected Value: {idea.expectedValue}</div>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: 10.5, color: '#64748b' }}>By <strong>{idea.submitterName}</strong></span>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button type="button" onClick={() => void handleIdeaAction(idea.id, 'VOTE')} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ThumbsUp size={11} color={brandColor} /> {idea.votesCount}
                        </button>
                        <button type="button" onClick={() => void handleIdeaAction(idea.id, 'CONVERT_TO_OPPORTUNITY')} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                          → Opportunity
                        </button>
                        <button type="button" onClick={() => void handleIdeaAction(idea.id, 'CONVERT_TO_FEATURE')} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${brandColor}44`, background: `${brandColor}14`, color: brandColor, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                          → Feature
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* DISCOVERY OST */}
          {discoverySubTab === 'OST' &&
            ((data?.opportunities || []).length === 0 ? (
              <EmptyBlock
                title="No discovery opportunities mapped yet"
                subtitle="Build an Opportunity Solution Tree linking product outcomes to validated user problems, hypotheses, and research evidence."
                actionLabel="Create Discovery Opportunity"
                onAction={() => openModal('OPPORTUNITY')}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                {(data?.opportunities || []).map((opp: any) => (
                  <div key={opp.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={softBadgeStyle}>{opp.opportunityCode} · {opp.productName}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                        Confidence {opp.confidenceScore}% · {opp.decision}
                      </span>
                    </div>
                    <h4 style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 800 }}>{opp.title}</h4>
                    <p style={{ margin: '0 0 6px', fontSize: 11.5, color: '#334155' }}><strong>Problem:</strong> {opp.problemStatement}</p>
                    {opp.hypothesis && <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}><strong>Hypothesis:</strong> {opp.hypothesis}</div>}
                    {opp.evidenceSummary && <div style={{ padding: '6px 8px', borderRadius: 7, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 11 }}><strong>Evidence:</strong> {opp.evidenceSummary}</div>}
                  </div>
                ))}
              </div>
            ))}

          {/* FEEDBACK */}
          {discoverySubTab === 'FEEDBACK' &&
            ((data?.feedbackItems || []).length === 0 ? (
              <EmptyBlock
                title="No customer or staff feedback logged yet"
                subtitle="Centralize bugs, usability issues, feature requests, and field observations with 1-click routing to Project Management."
                actionLabel="Log Customer / Staff Feedback"
                onAction={() => openModal('FEEDBACK', { category: 'BUG', severity: 'HIGH' })}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                {(data?.feedbackItems || []).map((fb: any) => (
                  <div key={fb.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={softBadgeStyle}>{fb.feedbackCode} · {fb.category}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ffffff', border: '1px solid #cbd5e1' }}>{fb.status}</span>
                      </div>
                      <h4 style={{ margin: '8px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{fb.title}</h4>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>{fb.description}</p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 11 }}>
                      <span style={{ color: '#64748b' }}>Channel: <strong>{fb.sourceChannel}</strong></span>
                      {fb.linkedWorkItemId ? (
                        <span style={{ color: '#047857', fontWeight: 800 }}>✓ Engineering Ticket: {fb.linkedWorkItemId}</span>
                      ) : (
                        <button type="button" onClick={() => void handleRouteFeedbackToEngineering(fb.id)} style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${brandColor}44`, background: `${brandColor}14`, color: brandColor, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                          Route to Engineering →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* RESEARCH & PERSONAS */}
          {discoverySubTab === 'RESEARCH' &&
            ((data?.researchRecords || []).length === 0 ? (
              <EmptyBlock
                title="No user research, personas, or competitor studies recorded"
                subtitle="Document evidence-backed user interviews, usability tests, customer personas, and competitor capability matrices."
                actionLabel="Create Research Study"
                onAction={() => openModal('RESEARCH', { researchType: 'USER_INTERVIEW' })}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                {(data?.researchRecords || []).map((resRec: any) => (
                  <div key={resRec.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={softBadgeStyle}>{resRec.researchCode} · {resRec.researchType}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                        {resRec.status} · Consent ✓
                      </span>
                    </div>
                    <h4 style={{ margin: '8px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{resRec.title}</h4>
                    <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}><strong>Question:</strong> {resRec.researchQuestion}</div>
                    {resRec.findingsSummary && (
                      <div style={{ padding: '6px 8px', borderRadius: 7, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 11 }}>
                        <strong>Verified Findings:</strong> {resRec.findingsSummary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: STRATEGY, OKRs, ROADMAPS & 14-SECTION VERSIONED PRD EDITOR   */}
      {/* =================================================================== */}
      {activeTab === 'strategy_prds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* OKRs & Roadmaps */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Product Objectives &amp; Key Results (OKRs)</h3>
                <button type="button" onClick={() => openModal('OKR', { measurementCycle: 'Q4 2026', unit: '%', targetValue: 95, actualValue: 50 })} style={primaryBtnStyle}>
                  <Plus size={13} /> New Objective
                </button>
              </div>
              {(data?.goals || []).length === 0 ? (
                <EmptyBlock
                  title="No OKRs defined for this subsidiary yet"
                  subtitle="Connect product strategy to measurable quarterly objectives and verifiable key results."
                  actionLabel="Define Product OKR"
                  onAction={() => openModal('OKR', { measurementCycle: 'Q4 2026', unit: '%', targetValue: 95, actualValue: 50 })}
                />
              ) : (
                (data?.goals || []).map((g: any) => (
                  <div key={g.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{g.objectiveTitle} ({g.measurementCycle})</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{g.purpose}</div>
                    {(g.keyResults || []).map((kr: any) => {
                      const pct = Math.min(100, Math.max(0, Math.round((kr.actualValue / (kr.targetValue || 1)) * 100)));
                      return (
                        <div key={kr.id} style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
                            <span>{kr.metricName}</span>
                            <span style={{ color: brandColor }}>{kr.actualValue}{kr.unit} / {kr.targetValue}{kr.unit}</span>
                          </div>
                          <div style={{ height: 7, borderRadius: 99, background: '#e2e8f0', marginTop: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: brandColor }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Strategic Product Roadmap (Now / Next / Later)</h3>
                <button type="button" onClick={() => openModal('ROADMAP', { horizon: 'NOW', quarterLabel: 'Q4 2026', commitmentLevel: 'TENTATIVE' })} style={primaryBtnStyle}>
                  <Plus size={13} /> Add Milestone
                </button>
              </div>
              {(data?.roadmapItems || []).length === 0 ? (
                <EmptyBlock
                  title="No roadmap milestones scheduled yet"
                  subtitle="Map features across Now, Next, and Later horizons with clear separation between Tentative and Approved Commitments."
                  actionLabel="Add Roadmap Milestone"
                  onAction={() => openModal('ROADMAP', { horizon: 'NOW', quarterLabel: 'Q4 2026', commitmentLevel: 'TENTATIVE' })}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(data?.roadmapItems || []).map((rm: any) => (
                    <div key={rm.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 7px', borderRadius: 5, background: brandColor, color: '#ffffff' }}>{rm.horizon} · {rm.quarterLabel}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: rm.commitmentLevel === 'APPROVED_COMMITMENT' ? '#ecfdf5' : '#ffffff', border: '1px solid #cbd5e1', color: rm.commitmentLevel === 'APPROVED_COMMITMENT' ? '#047857' : '#475569' }}>
                            {rm.commitmentLevel}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 5 }}>{rm.title}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{rm.productName} · Dependencies: {rm.dependenciesNote || 'None'}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800 }}>{rm.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 14-Section Version-Controlled PRD Editor */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>14-Section Version-Controlled PRD Specification Editor</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Engineering handoffs bind to an immutable approved PRD version snapshot — drafting a new version never overwrites prior approvals.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(data?.prds || []).length > 0 && (
                  <select
                    value={activePrd?.id || ''}
                    onChange={(e) => setSelectedPrdId(e.target.value)}
                    style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12, fontWeight: 700 }}
                  >
                    {(data?.prds || []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.prdCode} · {p.title} (v{p.currentVersion} · {p.status})
                      </option>
                    ))}
                  </select>
                )}
                {activePrd && (
                  <>
                    <button type="button" onClick={() => void handlePrdAction(activePrd.id, 'NEW_VERSION')} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                      + Draft v{(activePrd.currentVersion || 1) + 1}
                    </button>
                    <button type="button" onClick={() => void handlePrdAction(activePrd.id, 'APPROVE')} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#059669', color: '#ffffff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                      ✓ Approve v{activePrd.currentVersion}
                    </button>
                  </>
                )}
                <button type="button" onClick={onOpenNewPrd} style={primaryBtnStyle}>
                  <Plus size={13} /> New PRD
                </button>
              </div>
            </div>

            {!activePrd ? (
              <EmptyBlock
                title="No Product Requirements Documents (PRDs) created yet"
                subtitle="Author structured 14-section PRDs covering problem statement, personas, scope, user flows, security, and verifiable acceptance criteria."
                actionLabel="Create First PRD (v1)"
                onAction={onOpenNewPrd}
              />
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 12 }}>
                  {[
                    { label: '1. Overview & Context', val: activePrd.overview },
                    { label: '2. Problem Statement', val: activePrd.problemStatement },
                    { label: '3. Target Outcomes & Metrics', val: activePrd.targetOutcomes },
                    { label: '4. Target Personas', val: activePrd.personas },
                    { label: '5. In-Scope Capabilities', val: activePrd.inScope },
                    { label: '6. Out-of-Scope Exclusions', val: activePrd.outOfScope },
                    { label: '7. User Stories', val: activePrd.userStories },
                    { label: '8. User Flows', val: activePrd.userFlows },
                    { label: '9. Functional Requirements', val: activePrd.functionalReqs },
                    { label: '10. Non-Functional Requirements', val: activePrd.nonFunctionalReqs },
                    { label: '11. Data Model Notes', val: activePrd.dataModelNotes },
                    { label: '12. Security & Privacy', val: activePrd.securityPrivacy },
                    { label: '13. Dependencies & Risks', val: activePrd.dependenciesRisks },
                    { label: '14. Acceptance Criteria', val: activePrd.acceptanceCriteria },
                  ].map((sec) => (
                    <div key={sec.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: brandColor, textTransform: 'uppercase', marginBottom: 4 }}>{sec.label}</div>
                      <div style={{ fontSize: 12, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{sec.val || '—'}</div>
                    </div>
                  ))}
                </div>
                {activePrd.versions?.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {activePrd.versions.map((v: any) => (
                      <div key={v.id} style={{ padding: '6px 10px', borderRadius: 8, background: v.status === 'APPROVED' ? '#ecfdf5' : '#f8fafc', border: `1px solid ${v.status === 'APPROVED' ? '#a7f3d0' : '#e2e8f0'}`, fontSize: 11 }}>
                        <strong>v{v.versionNumber} ({v.status})</strong> · {v.changeSummary} · by {v.createdByName}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 6: DESIGN REVIEW, EXPERIMENTS, RELEASES & GO/NO-GO LAUNCH BOARD */}
      {/* =================================================================== */}
      {activeTab === 'delivery_releases' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Design & Prototype Review Board (Section 18) */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Product Design, Wireframe &amp; Prototype Review Board</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Concept → Wireframe → Design → Review → Revision → Approved → Handoff</p>
              </div>
              <button type="button" onClick={() => openModal('DESIGN', { artifactType: 'PROTOTYPE', versionLabel: 'v1.0' })} style={primaryBtnStyle}>
                <Plus size={13} /> Add Design Artifact
              </button>
            </div>
            {(data?.designArtifacts || []).length === 0 ? (
              <EmptyBlock
                title="No design prototypes uploaded for review yet"
                subtitle="Link Figma prototypes, wireframes, user flows, and accessibility reviews to PRDs and features."
                actionLabel="Submit Design for Review"
                onAction={() => openModal('DESIGN', { artifactType: 'PROTOTYPE', versionLabel: 'v1.0' })}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                {(data?.designArtifacts || []).map((d: any) => (
                  <div key={d.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={softBadgeStyle}>{d.designCode} · {d.artifactType} ({d.versionLabel})</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: d.workflowStage === 'APPROVED' ? '#ecfdf5' : '#ffffff', color: d.workflowStage === 'APPROVED' ? '#047857' : '#334155', border: '1px solid #cbd5e1' }}>
                        {d.workflowStage}
                      </span>
                    </div>
                    <h4 style={{ margin: '8px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{d.title}</h4>
                    <div style={{ fontSize: 11.5, color: '#475569' }}>{d.feedbackNotes || 'Ready for stakeholder review'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: 10.5, color: '#64748b' }}>Designer: <strong>{d.designerName || 'Design Team'}</strong></span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {d.workflowStage !== 'APPROVED' && (
                          <button type="button" onClick={() => void handleUpdateDesignStage(d.id, 'APPROVED')} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#059669', color: '#ffffff', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                            Approve
                          </button>
                        )}
                        <button type="button" onClick={() => void handleUpdateDesignStage(d.id, 'REVISION')} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
                          Request Revision
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
            {/* Experiments & MVP Pilot */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Experiments &amp; MVP Pilot Graduation</h3>
                <button type="button" onClick={() => openModal('EXPERIMENT', { experimentType: 'PILOT' })} style={primaryBtnStyle}>
                  <Plus size={13} /> Log Experiment
                </button>
              </div>
              {(data?.experiments || []).length === 0 ? (
                <EmptyBlock
                  title="No experiments or field pilots logged yet"
                  subtitle="Validate material hypotheses with explicit success criteria, sample sizes, and declared limitations before scaling."
                  actionLabel="Create Experiment / Pilot"
                  onAction={() => openModal('EXPERIMENT', { experimentType: 'PILOT' })}
                />
              ) : (
                (data?.experiments || []).map((ex: any) => (
                  <div key={ex.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={softBadgeStyle}>{ex.experimentCode} · {ex.experimentType}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                        {ex.outcomeDecision} · {ex.pilotGraduation}
                      </span>
                    </div>
                    <h4 style={{ margin: '6px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{ex.title}</h4>
                    <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 4 }}><strong>Hypothesis:</strong> {ex.hypothesis}</div>
                    {ex.resultsSummary && <div style={{ fontSize: 11.5, color: '#047857', fontWeight: 700, marginBottom: 4 }}><strong>Results:</strong> {ex.resultsSummary}</div>}
                    <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a' }}>
                      <strong>Declared Limitations:</strong> {ex.limitationsNote || 'Document sample constraints'}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Releases & 6-Stream Go/No-Go Launch Board */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Product Releases &amp; Go/No-Go Launch Board</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => openModal('RELEASE', { versionTag: 'v1.0.0' })} style={primaryBtnStyle}>
                    <Plus size={13} /> New Release
                  </button>
                  <button type="button" onClick={() => openModal('LAUNCH')} style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                    + Launch Checklist
                  </button>
                </div>
              </div>
              {(data?.releases || []).length === 0 && (data?.launchChecklists || []).length === 0 ? (
                <EmptyBlock
                  title="No releases or commercial launches scheduled"
                  subtitle="Track versioned software/product releases alongside 6-stream Go/No-Go commercial readiness checklists."
                  actionLabel="Schedule Product Release"
                  onAction={() => openModal('RELEASE', { versionTag: 'v1.0.0' })}
                />
              ) : (
                <>
                  {(data?.releases || []).map((rel: any) => (
                    <div key={rel.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={softBadgeStyle}>{rel.releaseCode} · {rel.versionTag}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8' }}>
                          {rel.workflowStage} · QA: {rel.qaStatus}
                        </span>
                      </div>
                      <h4 style={{ margin: '6px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{rel.title}</h4>
                      <div style={{ fontSize: 11.5, color: '#475569' }}>{rel.externalReleaseNotes || rel.rolloutAudience}</div>
                    </div>
                  ))}
                  {(data?.launchChecklists || []).map((lc: any) => (
                    <div key={lc.id} style={{ background: `${brandColor}0D`, border: `1px solid ${brandColor}44`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <strong style={{ fontSize: 12.5, color: '#0f172a' }}>{lc.launchCode} · {lc.title}</strong>
                        <span style={softBadgeStyle}>Go/No-Go: {lc.goNoGoDecision}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {[
                          { key: 'productReadinessOk', label: 'Product Readiness' },
                          { key: 'docsTrainingOk', label: 'Docs & Training' },
                          { key: 'supportOpsOk', label: 'Support & Ops' },
                          { key: 'marketingSalesOk', label: 'Marketing & Sales' },
                          { key: 'legalPrivacyOk', label: 'Legal & Privacy' },
                          { key: 'technicalSecurityOk', label: 'Technical Security' },
                        ].map((s) => {
                          const ok = Boolean(lc[s.key]);
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => void handleToggleLaunchStream(lc, s.key)}
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '4px 8px',
                                borderRadius: 6,
                                background: ok ? '#ecfdf5' : '#fef2f2',
                                color: ok ? '#047857' : '#dc2626',
                                border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`,
                                cursor: 'pointer',
                              }}
                              title="Click to toggle readiness stream"
                            >
                              {ok ? '✓' : '✕'} {s.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button type="button" onClick={() => void handleSetLaunchDecision(lc.id, 'GO_APPROVED')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#059669', color: '#ffffff', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                          ✓ Authorize GO
                        </button>
                        <button type="button" onClick={() => void handleSetLaunchDecision(lc.id, 'NO_GO_HOLD')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                          Hold (NO-GO)
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 7: ANALYTICS & PRODUCT BUDGET + LINKED FINANCE LEDGER           */}
      {/* =================================================================== */}
      {activeTab === 'analytics_budget' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Traceable Product Adoption, Retention &amp; Telemetry Metrics</h3>
              <button type="button" onClick={() => openModal('METRIC', { category: 'ADOPTION', unit: '%', verificationState: 'VERIFIED' })} style={primaryBtnStyle}>
                <Plus size={13} /> Record Metric Snapshot
              </button>
            </div>
            {(data?.metrics || []).length === 0 ? (
              <EmptyBlock
                title="No verified adoption metrics recorded yet"
                subtitle="Log adoption, retention, active users, conversion, and revenue telemetry with explicit formulas and source systems."
                actionLabel="Record First Metric"
                onAction={() => openModal('METRIC', { category: 'ADOPTION', unit: '%', verificationState: 'VERIFIED' })}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {(data?.metrics || []).map((m: any) => (
                  <div key={m.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b' }}>{m.productName} · {m.category}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#ecfdf5', color: '#047857' }}>
                        {m.verificationState} ({m.confidence}%)
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 6 }}>{m.metricName}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: brandColor, marginTop: 2 }}>
                      {Number(m.actualValue || 0).toLocaleString()} {m.unit}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      Prior: {m.priorPeriodValue} {m.unit} · Target: {m.targetValue ?? '—'} {m.unit}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, fontFamily: 'monospace' }}>
                      Formula: {m.formula} · Source: {m.sourceSystem}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Product Investment &amp; Budget Ledger (Finance Authoritative)</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Proposed funding is not available cash; approved product budget is not a disbursement. All bank payouts remain governed by Finance.
                </p>
              </div>
              <button type="button" onClick={() => openModal('BUDGET', { fiscalPeriod: 'FY 2026 / Q4' })} style={primaryBtnStyle}>
                <Plus size={13} /> Propose Product Budget
              </button>
            </div>
            {(data?.budgets || []).length === 0 ? (
              <EmptyBlock
                title="No product budget plans submitted yet"
                subtitle="Propose Capex/Opex product budgets routed automatically into the GMD Investment Gate approval queue."
                actionLabel="Propose Product Budget"
                onAction={() => openModal('BUDGET', { fiscalPeriod: 'FY 2026 / Q4' })}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>CODE &amp; PRODUCT</th>
                      <th style={{ padding: '10px 12px' }}>PERIOD</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>PROPOSED</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>APPROVED CAPEX + OPEX</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>COMMITTED / ACTUAL</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ATTRIBUTABLE REV</th>
                      <th style={{ padding: '10px 12px' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.budgets || []).map((b: any) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 800 }}>
                          <span style={{ color: brandColor, marginRight: 6 }}>{b.budgetCode}</span>
                          {b.productName}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{b.fiscalPeriod}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatNaira(b.proposedInvestmentNaira)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>{formatNaira(b.approvedCapexNaira + b.approvedOpexNaira)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#047857', fontWeight: 800 }}>
                          {formatNaira(b.committedSpendNaira)} / {formatNaira(b.actualSpendNaira)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{formatNaira(b.attributableRevNaira)}</td>
                        <td style={{ padding: '10px 12px' }}><span style={softBadgeStyle}>{b.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Live Linked Finance Requisitions (Read-Only Visibility) */}
            {(data?.linkedFinanceExpenditures || []).length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
                  Live Subsidiary Finance Requisitions (Read-Only Feed from Finance Ledger)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                  {(data?.linkedFinanceExpenditures || []).slice(0, 6).map((ex: any) => (
                    <div key={ex.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 900, color: brandColor }}>{ex.requestNumber} · {ex.paymentStatus}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{ex.title}</div>
                      </div>
                      <strong style={{ fontSize: 12.5, color: '#0f172a' }}>{formatNaira(ex.amountNaira)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 8: RISKS, DECISION REGISTER & VERSION-BOUND APPROVALS           */}
      {/* =================================================================== */}
      {activeTab === 'governance_approvals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Version-Bound Product Approval Queue</h3>
              <button type="button" onClick={() => openModal('APPROVAL', { gateType: 'PRD_APPROVAL', targetRecordType: 'PRD' })} style={primaryBtnStyle}>
                <Plus size={13} /> Request Gate Approval
              </button>
            </div>
            {(data?.approvals || []).length === 0 ? (
              <EmptyBlock
                title="No pending product governance approvals"
                subtitle="Submit PRD, Feature, Investment, Release, or Go/No-Go Launch gate requests with immutable version binding."
                actionLabel="Submit Approval Request"
                onAction={() => openModal('APPROVAL', { gateType: 'PRD_APPROVAL', targetRecordType: 'PRD' })}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                {(data?.approvals || []).map((apr: any) => (
                  <div key={apr.id} style={{ background: apr.status === 'PENDING' ? `${brandColor}0D` : '#f8fafc', border: `1px solid ${apr.status === 'PENDING' ? `${brandColor}44` : '#e2e8f0'}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={softBadgeStyle}>{apr.approvalCode} · {apr.gateType} (v{apr.targetVersion})</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: apr.status === 'APPROVED' ? '#ecfdf5' : '#ffffff', color: apr.status === 'APPROVED' ? '#047857' : brandColor }}>
                          {apr.status}
                        </span>
                      </div>
                      <h4 style={{ margin: '6px 0 4px', fontSize: 13.5, fontWeight: 800 }}>{apr.title}</h4>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>{apr.summary}</p>
                    </div>
                    {apr.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                        <button type="button" onClick={() => void handleApprovalDecision(apr.id, 'APPROVED')} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#059669', color: '#ffffff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                          ✓ Approve Gate
                        </button>
                        <button type="button" onClick={() => void handleApprovalDecision(apr.id, 'CHANGES_REQUESTED')} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                          Request Changes
                        </button>
                        <button type="button" onClick={() => void handleApprovalDecision(apr.id, 'REJECTED')} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Product Risk, Privacy &amp; Compliance Register</h3>
                <button type="button" onClick={() => openModal('RISK', { category: 'SECURITY', impact: 'HIGH', likelihood: 'MEDIUM' })} style={primaryBtnStyle}>
                  <Plus size={13} /> Log Risk
                </button>
              </div>
              {(data?.risks || []).length === 0 ? (
                <EmptyBlock
                  title="No open product risks or compliance blockers"
                  subtitle="Track security reviews, data privacy assessments, legal obligations, and launch-blocking mitigations."
                  actionLabel="Log Risk Item"
                  onAction={() => openModal('RISK', { category: 'SECURITY', impact: 'HIGH', likelihood: 'MEDIUM' })}
                />
              ) : (
                (data?.risks || []).map((rk: any) => (
                  <div key={rk.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#dc2626' }}>{rk.riskCode} · {rk.category} ({rk.impact})</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#ffffff', border: '1px solid #cbd5e1' }}>{rk.status}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{rk.title}</div>
                    <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}><strong>Mitigation:</strong> {rk.mitigationPlan}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Canonical Product Decision Register</h3>
                <button type="button" onClick={() => openModal('DECISION', { targetRecordType: 'FEATURE', outcome: 'APPROVED' })} style={primaryBtnStyle}>
                  <Plus size={13} /> Record Decision
                </button>
              </div>
              {(data?.decisions || []).length === 0 ? (
                <EmptyBlock
                  title="No formal product decisions recorded yet"
                  subtitle="Maintain an auditable decision register documenting alternatives considered, rationale, approver, and version."
                  actionLabel="Log Formal Decision"
                  onAction={() => openModal('DECISION', { targetRecordType: 'FEATURE', outcome: 'APPROVED' })}
                />
              ) : (
                (data?.decisions || []).map((dc: any) => (
                  <div key={dc.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#047857' }}>{dc.decisionCode} · {dc.targetRecordType} v{dc.recordVersion}</span>
                      <span style={{ fontSize: 10.5, color: '#64748b' }}>{new Date(dc.decidedAt).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{dc.title}</div>
                    <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}><strong>Rationale:</strong> {dc.rationale}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* UNIFIED CREATION MODAL FOR ALL DEEP WORKSPACE ENTITIES */}
      {modalType && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <form
            onSubmit={handleModalSubmit}
            style={{ width: '100%', maxWidth: 520, background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, display: 'flex', flexDirection: 'column', gap: 11 }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
              Create {modalType.replace(/_/g, ' ')}
            </h3>

            {products.length > 0 && (
              <select
                value={form.productId || defaultProdId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12.5, fontWeight: 700 }}
              >
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.productCode} · {p.name}</option>
                ))}
              </select>
            )}

            <input
              type="text"
              required
              placeholder={modalType === 'OKR' ? 'Objective Title...' : modalType === 'METRIC' ? 'Metric Name (e.g. Weekly Active Users)' : 'Title...'}
              value={form.title || form.objectiveTitle || form.metricName || ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  title: e.target.value,
                  objectiveTitle: e.target.value,
                  metricName: e.target.value,
                })
              }
              style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}
            />

            {modalType === 'BUDGET' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="number" required placeholder="Proposed Investment (₦)" value={form.proposedInvestmentNaira || ''} onChange={(e) => setForm({ ...form, proposedInvestmentNaira: e.target.value })} style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
                <input type="number" placeholder="Attributable Revenue (₦)" value={form.attributableRevNaira || ''} onChange={(e) => setForm({ ...form, attributableRevNaira: e.target.value })} style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
              </div>
            ) : modalType === 'METRIC' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input type="number" required placeholder="Actual Value" value={form.actualValue || ''} onChange={(e) => setForm({ ...form, actualValue: e.target.value })} style={{ padding: '8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
                <input type="number" placeholder="Target Value" value={form.targetValue || ''} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} style={{ padding: '8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
                <input type="text" placeholder="Unit (%, Users)" value={form.unit || '%'} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ padding: '8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              </div>
            ) : (
              <textarea
                rows={3}
                required
                placeholder="Detailed description, problem statement, hypothesis, mitigation plan, or decision rationale..."
                value={form.description || form.problemStatement || form.hypothesis || form.rationale || form.summary || form.mitigationPlan || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                    problemStatement: e.target.value,
                    hypothesis: e.target.value,
                    rationale: e.target.value,
                    summary: e.target.value,
                    mitigationPlan: e.target.value,
                    purpose: e.target.value,
                    researchQuestion: e.target.value,
                    feedbackNotes: e.target.value,
                  })
                }
                style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => setModalType(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={busy} style={primaryBtnStyle}>
                {busy ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
