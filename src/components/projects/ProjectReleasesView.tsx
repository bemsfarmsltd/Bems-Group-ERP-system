'use client';

import React, { useState } from 'react';
import { Rocket, FlaskConical, Plus, Trash2 } from 'lucide-react';
import type { ReleaseRow, TestCaseRow } from './pmTypes';

interface ProjectReleasesViewProps {
  projects: any[];
  releases: ReleaseRow[];
  testCases: TestCaseRow[];
  onRefresh: () => Promise<void>;
}

const RELEASE_STATUSES = [
  'PLANNED',
  'DEV_COMPLETE',
  'QA_VERIFIED',
  'RELEASE_CANDIDATE',
  'APPROVED',
  'DEPLOYED',
  'VERIFIED',
  'CLOSED',
];

const TEST_STATUS_STYLE: Record<string, string> = {
  PASS: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  FAIL: 'bg-red-50 border-red-200 text-red-700',
  BLOCKED: 'bg-amber-50 border-amber-200 text-amber-700',
  NOT_RUN: 'bg-slate-100 border-slate-200 text-slate-600',
};

export default function ProjectReleasesView({
  projects,
  releases,
  testCases,
  onRefresh,
}: ProjectReleasesViewProps) {
  const [subTab, setSubTab] = useState<'releases' | 'qa'>('releases');
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);

  const [relForm, setRelForm] = useState({
    projectId: projects[0]?.id || '',
    versionTag: '',
    title: '',
    environment: 'PRODUCTION',
    plannedDate: '',
    rollbackPlan: '',
  });
  const [testForm, setTestForm] = useState({
    projectId: projects[0]?.id || '',
    title: '',
    suiteName: 'Regression',
    steps: '',
    expectedResult: '',
  });

  const createRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/projects/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_RELEASE',
        ...relForm,
        projectId: relForm.projectId || projects[0]?.id,
      }),
    });
    setShowReleaseForm(false);
    setRelForm({ projectId: projects[0]?.id || '', versionTag: '', title: '', environment: 'PRODUCTION', plannedDate: '', rollbackPlan: '' });
    await onRefresh();
  };

  const createTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/projects/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_TEST_CASE',
        ...testForm,
        projectId: testForm.projectId || projects[0]?.id,
      }),
    });
    setShowTestForm(false);
    setTestForm({ projectId: projects[0]?.id || '', title: '', suiteName: 'Regression', steps: '', expectedResult: '' });
    await onRefresh();
  };

  const patchRelease = async (id: string, patch: Record<string, any>) => {
    await fetch('/api/projects/releases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'release', id, ...patch }),
    });
    await onRefresh();
  };

  const patchTestCase = async (id: string, lastRunStatus: string) => {
    await fetch('/api/projects/releases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'testCase', id, lastRunStatus }),
    });
    await onRefresh();
  };

  const deleteItem = async (kind: 'release' | 'testCase', id: string) => {
    await fetch(`/api/projects/releases?kind=${kind}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('releases')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
              subTab === 'releases' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Rocket className="h-3.5 w-3.5" /> Releases ({releases.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('qa')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
              subTab === 'qa' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5" /> QA Test Matrix ({testCases.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => (subTab === 'releases' ? setShowReleaseForm(true) : setShowTestForm(true))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
        >
          <Plus className="h-3.5 w-3.5" /> {subTab === 'releases' ? 'New Release' : 'New Test Case'}
        </button>
      </div>

      {subTab === 'releases' ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-2.5 px-4">Version</th>
                <th className="py-2.5 px-4">Release Title & Project</th>
                <th className="py-2.5 px-4">Environment</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Planned Date</th>
                <th className="py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {releases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No releases scheduled yet. Click &ldquo;New Release&rdquo; to track deployments and rollback plans.
                  </td>
                </tr>
              ) : (
                releases.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono font-bold text-orange-700">{r.versionTag}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-slate-900">{r.title}</div>
                      <div className="text-[11px] text-slate-500">{r.project?.projectCode} · {r.project?.title}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <select
                        value={r.environment}
                        onChange={(e) => patchRelease(r.id, { environment: e.target.value })}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                      >
                        <option value="STAGING">STAGING</option>
                        <option value="PRODUCTION">PRODUCTION</option>
                        <option value="FIELD_DEPLOYMENT">FIELD DEPLOYMENT</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-4">
                      <select
                        value={r.status}
                        onChange={(e) => patchRelease(r.id, { status: e.target.value })}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800"
                      >
                        {RELEASE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="date"
                        value={r.plannedDate || ''}
                        onChange={(e) => patchRelease(r.id, { plannedDate: e.target.value || null })}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => deleteItem('release', r.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete release"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-2.5 px-4">Suite</th>
                <th className="py-2.5 px-4">Test Case & Expected Result</th>
                <th className="py-2.5 px-4">Project</th>
                <th className="py-2.5 px-4">Last Run (1-Click)</th>
                <th className="py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {testCases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No QA test cases yet. Click &ldquo;New Test Case&rdquo; to build your regression suite.
                  </td>
                </tr>
              ) : (
                testCases.map((tc) => (
                  <tr key={tc.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-600">{tc.suiteName}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-slate-900">{tc.title}</div>
                      <div className="text-[11px] text-slate-500">{tc.expectedResult}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{tc.project?.projectCode}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        {(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => patchTestCase(tc.id, st)}
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold transition ${
                              tc.lastRunStatus === st
                                ? TEST_STATUS_STYLE[st]
                                : 'border-slate-200 bg-white text-slate-400 hover:text-slate-700'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => deleteItem('testCase', tc.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showReleaseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <form onSubmit={createRelease} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Create Release</h4>
            <select
              value={relForm.projectId || projects[0]?.id || ''}
              onChange={(e) => setRelForm((p) => ({ ...p, projectId: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectCode} · {p.title}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={relForm.versionTag}
                onChange={(e) => setRelForm((p) => ({ ...p, versionTag: e.target.value }))}
                placeholder="e.g. v2.4.0"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="date"
                value={relForm.plannedDate}
                onChange={(e) => setRelForm((p) => ({ ...p, plannedDate: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <input
              required
              value={relForm.title}
              onChange={(e) => setRelForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Release title"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <textarea
              rows={2}
              value={relForm.rollbackPlan}
              onChange={(e) => setRelForm((p) => ({ ...p, rollbackPlan: e.target.value }))}
              placeholder="Rollback plan..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowReleaseForm(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white">
                Save Release
              </button>
            </div>
          </form>
        </div>
      )}

      {showTestForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <form onSubmit={createTestCase} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Create QA Test Case</h4>
            <select
              value={testForm.projectId || projects[0]?.id || ''}
              onChange={(e) => setTestForm((p) => ({ ...p, projectId: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectCode} · {p.title}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={testForm.title}
                onChange={(e) => setTestForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Test case title"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                value={testForm.suiteName}
                onChange={(e) => setTestForm((p) => ({ ...p, suiteName: e.target.value }))}
                placeholder="Suite (e.g. Regression)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <textarea
              rows={2}
              value={testForm.steps}
              onChange={(e) => setTestForm((p) => ({ ...p, steps: e.target.value }))}
              placeholder="Test steps..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              value={testForm.expectedResult}
              onChange={(e) => setTestForm((p) => ({ ...p, expectedResult: e.target.value }))}
              placeholder="Expected result..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowTestForm(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white">
                Save Test Case
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

