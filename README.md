# Pokemon Card Scanner

Mobile-first web app: scan a Pokemon card, see raw price, PSA 10 price, and whether it's worth grading.

## Stack
- Next.js 14 (pages router) + TypeScript
- Tesseract.js (OCR, browser Web Worker)
- OpenCV.js (centering + card detection, browser)
- Vercel serverless for `/api/card` and `/api/psa10`
- Vercel KV for PSA 10 price cache (24h hit, 1h miss)

## Local setup
```bash
npm install
cp .env.example .env.local
# edit .env.local (optional pokemontcg key)
npm run dev
```

## Environment variables

| Var | Required? | What it is |
|-----|-----------|------------|
| `POKEMONTCG_API_KEY` | No | Bumps rate limit on pokemontcg.io. Anonymous works for low traffic. |
| `KV_REST_API_URL` | Prod only | Provided automatically by Vercel when KV is linked. |
| `KV_REST_API_TOKEN` | Prod only | Provided automatically by Vercel when KV is linked. |

## Tests
```bash
npm test              # vitest unit + API route tests
npm run test:e2e      # playwright visual regression (requires dev server)
```

## Deploying to Vercel
1. Push this repo to GitHub.
2. Import into Vercel (`vercel.com/new`).
3. Create a KV store: Vercel dashboard → Storage → Create → KV. Link it to the project. `KV_REST_API_URL` / `KV_REST_API_TOKEN` populate automatically.
4. Optionally add `POKEMONTCG_API_KEY` in project env vars.
5. Deploy. The URL Vercel gives you works on iPhone/Android — no app store needed.

## Known fragility
The PSA 10 price comes from scraping pricecharting.com. When they change their HTML, `lib/priceChartingParser.ts` may need a small fix. Parser logic is isolated and fixture-tested, so fixes are localized. If the scraper becomes consistently broken, the fallback is their paid API (~$30/mo).

## Manual QA
See `docs/manual-qa.md` for the phone-hardware checklist before each release.
