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
let antispoofModel: any = null;
let livenessModel: any = null;
let neuralPadModelsLoaded = false;

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

    // Explicitly initialize TensorFlow.js backend (webgl -> cpu fallback) and await tf.ready()
    // Prevents "The highest priority backend 'wasm' has not yet been initialized" on Windows/HP laptops
    if (faceapi.tf) {
      const candidates = ['webgl', 'cpu'];
      let backendReady = false;
      for (const backend of candidates) {
        try {
          if (typeof faceapi.tf.setBackend === 'function') {
            const ok = await faceapi.tf.setBackend(backend);
            if (ok !== false) {
              await faceapi.tf.ready();
              backendReady = true;
              break;
            }
          }
        } catch {
          // try next backend
        }
      }
      if (!backendReady && typeof faceapi.tf.ready === 'function') {
        await faceapi.tf.ready();
      }
    }

    const modelPath = '/models/face';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
    ]);

    // Load self-hosted Neural Anti-Spoofing & Liveness GraphModels (PAD CNNs)
    if (faceapi.tf && typeof faceapi.tf.loadGraphModel === 'function' && !neuralPadModelsLoaded) {
      try {
        const [asModel, lvModel] = await Promise.all([
          faceapi.tf.loadGraphModel(`${modelPath}/antispoof.json`),
          faceapi.tf.loadGraphModel(`${modelPath}/liveness.json`),
        ]);
        antispoofModel = asModel;
        livenessModel = lvModel;
        neuralPadModelsLoaded = true;
      } catch {
        // Non-fatal fallback: non-rigid mouth cycle & anti-swap still enforce strict liveness
        neuralPadModelsLoaded = false;
      }
    }

    return faceapi;
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

export interface DetectedFace3D {
  descriptor: number[] | null;
  ear: number;
  mar: number; // Mouth Aspect Ratio (changes on slight smile/speak; completely static on photos)
  eyeSymmetry: number; // LeftEyeWidth / RightEyeWidth (shifts on true 3D head rotation; flat on 2D photos)
  yawRatio: number;
  faceSizeRatio: number;
  detectionScore: number;
  box: { x: number; y: number; width: number; height: number };
  normBox: { x: number; y: number; width: number; height: number };
  normLandmarks: Array<{ x: number; y: number }>;
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
  /** Normalized 0..1 box & 68-point facial landmarks for live 3D biometric wireframe rendering */
  normBox?: { x: number; y: number; width: number; height: number };
  normLandmarks?: Array<{ x: number; y: number }>;
  /** All simultaneously detected faces (sorted largest/closest first) for multi-person walk-by 3D tracking */
  allFaces?: DetectedFace3D[];
}

let lumaCanvas: HTMLCanvasElement | null = null;
let padCropCanvas: HTMLCanvasElement | null = null;

export interface NeuralPadResult {
  neuralReady: boolean;
  antispoofScore: number; // 0..1 (higher = real human skin/depth; lower = phone screen / flat photo)
  livenessScore: number;  // 0..1 (higher = live face)
}

/**
 * Runs the self-hosted Neural Anti-Spoofing (128x128) and Liveness (32x32) CNN GraphModels
 * on the cropped face region (with 15% border margin to catch phone bezels & screen edges).
 */
export async function evaluateNeuralAntiSpoof(
  videoEl: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number }
): Promise<NeuralPadResult> {
  const tf = window.faceapi?.tf;
  if (!neuralPadModelsLoaded || !antispoofModel || !livenessModel || !tf) {
    return { neuralReady: false, antispoofScore: 1, livenessScore: 1 };
  }
  try {
    if (!padCropCanvas) {
      padCropCanvas = document.createElement('canvas');
      padCropCanvas.width = 128;
      padCropCanvas.height = 128;
    }
    const ctx = padCropCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { neuralReady: false, antispoofScore: 1, livenessScore: 1 };

    const padX = box.width * 0.15;
    const padY = box.height * 0.15;
    const sx = Math.max(0, Math.floor(box.x - padX));
    const sy = Math.max(0, Math.floor(box.y - padY));
    const sw = Math.max(16, Math.min(videoEl.videoWidth - sx, Math.floor(box.width + padX * 2)));
    const sh = Math.max(16, Math.min(videoEl.videoHeight - sy, Math.floor(box.height + padY * 2)));

    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, 128, 128);

    const pixels = tf.browser.fromPixels(padCropCanvas);
    const input128 = pixels.toFloat().expandDims(0);
    const input32 = tf.image.resizeBilinear(input128, [32, 32], false);

    let antispoofScore = 0.5;
    let livenessScore = 0.5;
    let asOut: any = null;
    let lvOut: any = null;
    try {
      asOut = antispoofModel.execute(input128);
      lvOut = livenessModel.execute(input32);
      const asData = await asOut.data();
      const lvData = await lvOut.data();
      antispoofScore = Math.max(0, Math.min(1, Number(asData?.[0] ?? 0.5)));
      livenessScore = Math.max(0, Math.min(1, Number(lvData?.[0] ?? 0.5)));
    } finally {
      tf.dispose([pixels, input128, input32, asOut, lvOut].filter(Boolean));
    }

    return {
      neuralReady: true,
      antispoofScore: Number(antispoofScore.toFixed(3)),
      livenessScore: Number(livenessScore.toFixed(3)),
    };
  } catch {
    return { neuralReady: false, antispoofScore: 1, livenessScore: 1 };
  }
}

