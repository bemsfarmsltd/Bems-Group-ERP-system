'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunset,
  X,
} from 'lucide-react';
import {
  analyzeVideoFaceFrame,
  loadFaceApiModels,
  speakFaceVoicePrompt,
  stopFaceVoicePrompt,
} from '@/lib/attendance/face-client';

interface KioskFaceRecognitionViewProps {
  stationCode: string;
  stationName: string;
  closingTime?: string;
  earliestCheckInTime?: string;
  externalFullscreen?: boolean;
  onCloseExternalFullscreen?: () => void;
  onSuccessPunch?: (result: any) => void;
}

interface PopupModalState {
  variant: 'success' | 'warning' | 'error';
  badgeText: string;
  employeeName?: string | null;
  employeeNumber?: string | null;
  department?: string | null;
  subsidiary?: string | null;
  timeStr?: string | null;
  confidence?: number;
  message: string;
}

export function KioskFaceRecognitionView({
  stationCode,
  stationName,
  closingTime = '17:00',
  earliestCheckInTime = '07:00',
  externalFullscreen = false,
  onCloseExternalFullscreen,
  onSuccessPunch,
}: KioskFaceRecognitionViewProps) {
  const [statusText, setStatusText] = useState('Step up & center your face inside the oval guide');
  const [faceDetected, setFaceDetected] = useState(false);
  const [livenessReady, setLivenessReady] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const [popup, setPopup] = useState<PopupModalState | null>(null);
  const [isEveningShift, setIsEveningShift] = useState(false);

  const isFullscreen = externalFullscreen || internalFullscreen;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);
  const onSuccessPunchRef = useRef(onSuccessPunch);
  const isEveningShiftRef = useRef(isEveningShift);

  useEffect(() => {
    onSuccessPunchRef.current = onSuccessPunch;
  }, [onSuccessPunch]);

  useEffect(() => {
    isEveningShiftRef.current = isEveningShift;
  }, [isEveningShift]);

  // Automatically determine whether current Lagos WAT time is Morning Check-In or Evening Sign-Out (>= closingTime)
  useEffect(() => {
    const checkShift = () => {
      try {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Lagos',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(new Date());
        const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
        const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
        const [cH, cM] = (closingTime || '17:00').split(':').map(Number);
        const closingMins = (Number.isFinite(cH) ? cH : 17) * 60 + (Number.isFinite(cM) ? cM : 0);
        setIsEveningShift(h * 60 + m >= closingMins);
      } catch {}
    };
    checkShift();
    const id = setInterval(checkShift, 15000);
    return () => clearInterval(id);
  }, [closingTime]);

  // Auto-dismiss popup after 4.8 seconds
  useEffect(() => {
    if (!popup) return;
    const t = setTimeout(() => setPopup(null), 4800);
    return () => clearTimeout(t);
  }, [popup]);

  // Esc key exits fullscreen or closes popup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (popup) setPopup(null);
        else if (isFullscreen) {
          setInternalFullscreen(false);
          onCloseExternalFullscreen?.();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, onCloseExternalFullscreen, popup]);

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    stopFaceVoicePrompt();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    stopCamera();
    setPopup(null);
    setStatusText('Initializing biometric camera...');
    try {
      await loadFaceApiModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      activeRef.current = true;
      let baselineEar = 0.28;
      let baselineYaw: number | null = null;
      let seenFrames = 0;
      let noFaceStreak = 0;

      speakFaceVoicePrompt(
        `BEMS Face Recognition Kiosk is ready for ${isEveningShiftRef.current ? 'evening sign-out' : 'morning check-in'}. Please step up and look at the camera.`,
        { force: true, muted: false }
      );

      const tick = async () => {
        if (!activeRef.current || !videoRef.current) return;

        if (Date.now() < cooldownUntilRef.current) {
          setTimeout(tick, 400);
          return;
        }

        try {
          const frame = await analyzeVideoFaceFrame(videoRef.current, true);
          if (frame.multipleFaces) {
            setFaceDetected(false);
            setLivenessReady(false);
            seenFrames = 0;
            noFaceStreak = 0;
            baselineYaw = null;
            setStatusText('One person at a time — multiple faces detected in frame');
            speakFaceVoicePrompt(
              'One person at a time please. Step back so only your face is in the camera.',
              { muted: false, minIntervalMs: 5500 }
            );
          } else if (!frame.detected || !frame.descriptor) {
            setFaceDetected(false);
            setLivenessReady(false);
            seenFrames = 0;
            baselineYaw = null;
            noFaceStreak++;
            setStatusText('Step up & center your face inside the oval guide');
            if (noFaceStreak === 25) {
              speakFaceVoicePrompt(
                'Center your face inside the oval guide in clear front lighting.',
                { muted: false, minIntervalMs: 12000 }
              );
            }
          } else if (frame.faceSizeRatio < 0.18) {
            setFaceDetected(true);
            setLivenessReady(false);
            noFaceStreak = 0;
            setStatusText('Move slightly closer to the kiosk camera');
            speakFaceVoicePrompt(
              'Please move a little closer to the kiosk camera.',
              { muted: false, minIntervalMs: 5500 }
            );
          } else {
            setFaceDetected(true);
            noFaceStreak = 0;
            seenFrames++;
            if (seenFrames === 1) {
              baselineEar = Math.max(0.24, frame.ear);
              baselineYaw = frame.yawRatio;
              setStatusText('Face locked — blink naturally or slightly nod to verify');
              speakFaceVoicePrompt('Face detected. Please blink naturally or nod slightly to verify.', {
                muted: false,
                minIntervalMs: 5000,
              });
            } else {
              const blinked = frame.ear < Math.min(0.22, baselineEar * 0.84);
              const turned = baselineYaw !== null && Math.abs(frame.yawRatio - baselineYaw) >= 0.09;
              if (blinked || turned || seenFrames >= 4) {
                setLivenessReady(true);
                setVerifying(true);
                setStatusText('Verifying Face ID against BEMS staff roster...');
                cooldownUntilRef.current = Date.now() + 5200;

                const res = await fetch('/api/attendance/face-punch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    stationCode,
                    action: 'AUTO',
                    descriptor: frame.descriptor,
                    livenessVerified: true,
                  }),
                });
                const json = await res.json();
                setVerifying(false);
                seenFrames = 0;
                baselineYaw = null;
                setLivenessReady(false);

                if (res.ok && json.success) {
                  const firstName = String(json.employeeName || 'Staff').split(' ')[0];
                  const isNoticeOnly = Boolean(json.alreadyCheckedIn || json.alreadyCheckedOut);
                  const spoken = json.alreadyCheckedIn
                    ? `Hello ${firstName}, you are already clocked in for today at ${json.timeStr}.`
                    : json.alreadyCheckedOut
                    ? `Hello ${firstName}, you already signed out today at ${json.timeStr}.`
                    : json.action === 'CHECK_OUT'
                    ? `Goodbye ${firstName}! Signed out at ${json.timeStr}.`
                    : json.status === 'LATE'
                    ? `Welcome ${firstName}! Clocked in late at ${json.timeStr}.`
                    : `Welcome ${firstName}! Clocked in on time at ${json.timeStr}.`;

                  speakFaceVoicePrompt(spoken, { force: true, muted: false });

                  setPopup({
                    variant: isNoticeOnly ? 'warning' : 'success',
                    badgeText: json.alreadyCheckedIn
                      ? 'ALREADY CLOCKED IN TODAY'
                      : json.alreadyCheckedOut
                      ? 'SHIFT ALREADY COMPLETED'
                      : json.action === 'CHECK_OUT'
                      ? 'EVENING SIGN-OUT VERIFIED'
                      : json.status === 'LATE'
                      ? 'MORNING CHECK-IN · LATE'
                      : 'MORNING CHECK-IN · ON TIME',
                    employeeName: json.employeeName,
                    employeeNumber: json.employeeNumber,
                    department: json.department,
                    subsidiary: json.subsidiary,
                    timeStr: json.timeStr,
                    confidence: json.confidencePercent,
                    message: json.message,
                  });
                  onSuccessPunchRef.current?.(json);
                } else {
                  const isRecognizedWindowLock = Boolean(json?.employeeName);
                  speakFaceVoicePrompt(
                    json?.error || 'Face not recognized. Please look directly at the camera.',
                    { force: true, muted: false }
                  );
                  setPopup({
                    variant: isRecognizedWindowLock ? 'warning' : 'error',
                    badgeText: isRecognizedWindowLock
                      ? 'TIME WINDOW LOCKED'
                      : 'BIOMETRIC MATCH NOT FOUND',
                    employeeName: json?.employeeName || null,
                    employeeNumber: json?.employeeNumber || null,
                    confidence: json?.confidencePercent,
                    message:
                      json?.error ||
                      'Could not verify Face ID. Ensure your Face ID is registered on the Staff Portal and look directly at the camera.',
                  });
                }
              }
            }
          }
        } catch {
          setVerifying(false);
        }

        if (activeRef.current) {
          setTimeout(tick, 280);
        }
      };

      setTimeout(tick, 420);
    } catch (err: any) {
      setStatusText(
        err?.message || 'Camera permission blocked. Please allow camera access on this kiosk browser.'
      );
    }
  }, [stationCode, stopCamera]);

  useEffect(() => {
    startScanner();
    return () => stopCamera();
  }, [startScanner, stopCamera]);

  const cornerColor = verifying
    ? '#ea580c'
    : livenessReady || faceDetected
    ? '#10b981'
    : '#ea580c';

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: isFullscreen ? '640px' : '100%',
        margin: '0 auto',
      }}
    >
      {/* Top Auto-Shift Intelligence Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          width: '100%',
          marginBottom: '14px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 13px',
            borderRadius: '999px',
            background: isEveningShift ? '#f8fafc' : '#fff7ed',
            border: `1px solid ${isEveningShift ? '#cbd5e1' : '#fed7aa'}`,
            color: isEveningShift ? '#0f172a' : '#c2410c',
            fontSize: '11.5px',
            fontWeight: 800,
          }}
        >
          {isEveningShift ? (
            <Sunset size={14} color="#ea580c" />
          ) : (
            <Sun size={14} color="#ea580c" />
          )}
          <span>
            {isEveningShift
              ? `AUTO-DETECT: EVENING SIGN-OUT (${closingTime}+)`
              : `AUTO-DETECT: MORNING CHECK-IN (${earliestCheckInTime}+)`}
          </span>
        </div>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 11px',
            borderRadius: '999px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#047857',
            fontSize: '11px',
            fontWeight: 800,
          }}
        >
          <ShieldCheck size={13} /> Liveness Guard Active
        </span>
      </div>

      {/* Biometric Camera Viewfinder with Corner Reticle Brackets */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: isFullscreen ? '560px' : '370px',
          aspectRatio: '4 / 3.2',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* 4 Corner Brackets */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '28px',
            height: '28px',
            borderTop: `4px solid ${cornerColor}`,
            borderLeft: `4px solid ${cornerColor}`,
            borderRadius: '12px 0 0 0',
            transition: 'border-color 0.25s ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '28px',
            height: '28px',
            borderTop: `4px solid ${cornerColor}`,
            borderRight: `4px solid ${cornerColor}`,
            borderRadius: '0 12px 0 0',
            transition: 'border-color 0.25s ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '28px',
            height: '28px',
            borderBottom: `4px solid ${cornerColor}`,
            borderLeft: `4px solid ${cornerColor}`,
            borderRadius: '0 0 0 12px',
            transition: 'border-color 0.25s ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '28px',
            height: '28px',
            borderBottom: `4px solid ${cornerColor}`,
            borderRight: `4px solid ${cornerColor}`,
            borderRadius: '0 0 12px 0',
            transition: 'border-color 0.25s ease',
          }}
        />

        {/* Video Frame */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: '20px',
            overflow: 'hidden',
            background: '#f1f5f9',
            border: `2px solid ${faceDetected ? '#10b981' : '#e2e8f0'}`,
            boxShadow: faceDetected
              ? '0 14px 34px rgba(16, 185, 129, 0.18)'
              : '0 10px 28px rgba(15, 23, 42, 0.08)',
            transition: 'all 0.25s ease',
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

          {/* Top Floating Camera Pill */}
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 11px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #e2e8f0',
              fontSize: '10.5px',
              fontWeight: 800,
              color: '#0f172a',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: faceDetected ? '#10b981' : '#ea580c',
              }}
            />
            <span>{faceDetected ? 'FACE LOCKED · VERIFYING' : 'BEMS FACE ID SCANNER'}</span>
          </div>

          {/* Center Oval Biometric Reticle */}
          <div
            style={{
              position: 'absolute',
              inset: '11% 25%',
              border: `2.5px dashed ${faceDetected ? '#10b981' : 'rgba(234, 88, 12, 0.85)'}`,
              borderRadius: '50%',
              pointerEvents: 'none',
              boxShadow: faceDetected
                ? '0 0 24px rgba(16, 185, 129, 0.35)'
                : '0 0 0 999px rgba(15, 23, 42, 0.10)',
              transition: 'all 0.25s ease',
            }}
          />

          {/* Overlaid Bottom Glass Instruction Bar */}
          <div
            style={{
              position: 'absolute',
              left: '12px',
              right: '12px',
              bottom: '12px',
              padding: '9px 14px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${faceDetected ? '#a7f3d0' : '#fed7aa'}`,
              color: faceDetected ? '#065f46' : '#9a3412',
              fontSize: isFullscreen ? '13.5px' : '12px',
              fontWeight: 800,
              textAlign: 'center',
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.10)',
            }}
          >
            {verifying ? 'Matching your Face ID...' : statusText}
          </div>
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginTop: '14px',
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <button
          type="button"
          onClick={startScanner}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: '#475569',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} />
          <span>Restart Camera</span>
        </button>

        {!isFullscreen && (
          <button
            type="button"
            onClick={() => setInternalFullscreen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #fed7aa',
              background: '#fff7ed',
              color: '#ea580c',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Maximize2 size={13} />
            <span>Fullscreen Face Kiosk</span>
          </button>
        )}
      </div>

      {/* NEAT POP-UP MODAL FOR CHECK-IN / SIGN-OUT / TIME-WINDOW LOCK / ERROR */}
      {popup && (
        <div
          onClick={() => setPopup(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100005,
            background: 'rgba(15, 23, 42, 0.48)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              border: `2px solid ${
                popup.variant === 'success'
                  ? '#10b981'
                  : popup.variant === 'warning'
                  ? '#f59e0b'
                  : '#ef4444'
              }`,
              maxWidth: '440px',
              width: '100%',
              padding: '26px 24px 22px',
              boxShadow: '0 25px 60px rgba(15, 23, 42, 0.22)',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => setPopup(null)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={15} />
            </button>

            {/* Status Icon Circle */}
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '18px',
                margin: '0 auto 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  popup.variant === 'success'
                    ? '#ecfdf5'
                    : popup.variant === 'warning'
                    ? '#fffbeb'
                    : '#fef2f2',
                border: `1px solid ${
                  popup.variant === 'success'
                    ? '#a7f3d0'
                    : popup.variant === 'warning'
                    ? '#fde68a'
                    : '#fecaca'
                }`,
              }}
            >
              {popup.variant === 'success' ? (
                <CheckCircle2 size={32} color="#059669" />
              ) : popup.variant === 'warning' ? (
                <Clock size={32} color="#d97706" />
              ) : (
                <ShieldAlert size={32} color="#dc2626" />
              )}
            </div>

            {/* Status Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                marginBottom: '10px',
                background:
                  popup.variant === 'success'
                    ? '#ecfdf5'
                    : popup.variant === 'warning'
                    ? '#fffbeb'
                    : '#fef2f2',
                color:
                  popup.variant === 'success'
                    ? '#047857'
                    : popup.variant === 'warning'
                    ? '#b45309'
                    : '#b91c1c',
                border: `1px solid ${
                  popup.variant === 'success'
                    ? '#a7f3d0'
                    : popup.variant === 'warning'
                    ? '#fde68a'
                    : '#fecaca'
                }`,
              }}
            >
              <Sparkles size={12} />
              <span>{popup.badgeText}</span>
            </div>

            {/* Recognized Employee Identity */}
            {popup.employeeName && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '19px', fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>
                  {popup.employeeName}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#64748b',
                    marginTop: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  {popup.employeeNumber && <span>{popup.employeeNumber}</span>}
                  {popup.confidence !== undefined && (
                    <span
                      style={{
                        padding: '1px 8px',
                        borderRadius: '999px',
                        background: '#f1f5f9',
                        color: '#0f172a',
                        fontSize: '11px',
                        fontWeight: 800,
                      }}
                    >
                      ✓ {popup.confidence}% Face Match
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Message Body */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '14px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                lineHeight: 1.5,
                marginBottom: '16px',
              }}
            >
              {popup.message}
            </div>

            <button
              type="button"
              onClick={() => setPopup(null)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '12px',
                border: 'none',
                background:
                  popup.variant === 'success'
                    ? '#059669'
                    : popup.variant === 'warning'
                    ? '#ea580c'
                    : '#0f172a',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Done · Ready for Next Staff
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        {/* Top Floating Header in Fullscreen */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '28px',
            right: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '12px 20px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ea580c',
              }}
            >
              <Camera size={20} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                {stationName || 'BEMS Reception Face ID Kiosk'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Automatic Morning Check-In &amp; Evening Sign-Out Biometric Terminal
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setInternalFullscreen(false);
              onCloseExternalFullscreen?.();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Minimize2 size={14} />
            <span>Exit Fullscreen (Esc)</span>
          </button>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '28px',
            padding: '28px 32px',
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.07)',
            width: '100%',
            maxWidth: '680px',
            marginTop: '48px',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return content;
}
