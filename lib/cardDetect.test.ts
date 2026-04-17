import { describe, it, expect } from 'vitest';
import { cardCornerBox } from './cardDetect';

describe('cardCornerBox', () => {
  it('returns the bottom-left 45% × 18% region of the card', () => {
    const box = cardCornerBox({ x: 100, y: 50, width: 400, height: 560 });
    expect(box.x).toBe(100);
    expect(box.width).toBe(180); // 45% of 400
    expect(box.height).toBe(101); // 18% of 560 → 100.8 → 101
    expect(box.y).toBe(50 + 560 - 101); // bottom-aligned
  });

  it('handles a card that fills the image', () => {
    const box = cardCornerBox({ x: 0, y: 0, width: 1000, height: 1400 });
    expect(box.x).toBe(0);
    expect(box.width).toBe(450);
    expect(box.height).toBe(252);
    expect(box.y).toBe(1400 - 252);
  });

  it('keeps the crop strictly inside the detected card rectangle', () => {
    const card = { x: 200, y: 300, width: 600, height: 840 };
    const box = cardCornerBox(card);
    expect(box.x).toBeGreaterThanOrEqual(card.x);
    expect(box.y).toBeGreaterThanOrEqual(card.y);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
    expect(box.y + box.height).toBeLessThanOrEqual(card.y + card.height);
  });
});
