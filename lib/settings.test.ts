import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, setPsaTier } from './settings';

describe('settings', () => {
  beforeEach(() => localStorage.clear());
  it('defaults psaTier to value', () => {
    expect(getSettings().psaTier).toBe('value');
  });
  it('persists a new tier', () => {
    setPsaTier('regular');
    expect(getSettings().psaTier).toBe('regular');
  });
  it('rejects invalid tier (falls back to default)', () => {
    localStorage.setItem('cardscan.settings.v1', JSON.stringify({ psaTier: 'bogus' }));
    expect(getSettings().psaTier).toBe('value');
  });
});
