import { parse } from 'node-html-parser';

export interface Psa10ParseResult {
  price: number | null;
  reason?: 'not_found' | 'parse_error';
}

export function parsePsa10Price(html: string): Psa10ParseResult {
  try {
    const root = parse(html);
    const rows = root.querySelectorAll('tr');
    for (const row of rows) {
      const text = row.textContent.trim();
      if (/\bPSA\s*10\b/i.test(text)) {
        const m = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
        if (m) return { price: Number(m[1].replace(/,/g, '')) };
      }
    }
    return { price: null, reason: 'not_found' };
  } catch {
    return { price: null, reason: 'parse_error' };
  }
}
