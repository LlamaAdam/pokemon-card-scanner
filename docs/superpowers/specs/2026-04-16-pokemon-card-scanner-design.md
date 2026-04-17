# Pokemon Card Scanner — Design Spec

**Date:** 2026-04-16
**Status:** Approved, pending implementation plan
**Location:** `C:\Users\pilot\OneDrive\Documents\Python Scripts\pokemon-card-scanner\`

---

## 1. Product Summary

A mobile-first web app where a user points their phone camera at a Pokemon card and gets back:

- Raw market price
- PSA 10 price
- A "should you grade this?" verdict that accounts for PSA fees
- An optional front-face centering check that flags cards with a realistic shot at PSA 10

Session-based scan list (localStorage) for tallying a pile of cards. No user accounts in v1.

**Target users:** owner + a small group of friends (~5–20 people). No public scale concerns.

**Deployment:** Vercel URL (e.g., `<name>-cardscan.vercel.app`), opened in mobile Safari or Chrome. No app-store submission, no developer account fees.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Phone browser (iOS Safari / Android Chrome)            │
│                                                         │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐   │
│   │  Camera     │  │ Tesseract.js │  │ OpenCV.js    │   │
│   │  capture    │─▶│   OCR        │  │ centering    │   │
│   └─────────────┘  └──────┬───────┘  └──────┬───────┘   │
│                           │                 │           │
│                           ▼                 │           │
│                  ┌────────────────┐         │           │
│                  │ Card resolver  │         │           │
│                  │ (name+set#)    │         │           │
│                  └────────┬───────┘         │           │
│                           │                 │           │
│                           ▼                 ▼           │
│                  ┌──────────────────────────────┐       │
│                  │ Result view + scan list      │       │
│                  │ (localStorage)               │       │
│                  └────────────┬─────────────────┘       │
└───────────────────────────────┼─────────────────────────┘
                                │
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel serverless                                      │
│                                                         │
│   ┌─────────────────┐    ┌──────────────────────────┐   │
│   │ /api/card       │    │ /api/psa10               │   │
│   │ (pokemontcg.io  │    │ (pricecharting scrape +  │   │
│   │  proxy)         │    │  Vercel KV cache 24h)    │   │
│   └─────────────────┘    └──────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Modules (each small and single-purpose)

- `lib/ocr.ts` — wraps Tesseract.js. Takes an image blob, crops the **bottom-left corner** (the card's identifier block), and returns `{ setCode, number, total, regulationMark, language, illustrator }` best-effort. See "OCR target region" below.
- `lib/centering.ts` — wraps OpenCV.js. Takes an image blob, returns `{ lr, tb, verdict }` or `null` if unmeasurable.
- `lib/cardResolver.ts` — takes OCR output, queries `/api/card`, returns a normalized `Card` or a list of fuzzy candidates.
- `lib/grading.ts` — pure function. Given `{ rawPrice, psa10Price, tier }`, returns `{ netProfit, multiplier, verdict }`.
- `lib/scanList.ts` — localStorage CRUD for the session scan list.
- `lib/priceChartingUrl.ts` — maps `(setCode, number)` to the PriceCharting URL pattern.
- `pages/api/card.ts` — proxies pokemontcg.io, hides API key.
- `pages/api/psa10.ts` — fetches and parses the PriceCharting page, caches in KV.

**Why this split:** OCR, centering, and pricing are independent — each can be tested and swapped alone. The card resolver is the only place that decides whether OCR output was good enough; that logic stays out of the UI.

### OCR target region: the bottom-left corner

Modern English Pokemon cards carry a consistent identifier block in the bottom-left corner in small regular-weight text:

```
Illus. [Artist Name]
[RegulationMark]    [SetCode] [Language]
[Number]/[SetTotal] [RaritySymbols]
```

Example from a Scarlet & Violet Black Bolt Meowth ex:

```
Illus. Natsumi Yoshida
J    POR EN
121/088 ★★
```

**Why this is the right OCR target instead of the card name at the top:**

- **Consistent background and font** — always small regular-weight text on a clean strip, regardless of card art style.
- **Robust to full-art / illustration rares** — the card name on full-arts is stylized foil text over busy artwork and breaks OCR badly. The corner text stays legible.
- **Smaller crop = faster OCR** — Tesseract only processes ~5–8% of the image.
- **Set code + collector number is a unique key** — `(POR, 121/088)` identifies exactly one printed card. We don't need the name for resolution.
- **Catches secret rares automatically** — when the collector number exceeds the set total (e.g., `121/088`), we know it's a secret/special card and can flag it to the resolver.

**Implementation approach:**

1. Detect the card's outer rectangle via OpenCV.js (same pipeline as centering — share the work).
2. Apply a perspective transform to straighten the card.
3. Crop the bottom-left ~25% × ~15% region.
4. Run Tesseract with a character allowlist tuned for this region: `A-Z0-9/★☆. ` (no lowercase except for `Illus.`).
5. Regex-parse the OCR text:
   - `(\d+)/(\d+)` → collector number + set total
   - `\b([A-Z]{2,4})\s+(EN|JP|DE|FR|IT|ES|PT)\b` → set code + language
   - Leading single letter before the set code → regulation mark
   - `Illus\.\s+(.+)` → illustrator name (display-only)
6. The card **name** is fetched from pokemontcg.io using `(setCode, number)` as the lookup, not OCR'd.

**Fallback:** if corner OCR fails, fall back to OCR'ing the card name at the top as a secondary signal, then let the resolver fuzzy-match against pokemontcg.io's name index.

### Tech stack

- **Frontend:** Next.js (React), mobile-first layout
- **OCR:** Tesseract.js, run in a Web Worker so the UI stays responsive
- **Centering:** OpenCV.js
- **Raw prices:** pokemontcg.io (TCGplayer market price in response)
- **PSA 10 prices:** pricecharting.com scrape via server-side fetch, cached in Vercel KV
- **Hosting:** Vercel free tier (includes KV + serverless functions)
- **State:** `localStorage` for the scan list, versioned keys

---

## 3. User Flow

### Primary flow — scan a card

1. User opens the site on a phone. Landing page shows a large **Scan a Card** button and the current session scan list below (if any).
2. Tap **Scan a Card** → native camera opens via `<input type="file" accept="image/*" capture="environment">` (works on iOS and Android without permissions friction).
3. Capture guidance appears before the shot: *"Fit the whole card in frame, flat and straight. The bottom-left corner should be readable."*
4. Image returns → OCR runs in a Web Worker. UI shows "Reading card…".
5. OCR reads the **bottom-left corner identifier block** (set code + collector number). `cardResolver` hits `/api/card` with `(setCode, number)`:
   - **Clean match** (both set code and number parsed confidently) → show the card. This is the fast path and should cover the large majority of scans.
   - **Partial parse** (number read, set code unreadable, or vice versa) → fall back to top-of-card name OCR; resolver queries by name + partial identifier, shows top-3 candidate picker.
   - **No usable OCR** → show retake + manual-search options.
6. Centering analysis runs in parallel on the same image; result appears on the card detail view when ready.
7. Result view shows:
   - Card art, name, set, collector number (pokemontcg.io)
   - Raw price (pokemontcg.io / TCGplayer market)
   - PSA 10 price (async from `/api/psa10`, skeleton until ready)
   - Grading verdict (once both prices are in): net profit after PSA fees, plus verdict label
   - Centering: "Front: 55/45 L/R, 60/40 T/B — borderline for PSA 10" or "couldn't measure"
   - Buttons: **Add to list**, **Scan another**

### Secondary flows

- **Session list view** — table of thumbnail, name, raw, PSA 10, net-if-graded. Sticky footer with totals: raw, PSA 10, net value of grading candidates. Swipe-to-delete rows. "Clear list" wipes localStorage.
- **Manual search fallback** — text search against pokemontcg.io when OCR fails.
- **PSA fee tier selector** — dropdown in settings/header: Value / Regular / Express. Default Value. Persists in localStorage. Grading math re-runs on change.

### Design decisions baked into the flow

- OCR + centering run **in parallel**, not sequential.
- PSA 10 fetch is **async and non-blocking** — raw price + card identity appear immediately.
- **No photo upload** — all image processing is client-side. The server only ever sees card identifiers. Saves bandwidth and eliminates image-privacy concerns.

---

## 4. Data Model and Caching

### Client state — localStorage

```ts
// key: "cardscan.scanlist.v1"
type ScanListEntry = {
  id: string;              // uuid
  scannedAt: number;       // epoch ms
  cardId: string;          // pokemontcg.io id, e.g. "sv3pt5-185"
  name: string;
  setName: string;
  setCode: string;
  number: string;
  imageUrl: string;        // small card image from pokemontcg.io
  rawPrice: number | null; // USD
  psa10Price: number | null;
  centering: {
    lr: string;            // e.g. "55/45"
    tb: string;
    verdict: "good" | "borderline" | "poor" | "unmeasurable";
  } | null;
};

