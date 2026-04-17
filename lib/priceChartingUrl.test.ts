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
    const expected = ['OBF', 'PAR', 'MEW', 'PAF', 'TEF', 'TWM', 'SFA', 'SCR', 'SSP', 'POR'];
    for (const code of expected) expect(SET_SLUG_MAP[code]).toBeTypeOf('string');
  });
});
