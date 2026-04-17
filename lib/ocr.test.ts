import { describe, it, expect } from 'vitest';
import { cornerCropBox } from './ocr';

describe('cornerCropBox', () => {
  it('returns ~25%×~15% of the bottom-left corner', () => {
    const box = cornerCropBox({ width: 1000, height: 1400 });
    expect(box.x).toBe(0);
    expect(box.width).toBe(250);
    expect(box.y).toBe(1400 - 210); // 15% of 1400
    expect(box.height).toBe(210);
  });

  it('handles non-standard aspect ratios', () => {
    const box = cornerCropBox({ width: 400, height: 600 });
    expect(box.width).toBe(100);
    expect(box.height).toBe(90);
  });
});
