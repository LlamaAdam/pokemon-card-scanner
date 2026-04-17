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
  onProgress?.({ stage: 'load-module' });
  const { createWorker, PSM } = await import('tesseract.js');

  onProgress?.({ stage: 'decode-image' });
  const bitmap = await createImageBitmap(blob);
  const box = cornerCropBox({ width: bitmap.width, height: bitmap.height });

  const canvas = document.createElement('canvas');
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  onProgress?.({ stage: 'init-worker' });
  const worker = await createWorker('eng', 1, {
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
