# Pokemon Card Scanner

Mobile-first web app: scan a Pokemon card, see raw price, PSA 10 price, and whether it's worth grading.

## Stack
- Next.js 14 (pages router) + TypeScript
- Tesseract.js (OCR, browser Web Worker)
- OpenCV.js (centering + card detection, browser)
- Vercel serverless for `/api/card` and `/api/psa10`
- Upstash Redis (free tier) for PSA 10 price cache (24h hit, 1h miss)

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
| `UPSTASH_REDIS_REST_URL` | Prod | REST URL from your Upstash Redis database dashboard. |
| `UPSTASH_REDIS_REST_TOKEN` | Prod | REST token from your Upstash Redis database dashboard. |

Legacy `KV_REST_API_URL` / `KV_REST_API_TOKEN` (from the deprecated Vercel KV integration) are also honored, so existing deployments keep working.

If no credentials are set, the app falls back to an in-memory cache — useful for local dev but not persistent across serverless invocations.

## Tests
```bash
npm test              # vitest unit + API route tests
npm run test:e2e      # playwright visual regression (requires dev server)
```

## Deploying to Vercel
1. Push this repo to GitHub.
2. Import into Vercel (`vercel.com/new`).
3. Provision Upstash Redis (free tier): go to https://console.upstash.com → **Create Database** → Redis → pick **Global** (or a region close to your Vercel deployment) → copy the **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN** from the *REST API* panel.
4. In the Vercel project → Settings → Environment Variables, add both values for Production (and Preview if you want caching there too).
5. Optionally add `POKEMONTCG_API_KEY` in project env vars.
6. Deploy. The URL Vercel gives you works on iPhone/Android — no app store needed.

## Known fragility
The PSA 10 price comes from scraping pricecharting.com. When they change their HTML, `lib/priceChartingParser.ts` may need a small fix. Parser logic is isolated and fixture-tested, so fixes are localized. If the scraper becomes consistently broken, the fallback is their paid API (~$30/mo).

## Manual QA
See `docs/manual-qa.md` for the phone-hardware checklist before each release.
