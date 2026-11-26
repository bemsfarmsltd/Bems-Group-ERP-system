'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera } from 'lucide-react';
import { StaffFaceEnrollmentCard } from '@/components/attendance/StaffFaceEnrollmentCard';

export default function FaceEnrollmentPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        padding: '24px 16px',
      }}
    >
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <a
              href="/staff-app/index.html"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: '12.5px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={15} /> Back to Staff Portal
            </a>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#475569',
                fontSize: '12.5px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Modules Home
            </Link>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '999px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              color: '#ea580c',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            <Camera size={13} /> BEMS BIOMETRIC ENROLLMENT
          </span>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
          }}
        >
          <h1 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
            Self-Service Face ID Registration
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
            Use your phone or laptop camera once to register your Face ID. Once approved by HR, simply walk up to the
            <strong> Office Reception Kiosk tablet/camera</strong> each morning and evening to clock in and out automatically.
          </p>
        </div>

        <StaffFaceEnrollmentCard />
      </div>
    </div>
  );
}
