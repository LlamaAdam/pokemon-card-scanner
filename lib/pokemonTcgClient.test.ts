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
    // pokemontcg.io stores number with no leading zeros: `4` matches, `004` does not.
    if (q.includes('set.ptcgoCode:POR') && /number:4(?!\d)/.test(q)) {
      return HttpResponse.json({
        data: [{
          id: 'me3-4', name: 'Snivy', number: '4',
          set: { id: 'me3', name: 'Perfect Order', ptcgoCode: 'POR' },
          images: { small: 'https://img/s.png', large: 'https://img/l.png' },
          tcgplayer: { prices: { normal: { market: 0.25 } } },
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

  it('strips leading zeros from number before querying (regression: Snivy 004/088)', async () => {
    // OCR reads the printed "004/088" as "004", but pokemontcg.io stores
    // the number as "4". Without normalization the query returns 0 hits.
    const card = await fetchCardByIdentifier({ setCode: 'POR', number: '004' });
    expect(card?.id).toBe('me3-4');
    expect(card?.name).toBe('Snivy');
  });

  it('preserves non-numeric suffixes like TG01 or SV001', async () => {
    // Should still attempt the query with the original string (even if it misses here).
    const card = await fetchCardByIdentifier({ setCode: 'POR', number: 'TG01' });
    expect(card).toBeNull();
  });
});
