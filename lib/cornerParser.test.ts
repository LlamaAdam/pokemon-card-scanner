import { describe, it, expect } from 'vitest';
import { parseCorner } from './cornerParser';
import { CORNER_FIXTURES } from '../test/fixtures/corners';

describe('parseCorner', () => {
  for (const fx of CORNER_FIXTURES) {
    it(fx.label, () => {
      const r = parseCorner(fx.ocrText);
      expect(r).toEqual(fx.expected);
    });
  }

  it('is pure — same input returns equal result', () => {
    const a = parseCorner(CORNER_FIXTURES[0].ocrText);
    const b = parseCorner(CORNER_FIXTURES[0].ocrText);
    expect(a).toEqual(b);
  });
});