// key: "cardscan.settings.v1"
type Settings = {
  psaTier: "value" | "regular" | "express";
};
```

### Server state — Vercel KV

```
Key: psa10:{setCode}:{number}          TTL: 24h
Value: { price: number, fetchedAt: number, source: "pricecharting" }

Key: psa10:{setCode}:{number}:miss     TTL: 1h    // negative cache
Value: { reason: "not_found" | "parse_error" }
```

Short negative TTL so missing cards don't re-scrape every request, but we retry frequently enough to pick up newly-listed cards within an hour.

### PSA grading fee constants (`lib/grading.ts`)

```ts
const PSA_FEES = {
  value:   { fee: 19.99, shipReturn: 15 },   // ~$35 all-in per card
  regular: { fee: 39.99, shipReturn: 15 },
  express: { fee: 99.99, shipReturn: 20 },
};

function gradingVerdict(raw, psa10, tier) {
  const totalCost = PSA_FEES[tier].fee + PSA_FEES[tier].shipReturn;
  const net = psa10 - raw - totalCost;
  if (net > 50) return "worth_grading";
  if (net > 0)  return "borderline";
  return "not_worth";
}
```

Fees are constants so they're easy to update when PSA adjusts pricing.

### Centering verdict thresholds (`lib/centering.ts`)

Worst-side ratio on the front face drives the verdict (PSA 10 front guideline is ~55/45 or better):

```ts
function centeringVerdict(lrWorstSide: number, tbWorstSide: number) {
  const worst = Math.max(lrWorstSide, tbWorstSide); // the more off-center axis
  if (worst <= 55) return "good";        // ≤ 55/45 — PSA 10 viable
  if (worst <= 60) return "borderline";  // 55–60 — PSA 9 likely, PSA 10 possible
  return "poor";                          // > 60 — PSA 10 unrealistic
}
```

If the inner frame can't be detected (borderless/full-art, bad photo), verdict is `unmeasurable` and no ratios are reported.

### External APIs

- **pokemontcg.io** — `/v2/cards?q=name:"Charizard" set.id:sv3pt5 number:185`. Response includes `tcgplayer.prices.holofoil.market` or `normal.market`. Free tier ~20k req/day; API key optional but boosts limits. Store key in a Vercel env var.
- **pricecharting.com** — scrape the card page (e.g., `pricecharting.com/game/pokemon-{set-slug}/{card-name}-{number}`). Parse the "Graded" row → "PSA 10" column. URL pattern is stable-ish; a `lib/priceChartingUrl.ts` helper maps `(setCode, number)` tuples to their URL scheme.

### Key non-obvious decisions

- **Versioned localStorage keys (`.v1`)** — schema changes in v2 can ignore old data cleanly.
- **Cache key is `setCode:number`** — collector number + set is the unique ID. Two cards named "Charizard" in one set differ only by number.
- **Only PSA 10 prices are cached server-side** — pokemontcg.io is already fast; PriceCharting is the fragile dependency, so that's where the cache lives.
- **Images stay client-side** — zero image-hosting cost, no privacy concerns.

---

## 5. Error Handling

| Failure | Handling |
|---|---|
| OCR garbage on bottom-left corner (blur, glare, finger covering it) | Retry with the card-name region at the top. If that also fails: "Couldn't read it" with Retake + Manual search. Never silent-fail. |
| OCR partial — number parsed, set code unreadable | Query pokemontcg.io with just the number across recent sets, show top-3 candidates ranked by set recency. |
| OCR partial — name path match is fuzzy | If top result's Levenshtein distance is within threshold, show top-3 candidates for confirmation. |
| Collector number > set total (e.g., `121/088`) | Treated as a secret/special rare, not an error. Flag it in the UI ("secret rare") for grading-decision context. |
| pokemontcg.io down / rate-limited | `/api/card` returns 503 `{ error: "pricing_unavailable" }`. UI shows card (if session-cached) with "Price unavailable — try again shortly." Scan list still works. |
| PriceCharting parse failure | `/api/psa10` returns `{ price: null, reason: "parse_error" }`. UI: "PSA 10 price unavailable." Grading verdict: "Can't determine." Server-side log captures the HTML snippet for debugging. |
| PriceCharting 404 (new/obscure card) | Cache as `not_found` for 1h. UI: "No PSA 10 data available." |
| Centering: can't find edges | Return `null`. UI: "Centering check unavailable — try a flatter, well-lit photo." Doesn't block price flow. |
| Centering: borderless/full-art | Detect absence of inner frame, return `{ verdict: "unmeasurable" }`. UI explains why. |
| Camera access denied | Fall back to manual search with an explanatory banner. |
| localStorage unavailable (private browsing) | Scan list falls back to in-memory for the session. One-time banner. |
| Duplicate scan | Allowed — user may own multiple copies. Entries have unique IDs. No auto-dedupe. |

---

## 6. Testing

### Unit tests (Vitest)

Pure functions get real tests:

- `lib/grading.ts` — verdict math at fee boundaries.
- `lib/priceChartingUrl.ts` — URL mapping with a fixture table of known-good mappings.
- `lib/cardResolver.ts` — fuzzy matching thresholds with fixture OCR outputs.
- `lib/ocr.ts` corner-parser — regex parsing of the bottom-left block against a fixture table of ~20 real card corners (including edge cases: secret rares where number > total, double-digit set codes, Japanese `JP` language, illustration rares with star/symbol rarity glyphs).
- `lib/scanList.ts` — CRUD against a mock localStorage.

### Integration tests (Vitest + MSW)

API routes tested with mocked upstream responses:

- `/api/card` — happy path, rate-limit response, 5xx.
- `/api/psa10` — fixture HTML parsing (a real PriceCharting HTML snapshot for a known card lives in `test/fixtures/`). Covers KV cache hit, negative cache, parse failure.

### Visual regression (Playwright)

Screenshot the card detail view and scan list view at 375×812 (iPhone viewport).

### Manual mobile QA

`docs/manual-qa.md` checklist:

- iOS Safari: camera opens, capture, OCR, result shows.
- Android Chrome: same.
- Scan 10 real cards of varying rarity and age, log accuracy.

### Coverage target

80% on `lib/*` pure logic. UI components and API routes covered by integration tests, not coverage-chased. OCR/OpenCV wrappers are tested via the resolver and centering modules that depend on them.

### Explicitly not tested

- Tesseract.js and OpenCV.js internals — trusted dependencies.
- Live PriceCharting HTML — fixture-based only to avoid flakiness from external state.

---

## 7. MVP Scope

### In scope for v1

- [x] Camera capture on iOS + Android mobile web
- [x] OCR of the bottom-left corner identifier block (set code + collector number + regulation mark + language + illustrator) via Tesseract.js, with card-name OCR as a fallback
- [x] Card resolution against pokemontcg.io with fuzzy fallback and manual search
- [x] Raw market price from pokemontcg.io
- [x] PSA 10 price via server-side PriceCharting scrape, cached 24h in Vercel KV
- [x] Grading verdict with PSA tier selector (Value / Regular / Express)
- [x] Front-face centering check via OpenCV.js with L/R + T/B ratios and verdict
- [x] Session scan list in localStorage with totals, per-card net-if-graded, swipe to delete, clear all
- [x] Error handling for every failure mode in Section 5
- [x] Card scope: English Pokemon TCG ~2000–present

### Out of scope for v1

- User accounts, cloud-synced collections, multi-device
- Back-face centering capture (two-photo flow)
- Vintage holo edge cases, Japanese cards, promos with odd formats
- Image recognition (match by art instead of OCR)
- Price history, trend graphs, alerts
- PSA population reports, predicted grade from photo
- Bulk scan / video-stream continuous scanning
- PWA install / offline mode
- Shareable scan list links
- Non-PSA grading companies (CGC, BGS, TAG)

### Deliverables

- Vercel deployment at a public URL
- GitHub repo: code, README with setup/env vars/tests/fragility notes on the PriceCharting scraper
- `docs/manual-qa.md` checklist
- This spec committed to the repo

### Known risks

1. **PriceCharting scraper will break** eventually when their HTML changes. Parser is isolated and fixture-tested, so fixes are localized. Escape hatch: $30/mo PriceCharting API.
2. **OCR accuracy varies** with card condition, lighting, camera. Targeting the bottom-left corner (clean regular-weight text on a uniform strip) should push first-try hit rate above the 70–85% baseline we'd see OCR'ing the stylized card name, but full-arts with heavy foil at the corner and heavily-played cards with scuffed bottoms will still fail. Fuzzy-match and manual-search fallbacks mean the user is never stuck.
3. **Centering is a guide, not a PSA prediction.** UI copy reflects that ("looks borderline" not "will get a 9").
4. **pokemontcg.io TCGplayer pricing can lag** by a day or two. Good enough for grading decisions; not for day-trading rips.
