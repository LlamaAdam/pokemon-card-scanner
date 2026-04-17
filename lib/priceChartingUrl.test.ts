import { describe, it, expect } from 'vitest';
import { priceChartingUrl, SET_SLUG_MAP } from './priceChartingUrl';

describe('priceChartingUrl', () => {
  it('builds a URL for a known set', () => {
    const url = priceChartingUrl({ setCode: 'OBF', number: '125', cardName: 'Charizard ex' });
    expect(url).toBe('https://www.pricecharting.com/game/pokemon-obsidian-flames/charizard-ex-125');
  });

  it('kebab-cases the card name', () => {
    const url = priceChartingUrl({ setCode: 'OBF', number: '125', cardName: "Professor's Research" });
    expect(url).toContain('professors-research-125');
  });

  it('strips non-alphanumeric characters from card name', () => {
    const url = priceChartingUrl({ setCode: 'OBF', number: '125', cardName: 'Mr. Mime V' });
    expect(url).toContain('mr-mime-v-125');
  });

  it('returns null when set code is unknown', () => {
    const url = priceChartingUrl({ setCode: 'ZZZ', number: '001', cardName: 'Pikachu' });
    expect(url).toBeNull();
  });

  it('SET_SLUG_MAP covers common modern sets', () => {
    const expected = ['OBF', 'PAR', 'MEW', 'PAF', 'TEF', 'TWM', 'SFA', 'SCR', 'SSP', 'POR', 'PRE'];
    for (const code of expected) expect(SET_SLUG_MAP[code]).toBeTypeOf('string');
  });

  it('POR maps to perfect-order, not prismatic-evolutions (regression)', () => {
    // pokemontcg.io ptcgoCode POR is the Mar-2026 set "Perfect Order" (me3).
    // Prismatic Evolutions (sv8pt5) uses ptcgoCode PRE. These must not swap.
    expect(SET_SLUG_MAP.POR).toBe('perfect-order');
    expect(SET_SLUG_MAP.PRE).toBe('prismatic-evolutions');
  });

  it('builds the correct pricecharting URL for Snivy 004/088 from Perfect Order', () => {
    const url = priceChartingUrl({ setCode: 'POR', number: '004', cardName: 'Snivy' });
    expect(url).toBe('https://www.pricecharting.com/game/pokemon-perfect-order/snivy-4');
  });
});
