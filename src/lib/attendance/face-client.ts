'use client';

/**
 * Browser-side Face Detection, 68-Point Landmark Liveness (Blink & Head Yaw),
 * and 128-d Face Embedding Extractor using self-hosted `/models/face/`.
 */

declare global {
  interface Window {
    faceapi?: any;
  }
}

let loadPromise: Promise<any> | null = null;

export async function loadFaceApiModels(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('Face recognition models can only load in the browser.');
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (!window.faceapi) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-bems-face-api="true"]') as HTMLScriptElement | null;
        if (existing && window.faceapi) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = '/models/face/face-api.min.js';
        script.async = true;
        script.dataset.bemsFaceApi = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load BEMS face recognition engine.'));
        document.head.appendChild(script);
      });
    }

    const faceapi = window.faceapi;
    if (!faceapi) {
      throw new Error('Face recognition engine unavailable.');
    }

    const modelPath = '/models/face';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
    ]);

    return faceapi;
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

export interface LiveFaceFrameAnalysis {
  detected: boolean;
  multipleFaces: boolean;
  descriptor: number[] | null;
  ear: number; // Eye Aspect Ratio (blink when drops below ~0.21 after being > 0.25)
  yawRatio: number; // Negative = turned left, 0 = straight, Positive = turned right (in mirrored selfie view)
  faceSizeRatio: number;
  centerOffsetX: number; // -0.5..+0.5 relative to video center (in raw video coords)
  centerOffsetY: number; // -0.5..+0.5 relative to video center
  faceBrightness: number; // 0..255 average luminance on the face box
  detectionScore: number; // 0..1 detector confidence
  box?: { x: number; y: number; width: number; height: number };
}

let lumaCanvas: HTMLCanvasElement | null = null;
function measureBoxBrightness(
  videoEl: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number }
): number {
  try {
    if (!lumaCanvas) {
      lumaCanvas = document.createElement('canvas');
      lumaCanvas.width = 32;
      lumaCanvas.height = 32;
    }
    const ctx = lumaCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 128;
    const sx = Math.max(0, Math.floor(box.x));
    const sy = Math.max(0, Math.floor(box.y));
    const sw = Math.max(8, Math.min(videoEl.videoWidth - sx, Math.floor(box.width)));
    const sh = Math.max(8, Math.min(videoEl.videoHeight - sy, Math.floor(box.height)));
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    const pixels = 32 * 32;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return Math.round(sum / pixels);
  } catch {
    return 128;
  }
}

/**
 * Computes the element-wise mean (centroid) of multiple 128-d face embeddings
 * to cancel out single-frame motion blur and lighting variance.
 */
export function averageFaceDescriptors(samples: number[][]): number[] {
  if (!samples || samples.length === 0) return [];
  if (samples.length === 1) return samples[0];
  const dim = samples[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const s of samples) {
    for (let i = 0; i < dim; i++) {
      out[i] += s[i];
    }
  }
  const n = samples.length;
  return out.map((v) => Number((v / n).toFixed(6)));
}

/**
 * Plays a crisp, unobtrusive Web Audio API chime for kiosk biometric feedback.
 */
export function playKioskChime(kind: 'lock' | 'success' | 'warning' | 'error'): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const tone = (freq: number, startOffset: number, duration: number, gainPeak = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'error' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    if (kind === 'lock') {
      tone(660, 0, 0.09, 0.05);
    } else if (kind === 'success') {
      tone(587.33, 0, 0.12, 0.09); // D5
      tone(880, 0.11, 0.22, 0.1); // A5
    } else if (kind === 'warning') {
      tone(440, 0, 0.14, 0.08);
      tone(392, 0.15, 0.18, 0.08);
    } else {
      tone(310, 0, 0.16, 0.09);
      tone(245, 0.17, 0.24, 0.09);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 650);
  } catch {
    // ignore Web Audio restrictions
  }
}

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function computeEyeAspectRatio(eye: Array<{ x: number; y: number }>): number {
  if (!eye || eye.length < 6) return 0.3;
  const v1 = dist2D(eye[1], eye[5]);
  const v2 = dist2D(eye[2], eye[4]);
  const h = dist2D(eye[0], eye[3]);
  if (h <= 0.001) return 0.3;
  return (v1 + v2) / (2.0 * h);
}

let boostCanvas: HTMLCanvasElement | null = null;
function buildExposureBoostedCanvas(videoEl: HTMLVideoElement): HTMLCanvasElement | null {
  try {
    const w = Math.min(480, videoEl.videoWidth || 480);
    const h = Math.round((w * (videoEl.videoHeight || 360)) / Math.max(1, videoEl.videoWidth || 480));
    if (!boostCanvas) boostCanvas = document.createElement('canvas');
    if (boostCanvas.width !== w || boostCanvas.height !== h) {
      boostCanvas.width = w;
      boostCanvas.height = h;
    }
    const ctx = boostCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.filter = 'brightness(1.45) contrast(1.18)';
    ctx.drawImage(videoEl, 0, 0, w, h);
    ctx.filter = 'none';
    return boostCanvas;
  } catch {
    return null;
  }
}

