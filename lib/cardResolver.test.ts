import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveFromOcr } from './cardResolver';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('resolveFromOcr', () => {
  beforeEach(() => fetchMock.mockReset());

  it('returns clean match when setCode + number parsed and API returns a card', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ id: 'obf-125', name: 'Charizard ex', setCode: 'OBF', number: '125', rawPrice: 45 }),
    });
    const r = await resolveFromOcr({
      setCode: 'OBF', number: '125', total: '197',
      regulationMark: 'G', language: 'EN', illustrator: null, isSecretRare: false,
      rawText: '', confidence: 90,
    });
    expect(r.status).toBe('clean');
    if (r.status === 'clean') expect(r.card.id).toBe('obf-125');
  });

  it('returns candidates when only number parsed (name-search fallback disabled)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
    const r = await resolveFromOcr({
      setCode: null, number: '125', total: null,
      regulationMark: null, language: null, illustrator: null, isSecretRare: false,
      rawText: '', confidence: 50,
    });
    expect(r.status).toBe('unresolved');
  });

  it('returns unresolved when OCR gave nothing', async () => {
    const r = await resolveFromOcr({
      setCode: null, number: null, total: null,
      regulationMark: null, language: null, illustrator: null, isSecretRare: false,
      rawText: '', confidence: 0,
    });
    expect(r.status).toBe('unresolved');
  });

  it('returns 503 marker when API errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'pricing_unavailable' }) });
    const r = await resolveFromOcr({
      setCode: 'OBF', number: '125', total: '197',
      regulationMark: null, language: 'EN', illustrator: null, isSecretRare: false,
      rawText: '', confidence: 90,
    });
    expect(r.status).toBe('upstream_error');
  });
});
