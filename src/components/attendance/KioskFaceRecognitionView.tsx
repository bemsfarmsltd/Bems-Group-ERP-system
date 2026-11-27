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
  averageFaceDescriptors,
  draw3dBiometricFaceMesh,
  evaluateNeuralAntiSpoof,
  loadFaceApiModels,
  measureFaceRgbMean,
  playKioskChime,
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
  const [scanProgress, setScanProgress] = useState(0); // 0..100 live biometric lock progress
  const [lightingAlert, setLightingAlert] = useState<string | null>(null);
  const [flashPhase, setFlashPhase] = useState<'idle' | 'warm' | 'cool'>('idle');
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const [popup, setPopup] = useState<PopupModalState | null>(null);
  const [isEveningShift, setIsEveningShift] = useState(false);

  const isFullscreen = externalFullscreen || internalFullscreen;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meshCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestFrameRef = useRef<import('@/lib/attendance/face-client').LiveFaceFrameAnalysis | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);
  const onSuccessPunchRef = useRef(onSuccessPunch);
  const isEveningShiftRef = useRef(isEveningShift);
  const verifyingRef = useRef(false);
  const faceDetectedRef = useRef(false);

  useEffect(() => {
    verifyingRef.current = verifying;
  }, [verifying]);

  useEffect(() => {
    faceDetectedRef.current = faceDetected;
  }, [faceDetected]);

  // Keep camera stream attached seamlessly when toggling between card view and fullscreen view
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isFullscreen]);

  // Smooth 60fps animation loop for the 3D biometric face wireframe mesh & scanning laser
  useEffect(() => {
    let rafId = 0;
    const renderMesh = () => {
      if (meshCanvasRef.current && videoRef.current) {
        draw3dBiometricFaceMesh(meshCanvasRef.current, videoRef.current, latestFrameRef.current, {
          locked: faceDetectedRef.current,
          verifying: verifyingRef.current,
        });
      }
      rafId = requestAnimationFrame(renderMesh);
    };
    rafId = requestAnimationFrame(renderMesh);
    return () => cancelAnimationFrame(rafId);
  }, []);

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
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      type MouthCycleStage = 'IDLE' | 'WAIT_OPEN' | 'WAIT_CLOSE';

      activeRef.current = true;
      let capturedDescriptors: number[][] = [];
      let lockFrames = 0;
      let stage: MouthCycleStage = 'IDLE';
      let startMar: number | null = null;
      let peakMar = 0;
      let prevBox: { cx: number; cy: number; w: number } | null = null;
      let baselineRgb: { r: number; g: number; b: number } | null = null;
      let maxFlashRgbDelta = 0;
      let neuralReadyFlag = false;
      let antispoofScores: number[] = [];
      let livenessScores: number[] = [];
      let consecutiveSpoofFrames = 0;

      const resetLivenessBuffer = () => {
        capturedDescriptors = [];
        lockFrames = 0;
        stage = 'IDLE';
        startMar = null;
        peakMar = 0;
        prevBox = null;
        baselineRgb = null;
        maxFlashRgbDelta = 0;
        antispoofScores = [];
        livenessScores = [];
        consecutiveSpoofFrames = 0;
        setFlashPhase('idle');
      };

      // Auto-recover if the camera track stops unexpectedly
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (activeRef.current) {
            setStatusText('Camera interrupted — reconnecting automatically...');
            setTimeout(() => {
              if (activeRef.current) startScanner();
            }, 1800);
          }
        };
      });

      speakFaceVoicePrompt(
        `BEMS 3D Face Recognition Kiosk is active for ${isEveningShiftRef.current ? 'evening sign-out' : 'morning check-in'}. Look at the camera and follow the live prompt.`,
        { force: true, muted: false }
      );

      const tick = async () => {
        if (!activeRef.current || !videoRef.current) return;

        try {
          // Continuous 3D radar tracks all faces in view, while strictly enforcing 3-layer Bank-Style Anti-Spoofing
          const frame = await analyzeVideoFaceFrame(videoRef.current, true, {
            allowMultiple: true,
            longRange: true,
          });
          latestFrameRef.current = frame;

          if (Date.now() < cooldownUntilRef.current) {
            setTimeout(tick, 220);
            return;
          }

          const trackedFaces = (frame.allFaces || []).filter(
            (f) => f.descriptor && f.faceSizeRatio >= 0.05 && f.detectionScore >= 0.25
          );

          // High-clarity faces eligible for biometric identity + neural anti-spoofing + mouth-cycle challenge
          const matchableFaces = trackedFaces.filter(
            (f) => f.faceSizeRatio >= 0.11 && f.detectionScore >= 0.45 && Math.abs(f.yawRatio) <= 0.42
          );

          if (trackedFaces.length === 0) {
            setFaceDetected(false);
            setLivenessReady(false);
            setScanProgress(0);
            setLightingAlert(null);
            resetLivenessBuffer();
            setStatusText('3D Radar Active — Scanning room for live staff faces...');
          } else if (matchableFaces.length === 0) {
            setFaceDetected(true);
            setLivenessReady(false);
            setScanProgress(25);
            resetLivenessBuffer();
            const nearest = trackedFaces[0];
            if (nearest.faceSizeRatio < 0.11) {
              setStatusText('3D Face Tracked — step slightly closer to begin liveness check');
            } else {
              setStatusText('3D Face Tracked — look straight at the camera');
            }
          } else {
            const primary = matchableFaces[0];
            setFaceDetected(true);
            setLightingAlert(
              frame.faceBrightness < 44 ? 'Low lighting detected — auto-exposure boost active' : null
            );

            // Layer 1: Self-Hosted Neural Anti-Spoofing & Liveness CNN evaluation (catches phone screens & prints)
            const pad = await evaluateNeuralAntiSpoof(videoRef.current, primary.box);
            if (pad.neuralReady) {
              neuralReadyFlag = true;
              antispoofScores.push(pad.antispoofScore);
              livenessScores.push(pad.livenessScore);
              if (antispoofScores.length > 8) antispoofScores.shift();
              if (livenessScores.length > 8) livenessScores.shift();

              if (pad.antispoofScore < 0.34 && pad.livenessScore < 0.34) {
                consecutiveSpoofFrames++;
              } else {
                consecutiveSpoofFrames = 0;
              }

              // Immediate Neural Spoof Block if 3 consecutive frames are flagged as flat phone screen / photo
              if (consecutiveSpoofFrames >= 3) {
                cooldownUntilRef.current = Date.now() + 4200;
                resetLivenessBuffer();
                setScanProgress(0);
                playKioskChime('error');
                speakFaceVoicePrompt(
                  'Spoof detected. Phone screens and photos are strictly blocked. Please step up in person.',
                  { force: true, muted: false }
                );
                setPopup({
                  variant: 'error',
                  badgeText: 'NEURAL ANTI-SPOOF · SCREEN / PHOTO BLOCKED',
                  message:
                    'A phone screen or flat photo was detected by the neural anti-spoofing guard. Please step up to the kiosk in person.',
                });
                if (activeRef.current) setTimeout(tick, 220);
                return;
              }
            }

            // Anti-Photo-Swap Guard: detect sudden box jump or scale jump (swiping between two photos on a phone)
            const curCx = primary.normBox.x + primary.normBox.width / 2;
            const curCy = primary.normBox.y + primary.normBox.height / 2;
            const curW = Math.max(0.05, primary.normBox.width);
            if (prevBox && stage !== 'IDLE') {
              const jumpDist = Math.hypot(curCx - prevBox.cx, curCy - prevBox.cy);
              const scaleDiff = Math.abs(curW - prevBox.w) / prevBox.w;
              if (jumpDist > prevBox.w * 0.24 || scaleDiff > 0.26) {
                resetLivenessBuffer();
                setStatusText('Movement interrupted — hold steady and look straight at the camera');
                if (activeRef.current) setTimeout(tick, 180);
                return;
              }
            }
            prevBox = { cx: curCx, cy: curCy, w: curW };

            // Frame-to-frame 128-D identity stability check (only when looking straight)
            if (primary.descriptor && Math.abs(primary.yawRatio) <= 0.24) {
              if (capturedDescriptors.length > 0) {
                const prev = capturedDescriptors[capturedDescriptors.length - 1];
                let sumSq = 0;
                for (let i = 0; i < 128; i++) {
                  const diff = primary.descriptor[i] - prev[i];
                  sumSq += diff * diff;
                }
                if (Math.sqrt(sumSq) > 0.34) {
                  resetLivenessBuffer();
                }
              }
              capturedDescriptors.push(primary.descriptor);
              if (capturedDescriptors.length > 3) capturedDescriptors.shift();
            }

            // Layer 2 & 3: Non-Rigid Bidirectional Mouth Cycle (Closed -> Open -> Closed) + Active Screen-Flash Sensing
            if (stage === 'IDLE') {
              if (Math.abs(primary.yawRatio) > 0.20) {
                setScanProgress(35);
                setStatusText('Look straight at the camera to begin verification...');
              } else if (primary.mar > 0.23) {
                // Blocks pre-opened-mouth photos from ever starting the challenge!
                setScanProgress(38);
                setStatusText('Keep your mouth closed briefly, then follow the prompt...');
              } else {
                stage = 'WAIT_OPEN';
                startMar = primary.mar;
                peakMar = primary.mar;
                lockFrames = 1;
                baselineRgb = measureFaceRgbMean(videoRef.current, primary.box);
                maxFlashRgbDelta = 0;
                setFlashPhase('warm');
                setScanProgress(52);
                playKioskChime('lock');
                setStatusText('Liveness Check: Please OPEN YOUR MOUTH slightly, then close it');
                speakFaceVoicePrompt('Face locked. Please open your mouth, then close it to verify.', {
                  force: true,
                  muted: false,
                });
              }
            } else {
              lockFrames++;
              if (primary.mar > peakMar) peakMar = primary.mar;

              // Alternate subtle light-theme screen-flash ring (warm orange <-> cool sky) and measure skin RGB reflection
              if (lockFrames === 4) setFlashPhase('cool');
              else if (lockFrames === 8) setFlashPhase('warm');
              if (baselineRgb) {
                const curRgb = measureFaceRgbMean(videoRef.current, primary.box);
                const rgbDelta = Math.hypot(
                  curRgb.r - baselineRgb.r,
                  curRgb.g - baselineRgb.g,
                  curRgb.b - baselineRgb.b
                );
                if (rgbDelta > maxFlashRgbDelta) maxFlashRgbDelta = rgbDelta;
              }

              const openDelta = startMar !== null ? Math.max(0, peakMar - startMar) : 0;

              if (stage === 'WAIT_OPEN') {
                if (peakMar >= 0.35 && openDelta >= 0.14) {
                  stage = 'WAIT_CLOSE';
                  setFlashPhase('cool');
                  setScanProgress(82);
                  playKioskChime('lock');
                  setStatusText('Great! Now CLOSE YOUR MOUTH to complete verification');
                } else {
                  setScanProgress(Math.min(76, 52 + Math.round(lockFrames * 1.0)));
                  setStatusText('Liveness Check: Please OPEN YOUR MOUTH slightly, then close it');
                }
              }

              let challengePassed = false;
              let livenessProof: Record<string, any> | null = null;

              if (stage === 'WAIT_CLOSE') {
                const closeDelta = Math.max(0, peakMar - primary.mar);
                if (primary.mar <= 0.26 && closeDelta >= 0.10 && lockFrames >= 3) {
                  const avgAntispoof =
                    antispoofScores.length > 0
                      ? antispoofScores.reduce((a, b) => a + b, 0) / antispoofScores.length
                      : 1;
                  const avgLiveness =
                    livenessScores.length > 0
                      ? livenessScores.reduce((a, b) => a + b, 0) / livenessScores.length
                      : 1;

                  const neuralPadPassed = !neuralReadyFlag || avgAntispoof >= 0.42 || avgLiveness >= 0.45;
                  if (!neuralPadPassed) {
                    cooldownUntilRef.current = Date.now() + 4200;
                    resetLivenessBuffer();
                    setScanProgress(0);
                    playKioskChime('error');
                    speakFaceVoicePrompt(
                      'Neural anti-spoofing blocked this scan. Phone screens and video replays are not allowed.',
                      { force: true, muted: false }
                    );
                    setPopup({
                      variant: 'error',
                      badgeText: 'NEURAL ANTI-SPOOF · SCREEN REPLAY BLOCKED',
                      message:
                        'Our neural anti-spoofing model detected a screen or video replay. Please step up to the kiosk in person.',
                    });
                    if (activeRef.current) setTimeout(tick, 220);
                    return;
                  }

                  challengePassed = true;
                  livenessProof = {
                    method: 'CHALLENGE_MOUTH_CYCLE',
                    startMar: Number((startMar ?? 0).toFixed(4)),
                    peakMar: Number(peakMar.toFixed(4)),
                    openDelta: Number(openDelta.toFixed(4)),
                    endMar: Number(primary.mar.toFixed(4)),
                    closeDelta: Number(closeDelta.toFixed(4)),
                    neuralReady: neuralReadyFlag,
                    antispoofScore: Number(avgAntispoof.toFixed(3)),
                    livenessScore: Number(avgLiveness.toFixed(3)),
                    flashReflectionDelta: Number(maxFlashRgbDelta.toFixed(2)),
                    framesAnalyzed: lockFrames,
                  };
                } else {
                  setScanProgress(Math.min(92, 82 + Math.round(lockFrames * 0.4)));
                  setStatusText('Great! Now CLOSE YOUR MOUTH to complete verification');
                }
              }

              if (challengePassed && livenessProof && capturedDescriptors.length >= 1) {
                setFlashPhase('idle');
                setLivenessReady(true);
                setVerifying(true);
                setScanProgress(100);
                setStatusText('Live anti-spoof passed — matching 3D Face ID...');
                cooldownUntilRef.current = Date.now() + 4500;

                const fusedDescriptor = averageFaceDescriptors(capturedDescriptors);

                const res = await fetch('/api/attendance/face-punch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    stationCode,
                    action: 'AUTO',
                    descriptor: fusedDescriptor,
                    livenessVerified: true,
                    livenessProof,
                  }),
                });
                const json = await res.json();
                setVerifying(false);
                setScanProgress(0);
                resetLivenessBuffer();
                setLivenessReady(false);

                if (res.ok && json.success) {
                  const firstName = String(json.employeeName || 'Staff').split(' ')[0];
                  const isNoticeOnly = Boolean(json.alreadyCheckedIn || json.alreadyCheckedOut);
                  playKioskChime(isNoticeOnly ? 'warning' : 'success');
                  const spoken = json.alreadyCheckedIn
                    ? `Hello ${firstName}, you are already clocked in for today at ${json.timeStr}.`
                    : json.alreadyCheckedOut
                    ? `Hello ${firstName}, you already signed out today at ${json.timeStr}.`
                    : json.action === 'CHECK_OUT'
                    ? `Goodbye ${firstName}! Signed out at ${json.timeStr}. Have a wonderful evening.`
                    : json.status === 'LATE'
                    ? `Welcome ${firstName}! Clocked in late at ${json.timeStr}.`
                    : `Welcome ${firstName}! Clocked in on time at ${json.timeStr}. Have a productive day.`;

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
                  playKioskChime(isRecognizedWindowLock ? 'warning' : 'error');
                  speakFaceVoicePrompt(
                    json?.error || 'Face not recognized. Please ensure your Face ID is registered.',
                    { force: true, muted: false }
                  );
                  setPopup({
                    variant: isRecognizedWindowLock ? 'warning' : 'error',
                    badgeText: json?.spoofBlocked
                      ? 'ANTI-SPOOFING BLOCKED'
                      : isRecognizedWindowLock
                      ? 'TIME WINDOW LOCKED'
                      : 'BIOMETRIC MATCH NOT FOUND',
                    employeeName: json?.employeeName || null,
                    employeeNumber: json?.employeeNumber || null,
                    confidence: json?.confidencePercent,
                    message:
                      json?.error ||
                      'Could not verify Face ID. Ensure your Face ID is registered on the Staff Portal and look toward the kiosk camera.',
                  });
                }
              } else if (lockFrames >= 38) {
                // Failed to complete Closed -> Open -> Closed cycle within ~7 seconds (photo / phone screen!)
                cooldownUntilRef.current = Date.now() + 4200;
                resetLivenessBuffer();
                setScanProgress(0);
                playKioskChime('error');
                speakFaceVoicePrompt(
                  'Liveness check failed. Photos and phone screens are blocked. Please step up in person, open your mouth, and close it.',
                  { force: true, muted: false }
                );
                setPopup({
                  variant: 'error',
                  badgeText: 'SPOOF BLOCKED · LIVENESS CHECK FAILED',
                  message:
                    'The live open-and-close mouth check was not completed. Photos and phone screens are strictly blocked. Please step up in person.',
                });
              }
            }
          }
        } catch {
          setVerifying(false);
          setScanProgress(0);
        }

        if (activeRef.current) {
          setTimeout(tick, 180);
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
        maxWidth: isFullscreen ? '860px' : '100%',
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
          <ShieldCheck size={13} /> Neural Anti-Spoof Active
        </span>
      </div>

      {/* Biometric Camera Viewfinder with Corner Reticle Brackets & Active Screen-Flash Illumination Ring */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: isFullscreen ? 'min(820px, 76vh * 1.32)' : '370px',
          aspectRatio: isFullscreen ? '16 / 10.5' : '4 / 3.2',
          maxHeight: isFullscreen ? '64vh' : undefined,
          padding: '10px',
          borderRadius: '26px',
          background:
            flashPhase === 'warm'
              ? 'rgba(251, 146, 60, 0.22)'
              : flashPhase === 'cool'
              ? 'rgba(56, 189, 248, 0.22)'
              : 'transparent',
          boxShadow:
            flashPhase === 'warm'
              ? '0 0 0 4px rgba(234, 88, 12, 0.28), 0 0 38px rgba(251, 146, 60, 0.35)'
              : flashPhase === 'cool'
              ? '0 0 0 4px rgba(14, 165, 233, 0.28), 0 0 38px rgba(56, 189, 248, 0.35)'
              : 'none',
          transition: 'background 0.22s ease, box-shadow 0.22s ease',
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

          {/* Live 3D Biometric Wireframe Face Mesh & Laser Scan Overlay */}
          <canvas
            ref={meshCanvasRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
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
            <span>{faceDetected ? '3D FACE LOCKED · VERIFYING' : '3D WALK-BY RADAR ACTIVE'}</span>
          </div>

          {/* Overlaid Bottom Glass Instruction Bar + Smart Progress Meter */}
          <div
            style={{
              position: 'absolute',
              left: '14px',
              right: '14px',
              bottom: '14px',
              padding: '10px 16px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${faceDetected ? '#a7f3d0' : '#fed7aa'}`,
              color: faceDetected ? '#065f46' : '#9a3412',
              fontSize: isFullscreen ? '15.5px' : '12px',
              fontWeight: 800,
              textAlign: 'center',
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
            }}
          >
            <div>{verifying ? 'Matching multi-frame Face ID...' : statusText}</div>
            {lightingAlert && !verifying && (
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#b45309', marginTop: '3px' }}>
                {lightingAlert}
              </div>
            )}
            {scanProgress > 0 && (
              <div
                style={{
                  marginTop: '7px',
                  width: '100%',
                  height: '5px',
                  borderRadius: '999px',
                  background: '#e2e8f0',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${scanProgress}%`,
                    height: '100%',
                    borderRadius: '999px',
                    background: scanProgress >= 90 ? '#10b981' : '#ea580c',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            )}
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
          justifyContent: 'flex-start',
          padding: '18px 28px 22px',
          gap: '16px',
          overflowY: 'auto',
        }}
      >
        {/* Top Header in Fullscreen (in-flow so it NEVER overlaps the camera card) */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '12px 20px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
            flexShrink: 0,
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
            padding: '22px 28px',
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.07)',
            width: '100%',
            maxWidth: '940px',
            margin: 'auto 0',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return content;
}
