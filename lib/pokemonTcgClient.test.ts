import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { fetchCardByIdentifier } from './pokemonTcgClient';

const server = setupServer(
  http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    if (q.includes('set.ptcgoCode:OBF') && q.includes('number:125')) {
      return HttpResponse.json({
        data: [{
          id: 'obf-125', name: 'Charizard ex', number: '125',
          set: { id: 'obf', name: 'Obsidian Flames', ptcgoCode: 'OBF' },
          images: { small: 'https://img/small.png', large: 'https://img/large.png' },
          tcgplayer: { prices: { holofoil: { market: 45.5 } } },
        }],
      });
    }
    return HttpResponse.json({ data: [] });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchCardByIdentifier', () => {
  it('resolves a card by setCode + number', async () => {
    const card = await fetchCardByIdentifier({ setCode: 'OBF', number: '125' });
    expect(card?.id).toBe('obf-125');
    expect(card?.rawPrice).toBe(45.5);
  });

  it('returns null when no match', async () => {
    const card = await fetchCardByIdentifier({ setCode: 'ZZZ', number: '001' });
    expect(card).toBeNull();
  });
});
