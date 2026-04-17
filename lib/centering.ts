import { loadOpenCv } from './cvLoader';
import type { OpenCv, OpenCvMat } from './opencvTypes';

export type CenteringVerdict = 'good' | 'borderline' | 'poor' | 'unmeasurable';

export interface CenteringResult {
  lr: string;
  tb: string;
  verdict: CenteringVerdict;
}

export interface FrameOffsets {
  outerWidth: number;
  outerHeight: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function ratioString(a: number, b: number): string {
  const total = a + b;
  if (total === 0) return '50/50';
  const ap = Math.round((a / total) * 100);
  const bp = 100 - ap;
  return `${Math.min(ap, bp)}/${Math.max(ap, bp)}`;
}

export function computeRatios(f: FrameOffsets): {
  lrWorst: number; tbWorst: number; lrLabel: string; tbLabel: string;
} {
  const lrTotal = f.left + f.right;
  const tbTotal = f.top + f.bottom;
  const lrWorst = lrTotal === 0 ? 50 : (Math.max(f.left, f.right) / lrTotal) * 100;
  const tbWorst = tbTotal === 0 ? 50 : (Math.max(f.top, f.bottom) / tbTotal) * 100;
  return {
    lrWorst, tbWorst,
    lrLabel: ratioString(f.left, f.right),
    tbLabel: ratioString(f.top, f.bottom),
  };
}

export function centeringVerdict(lrWorst: number, tbWorst: number): CenteringVerdict {
  const worst = Math.max(lrWorst, tbWorst);
  if (worst <= 55) return 'good';
  if (worst <= 60) return 'borderline';
  return 'poor';
}

// Phone photos are routinely 3000–4000 px on the long edge. Canny +
// findContours are O(pixels) and block the main thread, so we downsample
// first. 1024 px on the long edge preserves enough edge detail for the
// card-frame detector while keeping the whole pass under a second on a
// mid-range phone.
const MAX_CENTERING_DIMENSION = 1024;

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

export async function analyzeCentering(imageBlob: Blob): Promise<CenteringResult | null> {
  if (typeof window === 'undefined') return null;
  const cv = await loadOpenCv();

  const bitmap = await createImageBitmap(imageBlob);
  const fitted = fittedDimensions(
    { width: bitmap.width, height: bitmap.height },
    MAX_CENTERING_DIMENSION,
  );
  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, fitted.width, fitted.height);

  const src = cv.imread(canvas);
  try {
    const frame = detectInnerFrame(cv, src);
    if (!frame) return null;
    const r = computeRatios(frame);
    return {
      lr: r.lrLabel,
      tb: r.tbLabel,
      verdict: centeringVerdict(r.lrWorst, r.tbWorst),
    };
  } finally {
    src.delete();
  }
}

function detectInnerFrame(cv: OpenCv, src: OpenCvMat): FrameOffsets | null {
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Canny(gray, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const rects: { area: number; rect: { x: number; y: number; w: number; h: number } }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const r = cv.boundingRect(c);
      rects.push({ area: r.width * r.height, rect: { x: r.x, y: r.y, w: r.width, h: r.height } });
      c.delete();
    }
    rects.sort((a, b) => b.area - a.area);
    if (rects.length < 2) return null;
    const outer = rects[0].rect;
    const inner = rects.slice(1).find(
      (r) =>
        r.rect.x > outer.x && r.rect.y > outer.y &&
        r.rect.x + r.rect.w < outer.x + outer.w &&
        r.rect.y + r.rect.h < outer.y + outer.h &&
        r.area < outer.w * outer.h * 0.95 &&
        r.area > outer.w * outer.h * 0.4
    )?.rect;
    if (!inner) return null;

    return {
      outerWidth: outer.w,
      outerHeight: outer.h,
      left: inner.x - outer.x,
      right: outer.x + outer.w - (inner.x + inner.w),
      top: inner.y - outer.y,
      bottom: outer.y + outer.h - (inner.y + inner.h),
    };
  } finally {
    gray.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();
  }
}
