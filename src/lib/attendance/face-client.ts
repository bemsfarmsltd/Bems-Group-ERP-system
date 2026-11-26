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
  box?: { x: number; y: number; width: number; height: number };
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
    };
  }

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
  });

  if (includeDescriptor) {
    const detections = await faceapi
      .detectAllFaces(videoEl, options)
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    if (!detections || detections.length === 0) {
      return {
        detected: false,
        multipleFaces: false,
        descriptor: null,
        ear: 0.3,
        yawRatio: 0,
        faceSizeRatio: 0,
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
    const faceSizeRatio = box.width / Math.max(1, videoEl.videoWidth);
    const descriptor = det.descriptor ? Array.from(det.descriptor as Float32Array).map((n) => Number(n.toFixed(6))) : null;

    return {
      detected: true,
      multipleFaces: false,
      descriptor,
      ear,
      yawRatio,
      faceSizeRatio,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
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
    return {
      detected: true,
      multipleFaces: false,
      descriptor: null,
      ear,
      yawRatio,
      faceSizeRatio: box.width / Math.max(1, videoEl.videoWidth),
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
