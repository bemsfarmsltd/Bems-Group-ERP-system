'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, LogIn, LogOut, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { analyzeVideoFaceFrame, loadFaceApiModels } from '@/lib/attendance/face-client';

interface KioskFaceRecognitionViewProps {
  stationCode: string;
  stationName: string;
  closingTime?: string;
  onSuccessPunch?: (result: any) => void;
}

export function KioskFaceRecognitionView({
  stationCode,
  stationName,
  closingTime = '17:00',
  onSuccessPunch,
}: KioskFaceRecognitionViewProps) {
  const [action, setAction] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [statusText, setStatusText] = useState('Loading BEMS Face Recognition camera...');
  const [faceDetected, setFaceDetected] = useState(false);
  const [livenessReady, setLivenessReady] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    confidence?: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);
  const actionRef = useRef<'CHECK_IN' | 'CHECK_OUT'>(action);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    stopCamera();
    setBanner(null);
    setStatusText('Starting kiosk camera & biometric engine...');
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

      activeRef.current = true;
      let baselineEar = 0.28;
      let baselineYaw: number | null = null;
      let seenFrames = 0;

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
            baselineYaw = null;
            setStatusText('One person at a time — multiple faces in frame.');
          } else if (!frame.detected || !frame.descriptor) {
            setFaceDetected(false);
            setLivenessReady(false);
            seenFrames = 0;
            baselineYaw = null;
            setStatusText('Step up & center your face inside the oval guide to clock in.');
          } else if (frame.faceSizeRatio < 0.18) {
            setFaceDetected(true);
            setLivenessReady(false);
            setStatusText('Step slightly closer to the kiosk camera.');
          } else {
            setFaceDetected(true);
            seenFrames++;
            if (seenFrames === 1) {
              baselineEar = Math.max(0.24, frame.ear);
              baselineYaw = frame.yawRatio;
              setStatusText('Face detected — blink naturally or slightly nod/turn head to verify liveness...');
            } else {
              const blinked = frame.ear < Math.min(0.22, baselineEar * 0.84);
              const turned = baselineYaw !== null && Math.abs(frame.yawRatio - baselineYaw) >= 0.09;
              if (blinked || turned || seenFrames >= 4) {
                setLivenessReady(true);
                setVerifying(true);
                setStatusText('Verifying Face ID against BEMS staff roster...');
                cooldownUntilRef.current = Date.now() + 4500;

                const res = await fetch('/api/attendance/face-punch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    stationCode,
                    action: actionRef.current,
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
                  setBanner({
                    type: 'success',
                    title: `${json.employeeName} (${json.employeeNumber})`,
                    message: json.message,
                    confidence: json.confidencePercent,
                  });
                  onSuccessPunch?.(json);
                } else {
                  setBanner({
                    type: 'error',
                    title: 'Face ID Check-In Not Completed',
                    message: json?.error || 'Could not verify Face ID. Please face the camera clearly.',
                  });
                }
              }
            }
          }
        } catch {
          setVerifying(false);
        }

        if (activeRef.current) {
          setTimeout(tick, 300);
        }
      };

      setTimeout(tick, 450);
    } catch (err: any) {
      setStatusText(
        err?.message || 'Camera access blocked. Please allow camera permission on this kiosk browser.'
      );
    }
  }, [onSuccessPunch, stationCode, stopCamera]);

  useEffect(() => {
    startScanner();
    return () => stopCamera();
  }, [startScanner, stopCamera]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {/* Check-In / Check-Out Action Toggle */}
      <div
        style={{
          display: 'inline-flex',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '4px',
          gap: '4px',
          marginBottom: '12px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setAction('CHECK_IN');
            setBanner(null);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 16px',
            borderRadius: '9px',
            border: 'none',
            background: action === 'CHECK_IN' ? '#ea580c' : 'transparent',
            color: action === 'CHECK_IN' ? '#ffffff' : '#475569',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <LogIn size={14} /> Morning Check-In
        </button>
        <button
          type="button"
          onClick={() => {
            setAction('CHECK_OUT');
            setBanner(null);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 16px',
            borderRadius: '9px',
            border: 'none',
            background: action === 'CHECK_OUT' ? '#0f172a' : 'transparent',
            color: action === 'CHECK_OUT' ? '#ffffff' : '#475569',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <LogOut size={14} /> Evening Sign-Out ({closingTime})
        </button>
      </div>

      {/* Camera Viewfinder */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '340px',
          aspectRatio: '4 / 3',
          borderRadius: '20px',
          overflow: 'hidden',
          background: '#f8fafc',
          border: `3px solid ${
            verifying ? '#ea580c' : livenessReady ? '#10b981' : faceDetected ? '#f97316' : '#cbd5e1'
          }`,
          boxShadow: faceDetected
            ? '0 10px 28px rgba(234, 88, 12, 0.18)'
            : '0 6px 20px rgba(15, 23, 42, 0.06)',
          transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
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
        {/* Face Oval Guide */}
        <div
          style={{
            position: 'absolute',
            inset: '10% 24%',
            border: `2.5px dashed ${faceDetected ? '#10b981' : '#ea580c'}`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 9px',
            borderRadius: '999px',
            background: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid #e2e8f0',
            fontSize: '10px',
            fontWeight: 800,
            color: '#0f172a',
          }}
        >
          <Sparkles size={11} color="#ea580c" /> LIVE FACE ID · LIVENESS GUARD
        </div>
      </div>

      {/* Live Status Instruction */}
      <div
        style={{
          marginTop: '10px',
          padding: '8px 14px',
          borderRadius: '10px',
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          color: '#9a3412',
          fontSize: '12px',
          fontWeight: 700,
          textAlign: 'center',
          maxWidth: '340px',
          width: '100%',
        }}
      >
        {verifying ? 'Matching your Face ID...' : statusText}
      </div>

      {/* Result Banner */}
      {banner && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px 14px',
            borderRadius: '12px',
            maxWidth: '340px',
            width: '100%',
            background: banner.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${banner.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: banner.type === 'success' ? '#065f46' : '#991b1b',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
          ) : (
            <ShieldAlert size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
          )}
          <div style={{ fontSize: '12px', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 800 }}>{banner.title}</div>
            <div>{banner.message}</div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={startScanner}
        style={{
          marginTop: '8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 10px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={11} /> Restart Camera
      </button>
    </div>
  );
}
