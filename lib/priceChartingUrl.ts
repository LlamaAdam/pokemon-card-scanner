export const SET_SLUG_MAP: Record<string, string> = {
  SVI: 'scarlet-violet',
  PAL: 'paldea-evolved',
  OBF: 'obsidian-flames',
  MEW: 'pokemon-151',
  PAR: 'paradox-rift',
  PAF: 'paldean-fates',
  TEF: 'temporal-forces',
  TWM: 'twilight-masquerade',
  SFA: 'shrouded-fable',
  SCR: 'stellar-crown',
  SSP: 'surging-sparks',
  PRE: 'prismatic-evolutions',
  POR: 'perfect-order',
  SWSH: 'sword-shield',
  BRS: 'brilliant-stars',
  ASR: 'astral-radiance',
  LOR: 'lost-origin',
  SIT: 'silver-tempest',
  CRZ: 'crown-zenith',
};

export interface UrlInput {
  setCode: string;
  number: string;
  cardName: string;
}

function kebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\u2018\u2019\u02BC]/g, '') // strip ASCII and typographic apostrophes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function priceChartingUrl(input: UrlInput): string | null {
  const slug = SET_SLUG_MAP[input.setCode];
  if (!slug) return null;
  const name = kebab(input.cardName);
  const num = input.number.replace(/^0+/, '') || '0';
  return `https://www.pricecharting.com/game/pokemon-${slug}/${name}-${num}`;
}
