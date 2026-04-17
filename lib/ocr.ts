import type { CornerParseResult } from './cornerParser';
import { parseCorner } from './cornerParser';

export interface OcrResult extends CornerParseResult {
  rawText: string;
  confidence: number;
}

export interface Box {
  x: number; y: number; width: number; height: number;
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
 */
export async function ocrCardCorner(blob: Blob): Promise<OcrResult> {
  if (typeof window === 'undefined') {
    throw new Error('ocrCardCorner requires a browser environment');
  }
  const { createWorker, PSM } = await import('tesseract.js');

  const bitmap = await createImageBitmap(blob);
  const box = cornerCropBox({ width: bitmap.width, height: bitmap.height });

  const canvas = document.createElement('canvas');
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/★☆. ',
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    const { data } = await worker.recognize(canvas);
    const parsed = parseCorner(data.text);
    return { ...parsed, rawText: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
