// FaceLandmarker — thin wrapper around MediaPipe Tasks Vision' face landmarker
// model. Lazy-loads on first use so the bundle isn't paying for ~5MB of model
// data unless the player actually opens the Selfie Sync challenge.
//
// We pull the WASM binary AND the model file from Google's CDN, NOT from our
// own build — this keeps the Next.js bundle small and means iOS Safari fetches
// fresh URLs that work over HTTPS.
//
// Supported on iOS 16+ Safari and Chrome (which is WebKit on iOS). Falls back
// from GPU delegate to CPU on first error.
//
// Output shape: a `BlendshapeMap` keyed by MediaPipe's standard category
// names. Each value is 0..1. Useful keys:
//   - mouthSmileLeft / mouthSmileRight     → smile
//   - mouthFrownLeft / mouthFrownRight     → frown
//   - jawOpen                              → mouth wide open
//   - eyeBlinkLeft / eyeBlinkRight         → wink (asymmetry test)
//   - browInnerUp                          → surprise / sad raise
//   - browDownLeft / browDownRight         → angry brow
//
// Usage:
//   const fl = await getFaceLandmarker();
//   const result = fl.detectForVideo(videoEl, performance.now());
//   const b = blendshapesByName(result);
//   const smile = Math.max(b.mouthSmileLeft ?? 0, b.mouthSmileRight ?? 0);

import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    try {
      return await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
    } catch {
      // GPU delegate isn't available everywhere on iOS — retry on CPU.
      return await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
    }
  })();
  try {
    return await landmarkerPromise;
  } catch (err) {
    landmarkerPromise = null;
    throw err;
  }
}

export type BlendshapeMap = Partial<Record<string, number>>;

export function blendshapesByName(
  result: FaceLandmarkerResult,
): BlendshapeMap {
  const out: BlendshapeMap = {};
  const arr = result.faceBlendshapes;
  if (!arr || arr.length === 0) return out;
  for (const cat of arr[0].categories) {
    if (cat.categoryName) out[cat.categoryName] = cat.score;
  }
  return out;
}