/**
 * Measures mean RGB channel intensity on the face box for Active Screen-Flash Reflection sensing.
 */
export function measureFaceRgbMean(
  videoEl: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number }
): { r: number; g: number; b: number } {
  try {
    if (!lumaCanvas) {
      lumaCanvas = document.createElement('canvas');
      lumaCanvas.width = 32;
      lumaCanvas.height = 32;
    }
    const ctx = lumaCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { r: 128, g: 128, b: 128 };
    const sx = Math.max(0, Math.floor(box.x));
    const sy = Math.max(0, Math.floor(box.y));
    const sw = Math.max(8, Math.min(videoEl.videoWidth - sx, Math.floor(box.width)));
    const sh = Math.max(8, Math.min(videoEl.videoHeight - sy, Math.floor(box.height)));
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const pixels = 32 * 32;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return {
      r: Number((r / pixels).toFixed(2)),
      g: Number((g / pixels).toFixed(2)),
      b: Number((b / pixels).toFixed(2)),
    };
  } catch {
    return { r: 128, g: 128, b: 128 };
  }
}

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

function computeMouthAspectRatio(mouth: Array<{ x: number; y: number }>): number {
  if (!mouth || mouth.length < 12) return 0.15;
  // Outer mouth: left corner 0, right corner 6; top 3, bottom 9
  const v = dist2D(mouth[3], mouth[9]);
  const h = dist2D(mouth[0], mouth[6]);
  if (h <= 0.001) return 0.15;
  return v / h;
}

function computeEyeWidthSymmetry(
  leftEye: Array<{ x: number; y: number }>,
  rightEye: Array<{ x: number; y: number }>
): number {
  if (!leftEye || leftEye.length < 4 || !rightEye || rightEye.length < 4) return 1;
  const lw = dist2D(leftEye[0], leftEye[3]);
  const rw = dist2D(rightEye[0], rightEye[3]);
  if (rw <= 0.001) return 1;
  return lw / rw;
}

let boostCanvas: HTMLCanvasElement | null = null;
const GAMMA_LUT = new Uint8ClampedArray(256);
for (let i = 0; i < 256; i++) {
  // Fast gamma lift (gamma = 0.58) that brightens shadowed faces in strong backlight across ALL browsers (including Safari)
  GAMMA_LUT[i] = Math.min(255, Math.round(Math.pow(i / 255, 0.58) * 255));
}

function buildExposureBoostedCanvas(videoEl: HTMLVideoElement): HTMLCanvasElement | null {
  try {
    const w = Math.min(360, videoEl.videoWidth || 360);
    const h = Math.round((w * (videoEl.videoHeight || 270)) / Math.max(1, videoEl.videoWidth || 360));
    if (!boostCanvas) boostCanvas = document.createElement('canvas');
    if (boostCanvas.width !== w || boostCanvas.height !== h) {
      boostCanvas.width = w;
      boostCanvas.height = h;
    }
    const ctx = boostCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = GAMMA_LUT[d[i]];
      d[i + 1] = GAMMA_LUT[d[i + 1]];
      d[i + 2] = GAMMA_LUT[d[i + 2]];
    }
    ctx.putImageData(img, 0, 0);
    return boostCanvas;
  } catch {
    return null;
  }
}

/**
 * Triangulated 3D biometric wireframe mesh edges connecting the 68-point facial landmarks
 * (jawline, cheekbones, forehead, eye sockets, nose bridge, and mouth).
 */
