import { describe, it, expect } from 'vitest';
import { gradingVerdict, PSA_FEES, type PsaTier } from './grading';

describe('gradingVerdict', () => {
  it('returns worth_grading when net profit > $50', () => {
    const r = gradingVerdict({ rawPrice: 10, psa10Price: 200, tier: 'value' });
    expect(r.verdict).toBe('worth_grading');
    expect(r.netProfit).toBeCloseTo(200 - 10 - 34.99, 2);
    expect(r.multiplier).toBeCloseTo(20, 2);
  });

  it('returns borderline when net is 0 < net <= 50', () => {
    const r = gradingVerdict({ rawPrice: 50, psa10Price: 100, tier: 'value' });
    expect(r.verdict).toBe('borderline');
  });

  it('returns not_worth when net is negative', () => {
    const r = gradingVerdict({ rawPrice: 30, psa10Price: 40, tier: 'value' });
    expect(r.verdict).toBe('not_worth');
    expect(r.netProfit).toBeLessThan(0);
  });

  it('uses regular-tier fees when tier=regular', () => {
    const value = gradingVerdict({ rawPrice: 10, psa10Price: 100, tier: 'value' });
    const regular = gradingVerdict({ rawPrice: 10, psa10Price: 100, tier: 'regular' });
    expect(regular.netProfit).toBeLessThan(value.netProfit);
  });

  it('returns null verdict when psa10Price is null', () => {
    const r = gradingVerdict({ rawPrice: 10, psa10Price: null, tier: 'value' });
    expect(r.verdict).toBe('unknown');
    expect(r.netProfit).toBeNull();
  });

  it('exposes fee constants for every tier', () => {
    const tiers: PsaTier[] = ['value', 'regular', 'express'];
    for (const t of tiers) {
      expect(PSA_FEES[t].fee).toBeGreaterThan(0);
      expect(PSA_FEES[t].shipReturn).toBeGreaterThan(0);
    }
  });
});
