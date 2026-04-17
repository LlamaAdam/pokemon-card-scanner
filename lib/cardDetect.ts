import { loadOpenCv } from './cvLoader';
import type { OpenCv, OpenCvMatVector } from './opencvTypes';

/**
 * Axis-aligned bounding box of the card within the original image.
 * Coordinates are in the original bitmap's pixel space.
 */
export interface CardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Card detection runs Canny + findContours. O(pixels), main-thread, so we
// downsample first. 1024 on the longest side is plenty of detail for finding
// the card's outer rectangle — we only need edges strong enough to form a
// contour, not fine text. The detected rect is scaled back to full resolution
// so the downstream OCR crop still uses native pixels.
const DETECT_MAX_DIM = 1024;

// Pokemon cards are 2.5" × 3.5" (aspect ≈ 0.714 portrait, 1.4 landscape).
// Real-world photos have perspective skew + rotation so we allow ±25% slack.
const ASPECT_PORTRAIT = 2.5 / 3.5;
const ASPECT_LANDSCAPE = 3.5 / 2.5;
const ASPECT_TOLERANCE = 0.25;

function fittedDimensions(
  src: { width: number; height: number },
  max: number,
): { width: number; height: number; scale: number } {
  const longest = Math.max(src.width, src.height);
  if (longest <= max) return { width: src.width, height: src.height, scale: 1 };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(src.width * scale)),
    height: Math.max(1, Math.round(src.height * scale)),
    scale,
  };
}

/**
 * Detect the card's bounding rectangle in the photo via edge detection.
 *
 * Returns null if OpenCV fails to load, no contour matches card dimensions,
 * or the largest candidate is clearly not a card (wrong aspect ratio, too
 * small, or the image-bounding contour itself). Callers should fall back to
 * image-relative cropping when this returns null.
 */
export async function detectCardBounds(
  bitmap: ImageBitmap,
): Promise<CardBounds | null> {
  let cv: OpenCv;
  try {
    cv = await loadOpenCv();
  } catch {
    return null;
  }

  const fitted = fittedDimensions(
    { width: bitmap.width, height: bitmap.height },
    DETECT_MAX_DIM,
  );

  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(
    bitmap,
    0, 0, bitmap.width, bitmap.height,
    0, 0, fitted.width, fitted.height,
  );

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Canny(gray, edges, 50, 150);
    cv.findContours(
      edges, contours, hierarchy,
      cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE,
    );

    const imageArea = fitted.width * fitted.height;
    const best = pickBestCardRect(cv, contours, imageArea);
    if (!best) return null;

    // Scale back to original image coords.
    return {
      x: Math.round(best.x / fitted.scale),
      y: Math.round(best.y / fitted.scale),
      width: Math.round(best.width / fitted.scale),
      height: Math.round(best.height / fitted.scale),
    };
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();
  }
}

function pickBestCardRect(
  cv: OpenCv,
  contours: OpenCvMatVector,
  imageArea: number,
): CardBounds | null {
  let best: CardBounds | null = null;
  let bestScore = -Infinity;
  const count = contours.size();

  for (let i = 0; i < count; i++) {
    const c = contours.get(i);
    const r = cv.boundingRect(c);
    c.delete();

    const area = r.width * r.height;

    // Skip the image-bounding contour (Canny often closes the image border)
    // and anything smaller than 10% of the frame.
    if (area < imageArea * 0.1) continue;
    if (area > imageArea * 0.98) continue;

    const aspect = r.width / r.height;
    const distPortrait = Math.abs(aspect - ASPECT_PORTRAIT) / ASPECT_PORTRAIT;
    const distLandscape = Math.abs(aspect - ASPECT_LANDSCAPE) / ASPECT_LANDSCAPE;
    const aspectDist = Math.min(distPortrait, distLandscape);
    if (aspectDist > ASPECT_TOLERANCE) continue;

    // Favor larger rectangles whose aspect ratio is closer to the card's.
    const score = area * (1 - aspectDist);
    if (score > bestScore) {
      bestScore = score;
      best = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
  }

  return best;
}

/**
 * Given a detected card rectangle, compute the bottom-left region that
 * contains the set code / collector number / illustrator credit.
 *
 * Pokemon card layout: the copyright + collector-number line sits on the
 * bottom ~7% of the card height, and the printed text (set code, `N/N`,
 * illustrator) occupies the left ~40% of the card width. We take a slightly
 * generous slice (45% × 18%) so OCR still captures the target line even if
 * the detected rectangle is a few percent off due to edge noise or mild
 * perspective skew.
 */
export function cardCornerBox(card: CardBounds): CropBox {
  const width = Math.round(card.width * 0.45);
  const height = Math.round(card.height * 0.18);
  const x = card.x;
  const y = card.y + card.height - height;
  return { x, y, width, height };
}
