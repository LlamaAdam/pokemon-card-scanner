import type { CornerParseResult } from './cornerParser';
import { parseCorner } from './cornerParser';

export interface OcrResult extends CornerParseResult {
  rawText: string;
  confidence: number;
}

export interface Box {
  x: number; y: number; width: number; height: number;
}

/**
 * Progress updates emitted while OCR runs. Mirrors the coarse stages of
 * Tesseract worker lifecycle so the UI can show a numbered indicator when
 * the user reports "it's stuck here". `percent` is 0–1 when provided.
 */
export interface OcrProgress {
  stage:
    | 'load-module'
    | 'decode-image'
    | 'init-worker'
    | 'worker-ready'
    | 'recognize-start'
    | 'recognize-progress'
    | 'recognize-done';
  detail?: string;
  percent?: number;
}

export function cornerCropBox(dim: { width: number; height: number }): Box {
  const width = Math.round(dim.width * 0.25);
  const height = Math.round(dim.height * 0.15);
  const x = 0;
  const y = dim.height - height;
  return { x, y, width, height };
}

// Tesseract recommends ~300 DPI, which for the ~0.7" wide collector-number
// line is around 210 px wide. Modern phone cameras produce corners that are
// 1000+ px wide — overkill, and the recognize pass scales ~linearly with
// pixel count. Cap the longest side so a 4000×3000 phone photo produces a
// manageable canvas without hurting accuracy on the printed digits.
const MAX_OCR_DIMENSION = 800;

// A 90s ceiling on the whole OCR pipeline. Worker init + asset download +
// recognize should comfortably finish in well under a minute on any network;
// anything past this is a hung fetch worth surfacing as an error.
const OCR_TIMEOUT_MS = 90_000;

function fittedDimensions(
  src: { width: number; height: number },
  max: number,
): { width: number; height: number } {
  const longest = Math.max(src.width, src.height);
  if (longest <= max) return { width: src.width, height: src.height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(src.width * scale)),
    height: Math.max(1, Math.round(src.height * scale)),
  };
}

/**
 * Run Tesseract on the bottom-left corner of the image (browser-only).
 * Falls back to the whole image if the corner yields nothing parseable.
 *
 * Accepts an optional `onProgress` callback so callers can surface fine-grained
 * stages (module import, worker init, recognize %) to the UI. This is important
 * on mobile networks where the first-load ~8MB WASM + language-data download
 * can make the "Reading card…" phase look hung.
 */
export async function ocrCardCorner(
  blob: Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  if (typeof window === 'undefined') {
    throw new Error('ocrCardCorner requires a browser environment');
  }

  // Overall pipeline timeout — if the WASM download or recognize pass hangs
  // past this ceiling, reject with a clear message instead of leaving the UI
  // on a spinner indefinitely.
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`OCR timed out after ${Math.round(OCR_TIMEOUT_MS / 1000)}s`));
    }, OCR_TIMEOUT_MS);
  });

  try {
    return await Promise.race([runOcr(blob, onProgress), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function runOcr(
  blob: Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  onProgress?.({ stage: 'load-module' });
  const { createWorker, PSM } = await import('tesseract.js');

  onProgress?.({ stage: 'decode-image' });
  const bitmap = await createImageBitmap(blob);
  const box = cornerCropBox({ width: bitmap.width, height: bitmap.height });
  const fitted = fittedDimensions({ width: box.width, height: box.height }, MAX_OCR_DIMENSION);

  // Draw the cropped region directly at the fitted (possibly downsampled)
  // size. drawImage's 9-arg form resamples with the browser's built-in
  // bilinear filter, which is more than good enough for collector-number
  // text and avoids a separate downsample pass.
  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, fitted.width, fitted.height);

  onProgress?.({ stage: 'init-worker' });
  // Self-hosted paths: assets live under /public/tesseract/, populated at
  // install time by scripts/prepare-tesseract-assets.mjs. This avoids the
  // jsDelivr + tessdata.projectnaptha.com CDN hop that was observed to
  // hang on mobile networks (step 3 stuck at 0%).
  const worker = await createWorker('eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract',
    langPath: '/tesseract',
    // Tesseract fires { status, progress } events for asset download, loading
    // the core, initialising the API, and the recognize pass. We forward the
    // raw status string so the UI can show exactly which sub-phase is active.
    logger: onProgress
      ? (m: { status?: string; progress?: number }) => {
          onProgress({
            stage: 'recognize-progress',
            detail: m.status,
            percent: typeof m.progress === 'number' ? m.progress : undefined,
          });
        }
      : undefined,
  });
  onProgress?.({ stage: 'worker-ready' });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/★☆. ',
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    onProgress?.({ stage: 'recognize-start' });
    const { data } = await worker.recognize(canvas);
    onProgress?.({ stage: 'recognize-done' });
    const parsed = parseCorner(data.text);
    return { ...parsed, rawText: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