/**
 * Analyzes a single video frame for a single clear face, computes 68-point liveness metrics
 * (EAR for blink detection + nose-to-jaw yaw ratio for head turn), and extracts the 128-d embedding.
 */
export async function analyzeVideoFaceFrame(
  videoEl: HTMLVideoElement,
  includeDescriptor = true
): Promise<LiveFaceFrameAnalysis> {
  const faceapi = await loadFaceApiModels();
  if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    return {
      detected: false,
      multipleFaces: false,
      descriptor: null,
      ear: 0.3,
      yawRatio: 0,
      faceSizeRatio: 0,
      centerOffsetX: 0,
      centerOffsetY: 0,
      faceBrightness: 128,
      detectionScore: 0,
    };
  }

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.32,
  });

  if (includeDescriptor) {
    let sourceEl: HTMLVideoElement | HTMLCanvasElement = videoEl;
    let sourceWidth = Math.max(1, videoEl.videoWidth);
    let sourceHeight = Math.max(1, videoEl.videoHeight);

    let detections = await faceapi
      .detectAllFaces(videoEl, options)
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    // Smart Backlight / Low-Light Recovery: if raw video fails to detect a face, retry on an exposure-boosted frame
    if (!detections || detections.length === 0) {
      const boosted = buildExposureBoostedCanvas(videoEl);
      if (boosted) {
        detections = await faceapi
          .detectAllFaces(boosted, options)
          .withFaceLandmarks(true)
          .withFaceDescriptors();
        if (detections && detections.length > 0) {
          sourceEl = boosted;
          sourceWidth = boosted.width;
          sourceHeight = boosted.height;
        }
      }
    }

    if (!detections || detections.length === 0) {
      return {
        detected: false,
        multipleFaces: false,
        descriptor: null,
        ear: 0.3,
        yawRatio: 0,
        faceSizeRatio: 0,
        centerOffsetX: 0,
        centerOffsetY: 0,
        faceBrightness: 128,
        detectionScore: 0,
      };
    }

    if (detections.length > 1) {
      return {
        detected: false,
        multipleFaces: true,
        descriptor: null,
        ear: 0.3,
        yawRatio: 0,
        faceSizeRatio: 0,
        centerOffsetX: 0,
        centerOffsetY: 0,
        faceBrightness: 128,
        detectionScore: 0,
      };
    }

    const det = detections[0];
    const landmarks = det.landmarks;
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();
    const jaw = landmarks.getJawOutline();

    const ear = (computeEyeAspectRatio(leftEye) + computeEyeAspectRatio(rightEye)) / 2;

    // Yaw ratio: compare nose tip (index 3) horizontal position between left jaw (0) and right jaw (16)
    const noseTip = nose[3] || nose[0];
    const leftJaw = jaw[0];
    const rightJaw = jaw[16];
    let yawRatio = 0;
    if (noseTip && leftJaw && rightJaw) {
      const faceWidth = Math.max(1, dist2D(leftJaw, rightJaw));
      const midX = (leftJaw.x + rightJaw.x) / 2;
      yawRatio = (noseTip.x - midX) / (faceWidth / 2);
    }

    const box = det.detection.box;
    const vw = sourceWidth;
    const vh = sourceHeight;
    const faceSizeRatio = box.width / vw;
    const centerOffsetX = (box.x + box.width / 2 - vw / 2) / vw;
    const centerOffsetY = (box.y + box.height / 2 - vh / 2) / vh;
    const scaleX = videoEl.videoWidth / vw;
    const scaleY = videoEl.videoHeight / vh;
    const faceBrightness = measureBoxBrightness(videoEl, {
      x: box.x * scaleX,
      y: box.y * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    });
    const detectionScore = Number(det.detection.score || 0);
    const descriptor = det.descriptor ? Array.from(det.descriptor as Float32Array).map((n) => Number(n.toFixed(6))) : null;

    return {
      detected: true,
      multipleFaces: false,
      descriptor,
      ear,
      yawRatio,
      faceSizeRatio,
      centerOffsetX,
      centerOffsetY,
      faceBrightness,
      detectionScore,
      box: { x: box.x * scaleX, y: box.y * scaleY, width: box.width * scaleX, height: box.height * scaleY },
    };
  } else {
    const detections = await faceapi.detectAllFaces(videoEl, options).withFaceLandmarks(true);
    if (!detections || detections.length !== 1) {
      return {
        detected: false,
        multipleFaces: Boolean(detections && detections.length > 1),
        descriptor: null,
        ear: 0.3,
        yawRatio: 0,
        faceSizeRatio: 0,
        centerOffsetX: 0,
        centerOffsetY: 0,
        faceBrightness: 128,
        detectionScore: 0,
      };
    }
    const det = detections[0];
    const landmarks = det.landmarks;
    const ear =
      (computeEyeAspectRatio(landmarks.getLeftEye()) + computeEyeAspectRatio(landmarks.getRightEye())) / 2;
    const nose = landmarks.getNose();
    const jaw = landmarks.getJawOutline();
    const noseTip = nose[3] || nose[0];
    const leftJaw = jaw[0];
    const rightJaw = jaw[16];
    let yawRatio = 0;
    if (noseTip && leftJaw && rightJaw) {
      const faceWidth = Math.max(1, dist2D(leftJaw, rightJaw));
      const midX = (leftJaw.x + rightJaw.x) / 2;
      yawRatio = (noseTip.x - midX) / (faceWidth / 2);
    }
    const box = det.detection.box;
    const vw = Math.max(1, videoEl.videoWidth);
    const vh = Math.max(1, videoEl.videoHeight);
    return {
      detected: true,
      multipleFaces: false,
      descriptor: null,
      ear,
      yawRatio,
      faceSizeRatio: box.width / vw,
      centerOffsetX: (box.x + box.width / 2 - vw / 2) / vw,
      centerOffsetY: (box.y + box.height / 2 - vh / 2) / vh,
      faceBrightness: measureBoxBrightness(videoEl, box),
      detectionScore: Number(det.detection.score || 0),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  }
}

