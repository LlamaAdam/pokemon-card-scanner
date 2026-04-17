import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parsePsa10Price } from './priceChartingParser';

function fx(name: string) {
  return readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'pricecharting', name), 'utf8');
}

describe('parsePsa10Price', () => {
  it('extracts the PSA 10 price', () => {
    const r = parsePsa10Price(fx('obf-125.html'));
    expect(r.price).toBe(480);
    expect(r.reason).toBeUndefined();
  });

  it('returns not_found when no PSA 10 row exists', () => {
    const r = parsePsa10Price(fx('no-psa10.html'));
    expect(r.price).toBeNull();
    expect(r.reason).toBe('not_found');
  });

  it('returns not_found for non-HTML garbage (no PSA 10 row found)', () => {
    const r = parsePsa10Price('not html');
    expect(r.price).toBeNull();
    expect(r.reason).toBe('not_found');
  });
});