const BIOMETRIC_MESH_TRIANGLES: Array<[number, number, number]> = [
  // Left cheek & jaw lattice
  [0, 1, 36], [1, 2, 31], [1, 36, 31], [2, 3, 48], [2, 31, 48],
  [3, 4, 48], [4, 5, 48], [5, 6, 59], [5, 48, 59], [6, 7, 58], [6, 59, 58], [7, 8, 57], [7, 58, 57],
  // Right cheek & jaw lattice
  [16, 15, 45], [15, 14, 35], [15, 45, 35], [14, 13, 54], [14, 35, 54],
  [13, 12, 54], [12, 11, 54], [11, 10, 55], [11, 54, 55], [10, 9, 56], [10, 55, 56], [9, 8, 57], [9, 56, 57],
  // Eyebrow to eye & nose bridge 3D facets
  [17, 18, 36], [18, 19, 37], [18, 36, 37], [19, 20, 38], [19, 37, 38], [20, 21, 39], [20, 38, 39],
  [21, 27, 39], [21, 22, 27], [22, 23, 42], [22, 27, 42], [23, 24, 43], [23, 42, 43],
  [24, 25, 44], [24, 43, 44], [25, 26, 45], [25, 44, 45],
  // Mid-face cheekbones & nose 3D facets
  [36, 41, 31], [41, 40, 31], [40, 39, 28], [40, 28, 31], [39, 27, 28], [28, 29, 31], [29, 30, 31],
  [45, 46, 35], [46, 47, 35], [47, 42, 28], [47, 28, 35], [42, 27, 28], [28, 29, 35], [29, 30, 35],
  [30, 31, 32], [30, 32, 33], [30, 33, 34], [30, 34, 35],
  // Nose to mouth 3D facets
  [31, 48, 49], [31, 49, 32], [32, 49, 50], [32, 50, 33], [33, 50, 51],
  [33, 51, 52], [33, 52, 34], [34, 52, 53], [34, 53, 35], [35, 53, 54],
  // Mouth to chin 3D facets
  [48, 59, 60], [59, 58, 67], [58, 57, 66], [57, 56, 66], [56, 55, 65], [55, 54, 64],
];

/**
 * Draws a high-precision movie-style 3D biometric face wireframe mesh, glowing tracking corners,
 * and animated laser scan beam directly onto an overlay canvas aligned with the video feed.
 */
