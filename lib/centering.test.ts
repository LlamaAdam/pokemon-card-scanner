import { describe, it, expect } from 'vitest';
import { centeringVerdict, ratioString, computeRatios } from './centering';

describe('computeRatios', () => {
  it('computes L/R and T/B worst-side percentages', () => {
    const r = computeRatios({
      outerWidth: 100, outerHeight: 140,
      left: 10, right: 20, top: 15, bottom: 15,
    });
    expect(r.lrWorst).toBeCloseTo(66.67, 1);
    expect(r.tbWorst).toBeCloseTo(50, 1);
    expect(r.lrLabel).toBe('33/67');
    expect(r.tbLabel).toBe('50/50');
  });
});

describe('centeringVerdict', () => {
  it('good when worst ≤ 55', () => {
    expect(centeringVerdict(55, 52)).toBe('good');
  });
  it('borderline when worst 55–60', () => {
    expect(centeringVerdict(58, 52)).toBe('borderline');
  });
  it('poor when worst > 60', () => {
    expect(centeringVerdict(61, 52)).toBe('poor');
  });
  it('uses the worse of the two axes', () => {
    expect(centeringVerdict(52, 70)).toBe('poor');
  });
});

describe('ratioString', () => {
  it('formats smaller-side/larger-side', () => {
    expect(ratioString(10, 20)).toBe('33/67');
    expect(ratioString(15, 15)).toBe('50/50');
  });
});
