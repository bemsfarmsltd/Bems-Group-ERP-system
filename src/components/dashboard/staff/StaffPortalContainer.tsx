'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Smartphone, Monitor, ExternalLink, RefreshCw, ShieldCheck, LayoutGrid } from 'lucide-react';

interface StaffPortalContainerProps {
  user: any;
  businessName: string;
  subsidiaries?: any[];
  vendors?: any[];
  currentStaff?: any;
}

export function StaffPortalContainer({
  user,
  businessName,
}: StaffPortalContainerProps) {
  const [desktopLayout, setDesktopLayout] = useState<'PHONE_FRAME' | 'FULL_SCREEN'>('FULL_SCREEN');
  const [iframeKey, setIframeKey] = useState<number>(Date.now());
  const [isLoadingEngine, setIsLoadingEngine] = useState(true);

  const isCustomAdmin = String(user?.role || '').toUpperCase() === 'CUSTOM_ADMIN';

  // Auto-seed session into Flutter's Web SharedPreferences (localStorage)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && user) {
        const flutterUserPayload = {
          id: user.id || '',
          fullName: user.fullName || user.legalName || '',
          email: user.email || user.workEmail || '',
          phone: user.phone || '',
          employeeNumber: user.employeeNumber || '',
          role: user.role || 'STAFF',
          subsidiary: user.subsidiary || businessName || 'BEMS Group',
          department: user.department || 'General Operations',
          jobTitle: user.jobTitle || 'Staff Personnel',
          workLocation: user.workLocation || 'UMUAHIA_OPS_HUB',
          staffGrade: user.staffGrade || 'OFFICER',
          bankName: user.bankName || '',
          accountNumber: user.accountNumber || '',
          accountName: user.accountName || user.fullName || user.legalName || '',
          salaryBankName: user.salaryBankName || user.bankName || '',
          salaryAccountNumber: user.salaryAccountNumber || user.accountNumber || '',
          salaryAccountName: user.salaryAccountName || user.accountName || user.fullName || '',
          avatarUrl: user.avatarUrl || '',
          token: user.id || 'bems-staff-active-token',
        };
        window.localStorage.setItem('flutter.bems_staff_user', JSON.stringify(flutterUserPayload));
      }
    } catch (e) {
      console.warn('Could not auto-seed Flutter storage:', e);
    }
  }, [user, businessName]);

  const handleReloadEngine = () => {
    setIsLoadingEngine(true);
    setIframeKey(Date.now());
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans select-none overflow-hidden">
      {/* Top Desktop Controls Bar */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between text-slate-800 z-40 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xs text-white shadow-md">
            B
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wide text-slate-900">BEMS STAFF PORTAL</span>
              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Flutter Engine
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">
              {user?.fullName || user?.legalName} · {user?.employeeNumber} · {user?.subsidiary || businessName}
            </p>
          </div>
        </div>

        {/* Layout & Engine Controls */}
        <div className="flex items-center gap-2">
          {isCustomAdmin && (
            <Link
              href="/?view=admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
              title="Switch to your assigned Admin Modules"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Admin Modules</span>
            </Link>
          )}

          {/* Frame Toggle (Desktop only) */}
          <div className="hidden md:flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
            <button
              onClick={() => setDesktopLayout('PHONE_FRAME')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition-all ${
                desktopLayout === 'PHONE_FRAME'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Centered Mobile Phone Mockup"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile View</span>
            </button>
            <button
              onClick={() => setDesktopLayout('FULL_SCREEN')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition-all ${
                desktopLayout === 'FULL_SCREEN'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Expand to Full Desktop Monitor"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </button>
          </div>

          {/* Reload Flutter App Button */}
          <button
            onClick={handleReloadEngine}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm transition-all"
            title="Reload Staff Engine"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Open in Standalone Tab */}
          <a
            href="/staff-app/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-sm transition-all"
            title="Open pure Flutter app in dedicated tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Dedicated Tab</span>
          </a>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="flex-1 flex items-center justify-center p-0 md:p-4 bg-slate-100 relative overflow-hidden">
        {isLoadingEngine && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-30 transition-opacity">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white font-black text-xl shadow-xl shadow-orange-500/25 animate-pulse mb-3">
              B
            </div>
            <p className="text-sm font-bold text-slate-900">Starting BEMS Staff Portal...</p>
            <p className="text-xs text-slate-500 mt-1">Connecting to live ERP services</p>
          </div>
        )}

        <div
          className={`w-full transition-all duration-300 flex items-center justify-center ${
            desktopLayout === 'FULL_SCREEN'
              ? 'h-full max-w-none'
              : 'md:max-w-[420px] md:h-[calc(100vh-68px)] md:my-auto'
          }`}
        >
          <div
            className={`w-full h-full bg-white overflow-hidden transition-all duration-300 ${
              desktopLayout === 'PHONE_FRAME'
                ? 'md:rounded-[36px] md:border-[8px] md:border-slate-300 md:shadow-xl relative'
                : 'rounded-none'
            }`}
          >
            {desktopLayout === 'PHONE_FRAME' && (
              <div className="hidden md:flex absolute top-2 left-1/2 -translate-x-1/2 z-20 items-center justify-center">
                <div className="w-20 h-4 bg-slate-200 rounded-full flex items-center justify-center">
                  <div className="w-10 h-1 bg-slate-400 rounded-full"></div>
                </div>
              </div>
            )}

            <iframe
              key={iframeKey}
              src="/staff-app/index.html"
              onLoad={() => setIsLoadingEngine(false)}
              className="w-full h-full border-0 block"
              allow="camera; geolocation; microphone; clipboard-read; clipboard-write; display-capture"
              title="BEMS Staff Portal Mobile App"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
