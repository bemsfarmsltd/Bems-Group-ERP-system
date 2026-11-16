'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  FolderKanban,
  Users,
  Video,
  Truck,
  Code2,
  ArrowRight,
  LogOut,
  Bell,
  Search,
  Smartphone,
  Download,
  ShieldCheck,
} from 'lucide-react';
import {
  type AdminModuleKey,
  type CustomAdminPermissionsMap,
  hasModuleAccess,
} from '@/lib/admin-permissions';

export interface EnterpriseUserSummary {
  id: string;
  legalName: string;
  role: string;
  workEmail: string;
  employeeNumber?: string;
  subsidiaryName?: string;
  customAdminProfileId?: string | null;
  customAdminTitle?: string | null;
  customAdminPermissions?: CustomAdminPermissionsMap | null;
}

interface ModuleTileConfig {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status: 'Active' | 'Pipeline';
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  bgLight: string;
}

export function EnterpriseModulesScreen({ user }: { user: EnterpriseUserSummary }) {
  const [search, setSearch] = useState('');

  const isStaff = user?.role === 'STAFF';
  const isControlExecutive = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(
    String(user?.role || '').toUpperCase()
  );

  const allModules: ModuleTileConfig[] = [
    ...(isControlExecutive
      ? [
          {
            id: 'control-center',
            title: 'Control Center',
            subtitle: 'System governance & AI',
            href: '/control-center',
            status: 'Active' as const,
            icon: ShieldCheck,
            accentColor: '#ea580c',
            bgLight: '#fff7ed',
          },
        ]
      : []),
    {
      id: 'finance',
      title: 'Financial Management',
      subtitle: 'Treasury, budgets & disbursements',
      href: isStaff ? '/staff' : '/finance',
      status: 'Active',
      icon: Wallet,
      accentColor: '#ea580c',
      bgLight: '#fff7ed',
    },
    {
      id: 'projects',
      title: 'Project Management',
      subtitle: 'Timelines, chat & deliverables',
      href: isStaff ? '/staff/projects' : '/projects',
      status: 'Active',
      icon: FolderKanban,
      accentColor: '#0284c7',
      bgLight: '#f0f9ff',
    },
    {
      id: 'hr',
      title: 'Human Resources',
      subtitle: 'Directory, attendance & records',
      href: '/hr',
      status: 'Active',
      icon: Users,
      accentColor: '#4f46e5',
      bgLight: '#eef2ff',
    },
    {
      id: 'operations',
      title: 'Operations',
      subtitle: 'Field & fleet logistics',
      href: '/operations',
      status: 'Pipeline',
      icon: Truck,
      accentColor: '#059669',
      bgLight: '#ecfdf5',
    },
    {
      id: 'media',
      title: 'Media',
      subtitle: 'Production & studio assets',
      href: '/media',
      status: 'Pipeline',
      icon: Video,
      accentColor: '#db2777',
      bgLight: '#fdf2f8',
    },
    {
      id: 'innovation',
      title: 'Innovation',
      subtitle: 'Software & R&D platforms',
      href: '/innovation',
      status: 'Pipeline',
      icon: Code2,
      accentColor: '#0891b2',
      bgLight: '#ecfeff',
    },
  ];

  const MODULE_KEY_MAP: Record<string, AdminModuleKey> = {
    'control-center': 'control-center',
    finance: 'finance',
    projects: 'projects',
    hr: 'hr',
    operations: 'operations',
    media: 'media',
    innovation: 'innovation',
  };

  const modules = allModules.filter((m) => {
    const key = MODULE_KEY_MAP[m.id];
    if (!key) return true;
    if (isStaff) return ['finance', 'projects', 'hr', 'operations', 'media', 'innovation'].includes(m.id);
    return hasModuleAccess(user?.role || '', user?.customAdminPermissions, key);
  });

  const query = search.trim().toLowerCase();
  const filteredModules = modules.filter(
    (m) =>
      !query ||
      m.title.toLowerCase().includes(query) ||
      m.subtitle.toLowerCase().includes(query)
  );

  const byId = (id: string) => modules.find((m) => m.id === id);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      {/* Clean Minimal Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/bems-group-logo.png?v=20261024"
            alt="BEMS"
            className="h-9 w-9 rounded-xl border border-orange-200 bg-white p-1 object-contain"
          />
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-black tracking-tight text-slate-900">BEMS</span>
            <span className="text-base font-extrabold tracking-tight text-orange-600">ERP</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/notifications"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Bell className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Notifications</span>
          </Link>
          {isStaff && (
            <Link
              href="/staff"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              My Workspace
            </Link>
          )}
          {isControlExecutive && (
            <Link
              href="/control-center"
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 transition"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Control Center</span>
            </Link>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-1.5 py-1">
            <div className="text-right leading-tight">
              <div className="text-xs font-bold text-slate-900">{user?.legalName || 'User'}</div>
              <div className="text-[10px] font-medium text-slate-500">
                {user?.subsidiaryName || 'BEMS Group'} ·{' '}
                <span className="text-orange-600 font-bold">{user?.role || 'STAFF'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out of BEMS ERP"
              className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Calm Asymmetric Bento Collage */}
      <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-8">
        {query ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-600">
                {filteredModules.length} system{filteredModules.length === 1 ? '' : 's'} matching &ldquo;{search}&rdquo;
              </div>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-xs font-bold text-orange-600 hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredModules.map((m) => {
                const Icon = m.icon;
                return (
                  <Link
                    key={m.id}
                    href={m.href}
                    className="group rounded-3xl border border-slate-200 bg-white p-7 shadow-sm hover:border-orange-300 hover:shadow-md transition flex flex-col justify-between gap-8"
                  >
                    <div className="flex items-center justify-between">
                      <div className="rounded-2xl p-3" style={{ backgroundColor: m.bgLight, color: m.accentColor }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-orange-600 group-hover:translate-x-0.5 transition" />
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{m.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">{m.subtitle}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Tile 1: Left Tall Flagship — Financial Management (4 cols, 2 rows) */}
            {byId('finance') && (
              <Link
                href={byId('finance')!.href}
                className="group lg:col-span-4 lg:row-span-2 rounded-3xl border border-orange-200/80 bg-gradient-to-b from-white to-orange-50/70 p-7 shadow-sm hover:border-orange-400 hover:shadow-md transition flex flex-col justify-between min-h-[300px]"
              >
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-orange-600 p-3.5 text-white shadow-sm">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="Active" />
                </div>

                <div className="space-y-2 mt-12">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">
                    {byId('finance')!.title}
                  </h2>
                  <p className="text-sm text-slate-500">{byId('finance')!.subtitle}</p>
                  <div className="pt-3 inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 group-hover:gap-2.5 transition-all">
                    <span>Open system</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            )}

            {/* Tile 2: Top Right Wide Hero — Brand + Minimal Search (8 cols, 1 row) */}
            <div className="lg:col-span-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm flex flex-col justify-between gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                    Enterprise Management Systems
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    {user?.subsidiaryName || 'BEMS Group'} · Unified Workspace
                  </p>
                </div>
              </div>

              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search systems..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-11 pr-4 py-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:outline-none transition"
                />
              </div>
            </div>

            {/* Tile 3: Center Focal Square — BEMS Mobile App (4 cols, 1 row) */}
            <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="flex items-center justify-between">
                <div className="rounded-2xl bg-orange-50 p-3 text-orange-600">
                  <Smartphone className="h-5 w-5" />
                </div>
                <Link
                  href="/download"
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition"
                >
                  Download Center
                </Link>
              </div>
              <div>
                <h3 className="text-base font-extrabold tracking-tight text-slate-900">BEMS Mobile</h3>
                <p className="text-xs text-slate-500 mt-0.5">Android APK</p>
              </div>
              <a
                href="/api/mobile/download?app=STAFF_APP"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Download APK
              </a>
            </div>

            {/* Tile 4: Right Tall Feature — Project Management (4 cols, 2 rows) */}
            {byId('projects') && (
              <Link
                href={byId('projects')!.href}
                className="group lg:col-span-4 lg:row-span-2 rounded-3xl border border-sky-200/80 bg-gradient-to-b from-white to-sky-50/70 p-7 shadow-sm hover:border-sky-400 hover:shadow-md transition flex flex-col justify-between min-h-[300px]"
              >
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-sky-600 p-3.5 text-white shadow-sm">
                    <FolderKanban className="h-6 w-6" />
                  </div>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="Active" />
                </div>

                <div className="space-y-2 mt-12">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">
                    {byId('projects')!.title}
                  </h2>
                  <p className="text-sm text-slate-500">{byId('projects')!.subtitle}</p>
                  <div className="pt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 group-hover:gap-2.5 transition-all">
                    <span>Open system</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            )}

            {/* Tile 5: Center-Bottom — Human Resources (4 cols) */}
            {byId('hr') && (
              <Link
                href={byId('hr')!.href}
                className="group lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 hover:shadow-md transition flex flex-col justify-between gap-6"
              >
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                    <Users className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-slate-900">
                    {byId('hr')!.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{byId('hr')!.subtitle}</p>
                </div>
              </Link>
            )}

            {/* Tile 6: Bottom Row — Operations (3 cols) */}
            {byId('operations') && (
              <Link
                href={byId('operations')!.href}
                className="group lg:col-span-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300 hover:shadow-md transition flex flex-col justify-between gap-6"
              >
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                    <Truck className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-slate-900">
                    {byId('operations')!.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{byId('operations')!.subtitle}</p>
                </div>
              </Link>
            )}

            {/* Tile 7: Bottom Row — Media (3 cols) */}
            {byId('media') && (
              <Link
                href={byId('media')!.href}
                className="group lg:col-span-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-pink-300 hover:shadow-md transition flex flex-col justify-between gap-6"
              >
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-pink-50 p-3 text-pink-600">
                    <Video className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-pink-600 group-hover:translate-x-0.5 transition" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-slate-900">
                    {byId('media')!.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{byId('media')!.subtitle}</p>
                </div>
              </Link>
            )}

            {/* Tile 8: Bottom Row — Innovation (3 cols for executives, 6 cols for staff) */}
            {byId('innovation') && (
              <Link
                href={byId('innovation')!.href}
                className={`group ${
                  isControlExecutive ? 'lg:col-span-3' : 'lg:col-span-6'
                } rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-cyan-300 hover:shadow-md transition flex flex-col justify-between gap-6`}
              >
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                    <Code2 className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-cyan-700 group-hover:translate-x-0.5 transition" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-slate-900">
                    {byId('innovation')!.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{byId('innovation')!.subtitle}</p>
                </div>
              </Link>
            )}

            {/* Tile 9: Bottom Row — Control Center (3 cols, strictly GMD & Super Admin) */}
            {isControlExecutive && byId('control-center') && (
              <Link
                href="/control-center"
                className="group lg:col-span-3 rounded-3xl border border-orange-200 bg-orange-50/70 p-6 shadow-sm hover:border-orange-400 hover:shadow-md transition flex flex-col justify-between gap-6"
              >
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-orange-600 p-3 text-white">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-orange-400 group-hover:text-orange-700 group-hover:translate-x-0.5 transition" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-slate-900">
                    Control Center
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">System governance &amp; AI</p>
                </div>
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