/**
 * Captures a compact compressed JPEG thumbnail (240x240) from the video element for HR visual verification.
 */
export function captureFaceThumbnailDataUrl(videoEl: HTMLVideoElement): string | null {
  try {
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return null;
    const canvas = document.createElement('canvas');
    const size = 240;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const minDim = Math.min(videoEl.videoWidth, videoEl.videoHeight);
    const sx = (videoEl.videoWidth - minDim) / 2;
    const sy = (videoEl.videoHeight - minDim) / 2;
    ctx.drawImage(videoEl, sx, sy, minDim, minDim, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

let lastSpokenText = '';
let lastSpokenAt = 0;

/**
 * Smart Web Speech API voice coach for Face ID enrollment & Kiosk recognition.
 * Automatically debounces repeated prompts and selects a clear natural English voice.
 */
export function speakFaceVoicePrompt(
  text: string,
  options?: { force?: boolean; muted?: boolean; minIntervalMs?: number }
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (options?.muted) return;

  const clean = text.trim();
  if (!clean) return;

  const now = Date.now();
  const minInterval = options?.minIntervalMs ?? 3500;
  if (!options?.force && clean === lastSpokenText && now - lastSpokenAt < minInterval) {
    return;
  }
  if (!options?.force && now - lastSpokenAt < 1600) {
    return;
  }

  try {
    lastSpokenText = clean;
    lastSpokenAt = now;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /en-(NG|GB|US)/i.test(v.lang) && /natural|google|samantha|daniel|karen|serena/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang));
    if (preferred) {
      utterance.voice = preferred;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore speech synthesis restrictions
  }
}

export function stopFaceVoicePrompt(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {}
}

export interface StoredStaffAppUser {
  id?: string;
  name?: string;
  employeeNumber?: string;
  email?: string;
  token?: string;
}

/**
 * Reads the Flutter Staff Web App session (`flutter.bems_staff_user` in localStorage)
 * so `/attendance/face-enroll` always authenticates as the Staff App user rather than
 * an older admin dashboard cookie in the same mobile browser.
 */
export function getStoredStaffAppSession(): {
  headers: Record<string, string>;
  user: StoredStaffAppUser | null;
} {
  if (typeof window === 'undefined') {
    return { headers: {}, user: null };
  }
  try {
    const raw =
      window.localStorage.getItem('flutter.bems_staff_user') ||
      window.localStorage.getItem('bems_staff_user');
    if (!raw) return { headers: {}, user: null };
    let parsed: any = JSON.parse(raw);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (!parsed || typeof parsed !== 'object') {
      return { headers: {}, user: null };
    }
    const token = typeof parsed.token === 'string' ? parsed.token.trim() : '';
    const user: StoredStaffAppUser = {
      id: parsed.id || undefined,
      name: parsed.fullName || parsed.legalName || parsed.name || undefined,
      employeeNumber: parsed.employeeNumber || undefined,
      email: parsed.email || parsed.workEmail || undefined,
      token: token || undefined,
    };
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return { headers, user };
  } catch {
    return { headers: {}, user: null };
  }
}


