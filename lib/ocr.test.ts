import { describe, it, expect } from 'vitest';
import { cornerCropBox } from './ocr';

describe('cornerCropBox', () => {
  it('returns the bottom-left half × bottom third of the image', () => {
    const box = cornerCropBox({ width: 1000, height: 1400 });
    expect(box.x).toBe(0);
    expect(box.width).toBe(500); // 50% of 1000
    expect(box.height).toBe(420); // 30% of 1400
    expect(box.y).toBe(1400 - 420);
  });

  it('handles non-standard aspect ratios', () => {
    const box = cornerCropBox({ width: 400, height: 600 });
    expect(box.width).toBe(200);
    expect(box.height).toBe(180);
  });
});
