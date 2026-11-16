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
  const isAdminEntry =
    upperRole === 'GMD' ||
    upperRole === 'SUPER_ADMIN' ||
    upperRole === 'SYSTEM_ADMIN' ||
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
