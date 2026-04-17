import { describe, it, expect, beforeAll, afterAll, afterEach, vi, type Mock } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/card';

const server = setupServer(
  http.get('https://api.pokemontcg.io/v2/cards', () =>
    HttpResponse.json({
      data: [{
        id: 'obf-125', name: 'Charizard ex', number: '125',
        set: { id: 'obf', name: 'Obsidian Flames', ptcgoCode: 'OBF' },
        images: { small: 's.png', large: 'l.png' },
        tcgplayer: { prices: { holofoil: { market: 45 } } },
      }],
    }),
  ),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

describe('/api/card', () => {
  it('returns 400 when setCode missing', async () => {
    const req = { method: 'GET', query: { number: '125' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns normalized card on success', async () => {
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as unknown as Mock).mock.calls[0][0]).toMatchObject({ id: 'obf-125', rawPrice: 45 });
  });

  it('returns 404 when card not found', async () => {
    server.use(http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json({ data: [] })));
    const req = { method: 'GET', query: { setCode: 'ZZZ', number: '001' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 503 when upstream fails', async () => {
    server.use(http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.text('boom', { status: 500 })));
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
