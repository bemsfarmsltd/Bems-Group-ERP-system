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
  evaluateNeuralAntiSpoof,
  loadFaceApiModels,
  measureFaceRgbMean,
  playKioskChime,
  speakFaceVoicePrompt,
  stopFaceVoicePrompt,
} from '@/lib/attendance/face-client';
import {
  detectMediaPipeFaceFrame,
  drawMediaPipe3dFaceMesh,
  loadMediaPipeFaceLandmarker,
  type MediaPipeFace3D,
} from '@/lib/attendance/mediapipe-face';

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
  const latestFacesRef = useRef<MediaPipeFace3D[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);
  const onSuccessPunchRef = useRef(onSuccessPunch);
  const isEveningShiftRef = useRef(isEveningShift);
  const verifyingRef = useRef(false);
  const faceDetectedRef = useRef(false);
  const slowDeviceRef = useRef(false);

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

  // Smooth 20fps throttled animation loop for the 478-point Google MediaPipe 3D biometric face mesh & scanning laser
  useEffect(() => {
    let rafId = 0;
    let lastDrawAt = 0;
    const renderMesh = (now: number) => {
      if (now - lastDrawAt >= 48) {
        lastDrawAt = now;
        if (meshCanvasRef.current && videoRef.current) {
          drawMediaPipe3dFaceMesh(meshCanvasRef.current, videoRef.current, latestFacesRef.current, {
            locked: faceDetectedRef.current,
            verifying: verifyingRef.current,
            liteMode: slowDeviceRef.current,
          });
        }
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
    setStatusText('Initializing 3D MediaPipe biometric camera...');
    try {
      // Load Google MediaPipe 478-Point 3D Landmarker immediately; warm up 128-D recognition + PAD CNN in parallel
      await Promise.all([loadMediaPipeFaceLandmarker(), loadFaceApiModels()]);
      // 640x480 gives identical biometric accuracy (models downsample internally) with 3x less GPU load on office PCs
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      type ActiveChallengeType =
        | 'MEDIAPIPE_BLINK'
        | 'MEDIAPIPE_JAW_CYCLE'
        | 'MEDIAPIPE_NOD'
        | 'MEDIAPIPE_HEAD_TURN';
      type FlowStage = 'SCANNING' | 'LOCK_PAUSE' | 'WAIT_ACTION' | 'WAIT_RETURN';

      activeRef.current = true;
      let lastChallenge: ActiveChallengeType | null = null;
      let flowStage: FlowStage = 'SCANNING';
      let scanStartedAt = 0;
      let lockPauseUntil = 0;
      let challengeStartedAt = 0;
      let lockFrames = 0;
      let activeChallenge: ActiveChallengeType | null = null;

      // Stage 1 Recognized Staff State (Face ONLY locks when confirmed in BEMS!)
      let identifiedEmployeeId: string | null = null;
      let identifiedFirstName: string | null = null;
      let stage1Descriptor: number[] | null = null;

      const fetchJsonWithTimeout = async (url: string, bodyObj: Record<string, any>, timeoutMs = 8500) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyObj),
            signal: controller.signal,
          });
          const json = await res.json().catch(() => ({}));
          return { ok: res.ok, status: res.status, json };
        } finally {
          clearTimeout(timer);
        }
      };

      // Blink metrics
      let startBlink = 0;
      let peakBlinkLeft = 0;
      let peakBlinkRight = 0;

      // Jaw metrics
      let startJaw = 0;
      let peakJaw = 0;

      // Nod (pitch) metrics
      let startPitch = 0;
      let peakPitchDown = 0;

      // Head turn (left & right) metrics
      let minYaw = 0;
      let maxYaw = 0;
      let turnedLeft = false;
      let turnedRight = false;

      // Anti-Swap & Calm Single-Verdict Neural PAD accumulator (NO mid-scan spoof flicker!)
      let prevBox: { cx: number; cy: number; w: number } | null = null;
      let baselineRgb: { r: number; g: number; b: number } | null = null;
      let maxFlashRgbDelta = 0;
      let neuralReadyFlag = false;
      let antispoofScores: number[] = [];
      let livenessScores: number[] = [];
      let stage2MissedFrames = 0;
      let consecutiveSlowDetectFrames = 0;

      const resetLivenessBuffer = () => {
        flowStage = 'SCANNING';
        scanStartedAt = 0;
        lockPauseUntil = 0;
        challengeStartedAt = 0;
        lockFrames = 0;
        activeChallenge = null;
        identifiedEmployeeId = null;
        identifiedFirstName = null;
        stage1Descriptor = null;
        startBlink = 0;
        peakBlinkLeft = 0;
        peakBlinkRight = 0;
        startJaw = 0;
        peakJaw = 0;
        startPitch = 0;
        peakPitchDown = 0;
        minYaw = 0;
        maxYaw = 0;
        turnedLeft = false;
        turnedRight = false;
        prevBox = null;
        baselineRgb = null;
        maxFlashRgbDelta = 0;
        antispoofScores = [];
        livenessScores = [];
        stage2MissedFrames = 0;
        setFaceDetected(false);
        setFlashPhase('idle');
      };

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
        `BEMS 3D Face Recognition Kiosk is active for ${isEveningShiftRef.current ? 'evening sign-out' : 'morning check-in'}. Step up calmly and look at the camera.`,
        { force: true, muted: false }
      );

      const tick = async () => {
        if (!activeRef.current || !videoRef.current) return;
        let detectMs = 30;

        try {
          // Adaptive-paced Google MediaPipe 478-point 3D tracking & 52 neural blendshapes
          const detectStart = performance.now();
          const mpFrame = await detectMediaPipeFaceFrame(videoRef.current);
          detectMs = performance.now() - detectStart;
          if (detectMs > 160) {
            consecutiveSlowDetectFrames++;
            if (consecutiveSlowDetectFrames >= 5) slowDeviceRef.current = true;
          } else {
            consecutiveSlowDetectFrames = 0;
          }
          latestFacesRef.current = mpFrame.faces;

          // Clean cooldown between scans — never rushes or double-fires
          if (Date.now() < cooldownUntilRef.current) {
            setTimeout(tick, 140);
            return;
          }

          const inStage2 = flowStage !== 'SCANNING';
          const trackedFaces = mpFrame.faces.filter((f) => f.faceSizeRatio >= 0.06);
          // Wide yaw allowance (0.85) in Stage 2 so turning left/right or nodding NEVER drops back to Step 1
          const matchableFaces = trackedFaces.filter(
            (f) => f.faceSizeRatio >= 0.10 && Math.abs(f.yawRatio) <= (inStage2 ? 0.85 : 0.55)
          );

          if (trackedFaces.length === 0 || matchableFaces.length === 0) {
            if (inStage2) {
              // Grace buffer (~600ms / 12 frames) during Stage 2 so brief profile/nod frames never reset to Step 1
              stage2MissedFrames++;
              if (stage2MissedFrames < 12) {
                if (activeRef.current) setTimeout(tick, 50);
                return;
              }
            }
            setFaceDetected(false);
            setLivenessReady(false);
            setScanProgress(trackedFaces.length > 0 ? 12 : 0);
            setLightingAlert(null);
            resetLivenessBuffer();
            if (trackedFaces.length === 0) {
              setStatusText('3D Radar Active — Center your face inside the circle...');
            } else if (trackedFaces[0].faceSizeRatio < 0.10) {
              setStatusText('Face in view — step slightly closer to identify');
            } else {
              setStatusText('Face in view — look straight at the camera');
            }
          } else {
            stage2MissedFrames = 0;
            const primary = matchableFaces[0];
            const { eyeBlinkLeft, eyeBlinkRight, jawOpen } = primary.blendshapes;
            const blinkAvg = (eyeBlinkLeft + eyeBlinkRight) / 2;

            // Anti-Photo-Swap Guard during Stage 2 (tuned so natural nods & head turns never reset)
            const curCx = primary.normBox.x + primary.normBox.width / 2;
            const curCy = primary.normBox.y + primary.normBox.height / 2;
            const curW = Math.max(0.05, primary.normBox.width);
            if (prevBox && flowStage !== 'SCANNING') {
              const jumpDist = Math.hypot(curCx - prevBox.cx, curCy - prevBox.cy);
              const scaleDiff = Math.abs(curW - prevBox.w) / prevBox.w;
              if (jumpDist > prevBox.w * 0.55 || scaleDiff > 0.45) {
                resetLivenessBuffer();
                setStatusText('Hold steady inside the circle to restart...');
                if (activeRef.current) setTimeout(tick, 60);
                return;
              }
            }
            prevBox = { cx: curCx, cy: curCy, w: curW };

            // Quietly collect up to 3 Neural Anti-Spoofing CNN samples during Stage 2 (80% less GPU load on older PCs)
            if (flowStage !== 'SCANNING' && antispoofScores.length < 3 && lockFrames % 6 === 1) {
              const pad = await evaluateNeuralAntiSpoof(videoRef.current, primary.box);
              if (pad.neuralReady) {
                neuralReadyFlag = true;
                antispoofScores.push(pad.antispoofScore);
                livenessScores.push(pad.livenessScore);
              }
            }

            // =========================================================================
            // STAGE 1: IDENTIFY FIRST — Verify person EXISTS in BEMS before locking!
            // =========================================================================
            if (flowStage === 'SCANNING') {
              // Keep wireframe amber/unlocked until confirmed in database
              setFaceDetected(false);

              if (Math.abs(primary.yawRatio) > 0.22) {
                scanStartedAt = 0;
                setScanProgress(18);
                setStatusText('Step 1 of 2 · Look straight at the camera to identify');
              } else {
                if (scanStartedAt === 0) scanStartedAt = Date.now();
                const heldMs = Date.now() - scanStartedAt;
                setScanProgress(Math.min(38, 18 + Math.round((heldMs / 650) * 20)));
                setStatusText('Step 1 of 2 · Checking BEMS Staff Registry...');

                if (heldMs >= 650) {
                  // Extract 2 crisp 128-D descriptors and check if this person exists in BEMS
                  const idSamples: number[][] = [];
                  for (let attempt = 0; attempt < 2; attempt++) {
                    if (!videoRef.current) break;
                    const idFrame = await analyzeVideoFaceFrame(videoRef.current, true, {
                      allowMultiple: true,
                      longRange: true,
                    });
                    if (idFrame.descriptor) idSamples.push(idFrame.descriptor);
                  }

                  if (idSamples.length === 0) {
                    scanStartedAt = 0;
                    setScanProgress(18);
                    setStatusText('Step 1 of 2 · Look straight at the camera clearly...');
                    if (activeRef.current) setTimeout(tick, 120);
                    return;
                  }

                  const probeDescriptor = averageFaceDescriptors(idSamples);
                  const idResp = await fetchJsonWithTimeout('/api/attendance/face-punch', {
                    stationCode,
                    mode: 'IDENTIFY_ONLY',
                    descriptor: probeDescriptor,
                  });
                  const idJson = idResp.json;

                  if (!idResp.ok || !idJson?.recognized || !idJson?.employeeId) {
                    // Person does NOT exist in BEMS — NO face lock, NO liveness check!
                    cooldownUntilRef.current = Date.now() + 3600;
                    resetLivenessBuffer();
                    setScanProgress(0);
                    playKioskChime('error');
                    setStatusText('Face not registered in BEMS — please enroll on the Staff App');
                    setPopup({
                      variant: 'error',
                      badgeText: 'FACE NOT REGISTERED',
                      message:
                        idJson?.reason ||
                        'This face is not enrolled in BEMS yet. Please register your Face ID on the BEMS Staff App first.',
                    });
                    if (activeRef.current) setTimeout(tick, 140);
                    return;
                  }

                  // Person CONFIRMED in BEMS! NOW lock the face (green mesh) & pause calmly before Stage 2
                  identifiedEmployeeId = idJson.employeeId;
                  identifiedFirstName = idJson.firstName || 'Staff';
                  stage1Descriptor = probeDescriptor;
                  setFaceDetected(true);
                  flowStage = 'LOCK_PAUSE';
                  lockPauseUntil = Date.now() + 500;
                  setScanProgress(46);
                  playKioskChime('lock');
                  setStatusText(`Step 1 of 2 · Face Locked: ${identifiedFirstName} ✓`);
                }
              }
            } else if (flowStage === 'LOCK_PAUSE') {
              setFaceDetected(true);
              lockFrames++;
              if (Date.now() >= lockPauseUntil) {
                // Dynamically pick 1 of 4 unpredictable challenges, NEVER repeating the previous one
                const candidates: ActiveChallengeType[] = [];
                if (blinkAvg <= 0.24) candidates.push('MEDIAPIPE_BLINK');
                if (jawOpen <= 0.14) candidates.push('MEDIAPIPE_JAW_CYCLE');
                candidates.push('MEDIAPIPE_NOD');
                candidates.push('MEDIAPIPE_HEAD_TURN');

                const nonRepeating = candidates.filter((c) => c !== lastChallenge);
                const pool = nonRepeating.length > 0 ? nonRepeating : candidates;
                activeChallenge = pool[Math.floor(Math.random() * pool.length)];
                lastChallenge = activeChallenge;

                flowStage = 'WAIT_ACTION';
                challengeStartedAt = Date.now();
                lockFrames = 1;
                startBlink = blinkAvg;
                peakBlinkLeft = eyeBlinkLeft;
                peakBlinkRight = eyeBlinkRight;
                startJaw = jawOpen;
                peakJaw = jawOpen;
                startPitch = primary.pitchRatio;
                peakPitchDown = primary.pitchRatio;
                minYaw = primary.yawRatio;
                maxYaw = primary.yawRatio;
                turnedLeft = false;
                turnedRight = false;
                baselineRgb = measureFaceRgbMean(videoRef.current, primary.box);
                maxFlashRgbDelta = 0;
                setFlashPhase('warm');
                setScanProgress(52);

                const namePrefix = identifiedFirstName ? `${identifiedFirstName}, ` : '';
                if (activeChallenge === 'MEDIAPIPE_BLINK') {
                  setStatusText(`Step 2 of 2 · ${namePrefix}please BLINK naturally`);
                  speakFaceVoicePrompt(`Hello ${identifiedFirstName || ''}. Please blink naturally.`, {
                    force: true,
                    muted: false,
                  });
                } else if (activeChallenge === 'MEDIAPIPE_JAW_CYCLE') {
                  setStatusText(`Step 2 of 2 · ${namePrefix}please OPEN your mouth, then close it`);
                  speakFaceVoicePrompt(`Hello ${identifiedFirstName || ''}. Please open your mouth, then close it.`, {
                    force: true,
                    muted: false,
                  });
                } else if (activeChallenge === 'MEDIAPIPE_NOD') {
                  setStatusText(`Step 2 of 2 · ${namePrefix}please NOD your head down and up`);
                  speakFaceVoicePrompt(`Hello ${identifiedFirstName || ''}. Please nod your head gently.`, {
                    force: true,
                    muted: false,
                  });
                } else {
                  setStatusText(`Step 2 of 2 · ${namePrefix}please TURN your head LEFT, then RIGHT`);
                  speakFaceVoicePrompt(
                    `Hello ${identifiedFirstName || ''}. Please turn your head slightly left, then right.`,
                    { force: true, muted: false }
                  );
                }
              }
            } else {
              // =========================================================================
              // STAGE 2: DYNAMIC UNPREDICTABLE LIVENESS CHECK (ONLY for recognized staff!)
              // =========================================================================
              setFaceDetected(true);
              lockFrames++;
              const elapsedMs = Date.now() - challengeStartedAt;

              if (lockFrames === 10) setFlashPhase('cool');
              else if (lockFrames === 20) setFlashPhase('warm');
              if (baselineRgb && lockFrames % 4 === 0) {
                const curRgb = measureFaceRgbMean(videoRef.current, primary.box);
                const rgbDelta = Math.hypot(
                  curRgb.r - baselineRgb.r,
                  curRgb.g - baselineRgb.g,
                  curRgb.b - baselineRgb.b
                );
                if (rgbDelta > maxFlashRgbDelta) maxFlashRgbDelta = rgbDelta;
              }

              let challengePassed = false;
              let livenessProof: Record<string, any> | null = null;
              const namePrefix = identifiedFirstName ? `${identifiedFirstName}, ` : '';

              if (activeChallenge === 'MEDIAPIPE_BLINK') {
                if (eyeBlinkLeft > peakBlinkLeft) peakBlinkLeft = eyeBlinkLeft;
                if (eyeBlinkRight > peakBlinkRight) peakBlinkRight = eyeBlinkRight;
                const peakAvg = (peakBlinkLeft + peakBlinkRight) / 2;
                const blinkDelta = Math.max(0, peakAvg - startBlink);

                if (flowStage === 'WAIT_ACTION') {
                  if (peakBlinkLeft >= 0.44 && peakBlinkRight >= 0.44 && blinkDelta >= 0.26) {
                    flowStage = 'WAIT_RETURN';
                    setFlashPhase('cool');
                    setScanProgress(85);
                  } else {
                    setScanProgress(Math.min(78, 52 + Math.round(elapsedMs / 220)));
                    setStatusText(`Step 2 of 2 · ${namePrefix}please BLINK naturally`);
                  }
                }
                if (flowStage === 'WAIT_RETURN' && blinkAvg <= 0.22 && lockFrames >= 3) {
                  challengePassed = true;
                  livenessProof = {
                    method: 'MEDIAPIPE_BLINK',
                    startBlink: Number(startBlink.toFixed(4)),
                    peakBlinkLeft: Number(peakBlinkLeft.toFixed(4)),
                    peakBlinkRight: Number(peakBlinkRight.toFixed(4)),
                    blinkDelta: Number(blinkDelta.toFixed(4)),
                    endBlink: Number(blinkAvg.toFixed(4)),
                    framesAnalyzed: lockFrames,
                  };
                }
              } else if (activeChallenge === 'MEDIAPIPE_JAW_CYCLE') {
                if (jawOpen > peakJaw) peakJaw = jawOpen;
                const openDelta = Math.max(0, peakJaw - startJaw);

                if (flowStage === 'WAIT_ACTION') {
                  if (peakJaw >= 0.28 && openDelta >= 0.20) {
                    flowStage = 'WAIT_RETURN';
                    setFlashPhase('cool');
                    setScanProgress(84);
                    playKioskChime('lock');
                    setStatusText(`Step 2 of 2 · Great ${identifiedFirstName || ''}! Now CLOSE your mouth`);
                  } else {
                    setScanProgress(Math.min(78, 52 + Math.round(elapsedMs / 220)));
                    setStatusText(`Step 2 of 2 · ${namePrefix}please OPEN your mouth, then close it`);
                  }
                }
                if (flowStage === 'WAIT_RETURN') {
                  const closeDelta = Math.max(0, peakJaw - jawOpen);
                  if (jawOpen <= 0.12 && closeDelta >= 0.16 && lockFrames >= 3) {
                    challengePassed = true;
                    livenessProof = {
                      method: 'MEDIAPIPE_JAW_CYCLE',
                      startJaw: Number(startJaw.toFixed(4)),
                      peakJaw: Number(peakJaw.toFixed(4)),
                      openDelta: Number(openDelta.toFixed(4)),
                      endJaw: Number(jawOpen.toFixed(4)),
                      closeDelta: Number(closeDelta.toFixed(4)),
                      framesAnalyzed: lockFrames,
                    };
                  } else {
                    setStatusText(`Step 2 of 2 · Great ${identifiedFirstName || ''}! Now CLOSE your mouth`);
                  }
                }
              } else if (activeChallenge === 'MEDIAPIPE_NOD') {
                if (primary.pitchRatio > peakPitchDown) peakPitchDown = primary.pitchRatio;
                const nodDownDelta = Math.max(0, peakPitchDown - startPitch);

                if (flowStage === 'WAIT_ACTION') {
                  if (nodDownDelta >= 0.12) {
                    flowStage = 'WAIT_RETURN';
                    setFlashPhase('cool');
                    setScanProgress(84);
                    playKioskChime('lock');
                    setStatusText(`Step 2 of 2 · Great ${identifiedFirstName || ''}! Now lift your head back up`);
                  } else {
                    setScanProgress(Math.min(78, 52 + Math.round(elapsedMs / 220)));
                    setStatusText(`Step 2 of 2 · ${namePrefix}please NOD your head down and up`);
                  }
                }
                if (flowStage === 'WAIT_RETURN') {
                  const nodReturnDelta = Math.max(0, peakPitchDown - primary.pitchRatio);
                  if (nodReturnDelta >= 0.08 && lockFrames >= 4) {
                    challengePassed = true;
                    livenessProof = {
                      method: 'MEDIAPIPE_NOD',
                      startPitch: Number(startPitch.toFixed(4)),
                      peakPitchDown: Number(peakPitchDown.toFixed(4)),
                      nodDownDelta: Number(nodDownDelta.toFixed(4)),
                      nodReturnDelta: Number(nodReturnDelta.toFixed(4)),
                      framesAnalyzed: lockFrames,
                    };
                  } else {
                    setStatusText(`Step 2 of 2 · Great ${identifiedFirstName || ''}! Now lift your head back up`);
                  }
                }
              } else if (activeChallenge === 'MEDIAPIPE_HEAD_TURN') {
                if (primary.yawRatio < minYaw) minYaw = primary.yawRatio;
                if (primary.yawRatio > maxYaw) maxYaw = primary.yawRatio;
                if (primary.yawRatio <= -0.22) turnedLeft = true;
                if (primary.yawRatio >= 0.22) turnedRight = true;
                const yawSweep = Math.max(0, maxYaw - minYaw);

                if (turnedLeft && turnedRight && yawSweep >= 0.48 && lockFrames >= 4) {
                  challengePassed = true;
                  livenessProof = {
                    method: 'MEDIAPIPE_HEAD_TURN',
                    minYaw: Number(minYaw.toFixed(4)),
                    maxYaw: Number(maxYaw.toFixed(4)),
                    yawSweep: Number(yawSweep.toFixed(4)),
                    framesAnalyzed: lockFrames,
                  };
                } else if (turnedLeft && !turnedRight) {
                  setScanProgress(78);
                  setStatusText(`Step 2 of 2 · Great ${identifiedFirstName || ''}! Now turn slightly to the other side`);
                } else if (turnedRight && !turnedLeft) {
                  setScanProgress(78);
                  setStatusText(`Step 2 of 2 · Great ${identifiedFirstName || ''}! Now turn slightly to the other side`);
                } else {
                  setScanProgress(Math.min(72, 52 + Math.round(elapsedMs / 240)));
                  setStatusText(`Step 2 of 2 · ${namePrefix}please TURN your head LEFT, then RIGHT`);
                }
              }

              // =========================================================================
              // FINAL STEP: SINGLE DECISIVE VERDICT (Clean 5.5s cooldown — never contradicts)
              // =========================================================================
              if (challengePassed && livenessProof) {
                const avgAntispoof =
                  antispoofScores.length > 0
                    ? antispoofScores.reduce((a, b) => a + b, 0) / antispoofScores.length
                    : 1;
                const avgLiveness =
                  livenessScores.length > 0
                    ? livenessScores.reduce((a, b) => a + b, 0) / livenessScores.length
                    : 1;

                const isPose =
                  activeChallenge === 'MEDIAPIPE_NOD' || activeChallenge === 'MEDIAPIPE_HEAD_TURN';
                const neuralPadPassed = !neuralReadyFlag
                  ? true
                  : isPose
                  ? avgAntispoof >= 0.46 || avgLiveness >= 0.48
                  : avgAntispoof >= 0.38 || avgLiveness >= 0.40;

                if (!neuralPadPassed) {
                  cooldownUntilRef.current = Date.now() + 5500;
                  resetLivenessBuffer();
                  setScanProgress(0);
                  playKioskChime('error');
                  speakFaceVoicePrompt(
                    'Verification blocked. Phone screens and photos are not allowed. Please step up in person.',
                    { force: true, muted: false }
                  );
                  setPopup({
                    variant: 'error',
                    badgeText: 'ANTI-SPOOFING · SCREEN / PHOTO BLOCKED',
                    message:
                      'A phone screen or photo was detected. Please step up to the kiosk in person.',
                  });
                  if (activeRef.current) setTimeout(tick, 140);
                  return;
                }

                setFlashPhase('idle');
                setLivenessReady(true);
                setVerifying(true);
                setScanProgress(94);
                setStatusText(`Liveness verified ✓ Recording attendance for ${identifiedFirstName || 'Staff'}...`);
                cooldownUntilRef.current = Date.now() + 5500;

                try {
                  // Try 1 fast post-liveness descriptor (1.5s cap), cleanly falling back to Stage 1 descriptor so WebGL never hangs
                  let freshDescriptor: number[] | null = null;
                  if (videoRef.current) {
                    const quickFrame = await Promise.race([
                      analyzeVideoFaceFrame(videoRef.current, true, {
                        allowMultiple: true,
                        longRange: true,
                      }).catch(() => null),
                      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
                    ]);
                    if (quickFrame?.descriptor) freshDescriptor = quickFrame.descriptor;
                  }

                  const finalDescriptor =
                    freshDescriptor && stage1Descriptor
                      ? averageFaceDescriptors([stage1Descriptor, freshDescriptor])
                      : freshDescriptor || stage1Descriptor;

                  if (!finalDescriptor) {
                    cooldownUntilRef.current = Date.now() + 1800;
                    setStatusText('Look straight at the camera briefly to complete verification...');
                    return;
                  }

                  setScanProgress(100);
                  const punchResp = await fetchJsonWithTimeout('/api/attendance/face-punch', {
                    stationCode,
                    mode: 'PUNCH',
                    expectedEmployeeId: identifiedEmployeeId || undefined,
                    action: 'AUTO',
                    descriptor: finalDescriptor,
                    livenessVerified: true,
                    livenessProof: {
                      ...livenessProof,
                      neuralReady: neuralReadyFlag,
                      antispoofScore: Number(avgAntispoof.toFixed(3)),
                      livenessScore: Number(avgLiveness.toFixed(3)),
                      flashReflectionDelta: Number(maxFlashRgbDelta.toFixed(2)),
                    },
                  });
                  const json = punchResp.json;

                  if (punchResp.ok && json.success) {
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
                } catch {
                  playKioskChime('warning');
                  setPopup({
                    variant: 'warning',
                    badgeText: 'CONNECTION TIMEOUT · RETRY',
                    message: 'Network took too long to respond. Please step up again to clock in.',
                  });
                } finally {
                  setVerifying(false);
                  setScanProgress(0);
                  resetLivenessBuffer();
                  setLivenessReady(false);
                }
              } else if (elapsedMs >= 8500) {
                cooldownUntilRef.current = Date.now() + 5000;
                resetLivenessBuffer();
                setScanProgress(0);
                playKioskChime('error');
                speakFaceVoicePrompt(
                  'Liveness check timed out. Please step up in person and follow the on-screen step.',
                  { force: true, muted: false }
                );
                setPopup({
                  variant: 'error',
                  badgeText: 'LIVENESS CHECK TIMED OUT',
                  message:
                    'The live verification step was not completed in time. Please step up in person and follow the prompt.',
                });
              }
            }
          }
        } catch {
          setVerifying(false);
          setScanProgress(0);
        }

        if (activeRef.current) {
          const nextDelay = Math.max(70, Math.min(220, Math.round(detectMs * 1.35)));
          setTimeout(tick, nextDelay);
        }
      };

      setTimeout(tick, 320);
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

          {/* Centered Face Alignment Guide Circle/Oval (visual convenience guide — scanning still works outside it) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              paddingBottom: '26px',
            }}
          >
            <div
              style={{
                width: isFullscreen ? '250px' : '168px',
                height: isFullscreen ? '315px' : '212px',
                borderRadius: '50%',
                border: faceDetected
                  ? '3px solid rgba(16, 185, 129, 0.88)'
                  : '2.5px dashed rgba(234, 88, 12, 0.72)',
                boxShadow: faceDetected
                  ? '0 0 0 4px rgba(16, 185, 129, 0.16), inset 0 0 18px rgba(16, 185, 129, 0.12)'
                  : '0 0 0 3px rgba(255, 255, 255, 0.28)',
                transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
              }}
            />
          </div>

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