export function draw3dBiometricFaceMesh(
  canvas: HTMLCanvasElement,
  videoEl: HTMLVideoElement,
  frame: LiveFaceFrameAnalysis | null,
  options: { verifying?: boolean; locked?: boolean; progress?: number } = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cw = canvas.clientWidth || 640;
  const ch = canvas.clientHeight || 480;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  ctx.clearRect(0, 0, cw, ch);

  const facesToDraw: Array<{
    normBox: { x: number; y: number; width: number; height: number };
    normLandmarks: Array<{ x: number; y: number }>;
  }> =
    frame?.allFaces && frame.allFaces.length > 0
      ? frame.allFaces.filter((f) => f.normLandmarks && f.normLandmarks.length >= 68)
      : frame?.detected && frame.normLandmarks && frame.normLandmarks.length >= 68 && frame.normBox
      ? [{ normBox: frame.normBox, normLandmarks: frame.normLandmarks }]
      : [];

  if (facesToDraw.length === 0) {
    // Subtle ambient radar sweep line when actively hunting for walk-by faces
    const tIdle = (Date.now() % 2800) / 2800;
    const idleY = (tIdle < 0.5 ? tIdle * 2 : (1 - tIdle) * 2) * ch;
    const idleGrad = ctx.createLinearGradient(0, idleY - 24, 0, idleY + 24);
    idleGrad.addColorStop(0, 'rgba(234, 88, 12, 0)');
    idleGrad.addColorStop(0.5, 'rgba(234, 88, 12, 0.16)');
    idleGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = idleGrad;
    ctx.fillRect(0, idleY - 24, cw, 48);
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, idleY);
    ctx.lineTo(cw, idleY);
    ctx.stroke();
    return;
  }

  // Compute exact object-fit: cover mapping from normalized video coords to canvas pixels
  const vw = Math.max(1, videoEl.videoWidth || cw);
  const vh = Math.max(1, videoEl.videoHeight || ch);
  const videoAspect = vw / vh;
  const canvasAspect = cw / ch;

  let drawW = cw;
  let drawH = ch;
  let offsetX = 0;
  let offsetY = 0;
  if (videoAspect > canvasAspect) {
    drawH = ch;
    drawW = ch * videoAspect;
    offsetX = (cw - drawW) / 2;
  } else {
    drawW = cw;
    drawH = cw / videoAspect;
    offsetY = (ch - drawH) / 2;
  }

  const isGreen = Boolean(options.locked || options.verifying);
  const meshStroke = isGreen ? 'rgba(16, 235, 175, 0.44)' : 'rgba(251, 146, 60, 0.44)';
  const contourStroke = isGreen ? 'rgba(52, 211, 153, 0.92)' : 'rgba(249, 115, 22, 0.90)';
  const nodeFill = isGreen ? '#6ee7b7' : '#fdba74';

  for (const faceItem of facesToDraw) {
    const pts = faceItem.normLandmarks.map((p) => ({
      x: offsetX + p.x * drawW,
      y: offsetY + p.y * drawH,
    }));

    const bx = offsetX + faceItem.normBox.x * drawW;
    const by = offsetY + faceItem.normBox.y * drawH;
    const bw = faceItem.normBox.width * drawW;
    const bh = faceItem.normBox.height * drawH;

    ctx.save();

    // 1. Triangulated 3D wireframe facets
    ctx.strokeStyle = meshStroke;
    ctx.lineWidth = Math.max(0.85, Math.min(1.25, bw / 180));
    ctx.beginPath();
    for (const [a, b, c] of BIOMETRIC_MESH_TRIANGLES) {
      const pa = pts[a];
      const pb = pts[b];
      const pc = pts[c];
      if (!pa || !pb || !pc) continue;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.closePath();
    }
    ctx.stroke();

    // 2. Crisp feature contour paths (jaw, brows, nose, eyes, lips)
    const drawPath = (indices: number[], close = false) => {
      ctx.beginPath();
      indices.forEach((idx, i) => {
        const p = pts[idx];
        if (!p) return;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (close) ctx.closePath();
      ctx.stroke();
    };

    ctx.strokeStyle = contourStroke;
    ctx.lineWidth = Math.max(1.2, Math.min(1.9, bw / 140));
    ctx.shadowColor = isGreen ? 'rgba(16, 185, 129, 0.65)' : 'rgba(234, 88, 12, 0.65)';
    ctx.shadowBlur = 6;
    drawPath([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]); // Jaw
    drawPath([17, 18, 19, 20, 21]); // Left brow
    drawPath([22, 23, 24, 25, 26]); // Right brow
    drawPath([27, 28, 29, 30]); // Nose bridge
    drawPath([31, 32, 33, 34, 35]); // Nose base
    drawPath([36, 37, 38, 39, 40, 41], true); // Left eye
    drawPath([42, 43, 44, 45, 46, 47], true); // Right eye
    drawPath([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], true); // Outer lip

    // 3. Glowing 3D landmark nodes
    ctx.shadowBlur = 4;
    ctx.fillStyle = nodeFill;
    const baseR = Math.max(1.1, Math.min(2.2, bw / 130));
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const radius = i === 30 || i === 36 || i === 39 || i === 42 || i === 45 || i === 8 ? baseR * 1.45 : baseR;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Animated horizontal 3D laser sweep across the face bounding box
    const t = (Date.now() % 1500) / 1500;
    const sweepY = by + (t < 0.5 ? t * 2 : (1 - t) * 2) * bh;
    const grad = ctx.createLinearGradient(bx, sweepY - 16, bx, sweepY + 16);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0)');
    grad.addColorStop(0.5, isGreen ? 'rgba(52, 211, 153, 0.55)' : 'rgba(251, 146, 60, 0.45)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.shadowBlur = 0;
    ctx.fillStyle = grad;
    ctx.fillRect(bx - 10, sweepY - 16, bw + 20, 32);

    ctx.strokeStyle = isGreen ? 'rgba(110, 231, 183, 0.95)' : 'rgba(253, 186, 116, 0.95)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(bx - 10, sweepY);
    ctx.lineTo(bx + bw + 10, sweepY);
    ctx.stroke();

    // 5. Dynamic face-tracking corner brackets hugging each live face box
    const pad = Math.max(6, Math.min(14, bw * 0.08));
    const cl = Math.max(12, Math.min(26, bw * 0.2));
    const x1 = bx - pad;
    const y1 = by - pad;
    const x2 = bx + bw + pad;
    const y2 = by + bh + pad;
    ctx.strokeStyle = isGreen ? '#34d399' : '#fb923c';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + cl); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cl, y1);
    ctx.moveTo(x2 - cl, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + cl);
    ctx.moveTo(x1, y2 - cl); ctx.lineTo(x1, y2); ctx.lineTo(x1 + cl, y2);
    ctx.moveTo(x2 - cl, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - cl);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Analyzes a single video frame for a single clear face, computes 68-point liveness metrics
 * (EAR for blink detection + nose-to-jaw yaw ratio for head turn), and extracts the 128-d embedding.
 */
export async function analyzeVideoFaceFrame(
  videoEl: HTMLVideoElement,
  includeDescriptor = true,
  optionsOverride?: { allowMultiple?: boolean; longRange?: boolean }
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
      allFaces: [],
    };
  }

  // Long-range walk-by mode uses 416px input & 0.25 threshold so distant/passing faces lock cleanly
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: optionsOverride?.longRange ? 416 : 320,
    scoreThreshold: optionsOverride?.longRange ? 0.25 : 0.32,
  });

  if (includeDescriptor) {
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
        allFaces: [],
      };
    }

    if (detections.length > 1 && !optionsOverride?.allowMultiple) {
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
        allFaces: [],
      };
    }

    const vw = sourceWidth;
    const vh = sourceHeight;
    const scaleX = videoEl.videoWidth / vw;
    const scaleY = videoEl.videoHeight / vh;

    // Parse all detected faces and sort largest/most prominent first
    const parsedFaces: DetectedFace3D[] = detections
      .map((det: any) => {
        const lm = det.landmarks;
        const leftEye = lm.getLeftEye();
        const rightEye = lm.getRightEye();
        const mouth = lm.getMouth();
        const ear = (computeEyeAspectRatio(leftEye) + computeEyeAspectRatio(rightEye)) / 2;
        const mar = computeMouthAspectRatio(mouth);
        const eyeSymmetry = computeEyeWidthSymmetry(leftEye, rightEye);
        const nose = lm.getNose();
        const jaw = lm.getJawOutline();
        const noseTip = nose[3] || nose[0];
        const leftJaw = jaw[0];
        const rightJaw = jaw[16];
        let yawRatio = 0;
        if (noseTip && leftJaw && rightJaw) {
          const faceWidth = Math.max(1, dist2D(leftJaw, rightJaw));
          const midX = (leftJaw.x + rightJaw.x) / 2;
          yawRatio = (noseTip.x - midX) / (faceWidth / 2);
        }
        const b = det.detection.box;
        return {
          descriptor: det.descriptor
            ? Array.from(det.descriptor as Float32Array).map((n) => Number(n.toFixed(6)))
            : null,
          ear,
          mar,
          eyeSymmetry,
          yawRatio,
          faceSizeRatio: b.width / vw,
          detectionScore: Number(det.detection.score || 0),
          box: { x: b.x * scaleX, y: b.y * scaleY, width: b.width * scaleX, height: b.height * scaleY },
          normBox: { x: b.x / vw, y: b.y / vh, width: b.width / vw, height: b.height / vh },
          normLandmarks: (lm.positions || []).map((pt: { x: number; y: number }) => ({
            x: pt.x / vw,
            y: pt.y / vh,
          })),
        };
      })
      .sort((a: DetectedFace3D, b: DetectedFace3D) => b.faceSizeRatio - a.faceSizeRatio);

    const primary = parsedFaces[0];
    const centerOffsetX = primary.normBox.x + primary.normBox.width / 2 - 0.5;
    const centerOffsetY = primary.normBox.y + primary.normBox.height / 2 - 0.5;
    const faceBrightness = measureBoxBrightness(videoEl, primary.box);

    return {
      detected: true,
      multipleFaces: parsedFaces.length > 1,
      descriptor: primary.descriptor,
      ear: primary.ear,
      yawRatio: primary.yawRatio,
      faceSizeRatio: primary.faceSizeRatio,
      centerOffsetX,
      centerOffsetY,
      faceBrightness,
      detectionScore: primary.detectionScore,
      box: primary.box,
      normBox: primary.normBox,
      normLandmarks: primary.normLandmarks,
      allFaces: parsedFaces,
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


