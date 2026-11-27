'use client';

/**
 * Self-Hosted Google MediaPipe 478-Point 3D Face Landmarker & 52-Blendshape Neural Liveness Engine.
 * Runs at 30-60 FPS in-browser with zero per-scan API fees (₦0/month), using `/models/mediapipe/`.
 */

export interface MediaPipeBlendshapes {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  jawOpen: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
}

export interface MediaPipeFace3D {
  landmarks: Array<{ x: number; y: number; z: number }>;
  normBox: { x: number; y: number; width: number; height: number };
  box: { x: number; y: number; width: number; height: number };
  faceSizeRatio: number;
  yawRatio: number;
  pitchRatio: number; // Positive = nodding down, Negative = tilting up
  noseProtrusionZ: number;
  blendshapes: MediaPipeBlendshapes;
}

export interface MediaPipeFrameResult {
  detected: boolean;
  faces: MediaPipeFace3D[];
}

let landmarkerPromise: Promise<any> | null = null;
let cachedFaceLandmarkerClass: any = null;
let lastVideoTimestampMs = -1;

export async function loadMediaPipeFaceLandmarker(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('MediaPipe Face Landmarker can only load in the browser.');
  }
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const mp = await import('@mediapipe/tasks-vision');
    cachedFaceLandmarkerClass = mp.FaceLandmarker;
    const vision = await mp.FilesetResolver.forVisionTasks('/models/mediapipe/wasm');

    const createWithDelegate = async (delegate: 'GPU' | 'CPU') =>
      mp.FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/mediapipe/face_landmarker.task',
          delegate,
        },
        runningMode: 'VIDEO',
        numFaces: 3,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

    try {
      return await createWithDelegate('GPU');
    } catch {
      return await createWithDelegate('CPU');
    }
  })().catch((err) => {
    landmarkerPromise = null;
    throw err;
  });

  return landmarkerPromise;
}

function getBlendshapeScore(categories: Array<{ categoryName: string; score: number }> | undefined, name: string): number {
  if (!categories) return 0;
  const hit = categories.find((c) => c.categoryName === name);
  return hit ? Number(hit.score) : 0;
}

