import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const kvStore = new Map<string, unknown>();
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(async (k: string) => kvStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown, _opts?: unknown) => { kvStore.set(k, v); }),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import handler from './psa10';

function mockRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

describe('/api/psa10', () => {
  beforeEach(() => { kvStore.clear(); fetchMock.mockReset(); });

  it('returns 400 if setCode or number missing', async () => {
    const req = { method: 'GET', query: {} } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns cached price without fetching', async () => {
    kvStore.set('psa10:OBF:125', { price: 480, fetchedAt: Date.now() });
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125', cardName: 'Charizard ex' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ price: 480, cached: true });
  });

  it('scrapes, caches, and returns on cache miss', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        '<html><body><table><tr><td>PSA 10</td><td>$500.00</td></tr></table></body></html>',
    });
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125', cardName: 'Charizard ex' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ price: 500, cached: false });
    expect(kvStore.get('psa10:OBF:125')).toMatchObject({ price: 500 });
  });

  it('caches negative result on parse miss', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => '<html><body>no psa</body></html>',
    });
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125', cardName: 'Charizard ex' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(kvStore.get('psa10:OBF:125:miss')).toMatchObject({ reason: 'not_found' });
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ price: null, reason: 'not_found' });
  });

  it('returns 404 when set code is not in SET_SLUG_MAP', async () => {
    const req = { method: 'GET', query: { setCode: 'ZZZ', number: '001', cardName: 'Foo' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
