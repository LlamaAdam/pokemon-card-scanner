import type { CornerParseResult } from './cornerParser';
import { parseCorner } from './cornerParser';
import { detectCardBounds, cardCornerBox, type CropBox } from './cardDetect';

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
    | 'detect-card'
    | 'init-worker'
    | 'worker-ready'
    | 'recognize-start'
    | 'recognize-progress'
    | 'recognize-done';
  detail?: string;
  percent?: number;
}

// Fallback image-relative crop when we can't detect the card's bounding box
// (OpenCV load failed, no contour matched card aspect ratio, etc.). A
// bottom-left half × bottom-third slice catches the card's corner for any
// reasonable framing where the card fills roughly half the frame. Tighter
// crops used to miss padded photos entirely; looser crops pull in too much
// noise from the attack text and the background.
export function cornerCropBox(dim: { width: number; height: number }): Box {
  const width = Math.round(dim.width * 0.5);
  const height = Math.round(dim.height * 0.3);
  const x = 0;
  const y = dim.height - height;
  return { x, y, width, height };
}

// Target pixel resolution for the crop handed to Tesseract. 1600 px on the
// longest side gives ~60–80 px set-code text once the crop is tight to the
// card's bottom-left corner, which is comfortably inside Tesseract's sweet
// spot. We only downsample when the source crop is larger than this; small
// crops stay at native resolution to avoid bilinear upscale blur.
const MAX_OCR_DIMENSION = 1600;

// A 90s ceiling on the whole OCR pipeline. Worker init + asset download +
// recognize should comfortably finish in well under a minute on any network;
// anything past this is a hung fetch worth surfacing as an error.
const OCR_TIMEOUT_MS = 90_000;

// Detect-card has to stay well under Firefox's ~5s "slow script" warning.
// OpenCV.js first-load (8MB WASM from CDN) + Canny + findContours can
// easily blow past that on a cold cache, so we race against a 3.5s cap and
// fall back to image-relative cropping if it doesn't finish in time. The
// fallback crop is still usable — it just wastes a bit of Tesseract's time
// on non-text pixels.
const DETECT_CARD_TIMEOUT_MS = 3500;

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
 *
 * Flow: decode the photo → detect the card's outer rectangle via OpenCV
 * contour matching → crop tightly to the card's bottom-left corner (the
 * set code / collector number / illustrator line) → scale that crop to a
 * target resolution and hand it to Tesseract. When card detection fails,
 * we fall back to an image-relative crop so Tesseract still gets something
 * reasonable to read.
 *
 * Accepts an optional `onProgress` callback so callers can surface fine-grained
 * stages (module import, card detect, worker init, recognize %) to the UI.
 * This is important on mobile networks where the first-load ~8MB WASM +
 * language-data download can make the "Reading card…" phase look hung.
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
  // `imageOrientation: 'from-image'` applies the JPEG EXIF orientation tag.
  // Phone photos routinely ship with orientation=6 (rotate 90° CW on display);
  // without this option createImageBitmap returns raw landscape pixels and the
  // card ends up sideways, so our "bottom-left of the card" crop lands on the
  // copyright line instead of the set-code / collector-number line.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });

  // Try card-relative cropping first. If the card detector finds a rectangle
  // with a plausible card aspect ratio, we get a tight crop of exactly the
  // region containing the set-code line. When detection fails (or takes too
  // long — Firefox flags the page as "slowing down" if any single task
  // blocks the main thread for >5s), the fallback image-relative crop still
  // covers most real-world framings.
  onProgress?.({ stage: 'detect-card' });
  const cardBounds = await Promise.race([
    detectCardBounds(bitmap).catch(() => null),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), DETECT_CARD_TIMEOUT_MS),
    ),
  ]);
  onProgress?.({
    stage: 'detect-card',
    detail: cardBounds
      ? 'card located'
      : 'no border found — using fallback crop',
  });

  const crop: CropBox = cardBounds
    ? cardCornerBox(cardBounds)
    : cornerCropBox({ width: bitmap.width, height: bitmap.height });

  // Clamp to bitmap bounds — detected rectangles can occasionally extend a
  // pixel past the image edge due to rounding and downsample-scale-back.
  const safe = clampToBitmap(crop, bitmap.width, bitmap.height);

  const fitted = fittedDimensions(
    { width: safe.width, height: safe.height },
    MAX_OCR_DIMENSION,
  );

  // Draw the cropped region directly at the fitted size. drawImage's 9-arg
  // form resamples with the browser's built-in bilinear filter, which is
  // more than good enough for collector-number text and avoids a separate
  // downsample pass.
  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    bitmap,
    safe.x, safe.y, safe.width, safe.height,
    0, 0, fitted.width, fitted.height,
  );

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

function clampToBitmap(crop: CropBox, bw: number, bh: number): CropBox {
  const x = Math.max(0, Math.min(crop.x, bw - 1));
  const y = Math.max(0, Math.min(crop.y, bh - 1));
  const width = Math.max(1, Math.min(crop.width, bw - x));
  const height = Math.max(1, Math.min(crop.height, bh - y));
  return { x, y, width, height };
}