export async function detectMediaPipeFaceFrame(videoEl: HTMLVideoElement): Promise<MediaPipeFrameResult> {
  if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
    return { detected: false, faces: [] };
  }

  const landmarker = await loadMediaPipeFaceLandmarker();
  const nowMs = Math.max(performance.now(), lastVideoTimestampMs + 1);
  lastVideoTimestampMs = nowMs;

  const result = landmarker.detectForVideo(videoEl, nowMs);
  const rawLandmarksList: Array<Array<{ x: number; y: number; z: number }>> = result?.faceLandmarks || [];
  const rawBlendshapesList: Array<{ categories: Array<{ categoryName: string; score: number }> }> =
    result?.faceBlendshapes || [];

  if (rawLandmarksList.length === 0) {
    return { detected: false, faces: [] };
  }

  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;

  const faces: MediaPipeFace3D[] = rawLandmarksList
    .map((lms, idx) => {
      let minX = 1;
      let maxX = 0;
      let minY = 1;
      let maxY = 0;
      for (let i = 0; i < lms.length; i++) {
        const p = lms[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      const normW = Math.max(0.01, maxX - minX);
      const normH = Math.max(0.01, maxY - minY);

      // Nose tip (1) vs left cheek edge (234) & right cheek edge (454) for yaw,
      // and forehead (10) & chin (152) for vertical pitch (nodding down/up)
      const noseTip = lms[1];
      const leftCheek = lms[234];
      const rightCheek = lms[454];
      const forehead = lms[10];
      const chin = lms[152];
      let yawRatio = 0;
      let pitchRatio = 0;
      let noseProtrusionZ = 0;
      if (noseTip && leftCheek && rightCheek) {
        const midX = (leftCheek.x + rightCheek.x) / 2;
        const halfW = Math.max(0.01, Math.abs(rightCheek.x - leftCheek.x) / 2);
        yawRatio = (noseTip.x - midX) / halfW;
        const cheekMidZ = (leftCheek.z + rightCheek.z) / 2;
        noseProtrusionZ = cheekMidZ - noseTip.z;
      }
      if (noseTip && forehead && chin) {
        const midY = (forehead.y + chin.y) / 2;
        const halfH = Math.max(0.01, Math.abs(chin.y - forehead.y) / 2);
        pitchRatio = (noseTip.y - midY) / halfH;
      }

      const cats = rawBlendshapesList[idx]?.categories;
      const blendshapes: MediaPipeBlendshapes = {
        eyeBlinkLeft: getBlendshapeScore(cats, 'eyeBlinkLeft'),
        eyeBlinkRight: getBlendshapeScore(cats, 'eyeBlinkRight'),
        jawOpen: getBlendshapeScore(cats, 'jawOpen'),
        mouthSmileLeft: getBlendshapeScore(cats, 'mouthSmileLeft'),
        mouthSmileRight: getBlendshapeScore(cats, 'mouthSmileRight'),
      };

      return {
        landmarks: lms,
        normBox: { x: minX, y: minY, width: normW, height: normH },
        box: { x: minX * vw, y: minY * vh, width: normW * vw, height: normH * vh },
        faceSizeRatio: normW,
        yawRatio,
        pitchRatio,
        noseProtrusionZ,
        blendshapes,
      };
    })
    .sort((a, b) => b.faceSizeRatio - a.faceSizeRatio);

  return {
    detected: faces.length > 0,
    faces,
  };
}

/**
 * Renders a razor-sharp 60fps 478-point 3D MediaPipe wireframe mesh, contour highlights,
 * dynamic corner brackets, and animated scan laser onto the kiosk overlay canvas.
 */
export function drawMediaPipe3dFaceMesh(
  canvas: HTMLCanvasElement,
  videoEl: HTMLVideoElement,
  faces: MediaPipeFace3D[],
  options: { locked?: boolean; verifying?: boolean; liteMode?: boolean } = {}
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

  if (!faces || faces.length === 0) {
    const tIdle = (Date.now() % 2600) / 2600;
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
  const tessStroke = isGreen ? 'rgba(16, 235, 175, 0.24)' : 'rgba(251, 146, 60, 0.24)';
  const contourStroke = isGreen ? 'rgba(52, 211, 153, 0.90)' : 'rgba(249, 115, 22, 0.88)';
  const tessEdges: Array<{ start: number; end: number }> =
    cachedFaceLandmarkerClass?.FACE_LANDMARKS_TESSELATION || [];
  const ovalEdges: Array<{ start: number; end: number }> =
    cachedFaceLandmarkerClass?.FACE_LANDMARKS_FACE_OVAL || [];
  const leftEyeEdges: Array<{ start: number; end: number }> =
    cachedFaceLandmarkerClass?.FACE_LANDMARKS_LEFT_EYE || [];
  const rightEyeEdges: Array<{ start: number; end: number }> =
    cachedFaceLandmarkerClass?.FACE_LANDMARKS_RIGHT_EYE || [];
  const lipEdges: Array<{ start: number; end: number }> =
    cachedFaceLandmarkerClass?.FACE_LANDMARKS_LIPS || [];

  for (const face of faces) {
    const pts = face.landmarks.map((p) => ({
      x: offsetX + p.x * drawW,
      y: offsetY + p.y * drawH,
    }));

    const bx = offsetX + face.normBox.x * drawW;
    const by = offsetY + face.normBox.y * drawH;
    const bw = face.normBox.width * drawW;
    const bh = face.normBox.height * drawH;

    ctx.save();

    // 1. 478-Point 3D Triangulated Wireframe Tessellation (skipped in liteMode on slow GPUs to prevent freezing)
    if (!options.liteMode && tessEdges.length > 0) {
      ctx.strokeStyle = tessStroke;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < tessEdges.length; i++) {
        const a = pts[tessEdges[i].start];
        const b = pts[tessEdges[i].end];
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }

    // 2. Crisp feature contours (Face Oval, Eyes, Lips)
    const drawEdgeSet = (edges: Array<{ start: number; end: number }>) => {
      if (!edges || edges.length === 0) return;
      ctx.beginPath();
      for (let i = 0; i < edges.length; i++) {
        const a = pts[edges[i].start];
        const b = pts[edges[i].end];
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    };

    ctx.strokeStyle = contourStroke;
    ctx.lineWidth = Math.max(1.2, Math.min(1.8, bw / 145));
    ctx.shadowColor = isGreen ? 'rgba(16, 185, 129, 0.6)' : 'rgba(234, 88, 12, 0.6)';
    ctx.shadowBlur = 5;
    drawEdgeSet(ovalEdges);
    drawEdgeSet(leftEyeEdges);
    drawEdgeSet(rightEyeEdges);
    drawEdgeSet(lipEdges);

    // 3. Sweeping horizontal 3D laser beam
    const t = (Date.now() % 1450) / 1450;
    const sweepY = by + (t < 0.5 ? t * 2 : (1 - t) * 2) * bh;
    const grad = ctx.createLinearGradient(bx, sweepY - 14, bx, sweepY + 14);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0)');
    grad.addColorStop(0.5, isGreen ? 'rgba(52, 211, 153, 0.50)' : 'rgba(251, 146, 60, 0.42)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.shadowBlur = 0;
    ctx.fillStyle = grad;
    ctx.fillRect(bx - 10, sweepY - 14, bw + 20, 28);

    ctx.strokeStyle = isGreen ? 'rgba(110, 231, 183, 0.92)' : 'rgba(253, 186, 116, 0.92)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bx - 10, sweepY);
    ctx.lineTo(bx + bw + 10, sweepY);
    ctx.stroke();

    // 4. Dynamic face-hugging corner brackets
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
