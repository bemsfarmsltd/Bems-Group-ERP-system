'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react';
import {
  analyzeVideoFaceFrame,
  captureFaceThumbnailDataUrl,
  loadFaceApiModels,
} from '@/lib/attendance/face-client';

interface FaceProfileResponse {
  enrolled: boolean;
  status: 'NOT_ENROLLED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  shouldPromptEnrollment?: boolean;
  profile: {
    id: string;
    status: string;
    sampleCount: number;
    livenessVerified: boolean;
    referencePhotoUrl: string | null;
    enrolledAt: string;
    approvedByName: string | null;
    approvedAt: string | null;
    rejectionReason: string | null;
  } | null;
  attendanceMode: 'QR' | 'FACE';
  requireHrApproval: boolean;
}

type CaptureStep = 'STRAIGHT' | 'TURN_HEAD' | 'BLINK' | 'SUBMITTING' | 'DONE';

export function StaffFaceEnrollmentCard({
  autoPromptIfUnenrolled = false,
  autoStartCamera = false,
}: {
  autoPromptIfUnenrolled?: boolean;
  autoStartCamera?: boolean;
} = {}) {
  const [data, setData] = useState<FaceProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [promptBannerOpen, setPromptBannerOpen] = useState(false);
  const autoPromptTriggeredRef = useRef(false);
  const [step, setStep] = useState<CaptureStep>('STRAIGHT');
  const [statusHint, setStatusHint] = useState('Initializing camera & biometric models...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplesRef = useRef<number[][]>([]);
  const thumbnailRef = useRef<string | null>(null);
  const baselineEarRef = useRef<number>(0.29);
  const loopActiveRef = useRef<boolean>(false);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/attendance/face/profile', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!data || autoPromptTriggeredRef.current) return;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const wantsAutoStart = autoStartCamera || params?.get('autostart') === '1';
    if (wantsAutoStart && (data.status === 'NOT_ENROLLED' || data.status === 'REJECTED')) {
      autoPromptTriggeredRef.current = true;
      startEnrollmentWizard();
      return;
    }
    if (
      autoPromptIfUnenrolled &&
      data.shouldPromptEnrollment &&
      typeof window !== 'undefined' &&
      sessionStorage.getItem('bems_face_prompt_dismissed') !== '1'
    ) {
      autoPromptTriggeredRef.current = true;
      setPromptBannerOpen(true);
    }
  }, [autoPromptIfUnenrolled, autoStartCamera, data]);

  const stopCamera = useCallback(() => {
    loopActiveRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const submitEnrollment = useCallback(async () => {
    setStep('SUBMITTING');
    setSubmitting(true);
    setStatusHint('Encrypting & saving your Face ID profile...');
    try {
      const res = await fetch('/api/attendance/face/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descriptors: samplesRef.current,
          referencePhotoUrl: thumbnailRef.current,
          livenessVerified: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save Face ID.');
      }
      setStep('DONE');
      setStatusHint(json.message || 'Face ID registered successfully!');
      stopCamera();
      await fetchProfile();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Enrollment failed. Please try again.');
      stopCamera();
    } finally {
      setSubmitting(false);
    }
  }, [fetchProfile, stopCamera]);

  const startEnrollmentWizard = async () => {
    setErrorMsg(null);
    samplesRef.current = [];
    thumbnailRef.current = null;
    setStep('STRAIGHT');
    setModalOpen(true);
    setStatusHint('Loading BEMS facial recognition models...');

    try {
      await loadFaceApiModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      loopActiveRef.current = true;
      let currentStep: CaptureStep = 'STRAIGHT';
      let openEyeFrames = 0;

      const tick = async () => {
        if (!loopActiveRef.current || !videoRef.current) return;
        try {
          const frame = await analyzeVideoFaceFrame(videoRef.current, true);
          if (frame.multipleFaces) {
            setStatusHint('Multiple faces detected — make sure only you are in front of the camera.');
          } else if (!frame.detected || !frame.descriptor) {
            setStatusHint('Center your face inside the frame in clear front lighting.');
          } else if (frame.faceSizeRatio < 0.2) {
            setStatusHint('Move slightly closer to the camera.');
          } else if (currentStep === 'STRAIGHT') {
            if (Math.abs(frame.yawRatio) <= 0.18) {
              samplesRef.current.push(frame.descriptor);
              baselineEarRef.current = Math.max(0.24, frame.ear);
              thumbnailRef.current = captureFaceThumbnailDataUrl(videoRef.current);
              currentStep = 'TURN_HEAD';
              setStep('TURN_HEAD');
              setStatusHint('Great! Now slightly turn your head left or right.');
            } else {
              setStatusHint('Step 1 of 3: Look straight at the camera.');
            }
          } else if (currentStep === 'TURN_HEAD') {
            if (Math.abs(frame.yawRatio) >= 0.2) {
              samplesRef.current.push(frame.descriptor);
              currentStep = 'BLINK';
              setStep('BLINK');
              setStatusHint('Step 3 of 3 (Liveness): Look straight and blink both eyes naturally (or nod slightly).');
            } else {
              setStatusHint('Step 2 of 3: Slightly turn your head left or right.');
            }
          } else if (currentStep === 'BLINK') {
            if (frame.ear > 0.24) openEyeFrames++;
            const blinked = openEyeFrames >= 1 && frame.ear < Math.min(0.22, baselineEarRef.current * 0.82);
            const oppositeTurn = Math.abs(frame.yawRatio) <= 0.12 && openEyeFrames >= 4;
            if (blinked || oppositeTurn) {
              samplesRef.current.push(frame.descriptor);
              loopActiveRef.current = false;
              await submitEnrollment();
              return;
            } else {
              setStatusHint('Step 3 of 3 (Liveness): Look straight at the camera and blink naturally.');
            }
          }
        } catch {
          // continue loop
        }
        if (loopActiveRef.current) {
          setTimeout(tick, 260);
        }
      };

      setTimeout(tick, 400);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'Camera permission denied or unavailable. Please allow camera access in your browser to register your Face ID.'
      );
      stopCamera();
    }
  };

  const status = data?.status || 'NOT_ENROLLED';
  const canEnroll = status === 'NOT_ENROLLED' || status === 'REJECTED' || status === 'PENDING_APPROVAL';

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '18px 20px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: status === 'APPROVED' ? '#ecfdf5' : '#fff7ed',
              border: `1px solid ${status === 'APPROVED' ? '#a7f3d0' : '#fed7aa'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: status === 'APPROVED' ? '#059669' : '#ea580c',
              flexShrink: 0,
            }}
          >
            <Camera size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                Reception Kiosk Face ID Enrollment
              </span>
              {status === 'APPROVED' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                  }}
                >
                  <ShieldCheck size={12} /> Active & Approved
                </span>
              )}
              {status === 'PENDING_APPROVAL' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: '#fffbeb',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                  }}
                >
                  <Clock size={12} /> Pending HR Approval
                </span>
              )}
              {status === 'REJECTED' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: '#fef2f2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                  }}
                >
                  <ShieldAlert size={12} /> Rejected — Re-enroll
                </span>
              )}
              {status === 'NOT_ENROLLED' && !loading && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                  }}
                >
                  Not Registered
                </span>
              )}
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#475569' }}>
              {status === 'APPROVED'
                ? 'Your Face ID is verified and locked. Walk up to the office reception kiosk tablet to clock in/out by camera.'
                : status === 'PENDING_APPROVAL'
                ? 'Your Face ID has been captured and is awaiting HR / Super Admin approval before kiosk face clock-in unlocks.'
                : status === 'REJECTED'
                ? `Reason: ${data?.profile?.rejectionReason || 'Please re-register your face in clear front lighting.'}`
                : 'Register your face once here so the office reception kiosk camera can automatically identify and clock you in.'}
            </p>
          </div>
        </div>

        {canEnroll && (
          <button
            type="button"
            onClick={startEnrollmentWizard}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '10px',
              border: 'none',
              background: '#ea580c',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
            }}
          >
            <Sparkles size={14} />
            {status === 'NOT_ENROLLED' ? 'Register My Face ID' : 'Re-Capture Face ID'}
          </button>
        )}
      </div>

      {promptBannerOpen && !modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '20px',
              maxWidth: '430px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '16px',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
              }}
            >
              <Camera size={26} />
            </div>
            <div
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: '999px',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#ea580c',
                fontSize: '10.5px',
                fontWeight: 800,
                marginBottom: '8px',
              }}
            >
              ACTION REQUIRED · ATTENDANCE SETUP
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
              {status === 'REJECTED' ? 'Re-Register Your Kiosk Face ID' : 'Register Your Kiosk Face ID'}
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#475569', lineHeight: 1.55 }}>
              {status === 'REJECTED'
                ? data?.profile?.rejectionReason ||
                  'Your previous Face ID enrollment needs to be retaken in clear front lighting.'
                : 'Welcome to BEMS! Please take 15 seconds to enroll your Face ID now so the Office Reception Kiosk camera can clock you in and out automatically.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setPromptBannerOpen(false);
                  startEnrollmentWizard();
                }}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#ea580c',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                }}
              >
                Enroll My Face ID Now →
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem('bems_face_prompt_dismissed', '1');
                  setPromptBannerOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Remind Me Later
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '20px',
              maxWidth: '460px',
              width: '100%',
              padding: '22px',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Self-Service Face ID Registration
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  One-time biometric enrollment with anti-spoofing liveness check
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setModalOpen(false);
                }}
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Step Progress Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '14px' }}>
              {[
                { key: 'STRAIGHT', label: '1. Look Straight' },
                { key: 'TURN_HEAD', label: '2. Slight Turn' },
                { key: 'BLINK', label: '3. Blink Liveness' },
              ].map((s, idx) => {
                const order = ['STRAIGHT', 'TURN_HEAD', 'BLINK', 'SUBMITTING', 'DONE'];
                const curIdx = order.indexOf(step);
                const isDone = curIdx > idx;
                const isCurrent = curIdx === idx;
                return (
                  <div
                    key={s.key}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textAlign: 'center',
                      background: isDone ? '#ecfdf5' : isCurrent ? '#fff7ed' : '#f8fafc',
                      color: isDone ? '#047857' : isCurrent ? '#ea580c' : '#64748b',
                      border: `1px solid ${isDone ? '#a7f3d0' : isCurrent ? '#fdba74' : '#e2e8f0'}`,
                    }}
                  >
                    {isDone ? '✓ ' : ''}
                    {s.label}
                  </div>
                );
              })}
            </div>

            {step !== 'DONE' ? (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '4 / 3',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  background: '#f1f5f9',
                  border: '2px solid #ea580c',
                  marginBottom: '14px',
                }}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)',
                  }}
                />
                {/* Oval Face Guide */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '12% 24%',
                    border: '2.5px dashed rgba(234, 88, 12, 0.85)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    boxShadow: '0 0 0 999px rgba(255, 255, 255, 0.18)',
                  }}
                />
              </div>
            ) : (
              <div
                style={{
                  padding: '24px 16px',
                  borderRadius: '14px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  textAlign: 'center',
                  marginBottom: '14px',
                }}
              >
                <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#065f46' }}>
                  Face ID Captured Successfully
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#047857' }}>{statusHint}</p>
              </div>
            )}

            {errorMsg ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '12px',
                }}
              >
                {errorMsg}
              </div>
            ) : (
              step !== 'DONE' && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    color: '#9a3412',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    textAlign: 'center',
                    marginBottom: '12px',
                  }}
                >
                  {submitting ? 'Saving biometric profile...' : statusHint}
                </div>
              )
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {errorMsg && (
                <button
                  type="button"
                  onClick={startEnrollmentWizard}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#ea580c',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={13} /> Retry Capture
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setModalOpen(false);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {step === 'DONE' ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
