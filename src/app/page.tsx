'use client';

import React, { useState, useEffect } from 'react';
import { UnifiedAuthScreen } from '@/components/auth/UnifiedAuthScreen';
import { EnterpriseModulesScreen, type EnterpriseUserSummary } from '@/components/dashboard/EnterpriseModulesScreen';
import { AiMotionEntryScreen } from '@/components/ai/AiMotionEntryScreen';
import { KineticOptikkaTorus } from '@/components/ai/KineticOptikkaTorus';

export default function RootPage() {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [user, setUser] = useState<EnterpriseUserSummary | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session?_t=' + Date.now(), { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.user) {
          setUser({
            id: data.user.id,
            legalName: data.user.legalName || data.user.name || data.user.fullName || 'User',
            role: data.user.role || 'STAFF',
            workEmail: data.user.workEmail || data.user.email || '',
            employeeNumber: data.user.employeeNumber,
            subsidiaryName: data.user.subsidiary?.legalName || data.user.subsidiaryName || 'BEMS Group',
            customAdminProfileId: data.user.customAdminProfileId || null,
            customAdminTitle: data.user.customAdminTitle || null,
            customAdminPermissions: data.user.customAdminPermissions || null,
          });
          setAuthStatus('authenticated');
          try {
            if (sessionStorage.getItem('bems_show_welcome') === '1') {
              setShowWelcome(true);
            }
          } catch {}
        } else {
          setAuthStatus('unauthenticated');
        }
      })
      .catch(() => {
        if (active) setAuthStatus('unauthenticated');
      });

    return () => {
      active = false;
    };
  }, []);

  if (authStatus === 'checking') {
    return (
      <div
        role="status"
        aria-label="Loading BEMS ERP"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f2eb',
          overflow: 'hidden',
        }}
      >
        <KineticOptikkaTorus size={460} brandColor="#ea580c" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated' || !user) {
    return (
      <UnifiedAuthScreen
        onAuthed={(authedUser) => {
          setUser({
            id: authedUser.id,
            legalName: authedUser.fullName || authedUser.name || 'User',
            role: authedUser.role || 'STAFF',
            workEmail: authedUser.email || '',
            employeeNumber: authedUser.employeeNumber,
            subsidiaryName: authedUser.subsidiary || 'BEMS Group',
            customAdminProfileId: authedUser.customAdminProfileId || null,
            customAdminTitle: authedUser.customAdminTitle || null,
            customAdminPermissions: (authedUser.customAdminPermissions as EnterpriseUserSummary['customAdminPermissions']) || null,
          });
          setShowWelcome(true);
          setAuthStatus('authenticated');
        }}
      />
    );
  }

  const upperRole = String(user.role || '').toUpperCase();
  if (upperRole === 'STAFF') {
    const handleSwitchToAdmin = async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch {}
      setUser(null);
      setAuthStatus('unauthenticated');
    };

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: 24,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 28,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            BEMS Staff Session Active
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            Signed in as {user.legalName || 'Staff'}
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#475569', lineHeight: 1.5 }}>
            Your browser currently holds a Staff session. Continue directly to the BEMS Staff App, or sign out to log into the Admin Control Center.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href="/staff-app/index.html"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 42,
                borderRadius: 10,
                background: '#ea580c',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Open Staff App
            </a>
            <button
              type="button"
              onClick={handleSwitchToAdmin}
              style={{
                height: 42,
                borderRadius: 10,
                background: '#ffffff',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign Out &amp; Switch to Admin
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isAdminEntry =
    upperRole === 'GMD' ||
    upperRole === 'SUPER_ADMIN' ||
    upperRole === 'SYSTEM_ADMIN' ||
    upperRole === 'CUSTOM_ADMIN' ||
    Boolean(user.customAdminProfileId || user.customAdminTitle || user.customAdminPermissions);
  if (showWelcome && isAdminEntry) {
    return (
      <AiMotionEntryScreen
        onComplete={() => {
          try {
            sessionStorage.removeItem('bems_show_welcome');
            sessionStorage.setItem('bems_welcome_shown_session', '1');
          } catch {}
          setShowWelcome(false);
        }}
        businessName={user.subsidiaryName || 'BEMS Group'}
        userName={user.legalName || 'Executive'}
        userRole={user.role}
        mode="login"
        brandColor="#ea580c"
      />
    );
  }

  return <EnterpriseModulesScreen user={user} />;
}
