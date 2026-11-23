'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  FileText,
  Layers,
  Lightbulb,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  ThumbsUp,
  UserCheck,
  Award,
  ExternalLink,
} from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';
import { BrainstormingCanvasPanel } from './BrainstormingCanvasPanel';

type StaffNavKey =
  | 'home'
  | 'my_products'
  | 'ideas'
  | 'brainstorm'
  | 'research_actions'
  | 'reviews_contributions';

const DRAFT_STORAGE_KEY = 'bems_staff_idea_draft_v1';
const OFFLINE_QUEUE_KEY = 'bems_staff_innovation_offline_queue_v1';

export default function StaffInnovationPortalClient({
  actorName,
  actorRole,
}: {
  actorName: string;
  actorRole: string;
}) {
  const [activeTab, setActiveTab] = useState<StaffNavKey>('home');
  const [inbox, setInbox] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Idea Submission Form with Local Draft & Idempotent Key (Section 40)
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaProblem, setIdeaProblem] = useState('');
  const [ideaDescription, setIdeaDescription] = useState('');
  const [ideaExpectedValue, setIdeaExpectedValue] = useState('');
  const [ideaCategory, setIdeaCategory] = useState('NEW_CAPABILITY');
  const [ideaProductId, setIdeaProductId] = useState('');
  const [clientSubmissionId, setClientSubmissionId] = useState(() => `staff-idea-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const [submitting, setSubmitting] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);

  // Feedback Form (Section 50)
  const [fbCategory, setFbCategory] = useState('FEATURE_REQUEST');
  const [fbTitle, setFbTitle] = useState('');
  const [fbDesc, setFbDesc] = useState('');
  const [fbSteps, setFbSteps] = useState('');

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  // Load saved local draft & offline queue
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.title) setIdeaTitle(parsed.title);
        if (parsed.problemStatement) setIdeaProblem(parsed.problemStatement);
        if (parsed.description) setIdeaDescription(parsed.description);
        if (parsed.expectedValue) setIdeaExpectedValue(parsed.expectedValue);
      }
      const savedQueue = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (savedQueue) {
        setOfflineQueue(JSON.parse(savedQueue));
      }
    } catch {}
  }, []);

  const saveLocalDraft = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        title: ideaTitle,
        problemStatement: ideaProblem,
        description: ideaDescription,
        expectedValue: ideaExpectedValue,
      })
    );
    showToast('Draft saved locally on your device.');
  };

  const fetchStaffInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(resolveApiUrl('/api/innovation/staff/inbox'), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setInbox(json);
        if (!selectedProductId && json.myProducts?.length > 0) {
          setSelectedProductId(json.myProducts[0].id);
          setIdeaProductId(json.myProducts[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    void fetchStaffInbox();
  }, [fetchStaffInbox]);

  const handleSyncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(resolveApiUrl('/api/innovation/staff/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ drafts: offlineQueue }),
      });
      if (res.ok) {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        setOfflineQueue([]);
        showToast('Synchronized offline product drafts with zero duplicates.');
        void fetchStaffInbox();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleIdeaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ideaTitle.trim() || !ideaProblem.trim()) return;
    setSubmitting(true);
    const payload = {
      clientSubmissionId,
      productId: ideaProductId || selectedProductId || null,
      title: ideaTitle.trim(),
      problemStatement: ideaProblem.trim(),
      description: ideaDescription.trim() || ideaProblem.trim(),
      expectedValue: ideaExpectedValue.trim() || null,
      category: ideaCategory,
    };

    try {
      const res = await fetch(resolveApiUrl('/api/innovation/ideas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.idea) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        setIdeaTitle('');
        setIdeaProblem('');
        setIdeaDescription('');
        setIdeaExpectedValue('');
        setClientSubmissionId(`staff-idea-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
        showToast(`Idea submitted! Reference: ${json.idea.ideaNumber} (${json.idea.status})`);
        void fetchStaffInbox();
      } else {
        showToast(json.error || 'Submission failed. Your draft is preserved.');
      }
    } catch {
      // Queue offline if network fails (Section 40 & 55)
      const nextQ = [...offlineQueue, { ...payload, type: 'IDEA' }];
      setOfflineQueue(nextQ);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nextQ));
      showToast('Network offline: queued idea locally for idempotent background sync.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteIdea = async (ideaId: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/ideas'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: ideaId, action: 'VOTE' }),
    });
    if (res.ok) void fetchStaffInbox();
  };

  const handleWithdrawIdea = async (ideaId: string) => {
    const res = await fetch(resolveApiUrl('/api/innovation/ideas'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: ideaId, action: 'WITHDRAW' }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast(`Idea ${json.idea?.ideaNumber} withdrawn.`);
      void fetchStaffInbox();
    } else {
      showToast(json.error || 'Could not withdraw idea.');
    }
  };

  const handleToggleFollowProduct = async (productId: string, currentFollow: boolean) => {
    const res = await fetch(resolveApiUrl('/api/innovation/products'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'FOLLOW_TOGGLE',
        productId,
        isFollowing: !currentFollow,
      }),
    });
    if (res.ok) {
      showToast(!currentFollow ? 'Following product updates.' : 'Unfollowed product notifications.');
      void fetchStaffInbox();
    }
  };

  const handleSubmitResearchFinding = async (researchId: string) => {
    const finding = window.prompt('Enter your research observation / interview finding summary:');
    if (!finding) return;
    const res = await fetch(resolveApiUrl('/api/innovation/discovery'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'RESEARCH',
        id: researchId,
        findingsSummary: finding,
        status: 'SUBMITTED',
        consentObtained: true,
      }),
    });
    if (res.ok) {
      showToast('Submitted research evidence for supervisor review.');
      void fetchStaffInbox();
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbTitle.trim() || !fbDesc.trim()) return;
    const res = await fetch(resolveApiUrl('/api/innovation/discovery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'FEEDBACK',
        productId: selectedProductId || null,
        category: fbCategory,
        title: fbTitle.trim(),
        description: fbDesc.trim(),
        stepsToReproduce: fbSteps.trim() || null,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setFbTitle('');
      setFbDesc('');
      setFbSteps('');
      showToast(`Submitted ${json.feedback?.category} (${json.feedback?.feedbackCode}).`);
      void fetchStaffInbox();
    }
  };

  const handleReviewDecision = async (approvalId: string, status: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') => {
    let reason = 'Reviewed and approved.';
    if (status !== 'APPROVED') {
      const input = window.prompt(`Reason for ${status}:`);
      if (!input) return;
      reason = input;
    }
    const res = await fetch(resolveApiUrl('/api/innovation/delivery'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entityType: 'APPROVAL',
        id: approvalId,
        status,
        decisionNote: reason,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast(`Decision ${status} confirmed on ${json.approval?.approvalCode}.`);
      void fetchStaffInbox();
    } else {
      showToast(json.error || 'Could not record review decision.');
    }
  };

  const summary = inbox?.summary || {};
  const myProducts = inbox?.myProducts || [];
  const activeProduct = myProducts.find((p: any) => p.id === selectedProductId) || myProducts[0] || null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
        paddingBottom: 60,
      }}
    >
      {/* Top Staff Product Workspace Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 20px',
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              href="/staff-app/index.html"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 8,
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={13} /> Staff App Home
            </Link>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 15.5, fontWeight: 900, color: '#0f172a' }}>
                  BEMS Staff Product &amp; Innovation Workspace
                </strong>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 99,
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                  }}
                >
                  {actorName}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Submit Ideas · Join Brainstorming Canvases · Track Features &amp; PRDs · Contribute Research &amp; Feedback
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {offlineQueue.length > 0 && (
              <button
                type="button"
                onClick={handleSyncOfflineQueue}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #fed7aa',
                  background: '#fff7ed',
                  color: '#ea580c',
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Sync {offlineQueue.length} Offline Draft(s)
              </button>
            )}
            <button
              type="button"
              onClick={() => void fetchStaffInbox()}
              style={{
                padding: '6px 11px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Primary Staff Navigation Tabs (Section 64 & 68) */}
        <div
          style={{
            maxWidth: 1240,
            margin: '10px auto 0',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'home', label: '1. Product Home' },
            { id: 'my_products', label: `2. My Products & Details (${summary.myProductsCount ?? 0})` },
            { id: 'ideas', label: `3. Submit Idea & Idea Board (${summary.myIdeasCount ?? 0})` },
            { id: 'brainstorm', label: `4. Brainstorming Canvas (${summary.activeBoardsCount ?? 0})` },
            { id: 'research_actions', label: '5. Research, Feedback & My Actions' },
            { id: 'reviews_contributions', label: `6. My Reviews & Contributions (${summary.assignedReviewsCount ?? 0})` },
          ].map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as StaffNavKey)}
                style={{
                  padding: '7px 13px',
                  borderRadius: 9,
                  border: active ? '1px solid #ea580c' : '1px solid #e2e8f0',
                  background: active ? '#ea580c' : '#f8fafc',
                  color: active ? '#ffffff' : '#334155',
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {notice && (
        <div
          style={{
            maxWidth: 1240,
            margin: '12px auto 0',
            padding: '10px 16px',
            borderRadius: 12,
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: 12.5,
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>✓ {notice}</span>
          <button type="button" onClick={() => setNotice(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800 }}>
            ✕
          </button>
        </div>
      )}

      <main style={{ maxWidth: 1240, margin: '16px auto 0', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* =================================================================== */}
        {/* SCREEN 1: STAFF PRODUCT HOME DASHBOARD (SECTION 38)                 */}
        {/* =================================================================== */}
        {activeTab === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Quick Action Bar */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 900, color: '#0f172a' }}>
                  Welcome to Product Innovation, {actorName}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Collaborate on company products, submit evidence-backed ideas, and join live brainstorming boards.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('ideas')}
                  style={{ padding: '8px 13px', borderRadius: 9, border: 'none', background: '#ea580c', color: '#ffffff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  + Submit Idea
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('brainstorm')}
                  style={{ padding: '8px 13px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  Join Brainstorming Canvas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('my_products')}
                  style={{ padding: '8px 13px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  View Product Board
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('research_actions')}
                  style={{ padding: '8px 13px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  Provide Feedback
                </button>
              </div>
            </div>

            {/* Summary KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {[
                { label: 'MY PRODUCTS', val: summary.myProductsCount ?? 0, sub: 'Authorized Product Workspaces', tab: 'my_products' as StaffNavKey, color: '#ea580c' },
                { label: 'MY SUBMITTED IDEAS', val: summary.myIdeasCount ?? 0, sub: `${summary.approvedIdeasCount ?? 0} Approved into Features`, tab: 'ideas' as StaffNavKey, color: '#059669' },
                { label: 'BRAINSTORMING SESSIONS', val: summary.activeBoardsCount ?? 0, sub: 'Live Shared Whiteboards', tab: 'brainstorm' as StaffNavKey, color: '#7c3aed' },
                { label: 'ASSIGNED REVIEWS', val: summary.assignedReviewsCount ?? 0, sub: 'Pending Delegated Decisions', tab: 'reviews_contributions' as StaffNavKey, color: '#0284c7' },
                { label: 'MY PRODUCT ACTIONS', val: summary.myProductActionsCount ?? 0, sub: 'Linked PM Engineering Tasks', tab: 'research_actions' as StaffNavKey, color: '#0f172a' },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setActiveTab(c.tab)}
                  style={{
                    textAlign: 'left',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 13,
                    padding: 14,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b' }}>{c.label}</div>
                  <div style={{ fontSize: 23, fontWeight: 900, color: c.color, marginTop: 4 }}>{c.val}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{c.sub}</div>
                </button>
              ))}
            </div>

            {/* Compact Product Progress Summaries (Without Privileged Financials — Section 38) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 900, color: '#0f172a' }}>
                My Authorized Products &amp; Role Assignments
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {myProducts.map((p: any) => (
                  <div key={p.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 900, color: '#ea580c' }}>
                        {p.productCode} · {p.lifecycleStage}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                        Role: {p.myRole}
                      </span>
                    </div>
                    <h4 style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 800 }}>{p.name}</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>{p.summary}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 11 }}>
                      <span>{p.featuresCount} Features · Next: {p.nextMilestone || 'Active'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductId(p.id);
                          setActiveTab('my_products');
                        }}
                        style={{ border: 'none', background: '#0f172a', color: '#ffffff', borderRadius: 6, padding: '4px 9px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}
                      >
                        Open →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SCREEN 2 & 3: MY PRODUCTS, PRODUCT DETAILS, BOARD, ROADMAP & PRDs   */}
        {/* =================================================================== */}
        {activeTab === 'my_products' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>Select Product Workspace:</strong>
                  <select
                    value={activeProduct?.id || ''}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12.5, fontWeight: 800 }}
                  >
                    {myProducts.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.productCode} · {p.name} ({p.myRole})
                      </option>
                    ))}
                  </select>
                </div>

                {activeProduct && (
                  <button
                    type="button"
                    onClick={() => void handleToggleFollowProduct(activeProduct.id, activeProduct.isFollowing)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: activeProduct.isFollowing ? '#ecfdf5' : '#ffffff',
                      color: activeProduct.isFollowing ? '#047857' : '#334155',
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {activeProduct.isFollowing ? '✓ Following Product Alerts' : '+ Follow Product'}
                  </button>
                )}
              </div>

              {activeProduct && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{activeProduct.name}</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{activeProduct.summary}</div>
                  {activeProduct.vision && (
                    <div style={{ fontSize: 11.5, color: '#ea580c', fontWeight: 700, marginTop: 6 }}>
                      Approved Product Vision: {activeProduct.vision}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Staff Product Board & Feature Tracking (Section 43) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 900 }}>
                Product Features &amp; Release Progress (Section 43)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {(inbox?.features || [])
                  .filter((f: any) => !activeProduct || f.productId === activeProduct.id)
                  .map((f: any) => (
                    <div key={f.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 900, color: '#ea580c' }}>
                          {f.featureCode} · {f.roadmapHorizon}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                          {f.workflowStage}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 6 }}>{f.title}</div>
                      <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>{f.problemStatement}</div>
                      {f.acceptanceCriteria && (
                        <div style={{ fontSize: 10.5, color: '#047857', marginTop: 6 }}>
                          <strong>Acceptance:</strong> {f.acceptanceCriteria}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Staff PRDs & Approved Specifications Reader (Section 46) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 900 }}>
                Approved Product Requirement Documents (PRDs — Section 46)
              </h3>
              {(inbox?.prds || [])
                .filter((p: any) => !activeProduct || p.productId === activeProduct.id)
                .map((prd: any) => (
                  <div key={prd.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13.5, color: '#0f172a' }}>
                        {prd.prdCode} · {prd.title}
                      </strong>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                        v{prd.currentVersion} ({prd.status})
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#334155', marginTop: 6 }}>
                      <strong>Overview:</strong> {prd.overview}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4 }}>
                      <strong>In Scope:</strong> {prd.inScope}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#047857', marginTop: 4 }}>
                      <strong>Acceptance Criteria:</strong> {prd.acceptanceCriteria}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SCREEN 4 & 5: STAFF IDEA SUBMISSION & IDEA VOTING BOARD (SECTIONS 40 & 42) */}
        {/* =================================================================== */}
        {activeTab === 'ideas' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            {/* Structured Idea Submission Form */}
            <form
              onSubmit={handleIdeaSubmit}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  Submit a Product Idea (Section 40)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748b' }}>
                  Idempotent submission guarantees a unique reference number (IDEA-2026-XXXX) even on intermittent connections.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Target Product</label>
                <select
                  value={ideaProductId}
                  onChange={(e) => setIdeaProductId(e.target.value)}
                  style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12.5 }}
                >
                  <option value="">New Product / Group-Wide Idea</option>
                  {myProducts.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.productCode} · {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Idea Title *</label>
                <input
                  type="text"
                  required
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  placeholder="Concise title of your proposed capability..."
                  style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>User Problem / Pain Point *</label>
                <textarea
                  required
                  rows={2}
                  value={ideaProblem}
                  onChange={(e) => setIdeaProblem(e.target.value)}
                  placeholder="What verified problem does this solve for users or operations?"
                  style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Proposed Solution &amp; Evidence</label>
                <textarea
                  rows={2}
                  value={ideaDescription}
                  onChange={(e) => setIdeaDescription(e.target.value)}
                  placeholder="Describe how it should work and any supporting observations..."
                  style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Expected Outcome / Value</label>
                <input
                  type="text"
                  value={ideaExpectedValue}
                  onChange={(e) => setIdeaExpectedValue(e.target.value)}
                  placeholder="e.g., Save 30 mins per shift or reduce reconciliation errors"
                  style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={saveLocalDraft}
                  style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Draft Locally
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#ffffff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                >
                  {submitting ? 'Submitting...' : 'Submit Idea →'}
                </button>
              </div>
            </form>

            {/* Staff Idea Board & My Ideas Status Tracker (Section 42) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>
                Company Idea Board &amp; Voting ({(inbox?.ideaBoard || []).length})
              </h3>
              {(inbox?.ideaBoard || []).map((idea: any) => (
                <div key={idea.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: '#ea580c' }}>
                      {idea.ideaNumber} · {idea.productName}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                      {idea.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{idea.title}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{idea.problemStatement}</div>
                  {idea.publicDecisionNote && (
                    <div style={{ fontSize: 11, color: '#047857', marginTop: 4, fontWeight: 700 }}>
                      Reviewer Decision: {idea.publicDecisionNote}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 10.5, color: '#64748b' }}>By {idea.submitterName}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => void handleVoteIdea(idea.id)}
                        style={{
                          padding: '3px 9px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ThumbsUp size={11} color="#ea580c" /> Endorse ({idea.votesCount})
                      </button>
                      {idea.submitterId === inbox?.employee?.id && ['DRAFT', 'SUBMITTED', 'TRIAGE'].includes(idea.status) && (
                        <button
                          type="button"
                          onClick={() => void handleWithdrawIdea(idea.id)}
                          style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SCREEN 6 & 7: STAFF SHARED BRAINSTORMING CANVAS (SECTION 41)        */}
        {/* =================================================================== */}
        {activeTab === 'brainstorm' && (
          <BrainstormingCanvasPanel
            boards={inbox?.boards || []}
            products={myProducts}
            isStaffMode={true}
            onRefresh={() => void fetchStaffInbox()}
            onNotice={showToast}
          />
        )}

        {/* =================================================================== */}
        {/* SCREEN 8–11: ASSIGNED RESEARCH, FEEDBACK & PM HANDOFF TASKS         */}
        {/* =================================================================== */}
        {activeTab === 'research_actions' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            {/* Assigned Research & Evidence Capture (Section 44) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 900 }}>
                Assigned Discovery &amp; Research Studies (Section 44)
              </h3>
              {(inbox?.assignedResearch || []).map((r: any) => (
                <div key={r.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: '#7c3aed' }}>
                      {r.researchCode} · {r.researchType}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#ecfdf5', color: '#047857' }}>
                      {r.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{r.researchQuestion}</div>
                  {r.findingsSummary && (
                    <div style={{ fontSize: 11, color: '#047857', marginTop: 4 }}>
                      <strong>Findings:</strong> {r.findingsSummary}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSubmitResearchFinding(r.id)}
                    style={{ marginTop: 8, padding: '5px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                  >
                    + Submit / Update Research Evidence
                  </button>
                </div>
              ))}

              {/* Linked Project Management Tasks (Section 49) */}
              <h3 style={{ margin: '16px 0 10px', fontSize: 14.5, fontWeight: 900 }}>
                My Product Actions &amp; Linked Project Management Tasks (Section 49)
              </h3>
              {(inbox?.myProductActions || []).map((wi: any) => (
                <div key={wi.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 11, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: '#ea580c' }}>{wi.itemKey || wi.key} · {wi.itemType || wi.workType}</span>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{wi.title}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8' }}>
                    {wi.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Staff Product Feedback, Quality & Improvement Requests (Section 50) */}
            <form
              onSubmit={handleFeedbackSubmit}
              style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900 }}>
                Report Product Issue or Improvement Request (Section 50)
              </h3>
              <select
                value={fbCategory}
                onChange={(e) => setFbCategory(e.target.value)}
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12.5, fontWeight: 700 }}
              >
                <option value="BUG">Bug / Defect Report</option>
                <option value="USABILITY">Usability Issue</option>
                <option value="FEATURE_REQUEST">Feature Enhancement Request</option>
                <option value="PROCESS_IMPROVEMENT">Process Improvement</option>
                <option value="PERFORMANCE">Performance Issue</option>
              </select>
              <input
                type="text"
                required
                value={fbTitle}
                onChange={(e) => setFbTitle(e.target.value)}
                placeholder="Summary of issue or suggestion..."
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              />
              <textarea
                required
                rows={2}
                value={fbDesc}
                onChange={(e) => setFbDesc(e.target.value)}
                placeholder="Detailed description and expected outcome..."
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              />
              <input
                type="text"
                value={fbSteps}
                onChange={(e) => setFbSteps(e.target.value)}
                placeholder="Steps to reproduce (optional for bugs)..."
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              />
              <button
                type="submit"
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#ffffff', fontSize: 12, fontWeight: 800, cursor: 'pointer', alignSelf: 'flex-end' }}
              >
                Submit Feedback Case
              </button>
            </form>
          </div>
        )}

        {/* =================================================================== */}
        {/* SCREEN 10 & 12: MY REVIEWS & PERSONAL CONTRIBUTIONS (SECTIONS 51 & 53) */}
        {/* =================================================================== */}
        {activeTab === 'reviews_contributions' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            {/* Delegated Review Queue */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 900 }}>
                My Assigned Review Queue &amp; Approval Decisions (Section 51)
              </h3>
              {(inbox?.myReviews || []).map((rev: any) => (
                <div key={rev.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 11, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: '#ea580c' }}>
                      {rev.approvalCode} · {rev.gateType} (v{rev.targetVersion})
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                      {rev.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{rev.title}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{rev.summary}</div>
                  {rev.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => void handleReviewDecision(rev.id, 'APPROVED')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#059669', color: '#ffffff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewDecision(rev.id, 'CHANGES_REQUESTED')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Request Changes
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewDecision(rev.id, 'REJECTED')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Personal Contributions & Learning Timeline (Section 53) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 900 }}>
                Personal Product Contributions &amp; Learning History (Section 53)
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 11, color: '#64748b' }}>
                Records your submitted ideas, research studies, and feedback contributions as a qualitative portfolio (never used as a crude quantity-based performance grade).
              </p>
              {(inbox?.contributions || []).map((c: any) => (
                <div key={c.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 11, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 800, color: '#ea580c' }}>
                    <span>{c.code} · {c.type.replace(/_/g, ' ')}</span>
                    <span>{c.status}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', marginTop: 3 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{c.outcome}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
