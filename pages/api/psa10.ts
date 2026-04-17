import type { NextApiRequest, NextApiResponse } from 'next';
import { kv } from '@vercel/kv';
import { priceChartingUrl } from '@/lib/priceChartingUrl';
import { parsePsa10Price } from '@/lib/priceChartingParser';

const TTL_HIT = 60 * 60 * 24;
const TTL_MISS = 60 * 60;

interface HitEntry { price: number; fetchedAt: number; }
interface MissEntry { reason: 'not_found' | 'parse_error'; fetchedAt: number; }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { setCode, number, cardName } = req.query as Record<string, string | undefined>;
  if (!setCode || !number || !cardName) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const hitKey = `psa10:${setCode}:${number}`;
  const missKey = `${hitKey}:miss`;

  const hit = await kv.get<HitEntry>(hitKey);
  if (hit?.price != null) {
    return res.status(200).json({ price: hit.price, cached: true, fetchedAt: hit.fetchedAt });
  }
  const miss = await kv.get<MissEntry>(missKey);
  if (miss?.reason) {
    return res.status(200).json({ price: null, reason: miss.reason, cached: true });
  }

  const url = priceChartingUrl({ setCode, number, cardName });
  if (!url) return res.status(404).json({ error: 'unknown_set' });

  let html: string;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 cardscan-bot' } });
    if (!r.ok) {
      if (r.status === 404) {
        await kv.set(missKey, { reason: 'not_found', fetchedAt: Date.now() }, { ex: TTL_MISS });
        return res.status(200).json({ price: null, reason: 'not_found', cached: false });
      }
      return res.status(503).json({ error: 'scrape_failed', status: r.status });
    }
    html = await r.text();
  } catch (e) {
    return res.status(503).json({ error: 'scrape_failed', detail: String(e) });
  }

  const parsed = parsePsa10Price(html);
  if (parsed.price != null) {
    const entry: HitEntry = { price: parsed.price, fetchedAt: Date.now() };
    await kv.set(hitKey, entry, { ex: TTL_HIT });
    return res.status(200).json({ price: parsed.price, cached: false, fetchedAt: entry.fetchedAt });
  }

  const reason = parsed.reason ?? 'parse_error';
  await kv.set(missKey, { reason, fetchedAt: Date.now() }, { ex: TTL_MISS });
  return res.status(200).json({ price: null, reason, cached: false });
}
