export interface NormalizedCard {
  id: string;
  name: string;
  number: string;
  setId: string;
  setName: string;
  setCode: string;
  imageSmall: string;
  imageLarge: string;
  rawPrice: number | null;
}

interface RawCard {
  id: string;
  name: string;
  number: string;
  set: { id: string; name: string; ptcgoCode?: string };
  images: { small: string; large: string };
  tcgplayer?: {
    prices?: Record<string, { market?: number | null } | undefined>;
  };
}

const BASE = 'https://api.pokemontcg.io/v2';

function extractMarket(tcg: RawCard['tcgplayer']): number | null {
  if (!tcg?.prices) return null;
  const priority = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', 'unlimitedHolofoil'];
  for (const k of priority) {
    const m = tcg.prices[k]?.market;
    if (typeof m === 'number') return m;
  }
  for (const v of Object.values(tcg.prices)) {
    if (typeof v?.market === 'number') return v.market;
  }
  return null;
}

function normalize(raw: RawCard): NormalizedCard {
  return {
    id: raw.id,
    name: raw.name,
    number: raw.number,
    setId: raw.set.id,
    setName: raw.set.name,
    setCode: raw.set.ptcgoCode ?? raw.set.id.toUpperCase(),
    imageSmall: raw.images.small,
    imageLarge: raw.images.large,
    rawPrice: extractMarket(raw.tcgplayer),
  };
}

export async function fetchCardByIdentifier(
  input: { setCode: string; number: string },
  apiKey?: string,
): Promise<NormalizedCard | null> {
  const q = `set.ptcgoCode:${input.setCode} number:${input.number}`;
  const url = `${BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1`;
  const res = await fetch(url, {
    ...(apiKey ? { headers: { 'X-Api-Key': apiKey } } : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`pokemontcg.io ${res.status}`);
  const json = await res.json() as { data: RawCard[] };
  return json.data?.[0] ? normalize(json.data[0]) : null;
}

export async function fetchCardsByName(name: string, apiKey?: string): Promise<NormalizedCard[]> {
  const q = `name:"${name.replace(/"/g, '')}"`;
  const url = `${BASE}/cards?q=${encodeURIComponent(q)}&pageSize=10`;
  const res = await fetch(url, {
    ...(apiKey ? { headers: { 'X-Api-Key': apiKey } } : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`pokemontcg.io ${res.status}`);
  const json = await res.json() as { data: RawCard[] };
  return (json.data ?? []).map(normalize);
}
