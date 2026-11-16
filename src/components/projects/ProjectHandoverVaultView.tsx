'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import { AssigneeAvatarChip } from '@/components/projects/pmUiPrimitives';

interface ProjectHandoverVaultViewProps {
  projects: any[];
  actor: { id: string; legalName: string; role: string };
  isExecutive: boolean;
  onRefresh: () => Promise<void>;
}

const CRED_CATEGORIES = [
  'TECH_STACK',
  'CLOUD_HOSTING',
  'DATABASE',
  'GITHUB',
  'MEDIA_PLATFORM',
  'OPS_PORTAL',
  'HARDWARE',
];

export default function ProjectHandoverVaultView({
  projects,
  actor,
  isExecutive,
  onRefresh,
}: ProjectHandoverVaultViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [busy, setBusy] = useState(false);

  // Handover submission form
  const [docTitle, setDocTitle] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docSummary, setDocSummary] = useState('');
  const [techInput, setTechInput] = useState('');
  const [technologies, setTechnologies] = useState<string[]>([]);

  // Credential Vault form
  const [toolName, setToolName] = useState('');
  const [credCategory, setCredCategory] = useState('TECH_STACK');
  const [credEnv, setCredEnv] = useState('PROD');
  const [loginUrl, setLoginUrl] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [credNotes, setCredNotes] = useState('');
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [vaultError, setVaultError] = useState<string | null>(null);

  // Attachment upload form
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('TECHNICAL_DESIGN');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const members = useMemo(() => activeProject?.members || [], [activeProject]);
  const handovers = useMemo(() => activeProject?.staffHandovers || [], [activeProject]);
  const credentials = useMemo(() => activeProject?.credentialEntries || [], [activeProject]);
  const documents = useMemo(() => activeProject?.documents || [], [activeProject]);

  const isTeamLead = activeProject?.teamLeadId === actor.id;
  const canVerifyOrReveal = isExecutive || isTeamLead;

  const handleAddTech = () => {
    const val = techInput.trim();
    if (!val || technologies.includes(val)) return;
    setTechnologies((prev) => [...prev, val]);
    setTechInput('');
  };

  const handleSubmitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject?.id) return;
    setBusy(true);
    try {
      const res = await fetch('/api/projects/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          docTitle,
          docUrl,
          docSummary,
          technologies,
        }),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyHandover = async (handoverId: string) => {
    if (!activeProject?.id) return;
    setBusy(true);
    try {
      await fetch('/api/projects/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'VERIFY_HANDOVER',
          projectId: activeProject.id,
          handoverId,
        }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject?.id) return;
    setBusy(true);
    setVaultError(null);
    try {
      const res = await fetch('/api/projects/handover', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          toolName,
          category: credCategory,
          environment: credEnv,
          loginUrl,
          username,
          secret,
          notes: credNotes,
        }),
      });
      if (res.ok) {
        setToolName('');
        setLoginUrl('');
        setUsername('');
        setSecret('');
        setCredNotes('');
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleReveal = async (credentialId: string) => {
    if (revealedSecrets[credentialId]) {
      setRevealedSecrets((prev) => {
        const next = { ...prev };
        delete next[credentialId];
        return next;
      });
      return;
    }
    setVaultError(null);
    const res = await fetch('/api/projects/handover', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setVaultError(json.error || 'Access denied.');
      return;
    }
    setRevealedSecrets((prev) => ({ ...prev, [credentialId]: json.secret }));
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject?.id) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('projectId', activeProject.id);
      fd.append('title', uploadTitle.trim() || file.name);
      fd.append('category', uploadCategory);
      fd.append('file', file);
      const res = await fetch('/api/projects/attachments', { method: 'POST', body: fd });
      if (res.ok) {
        setUploadTitle('');
        await onRefresh();
      }
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/projects/attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Selector + GitHub Repo Badge */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Active Project Handover & Vault
          </label>
          <select
            value={activeProject?.id || ''}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-400 focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} · {p.title} ({p.projectType})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeProject?.githubRepoUrl ? (
            <a
              href={activeProject.githubRepoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:border-orange-300"
            >
              <GitBranch className="h-3.5 w-3.5 text-orange-600" />
              GitHub: {activeProject.githubBranch || 'main'}
            </a>
          ) : (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
              {activeProject?.projectType || 'OPERATIONS'} Mode (GitHub Optional)
            </span>
          )}
        </div>
      </div>

      {/* Staff Handover Compliance Matrix */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-600" />
            Mandatory Staff Handover Compliance ({handovers.length}/{members.length} submitted)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m: any) => {
            const h = handovers.find((item: any) => item.employeeId === m.employeeId);
            const credCount = credentials.filter((c: any) => c.employeeId === m.employeeId).length;
            let techs: string[] = [];
            try {
              techs = h?.technologiesUsedJson ? JSON.parse(h.technologiesUsedJson) : [];
            } catch {}
            return (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AssigneeAvatarChip name={m.employee?.legalName || 'Staff'} size={24} />
                    <span className="text-xs font-bold text-slate-900 truncate">{m.employee?.legalName}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      h?.submissionStatus === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : h?.submissionStatus === 'SUBMITTED'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {h?.submissionStatus || 'PENDING'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  <div>
                    <strong>Docs:</strong> {h?.docTitle || 'Not submitted yet'}
                  </div>
                  <div>
                    <strong>Tools/Tech:</strong> {techs.length > 0 ? techs.join(', ') : 'None listed'}
                  </div>
                  <div>
                    <strong>Vault Credentials:</strong> {credCount} stored
                  </div>
                </div>
                {h && h.submissionStatus === 'SUBMITTED' && canVerifyOrReveal && (
                  <button
                    type="button"
                    onClick={() => handleVerifyHandover(h.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Verify Handover
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-Column: Submit Documentation & Tech Stack + Encrypted Credentials Vault */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Documentation & Tech Stack Form */}
        <form onSubmit={handleSubmitHandover} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-orange-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Submit Documentation & Technologies / Tools Used</h3>
          </div>
          <input
            required
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Documentation title (e.g. SmartAIRS Lagos API & Runbook)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900"
          />
          <input
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
            placeholder="External doc link (Notion / Google Docs / Confluence URL, optional)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
          />
          <textarea
            rows={3}
            required
            value={docSummary}
            onChange={(e) => setDocSummary(e.target.value)}
            placeholder="Architecture, operational SOPs, deployment steps, or field handover summary..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
          />
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-600">
              Technologies, Tools, or Equipment Used
            </label>
            <div className="flex gap-2">
              <input
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTech();
                  }
                }}
                placeholder="e.g. Next.js, PostgreSQL, Supabase, Sony A7IV, POS Terminal..."
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
              />
              <button
                type="button"
                onClick={handleAddTech}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                + Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {technologies.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-800"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTechnologies((prev) => prev.filter((x) => x !== t))}
                    className="text-orange-500 hover:text-rose-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Submit My Documentation & Tech Stack
          </button>
        </form>

        {/* Encrypted Credentials Vault */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-orange-600" />
              <h3 className="text-sm font-extrabold text-slate-900">Encrypted Tool & Platform Credentials Vault</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              AES-256-GCM
            </span>
          </div>
          {vaultError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {vaultError}
            </div>
          )}
          <form onSubmit={handleAddCredential} className="grid grid-cols-2 gap-2">
            <input
              required
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="Tool / Platform (e.g. Supabase, AWS, Canva)"
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900"
            />
            <select
              value={credCategory}
              onChange={(e) => setCredCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900"
            >
              {CRED_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <input
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="Login URL (https://...)"
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900"
            />
            <select
              value={credEnv}
              onChange={(e) => setCredEnv(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900"
            >
              <option value="PROD">PROD</option>
              <option value="STAGING">STAGING</option>
              <option value="DEV">DEV</option>
            </select>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username / Email / Client ID"
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900"
            />
            <input
              required
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Password / API Key / Token"
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900"
            />
            <input
              value={credNotes}
              onChange={(e) => setCredNotes(e.target.value)}
              placeholder="2FA / recovery notes (optional)"
              className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900"
            />
            <button
              type="submit"
              disabled={busy}
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
            >
              <KeyRound className="h-3.5 w-3.5" /> Save Encrypted Credential
            </button>
          </form>

          <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
            {credentials.map((c: any) => {
              const revealed = revealedSecrets[c.id];
              return (
                <div key={c.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">
                      {c.toolName}{' '}
                      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {c.environment}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      User: <span className="font-mono">{c.username}</span> · By {c.employee?.legalName}
                    </div>
                    {revealed && (
                      <div className="mt-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-1 font-mono text-[11px] font-bold text-emerald-900 select-all">
                        {revealed}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleReveal(c.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-orange-300"
                    title="Reveal secret (GMD / Super Admin / Team Lead / Submitter)"
                  >
                    {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {revealed ? 'Hide' : 'Reveal'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Documents & Pictures Upload Vault */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-orange-600" />
              Project Documents & Pictures Vault ({documents.length})
            </h3>
            <p className="text-xs text-slate-500">
              Upload architecture diagrams, contracts, SOPs, site inspection photos, or media deliverables (max 15 MB).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Document / Photo label..."
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-900"
            />
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
            >
              <option value="TECHNICAL_DESIGN">Technical / Architecture</option>
              <option value="FIELD_MEDIA">Field / Operations Photo</option>
              <option value="DEPLOYMENT_PLAN">Deployment / Runbook</option>
              <option value="CONTRACT">Contract / SLA</option>
            </select>
            <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700">
              <Upload className="h-3.5 w-3.5" /> Upload File / Picture
              <input type="file" className="hidden" onChange={handleUploadFile} />
            </label>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 py-8 text-center text-xs text-slate-500">
            No documents or pictures uploaded for this project yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {documents.map((doc: any) => {
              const isImg = doc.assetKind === 'IMAGE' || String(doc.mimeType || '').startsWith('image/');
              return (
                <div key={doc.id} className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden flex flex-col">
                  {isImg && doc.fileUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(doc.fileUrl)}
                      className="h-32 w-full bg-slate-100 overflow-hidden"
                    >
                      <img src={doc.fileUrl} alt={doc.title} className="h-full w-full object-cover hover:scale-105 transition" />
                    </button>
                  ) : (
                    <div className="h-32 w-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <FileText className="h-10 w-10" />
                    </div>
                  )}
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <a
                        href={doc.fileUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs font-bold text-slate-900 hover:text-orange-600"
                      >
                        {doc.title}
                      </a>
                      <span className="text-[10px] font-semibold text-slate-500">{doc.category}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                      title="Delete attachment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6"
        >
          <img src={previewImage} alt="Preview" className="max-h-[85vh] max-w-[90vw] rounded-2xl shadow-2xl bg-white" />
        </div>
      )}
    </div>
  );
}

