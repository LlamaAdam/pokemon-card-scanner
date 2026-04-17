import type { OcrResult } from './ocr';
import type { NormalizedCard } from './pokemonTcgClient';

export type ResolverOutcome =
  | { status: 'clean'; card: NormalizedCard }
  | { status: 'candidates'; candidates: NormalizedCard[] }
  | { status: 'unresolved' }
  | { status: 'upstream_error'; httpStatus: number };

export async function resolveFromOcr(ocr: OcrResult): Promise<ResolverOutcome> {
  // Clean-match path: both setCode and number present
  if (ocr.setCode && ocr.number) {
    const url = `/api/card?setCode=${encodeURIComponent(ocr.setCode)}&number=${encodeURIComponent(ocr.number)}`;
    const r = await fetch(url);
    if (r.status === 404) return { status: 'unresolved' };
    if (!r.ok) return { status: 'upstream_error', httpStatus: r.status };
    const card = await r.json() as NormalizedCard;
    return { status: 'clean', card };
  }

  // Nothing usable parsed from the corner
  return { status: 'unresolved' };
}

export async function searchByName(name: string): Promise<NormalizedCard[]> {
  const r = await fetch(`/api/card?name=${encodeURIComponent(name)}`);
  if (!r.ok) return [];
  const j = await r.json() as { results: NormalizedCard[] };
  return j.results ?? [];
}
