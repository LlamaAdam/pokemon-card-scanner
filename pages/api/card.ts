import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchCardByIdentifier, fetchCardsByName } from '@/lib/pokemonTcgClient';

function singleParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? undefined : v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const apiKey = process.env.POKEMONTCG_API_KEY || undefined;
  const setCode = singleParam(req.query.setCode);
  const number = singleParam(req.query.number);
  const name = singleParam(req.query.name);

  try {
    if (setCode && number) {
      const card = await fetchCardByIdentifier({ setCode, number }, apiKey);
      if (!card) return res.status(404).json({ error: 'not_found' });
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
      return res.status(200).json(card);
    }
    if (name) {
      const cards = await fetchCardsByName(name, apiKey);
      return res.status(200).json({ results: cards });
    }
    return res.status(400).json({ error: 'missing_params', detail: 'Provide (setCode, number) or name.' });
  } catch (e) {
    console.error('[card] upstream error', e);
    return res.status(503).json({ error: 'pricing_unavailable' });
  }
}
