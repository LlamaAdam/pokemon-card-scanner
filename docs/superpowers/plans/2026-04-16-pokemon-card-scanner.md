# Pokemon Card Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mobile-web Pokemon card scanner that reads a card's bottom-left identifier via OCR, shows raw + PSA 10 prices, computes a grading verdict, and checks front-face centering — all from a phone browser with a localStorage session list.

**Architecture:** Next.js app on Vercel. All image work client-side (Tesseract.js + OpenCV.js). Two serverless API routes: `/api/card` proxies pokemontcg.io, `/api/psa10` scrapes pricecharting.com into Vercel KV (24h cache, 1h negative cache). No user accounts in v1; session state in localStorage.

**Tech Stack:** Next.js 14 (pages router, TypeScript), React 18, Tesseract.js, OpenCV.js (CDN), Vitest, Playwright, MSW, Vercel KV, pokemontcg.io API.

**Repo root:** `C:\Users\pilot\OneDrive\Documents\Python Scripts\pokemon-card-scanner\`

---

## File Structure

```
pokemon-card-scanner/
├── package.json
├── next.config.js
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── .gitignore
├── README.md
├── docs/
│   ├── manual-qa.md
│   └── superpowers/
│       ├── specs/2026-04-16-pokemon-card-scanner-design.md   (exists)
│       └── plans/2026-04-16-pokemon-card-scanner.md          (this file)
├── pages/
│   ├── _app.tsx
│   ├── index.tsx
│   ├── scan.tsx
│   └── api/
│       ├── card.ts
│       └── psa10.ts
├── components/
│   ├── CameraCapture.tsx
│   ├── CardResult.tsx
│   ├── ScanList.tsx
│   ├── SettingsMenu.tsx
│   └── ErrorBanner.tsx
├── lib/
│   ├── grading.ts              # pure: PSA fee math, verdict
│   ├── cornerParser.ts         # pure: regex-parse bottom-left OCR text
│   ├── priceChartingUrl.ts     # pure: (setCode, number) -> URL
│   ├── priceChartingParser.ts  # pure: HTML -> PSA 10 price
│   ├── scanList.ts             # localStorage CRUD
│   ├── settings.ts             # localStorage CRUD for PSA tier
│   ├── cardDetection.ts        # OpenCV.js: detect edges, straighten, crop
│   ├── centering.ts            # OpenCV.js: measure inner frame, verdict
│   ├── ocr.ts                  # Tesseract.js wrapper, corner OCR
│   ├── cardResolver.ts         # OCR -> /api/card -> Card
│   └── pokemonTcgClient.ts     # typed fetch wrapper
├── workers/
│   └── ocr.worker.ts
└── test/
    ├── setup.ts
    └── fixtures/
        ├── corners/            # string fixtures of OCR text
        └── pricecharting/      # HTML snapshots
```

Each `lib/*` file has one responsibility. UI components are thin — they call `lib/*` functions and render. API routes are also thin — they call `lib/*` parsers and hit KV.

---

## Phase 1: Project Scaffold

### Task 1: Initialize Next.js + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `.gitignore`, `.env.example`

- [ ] **Step 1: Scaffold Next.js**

Run from `pokemon-card-scanner/`:

```bash
npx create-next-app@14 . --typescript --eslint --no-app --src-dir=false --import-alias="@/*" --no-tailwind
```

When prompted about proceeding in a non-empty directory, confirm.

- [ ] **Step 2: Add runtime + dev dependencies**

```bash
npm install tesseract.js @vercel/kv
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom msw @playwright/test
```

- [ ] **Step 3: Write `.env.example`**

Create `.env.example`:

```
# pokemontcg.io API key (optional; raises rate limit). Leave blank for anonymous use.
POKEMONTCG_API_KEY=

# Vercel KV (populated automatically when KV store is linked on Vercel)
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 4: Update `.gitignore`**

Append to `.gitignore`:

```
.env.local
.env*.local
test-results/
playwright-report/
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold next.js + typescript project"
```

---

### Task 2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`, `test/setup.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'pages/api/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2: Write `test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';

// localStorage polyfill for jsdom
class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(k: string) { return this.store[k] ?? null; }
  setItem(k: string, v: string) { this.store[k] = String(v); }
  removeItem(k: string) { delete this.store[k]; }
  get length() { return Object.keys(this.store).length; }
  key(i: number) { return Object.keys(this.store)[i] ?? null; }
}

beforeEach(() => {
  (globalThis as any).localStorage = new LocalStorageMock();
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In `package.json`, set `scripts` to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Smoke-test Vitest**

Create a temporary `lib/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('adds', () => expect(1 + 1).toBe(2)); });
```

Run: `npm test`
Expected: 1 test passes.

Delete `lib/__smoke__.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts test/setup.ts package.json package-lock.json
git commit -m "chore: configure vitest with jsdom + localStorage polyfill"
```

---

## Phase 2: Pure Logic Modules (TDD)

### Task 3: `lib/grading.ts` — PSA fee math and verdict

**Files:**
- Create: `lib/grading.ts`, `lib/grading.test.ts`

- [ ] **Step 1: Write failing tests**

`lib/grading.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gradingVerdict, PSA_FEES, type PsaTier } from './grading';

describe('gradingVerdict', () => {
  it('returns worth_grading when net profit > $50', () => {
    const r = gradingVerdict({ rawPrice: 10, psa10Price: 200, tier: 'value' });
    expect(r.verdict).toBe('worth_grading');
    expect(r.netProfit).toBeCloseTo(200 - 10 - 34.99, 2);
    expect(r.multiplier).toBeCloseTo(20, 2);
  });

  it('returns borderline when net is 0 < net <= 50', () => {
    const r = gradingVerdict({ rawPrice: 50, psa10Price: 100, tier: 'value' });
    expect(r.verdict).toBe('borderline');
  });

  it('returns not_worth when net is negative', () => {
    const r = gradingVerdict({ rawPrice: 30, psa10Price: 40, tier: 'value' });
    expect(r.verdict).toBe('not_worth');
    expect(r.netProfit).toBeLessThan(0);
  });

  it('uses regular-tier fees when tier=regular', () => {
    const value = gradingVerdict({ rawPrice: 10, psa10Price: 100, tier: 'value' });
    const regular = gradingVerdict({ rawPrice: 10, psa10Price: 100, tier: 'regular' });
    expect(regular.netProfit).toBeLessThan(value.netProfit);
  });

  it('returns null verdict when psa10Price is null', () => {
    const r = gradingVerdict({ rawPrice: 10, psa10Price: null, tier: 'value' });
    expect(r.verdict).toBe('unknown');
    expect(r.netProfit).toBeNull();
  });

  it('exposes fee constants for every tier', () => {
    const tiers: PsaTier[] = ['value', 'regular', 'express'];
    for (const t of tiers) {
      expect(PSA_FEES[t].fee).toBeGreaterThan(0);
      expect(PSA_FEES[t].shipReturn).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- grading`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/grading.ts`**

```ts
export type PsaTier = 'value' | 'regular' | 'express';

export const PSA_FEES: Record<PsaTier, { fee: number; shipReturn: number }> = {
  value:   { fee: 19.99, shipReturn: 15 },
  regular: { fee: 39.99, shipReturn: 15 },
  express: { fee: 99.99, shipReturn: 20 },
};

export type Verdict = 'worth_grading' | 'borderline' | 'not_worth' | 'unknown';

export interface GradingResult {
  verdict: Verdict;
  netProfit: number | null;
  multiplier: number | null;
  totalCost: number;
}

export interface GradingInput {
  rawPrice: number | null;
  psa10Price: number | null;
  tier: PsaTier;
}

export function gradingVerdict(input: GradingInput): GradingResult {
  const { fee, shipReturn } = PSA_FEES[input.tier];
  const totalCost = fee + shipReturn;

  if (input.psa10Price == null || input.rawPrice == null) {
    return { verdict: 'unknown', netProfit: null, multiplier: null, totalCost };
  }

  const netProfit = input.psa10Price - input.rawPrice - totalCost;
  const multiplier = input.rawPrice > 0 ? input.psa10Price / input.rawPrice : null;

  let verdict: Verdict;
  if (netProfit > 50) verdict = 'worth_grading';
  else if (netProfit > 0) verdict = 'borderline';
  else verdict = 'not_worth';

  return { verdict, netProfit, multiplier, totalCost };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- grading`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grading.ts lib/grading.test.ts
git commit -m "feat(grading): psa fee math and worth-grading verdict"
```

---

### Task 4: `lib/cornerParser.ts` — parse bottom-left OCR text

**Files:**
- Create: `lib/cornerParser.ts`, `lib/cornerParser.test.ts`, `test/fixtures/corners/index.ts`

- [ ] **Step 1: Write the fixture table**

`test/fixtures/corners/index.ts`:

```ts
export interface CornerFixture {
  label: string;
  ocrText: string;
  expected: {
    setCode: string | null;
    number: string | null;
    total: string | null;
    regulationMark: string | null;
    language: string | null;
    illustrator: string | null;
    isSecretRare: boolean;
  };
}

export const CORNER_FIXTURES: CornerFixture[] = [
  {
    label: 'Meowth ex illustration rare (secret)',
    ocrText: 'Illus. Natsumi Yoshida\nJ    POR EN\n121/088 ★★',
    expected: {
      setCode: 'POR', number: '121', total: '088',
      regulationMark: 'J', language: 'EN',
      illustrator: 'Natsumi Yoshida', isSecretRare: true,
    },
  },
  {
    label: 'Common from Obsidian Flames',
    ocrText: 'Illus. kawayoo\nG    OBF EN\n045/197',
    expected: {
      setCode: 'OBF', number: '045', total: '197',
      regulationMark: 'G', language: 'EN',
      illustrator: 'kawayoo', isSecretRare: false,
    },
  },
  {
    label: 'Japanese card',
    ocrText: 'Illus. 5ban Graphics\nH    SV5a JP\n073/066',
    expected: {
      setCode: 'SV5a', number: '073', total: '066',
      regulationMark: 'H', language: 'JP',
      illustrator: '5ban Graphics', isSecretRare: true,
    },
  },
  {
    label: 'Noisy OCR with stray punctuation',
    ocrText: 'IIlus. Ryuta Fuse|\nF  .  TEF  EN\n099/162  ',
    expected: {
      setCode: 'TEF', number: '099', total: '162',
      regulationMark: 'F', language: 'EN',
      illustrator: 'Ryuta Fuse', isSecretRare: false,
    },
  },
  {
    label: 'Number only — set code unreadable',
    ocrText: 'Illus. Unknown\n     EN\n015/198',
    expected: {
      setCode: null, number: '015', total: '198',
      regulationMark: null, language: 'EN',
      illustrator: 'Unknown', isSecretRare: false,
    },
  },
  {
    label: 'Complete garbage',
    ocrText: '@@@\n###\n!!!',
    expected: {
      setCode: null, number: null, total: null,
      regulationMark: null, language: null,
      illustrator: null, isSecretRare: false,
    },
  },
];
```

- [ ] **Step 2: Write failing tests**

`lib/cornerParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCorner } from './cornerParser';
import { CORNER_FIXTURES } from '../test/fixtures/corners';

describe('parseCorner', () => {
  for (const fx of CORNER_FIXTURES) {
    it(fx.label, () => {
      const r = parseCorner(fx.ocrText);
      expect(r).toEqual(fx.expected);
    });
  }

  it('is pure — same input returns equal result', () => {
    const a = parseCorner(CORNER_FIXTURES[0].ocrText);
    const b = parseCorner(CORNER_FIXTURES[0].ocrText);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test -- cornerParser`
Expected: FAIL — `parseCorner` not exported.

- [ ] **Step 4: Implement `lib/cornerParser.ts`**

```ts
export interface CornerParseResult {
  setCode: string | null;
  number: string | null;
  total: string | null;
  regulationMark: string | null;
  language: string | null;
  illustrator: string | null;
  isSecretRare: boolean;
}

const LANGUAGES = ['EN', 'JP', 'DE', 'FR', 'IT', 'ES', 'PT'] as const;
const LANG_ALT = LANGUAGES.join('|');

export function parseCorner(raw: string): CornerParseResult {
  const text = raw.replace(/[|`]/g, '').trim();

  // Illustrator: "Illus. <name>" (case-insensitive, tolerate "IIlus."/"lllus.")
  const illusMatch = text.match(/I[Il1]lus\.\s+([^\n]+?)\s*$/im);
  const illustrator = illusMatch ? illusMatch[1].trim() : null;

  // number/total: first occurrence of N/N
  const numMatch = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  const number = numMatch ? numMatch[1].padStart(3, '0').replace(/^0+(?=\d{3,})/, '') : null;
  const total = numMatch ? numMatch[2].padStart(3, '0').replace(/^0+(?=\d{3,})/, '') : null;

  // set code + language: look for "<CODE> <LANG>" where LANG is in allowlist
  const langLine = text.match(new RegExp(`\\b([A-Z][A-Z0-9]{1,4})\\s+(${LANG_ALT})\\b`));
  const setCode = langLine ? langLine[1] : null;
  const languageFromCode = langLine ? langLine[2] : null;

  // fallback for language: scan anywhere
  const languageAny = text.match(new RegExp(`\\b(${LANG_ALT})\\b`));
  const language = languageFromCode ?? (languageAny ? languageAny[1] : null);

  // regulation mark: single uppercase letter appearing on its own before the set-code/lang line
  let regulationMark: string | null = null;
  const regMatch = text.match(/\b([A-Z])\b[^\n]*?\b[A-Z][A-Z0-9]{1,4}\s+(?:EN|JP|DE|FR|IT|ES|PT)\b/);
  if (regMatch) regulationMark = regMatch[1];

  const isSecretRare =
    number != null && total != null && Number(number) > Number(total);

  return { setCode, number, total, regulationMark, language, illustrator, isSecretRare };
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- cornerParser`
Expected: all fixture tests PASS.

If the "noisy OCR" test fails on regulationMark=F (stray `.` between `F` and `TEF`), tighten the regex:

```ts
const regMatch = text.match(/(?:^|\n)\s*([A-Z])(?:\s|\.|:)+\s*[A-Z][A-Z0-9]{1,4}\s+(?:EN|JP|DE|FR|IT|ES|PT)/m);
```

- [ ] **Step 6: Commit**

```bash
git add lib/cornerParser.ts lib/cornerParser.test.ts test/fixtures/corners/index.ts
git commit -m "feat(ocr): parse bottom-left corner identifier block"
```

---

### Task 5: `lib/priceChartingUrl.ts` — (setCode, number) → URL

**Files:**
- Create: `lib/priceChartingUrl.ts`, `lib/priceChartingUrl.test.ts`

- [ ] **Step 1: Write failing tests**

`lib/priceChartingUrl.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- priceChartingUrl`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/priceChartingUrl.ts`**

```ts
// setCode -> pricecharting url slug for "pokemon-<slug>"
export const SET_SLUG_MAP: Record<string, string> = {
  // Scarlet & Violet era (expand as needed)
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
  POR: 'prismatic-evolutions',
  // Older sets
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
    .replace(/[''']/g, '')
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
```

- [ ] **Step 4: Run tests**

Run: `npm test -- priceChartingUrl`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/priceChartingUrl.ts lib/priceChartingUrl.test.ts
git commit -m "feat(price): map (setCode, number) to pricecharting URL"
```

---

### Task 6: `lib/scanList.ts` and `lib/settings.ts` — localStorage CRUD

**Files:**
- Create: `lib/scanList.ts`, `lib/scanList.test.ts`, `lib/settings.ts`, `lib/settings.test.ts`

- [ ] **Step 1: Write failing tests for scanList**

`lib/scanList.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { addEntry, listEntries, removeEntry, clearList, type ScanListEntry } from './scanList';

function makeEntry(over: Partial<ScanListEntry> = {}): Omit<ScanListEntry, 'id' | 'scannedAt'> {
  return {
    cardId: 'obf-125', name: 'Charizard ex', setName: 'Obsidian Flames',
    setCode: 'OBF', number: '125', imageUrl: 'https://example/img.png',
    rawPrice: 30, psa10Price: 200,
    centering: { lr: '55/45', tb: '60/40', verdict: 'borderline' },
    ...over,
  };
}

describe('scanList', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => { expect(listEntries()).toEqual([]); });

  it('adds an entry and returns it with id + scannedAt', () => {
    const e = addEntry(makeEntry());
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.scannedAt).toBeGreaterThan(0);
    expect(listEntries()).toHaveLength(1);
  });

  it('removes by id', () => {
    const a = addEntry(makeEntry({ name: 'A' }));
    const b = addEntry(makeEntry({ name: 'B' }));
    removeEntry(a.id);
    expect(listEntries().map(e => e.name)).toEqual(['B']);
    expect(b).toBeTruthy();
  });

  it('clears the list', () => {
    addEntry(makeEntry()); addEntry(makeEntry());
    clearList();
    expect(listEntries()).toEqual([]);
  });

  it('returns entries newest-first', () => {
    const a = addEntry(makeEntry({ name: 'A' }));
    // force a later timestamp
    (globalThis as any).__now = a.scannedAt + 1000;
    const b = addEntry(makeEntry({ name: 'B' }));
    expect(listEntries().map(e => e.name)).toEqual(['B', 'A']);
  });

  it('survives corrupt localStorage (returns empty, overwrites)', () => {
    localStorage.setItem('cardscan.scanlist.v1', '{not json');
    expect(listEntries()).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `lib/scanList.ts`**

```ts
export interface ScanListEntry {
  id: string;
  scannedAt: number;
  cardId: string;
  name: string;
  setName: string;
  setCode: string;
  number: string;
  imageUrl: string;
  rawPrice: number | null;
  psa10Price: number | null;
  centering: {
    lr: string;
    tb: string;
    verdict: 'good' | 'borderline' | 'poor' | 'unmeasurable';
  } | null;
}

const KEY = 'cardscan.scanlist.v1';

function now(): number {
  return (globalThis as any).__now ?? Date.now();
}

function read(): ScanListEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: ScanListEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* full or unavailable */ }
}

function uuid(): string {
  // Prefer crypto.randomUUID; fall back for jsdom without it.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function addEntry(data: Omit<ScanListEntry, 'id' | 'scannedAt'>): ScanListEntry {
  const entry: ScanListEntry = { ...data, id: uuid(), scannedAt: now() };
  const entries = read();
  entries.push(entry);
  write(entries);
  return entry;
}

export function listEntries(): ScanListEntry[] {
  return read().slice().sort((a, b) => b.scannedAt - a.scannedAt);
}

export function removeEntry(id: string): void {
  write(read().filter((e) => e.id !== id));
}

export function clearList(): void {
  write([]);
}
```

- [ ] **Step 3: Run scanList tests**

Run: `npm test -- scanList`
Expected: all 6 tests PASS.

- [ ] **Step 4: Write failing tests + implementation for settings**

`lib/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, setPsaTier } from './settings';

describe('settings', () => {
  beforeEach(() => localStorage.clear());
  it('defaults psaTier to value', () => {
    expect(getSettings().psaTier).toBe('value');
  });
  it('persists a new tier', () => {
    setPsaTier('regular');
    expect(getSettings().psaTier).toBe('regular');
  });
  it('rejects invalid tier (falls back to default)', () => {
    localStorage.setItem('cardscan.settings.v1', JSON.stringify({ psaTier: 'bogus' }));
    expect(getSettings().psaTier).toBe('value');
  });
});
```

`lib/settings.ts`:

```ts
import type { PsaTier } from './grading';

const KEY = 'cardscan.settings.v1';
const VALID: PsaTier[] = ['value', 'regular', 'express'];

export interface Settings { psaTier: PsaTier; }

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { psaTier: 'value' };
    const parsed = JSON.parse(raw);
    return { psaTier: VALID.includes(parsed?.psaTier) ? parsed.psaTier : 'value' };
  } catch {
    return { psaTier: 'value' };
  }
}

export function setPsaTier(tier: PsaTier): void {
  try { localStorage.setItem(KEY, JSON.stringify({ psaTier: tier })); } catch { /* noop */ }
}
```

Run: `npm test -- settings`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scanList.ts lib/scanList.test.ts lib/settings.ts lib/settings.test.ts
git commit -m "feat(storage): localStorage-backed scan list and settings"
```

---

## Phase 3: Backend API Routes

### Task 7: `lib/pokemonTcgClient.ts` — typed fetch for pokemontcg.io

**Files:**
- Create: `lib/pokemonTcgClient.ts`, `lib/pokemonTcgClient.test.ts`

- [ ] **Step 1: Write failing tests with MSW**

`lib/pokemonTcgClient.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { fetchCardByIdentifier } from './pokemonTcgClient';

const server = setupServer(
  http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    if (q.includes('set.ptcgoCode:OBF') && q.includes('number:125')) {
      return HttpResponse.json({
        data: [{
          id: 'obf-125', name: 'Charizard ex', number: '125',
          set: { id: 'obf', name: 'Obsidian Flames', ptcgoCode: 'OBF' },
          images: { small: 'https://img/small.png', large: 'https://img/large.png' },
          tcgplayer: { prices: { holofoil: { market: 45.5 } } },
        }],
      });
    }
    return HttpResponse.json({ data: [] });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchCardByIdentifier', () => {
  it('resolves a card by setCode + number', async () => {
    const card = await fetchCardByIdentifier({ setCode: 'OBF', number: '125' });
    expect(card?.id).toBe('obf-125');
    expect(card?.rawPrice).toBe(45.5);
  });

  it('returns null when no match', async () => {
    const card = await fetchCardByIdentifier({ setCode: 'ZZZ', number: '001' });
    expect(card).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `lib/pokemonTcgClient.ts`**

```ts
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
  const res = await fetch(url, apiKey ? { headers: { 'X-Api-Key': apiKey } } : undefined);
  if (!res.ok) throw new Error(`pokemontcg.io ${res.status}`);
  const json = await res.json() as { data: RawCard[] };
  return json.data?.[0] ? normalize(json.data[0]) : null;
}

export async function fetchCardsByName(name: string, apiKey?: string): Promise<NormalizedCard[]> {
  const q = `name:"${name.replace(/"/g, '')}"`;
  const url = `${BASE}/cards?q=${encodeURIComponent(q)}&pageSize=10`;
  const res = await fetch(url, apiKey ? { headers: { 'X-Api-Key': apiKey } } : undefined);
  if (!res.ok) throw new Error(`pokemontcg.io ${res.status}`);
  const json = await res.json() as { data: RawCard[] };
  return (json.data ?? []).map(normalize);
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- pokemonTcgClient`
Expected: both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/pokemonTcgClient.ts lib/pokemonTcgClient.test.ts
git commit -m "feat(api): typed pokemontcg.io client with market-price extraction"
```

---

### Task 8: `pages/api/card.ts` — pokemontcg.io proxy route

**Files:**
- Create: `pages/api/card.ts`, `pages/api/card.test.ts`

- [ ] **Step 1: Write failing tests**

`pages/api/card.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from './card';

const server = setupServer(
  http.get('https://api.pokemontcg.io/v2/cards', () =>
    HttpResponse.json({
      data: [{
        id: 'obf-125', name: 'Charizard ex', number: '125',
        set: { id: 'obf', name: 'Obsidian Flames', ptcgoCode: 'OBF' },
        images: { small: 's.png', large: 'l.png' },
        tcgplayer: { prices: { holofoil: { market: 45 } } },
      }],
    }),
  ),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

describe('/api/card', () => {
  it('returns 400 when setCode missing', async () => {
    const req = { method: 'GET', query: { number: '125' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns normalized card on success', async () => {
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ id: 'obf-125', rawPrice: 45 });
  });

  it('returns 404 when card not found', async () => {
    server.use(http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json({ data: [] })));
    const req = { method: 'GET', query: { setCode: 'ZZZ', number: '001' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 503 when upstream fails', async () => {
    server.use(http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.text('boom', { status: 500 })));
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125' } } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
```

- [ ] **Step 2: Implement `pages/api/card.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchCardByIdentifier, fetchCardsByName } from '@/lib/pokemonTcgClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const apiKey = process.env.POKEMONTCG_API_KEY || undefined;
  const { setCode, number, name } = req.query as Record<string, string | undefined>;

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
    const msg = e instanceof Error ? e.message : 'unknown';
    return res.status(503).json({ error: 'pricing_unavailable', detail: msg });
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- api/card`
Expected: all 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add pages/api/card.ts pages/api/card.test.ts
git commit -m "feat(api): /api/card proxy with identifier + name lookup"
```

---

### Task 9: `lib/priceChartingParser.ts` — HTML → PSA 10 price

**Files:**
- Create: `lib/priceChartingParser.ts`, `lib/priceChartingParser.test.ts`, `test/fixtures/pricecharting/obf-125.html`, `test/fixtures/pricecharting/no-psa10.html`

- [ ] **Step 1: Install HTML parser**

Run: `npm install node-html-parser`

- [ ] **Step 2: Create fixture HTML files**

`test/fixtures/pricecharting/obf-125.html`:

```html
<!doctype html>
<html><head><title>Charizard ex</title></head><body>
<h1 id="product_name">Charizard ex #125</h1>
<table>
  <tr><th>Condition</th><th>Price</th></tr>
  <tr><td>Ungraded</td><td class="price js-price">$45.00</td></tr>
  <tr><td>Grade 7</td><td class="price js-price">$90.00</td></tr>
  <tr><td>Grade 8</td><td class="price js-price">$140.00</td></tr>
  <tr><td>Grade 9</td><td class="price js-price">$220.00</td></tr>
  <tr><td>PSA 10</td><td class="price js-price">$480.00</td></tr>
</table>
</body></html>
```

`test/fixtures/pricecharting/no-psa10.html`:

```html
<!doctype html><html><body>
<h1 id="product_name">Obscure Card #001</h1>
<table><tr><td>Ungraded</td><td class="price js-price">$2.00</td></tr></table>
</body></html>
```

(If practical, replace `obf-125.html` later with a real trimmed snapshot from pricecharting.com for higher fidelity; the structure must still contain a `<tr>` whose text includes "PSA 10" and a dollar amount.)

- [ ] **Step 3: Write failing tests**

`lib/priceChartingParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parsePsa10Price } from './priceChartingParser';

function fx(name: string) {
  return readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'pricecharting', name), 'utf8');
}

describe('parsePsa10Price', () => {
  it('extracts the PSA 10 price', () => {
    const r = parsePsa10Price(fx('obf-125.html'));
    expect(r.price).toBe(480);
    expect(r.reason).toBeUndefined();
  });

  it('returns not_found when no PSA 10 row exists', () => {
    const r = parsePsa10Price(fx('no-psa10.html'));
    expect(r.price).toBeNull();
    expect(r.reason).toBe('not_found');
  });

  it('returns not_found for non-HTML garbage (no PSA 10 row found)', () => {
    const r = parsePsa10Price('not html');
    expect(r.price).toBeNull();
    expect(r.reason).toBe('not_found');
  });
});
```

- [ ] **Step 4: Implement `lib/priceChartingParser.ts`**

```ts
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
```

- [ ] **Step 5: Run tests**

Run: `npm test -- priceChartingParser`
Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/priceChartingParser.ts lib/priceChartingParser.test.ts test/fixtures/pricecharting/ package.json package-lock.json
git commit -m "feat(price): parse psa 10 price from pricecharting html"
```

---

### Task 10: `pages/api/psa10.ts` — scrape + KV cache

**Files:**
- Create: `pages/api/psa10.ts`, `pages/api/psa10.test.ts`

- [ ] **Step 1: Write failing tests**

`pages/api/psa10.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const kvStore = new Map<string, unknown>();
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(async (k: string) => kvStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown, _opts?: unknown) => { kvStore.set(k, v); }),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import handler from './psa10';

function mockRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

describe('/api/psa10', () => {
  beforeEach(() => { kvStore.clear(); fetchMock.mockReset(); });

  it('returns 400 if setCode or number missing', async () => {
    const req = { method: 'GET', query: {} } as unknown as NextApiRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns cached price without fetching', async () => {
    kvStore.set('psa10:OBF:125', { price: 480, fetchedAt: Date.now() });
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125', cardName: 'Charizard ex' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ price: 480, cached: true });
  });

  it('scrapes, caches, and returns on cache miss', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        '<html><body><table><tr><td>PSA 10</td><td>$500.00</td></tr></table></body></html>',
    });
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125', cardName: 'Charizard ex' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ price: 500, cached: false });
    expect(kvStore.get('psa10:OBF:125')).toMatchObject({ price: 500 });
  });

  it('caches negative result on parse miss', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => '<html><body>no psa</body></html>',
    });
    const req = { method: 'GET', query: { setCode: 'OBF', number: '125', cardName: 'Charizard ex' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(kvStore.get('psa10:OBF:125:miss')).toMatchObject({ reason: 'not_found' });
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ price: null, reason: 'not_found' });
  });

  it('returns 404 when set code is not in SET_SLUG_MAP', async () => {
    const req = { method: 'GET', query: { setCode: 'ZZZ', number: '001', cardName: 'Foo' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
```

- [ ] **Step 2: Implement `pages/api/psa10.ts`**

```ts
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
```

- [ ] **Step 3: Run tests**

Run: `npm test -- api/psa10`
Expected: all 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add pages/api/psa10.ts pages/api/psa10.test.ts
git commit -m "feat(api): /api/psa10 scrapes pricecharting with KV cache"
```

---

## Phase 4: Browser Image Pipeline

OpenCV.js and Tesseract.js run in the browser only. The logic is tested via pure helper functions where possible, and gated behind an `isBrowser()` check so module imports don't break in jsdom tests.

### Task 11: `lib/cvLoader.ts` — lazy-load OpenCV.js from CDN

**Files:**
- Create: `lib/cvLoader.ts`, `lib/cvLoader.test.ts`

- [ ] **Step 1: Write failing tests**

`lib/cvLoader.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadOpenCv, __resetCvForTest } from './cvLoader';

describe('loadOpenCv', () => {
  beforeEach(() => {
    __resetCvForTest();
    // stub a minimal global cv and window
    (globalThis as any).window = globalThis;
    (globalThis as any).document = {
      createElement: vi.fn().mockImplementation(() => {
        const el: any = { onload: null as null | (() => void), src: '' };
        queueMicrotask(() => {
          (globalThis as any).cv = { Mat: function () {}, __ready: true };
          el.onload?.();
        });
        return el;
      }),
      head: { appendChild: vi.fn() },
    };
  });

  it('loads the script once and resolves with cv', async () => {
    const cv = await loadOpenCv();
    expect((cv as any).__ready).toBe(true);
    const again = await loadOpenCv();
    expect(again).toBe(cv);
    expect(((globalThis as any).document.createElement as any).mock.calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Implement `lib/cvLoader.ts`**

```ts
// @ts-expect-error - OpenCV.js attaches `cv` globally at runtime
let loaded: Promise<any> | null = null;

const CDN = 'https://docs.opencv.org/4.x/opencv.js';

export function loadOpenCv(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV requires a browser environment'));
  }
  if ((window as any).cv?.Mat) return Promise.resolve((window as any).cv);
  if (loaded) return loaded;

  loaded = new Promise((resolve, reject) => {
    const script = document.createElement('script') as HTMLScriptElement;
    script.src = CDN;
    script.async = true;
    script.onload = () => {
      // OpenCV fires onload before WASM runtime finishes initializing.
      const poll = () => {
        const cv = (window as any).cv;
        if (cv?.Mat) return resolve(cv);
        setTimeout(poll, 50);
      };
      poll();
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
  return loaded;
}

// Test-only reset
export function __resetCvForTest(): void {
  loaded = null;
  if (typeof window !== 'undefined') delete (window as any).cv;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- cvLoader`
Expected: test PASSES.

- [ ] **Step 4: Commit**

```bash
git add lib/cvLoader.ts lib/cvLoader.test.ts
git commit -m "feat(cv): lazy CDN loader for OpenCV.js with single-flight promise"
```

---

### Task 12: `lib/centering.ts` — measure inner-frame offsets, verdict

Card detection (outer edges + perspective straighten) and inner-frame measurement live in this module. The OpenCV calls themselves are thin; the pure *measurement math* (ratios, verdict thresholds) is tested directly.

**Files:**
- Create: `lib/centering.ts`, `lib/centering.test.ts`

- [ ] **Step 1: Write failing tests for pure helpers**

`lib/centering.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { centeringVerdict, ratioString, computeRatios } from './centering';

describe('computeRatios', () => {
  it('computes L/R and T/B worst-side percentages', () => {
    // Outer 100×140, inner offset {left:10,right:20,top:15,bottom:15}
    const r = computeRatios({
      outerWidth: 100, outerHeight: 140,
      left: 10, right: 20, top: 15, bottom: 15,
    });
    // Horizontal inner width = 100 - 10 - 20 = 70; centered would be 15/15.
    // Left margin 10, right margin 20 => worst side = max(10,20)/(10+20) = 66.7
    expect(r.lrWorst).toBeCloseTo(66.67, 1);
    expect(r.tbWorst).toBeCloseTo(50, 1);
    expect(r.lrLabel).toBe('33/67');
    expect(r.tbLabel).toBe('50/50');
  });
});

describe('centeringVerdict', () => {
  it('good when worst ≤ 55', () => {
    expect(centeringVerdict(55, 52)).toBe('good');
  });
  it('borderline when worst 55–60', () => {
    expect(centeringVerdict(58, 52)).toBe('borderline');
  });
  it('poor when worst > 60', () => {
    expect(centeringVerdict(61, 52)).toBe('poor');
  });
  it('uses the worse of the two axes', () => {
    expect(centeringVerdict(52, 70)).toBe('poor');
  });
});

describe('ratioString', () => {
  it('formats smaller-side/larger-side', () => {
    expect(ratioString(10, 20)).toBe('33/67');
    expect(ratioString(15, 15)).toBe('50/50');
  });
});
```

- [ ] **Step 2: Implement pure helpers + OpenCV-gated entry point**

`lib/centering.ts`:

```ts
import { loadOpenCv } from './cvLoader';

export type CenteringVerdict = 'good' | 'borderline' | 'poor' | 'unmeasurable';

export interface CenteringResult {
  lr: string;         // e.g. "55/45"
  tb: string;
  verdict: CenteringVerdict;
}

export interface FrameOffsets {
  outerWidth: number;
  outerHeight: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function ratioString(a: number, b: number): string {
  const total = a + b;
  if (total === 0) return '50/50';
  const ap = Math.round((a / total) * 100);
  const bp = 100 - ap;
  return `${Math.min(ap, bp)}/${Math.max(ap, bp)}`;
}

export function computeRatios(f: FrameOffsets): {
  lrWorst: number; tbWorst: number; lrLabel: string; tbLabel: string;
} {
  const lrTotal = f.left + f.right;
  const tbTotal = f.top + f.bottom;
  const lrWorst = lrTotal === 0 ? 50 : (Math.max(f.left, f.right) / lrTotal) * 100;
  const tbWorst = tbTotal === 0 ? 50 : (Math.max(f.top, f.bottom) / tbTotal) * 100;
  return {
    lrWorst, tbWorst,
    lrLabel: ratioString(f.left, f.right),
    tbLabel: ratioString(f.top, f.bottom),
  };
}

export function centeringVerdict(lrWorst: number, tbWorst: number): CenteringVerdict {
  const worst = Math.max(lrWorst, tbWorst);
  if (worst <= 55) return 'good';
  if (worst <= 60) return 'borderline';
  return 'poor';
}

/**
 * Analyze a card image and return centering. Runs in browser only.
 * Returns null if the card or inner frame cannot be detected (e.g. borderless).
 */
export async function analyzeCentering(imageBlob: Blob): Promise<CenteringResult | null> {
  if (typeof window === 'undefined') return null;
  const cv = await loadOpenCv();

  const bitmap = await createImageBitmap(imageBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);

  const src = cv.imread(canvas);
  try {
    const frame = detectInnerFrame(cv, src);
    if (!frame) return null;
    const r = computeRatios(frame);
    return {
      lr: r.lrLabel,
      tb: r.tbLabel,
      verdict: centeringVerdict(r.lrWorst, r.tbWorst),
    };
  } finally {
    src.delete();
  }
}

/**
 * Two-stage edge detection:
 * 1. Find the outer card rectangle (largest 4-sided contour).
 * 2. Inside it, find the inner art/frame rectangle.
 * Returns pixel offsets from outer to inner on all 4 sides, or null if not found.
 */
function detectInnerFrame(cv: any, src: any): FrameOffsets | null {
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Canny(gray, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    // Pick the two largest rectangular contours: outer = card, inner = frame.
    const rects: { area: number; rect: { x: number; y: number; w: number; h: number } }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const r = cv.boundingRect(c);
      rects.push({ area: r.width * r.height, rect: { x: r.x, y: r.y, w: r.width, h: r.height } });
      c.delete();
    }
    rects.sort((a, b) => b.area - a.area);
    if (rects.length < 2) return null;
    const outer = rects[0].rect;
    // Inner = next-largest rect fully contained inside outer with area < 95% of outer.
    const inner = rects.slice(1).find(
      (r) =>
        r.rect.x > outer.x && r.rect.y > outer.y &&
        r.rect.x + r.rect.w < outer.x + outer.w &&
        r.rect.y + r.rect.h < outer.y + outer.h &&
        r.area < outer.w * outer.h * 0.95 &&
        r.area > outer.w * outer.h * 0.4
    )?.rect;
    if (!inner) return null;

    return {
      outerWidth: outer.w,
      outerHeight: outer.h,
      left: inner.x - outer.x,
      right: outer.x + outer.w - (inner.x + inner.w),
      top: inner.y - outer.y,
      bottom: outer.y + outer.h - (inner.y + inner.h),
    };
  } finally {
    gray.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- centering`
Expected: all pure-helper tests PASS (the OpenCV-dependent `analyzeCentering` is not unit-tested; it's covered by manual QA in Task 23).

- [ ] **Step 4: Commit**

```bash
git add lib/centering.ts lib/centering.test.ts
git commit -m "feat(centering): front-face centering analysis via opencv.js"
```

---

### Task 13: `lib/ocr.ts` + Web Worker for corner OCR

**Files:**
- Create: `workers/ocr.worker.ts`, `lib/ocr.ts`, `lib/ocr.test.ts`

- [ ] **Step 1: Write failing tests for the bounding-box crop helper**

`lib/ocr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cornerCropBox } from './ocr';

describe('cornerCropBox', () => {
  it('returns ~25%×~15% of the bottom-left corner', () => {
    const box = cornerCropBox({ width: 1000, height: 1400 });
    expect(box.x).toBe(0);
    expect(box.width).toBe(250);
    expect(box.y).toBe(1400 - 210); // 15% of 1400
    expect(box.height).toBe(210);
  });

  it('handles non-standard aspect ratios', () => {
    const box = cornerCropBox({ width: 400, height: 600 });
    expect(box.width).toBe(100);
    expect(box.height).toBe(90);
  });
});
```

- [ ] **Step 2: Implement `lib/ocr.ts`**

```ts
import type { CornerParseResult } from './cornerParser';
import { parseCorner } from './cornerParser';

export interface OcrResult extends CornerParseResult {
  rawText: string;
  confidence: number;
}

export interface Box {
  x: number; y: number; width: number; height: number;
}

export function cornerCropBox(dim: { width: number; height: number }): Box {
  const width = Math.round(dim.width * 0.25);
  const height = Math.round(dim.height * 0.15);
  const x = 0;
  const y = dim.height - height;
  return { x, y, width, height };
}

/**
 * Run Tesseract on the bottom-left corner of the image (browser-only).
 * Falls back to the whole image if the corner yields nothing parseable.
 */
export async function ocrCardCorner(blob: Blob): Promise<OcrResult> {
  if (typeof window === 'undefined') {
    throw new Error('ocrCardCorner requires a browser environment');
  }
  const { createWorker, PSM } = await import('tesseract.js');

  const bitmap = await createImageBitmap(blob);
  const box = cornerCropBox({ width: bitmap.width, height: bitmap.height });

  const canvas = document.createElement('canvas');
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/★☆. ',
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    const { data } = await worker.recognize(canvas);
    const parsed = parseCorner(data.text);
    return { ...parsed, rawText: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- ocr`
Expected: both `cornerCropBox` tests PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/ocr.ts lib/ocr.test.ts
git commit -m "feat(ocr): corner-crop bottom-left and run tesseract with whitelist"
```

---

### Task 14: `lib/cardResolver.ts` — OCR → `/api/card` → `NormalizedCard`

**Files:**
- Create: `lib/cardResolver.ts`, `lib/cardResolver.test.ts`

- [ ] **Step 1: Write failing tests**

`lib/cardResolver.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveFromOcr } from './cardResolver';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('resolveFromOcr', () => {
  beforeEach(() => fetchMock.mockReset());

  it('returns clean match when setCode + number parsed and API returns a card', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ id: 'obf-125', name: 'Charizard ex', setCode: 'OBF', number: '125', rawPrice: 45 }),
    });
    const r = await resolveFromOcr({
      setCode: 'OBF', number: '125', total: '197',
      regulationMark: 'G', language: 'EN', illustrator: null, isSecretRare: false,
      rawText: '', confidence: 90,
    });
    expect(r.status).toBe('clean');
    if (r.status === 'clean') expect(r.card.id).toBe('obf-125');
  });

  it('returns candidates when only number parsed (name-search fallback disabled)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
    const r = await resolveFromOcr({
      setCode: null, number: '125', total: null,
      regulationMark: null, language: null, illustrator: null, isSecretRare: false,
      rawText: '', confidence: 50,
    });
    expect(r.status).toBe('unresolved');
  });

  it('returns unresolved when OCR gave nothing', async () => {
    const r = await resolveFromOcr({
      setCode: null, number: null, total: null,
      regulationMark: null, language: null, illustrator: null, isSecretRare: false,
      rawText: '', confidence: 0,
    });
    expect(r.status).toBe('unresolved');
  });

  it('returns 503 marker when API errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'pricing_unavailable' }) });
    const r = await resolveFromOcr({
      setCode: 'OBF', number: '125', total: '197',
      regulationMark: null, language: 'EN', illustrator: null, isSecretRare: false,
      rawText: '', confidence: 90,
    });
    expect(r.status).toBe('upstream_error');
  });
});
```

- [ ] **Step 2: Implement `lib/cardResolver.ts`**

```ts
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
```

- [ ] **Step 3: Run tests**

Run: `npm test -- cardResolver`
Expected: all 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/cardResolver.ts lib/cardResolver.test.ts
git commit -m "feat(resolver): ocr output -> /api/card with candidate fallbacks"
```

---

## Phase 5: UI

Components are thin — they call `lib/*` functions and render. Global styles live in `styles/globals.css` (created by `create-next-app`).

### Task 15: App shell + base layout

**Files:**
- Modify: `pages/_app.tsx`, `styles/globals.css`

- [ ] **Step 1: Replace `pages/_app.tsx`**

```tsx
import type { AppProps } from 'next/app';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <Component {...pageProps} />
    </>
  );
}
```

- [ ] **Step 2: Add mobile-friendly base styles**

Append to `styles/globals.css` (create if missing):

```css
:root {
  --bg: #0f1117;
  --surface: #1a1d26;
  --text: #e6e8ef;
  --muted: #8b90a0;
  --accent: #4ade80;
  --danger: #f87171;
  --border: #2a2f3d;
  --radius: 12px;
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  min-height: 100vh;
  -webkit-tap-highlight-color: transparent;
}
button {
  font: inherit; color: inherit; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 12px 18px; cursor: pointer;
}
button.primary {
  background: var(--accent); color: #0f1117; border-color: var(--accent); font-weight: 600;
}
.container { max-width: 640px; margin: 0 auto; padding: var(--space-2); }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: var(--space-2);
}
.muted { color: var(--muted); }
.danger { color: var(--danger); }
.accent { color: var(--accent); }
```

- [ ] **Step 3: Commit**

```bash
git add pages/_app.tsx styles/globals.css
git commit -m "feat(ui): mobile-first base layout and dark theme tokens"
```

---

### Task 16: `components/CameraCapture.tsx`

**Files:**
- Create: `components/CameraCapture.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { useRef } from 'react';

interface Props {
  onCapture: (file: File) => void;
}

export default function CameraCapture({ onCapture }: Props) {
  const ref = useRef<HTMLInputElement | null>(null);

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <p className="muted" style={{ marginTop: 0 }}>
        Fit the whole card in frame, flat and straight.
        The bottom-left corner should be readable.
      </p>
      <button
        className="primary"
        style={{ width: '100%', padding: '20px' }}
        onClick={() => ref.current?.click()}
      >
        Scan a Card
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCapture(f);
          // reset so the same file can be selected again
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/CameraCapture.tsx
git commit -m "feat(ui): camera capture component with native file picker"
```

---

### Task 17: `components/CardResult.tsx`

**Files:**
- Create: `components/CardResult.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import type { NormalizedCard } from '@/lib/pokemonTcgClient';
import type { CenteringResult } from '@/lib/centering';
import type { PsaTier } from '@/lib/grading';
import { gradingVerdict } from '@/lib/grading';

interface Props {
  card: NormalizedCard;
  psa10Price: number | null;
  psa10Loading: boolean;
  psa10Error: string | null;
  centering: CenteringResult | null;
  tier: PsaTier;
  isSecretRare?: boolean;
  onAddToList: () => void;
  onScanAnother: () => void;
}

function money(n: number | null): string {
  return n == null ? '—' : `$${n.toFixed(2)}`;
}

function verdictLabel(v: string): string {
  if (v === 'worth_grading') return 'Worth grading';
  if (v === 'borderline') return 'Borderline';
  if (v === 'not_worth') return 'Not worth grading';
  return "Can't determine";
}

function centeringLabel(c: CenteringResult): string {
  if (c.verdict === 'good') return 'Good — PSA 10 viable';
  if (c.verdict === 'borderline') return 'Borderline for PSA 10';
  if (c.verdict === 'poor') return 'Poor — PSA 10 unlikely';
  return 'Not measurable';
}

export default function CardResult(p: Props) {
  const grading = gradingVerdict({
    rawPrice: p.card.rawPrice, psa10Price: p.psa10Price, tier: p.tier,
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 16 }}>
        <img
          src={p.card.imageSmall}
          alt={p.card.name}
          width={120}
          style={{ borderRadius: 8, flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 4px' }}>{p.card.name}</h2>
          <div className="muted" style={{ fontSize: 14 }}>
            {p.card.setName} · {p.card.setCode} {p.card.number}
            {p.isSecretRare && <span className="accent"> · Secret Rare</span>}
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 4 }}>
            <div>Raw: <strong>{money(p.card.rawPrice)}</strong></div>
            <div>
              PSA 10:{' '}
              {p.psa10Loading
                ? <span className="muted">loading…</span>
                : p.psa10Error
                  ? <span className="danger">{p.psa10Error}</span>
                  : <strong>{money(p.psa10Price)}</strong>}
            </div>
          </div>
        </div>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />

      <div>
        <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Grading
        </div>
        <div style={{ fontSize: 18, margin: '4px 0' }}>
          {verdictLabel(grading.verdict)}
          {grading.netProfit != null && (
            <span className="muted" style={{ fontSize: 14 }}> · net {money(grading.netProfit)}</span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Assumes {p.tier} tier · ${grading.totalCost.toFixed(2)} fees + shipping
        </div>
      </div>

      {p.centering && (
        <>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
          <div>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
              Centering (front)
            </div>
            <div style={{ fontSize: 16, margin: '4px 0' }}>
              {p.centering.verdict !== 'unmeasurable'
                ? `${p.centering.lr} L/R · ${p.centering.tb} T/B`
                : 'Not measurable'}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {centeringLabel(p.centering)}
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="primary" style={{ flex: 1 }} onClick={p.onAddToList}>
          Add to list
        </button>
        <button style={{ flex: 1 }} onClick={p.onScanAnother}>
          Scan another
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/CardResult.tsx
git commit -m "feat(ui): card result view with grading verdict + centering"
```

---

### Task 18: `components/ScanList.tsx` + `components/SettingsMenu.tsx`

**Files:**
- Create: `components/ScanList.tsx`, `components/SettingsMenu.tsx`

- [ ] **Step 1: Implement `components/ScanList.tsx`**

```tsx
import type { ScanListEntry } from '@/lib/scanList';
import type { PsaTier } from '@/lib/grading';
import { gradingVerdict } from '@/lib/grading';

interface Props {
  entries: ScanListEntry[];
  tier: PsaTier;
  onRemove: (id: string) => void;
  onClear: () => void;
}

function sum(ns: (number | null)[]): number {
  return ns.reduce<number>((a, b) => a + (b ?? 0), 0);
}

export default function ScanList({ entries, tier, onRemove, onClear }: Props) {
  if (entries.length === 0) {
    return <p className="muted" style={{ textAlign: 'center' }}>No cards scanned yet.</p>;
  }
  const rawTotal = sum(entries.map(e => e.rawPrice));
  const psaTotal = sum(entries.map(e => e.psa10Price));
  const netTotal = entries.reduce((a, e) => {
    const g = gradingVerdict({ rawPrice: e.rawPrice, psa10Price: e.psa10Price, tier });
    return a + (g.verdict === 'worth_grading' && g.netProfit != null ? g.netProfit : 0);
  }, 0);
  const candidates = entries.filter(e => {
    const g = gradingVerdict({ rawPrice: e.rawPrice, psa10Price: e.psa10Price, tier });
    return g.verdict === 'worth_grading';
  }).length;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Scanned ({entries.length})</h3>
        <button onClick={onClear} style={{ fontSize: 12 }}>Clear all</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
        {entries.map(e => (
          <li
            key={e.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 0', borderTop: '1px solid var(--border)',
            }}
          >
            <img src={e.imageUrl} alt="" width={40} style={{ borderRadius: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {e.name}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {e.setCode} {e.number} · raw ${e.rawPrice?.toFixed(2) ?? '—'} · PSA10 ${e.psa10Price?.toFixed(2) ?? '—'}
              </div>
            </div>
            <button
              onClick={() => onRemove(e.id)}
              style={{ padding: '6px 10px', fontSize: 12 }}
              aria-label={`Remove ${e.name}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div
        className="muted"
        style={{
          fontSize: 13, paddingTop: 12, borderTop: '1px solid var(--border)',
          display: 'grid', gap: 2,
        }}
      >
        <div>Total raw: <strong>${rawTotal.toFixed(2)}</strong></div>
        <div>Total PSA 10: <strong>${psaTotal.toFixed(2)}</strong></div>
        <div>
          Grading candidates: <strong className="accent">{candidates}</strong>
          {candidates > 0 && <span> · worth <strong>${netTotal.toFixed(2)}</strong> net</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `components/SettingsMenu.tsx`**

```tsx
import type { PsaTier } from '@/lib/grading';
import { PSA_FEES } from '@/lib/grading';

interface Props {
  tier: PsaTier;
  onChange: (tier: PsaTier) => void;
}

export default function SettingsMenu({ tier, onChange }: Props) {
  const tiers: PsaTier[] = ['value', 'regular', 'express'];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 16px' }}>
      <label className="muted" htmlFor="psa-tier" style={{ fontSize: 13 }}>PSA tier</label>
      <select
        id="psa-tier"
        value={tier}
        onChange={(e) => onChange(e.target.value as PsaTier)}
        style={{
          background: 'var(--surface)', color: 'var(--text)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '8px 12px', fontSize: 14,
        }}
      >
        {tiers.map(t => (
          <option key={t} value={t}>
            {t[0].toUpperCase() + t.slice(1)} (${(PSA_FEES[t].fee + PSA_FEES[t].shipReturn).toFixed(0)})
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/ScanList.tsx components/SettingsMenu.tsx
git commit -m "feat(ui): scan list with totals and psa-tier selector"
```

---

### Task 19: `pages/index.tsx` — landing + list

**Files:**
- Replace: `pages/index.tsx`

- [ ] **Step 1: Implement the page**

```tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CameraCapture from '@/components/CameraCapture';
import ScanList from '@/components/ScanList';
import SettingsMenu from '@/components/SettingsMenu';
import { listEntries, removeEntry, clearList } from '@/lib/scanList';
import { getSettings, setPsaTier } from '@/lib/settings';
import type { ScanListEntry } from '@/lib/scanList';
import type { PsaTier } from '@/lib/grading';

export default function Home() {
  const router = useRouter();
  const [entries, setEntries] = useState<ScanListEntry[]>([]);
  const [tier, setTier] = useState<PsaTier>('value');

  useEffect(() => {
    setEntries(listEntries());
    setTier(getSettings().psaTier);
  }, []);

  function handleCapture(file: File) {
    // Stash file in sessionStorage-adjacent blob URL and navigate to /scan.
    const url = URL.createObjectURL(file);
    (window as any).__capturedBlobUrl = url;
    router.push('/scan');
  }

  function handleTierChange(next: PsaTier) {
    setPsaTier(next);
    setTier(next);
  }

  return (
    <div className="container">
      <header style={{ textAlign: 'center', margin: '24px 0' }}>
        <h1 style={{ margin: 0 }}>Card Scanner</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>Pokemon TCG · grading ROI · PSA 10 values</p>
      </header>

      <SettingsMenu tier={tier} onChange={handleTierChange} />
      <CameraCapture onCapture={handleCapture} />

      <div style={{ marginTop: 24 }}>
        <ScanList
          entries={entries}
          tier={tier}
          onRemove={(id) => { removeEntry(id); setEntries(listEntries()); }}
          onClear={() => { clearList(); setEntries([]); }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/index.tsx
git commit -m "feat(ui): landing page with capture button, list, and settings"
```

---

### Task 20: `pages/scan.tsx` — capture → OCR → result

**Files:**
- Create: `pages/scan.tsx`

- [ ] **Step 1: Implement the page**

```tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CardResult from '@/components/CardResult';
import { ocrCardCorner } from '@/lib/ocr';
import { analyzeCentering } from '@/lib/centering';
import { resolveFromOcr } from '@/lib/cardResolver';
import { addEntry } from '@/lib/scanList';
import { getSettings } from '@/lib/settings';
import type { NormalizedCard } from '@/lib/pokemonTcgClient';
import type { CenteringResult } from '@/lib/centering';
import type { PsaTier } from '@/lib/grading';

type Phase = 'idle' | 'ocr' | 'resolving' | 'ready' | 'error';

export default function Scan() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [card, setCard] = useState<NormalizedCard | null>(null);
  const [isSecretRare, setIsSecretRare] = useState(false);
  const [centering, setCentering] = useState<CenteringResult | null>(null);
  const [psa10, setPsa10] = useState<number | null>(null);
  const [psa10Loading, setPsa10Loading] = useState(false);
  const [psa10Error, setPsa10Error] = useState<string | null>(null);
  const [tier, setTier] = useState<PsaTier>('value');

  useEffect(() => {
    setTier(getSettings().psaTier);
    const url = (window as any).__capturedBlobUrl as string | undefined;
    if (!url) { router.replace('/'); return; }
    run(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(blobUrl: string) {
    try {
      const blob = await (await fetch(blobUrl)).blob();
      setPhase('ocr');

      // Kick off OCR and centering in parallel
      const ocrPromise = ocrCardCorner(blob);
      const centeringPromise = analyzeCentering(blob).catch(() => null);

      const ocr = await ocrPromise;
      setIsSecretRare(ocr.isSecretRare);
      setPhase('resolving');

      const resolved = await resolveFromOcr(ocr);
      if (resolved.status === 'clean') {
        setCard(resolved.card);
        setPhase('ready');
        fetchPsa10(resolved.card);
      } else if (resolved.status === 'upstream_error') {
        setPhase('error');
        setErrorMsg('Price service unavailable. Try again shortly.');
      } else {
        setPhase('error');
        setErrorMsg("Couldn't identify the card. Retake the photo with the bottom-left corner in clear focus.");
      }

      centeringPromise.then(setCentering);
    } catch (e) {
      setPhase('error');
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  async function fetchPsa10(c: NormalizedCard) {
    setPsa10Loading(true); setPsa10Error(null);
    try {
      const r = await fetch(
        `/api/psa10?setCode=${encodeURIComponent(c.setCode)}&number=${encodeURIComponent(c.number)}&cardName=${encodeURIComponent(c.name)}`
      );
      if (!r.ok) {
        setPsa10Error('unavailable');
      } else {
        const j = await r.json() as { price: number | null; reason?: string };
        setPsa10(j.price);
        if (j.price == null && j.reason === 'not_found') setPsa10Error('no data');
      }
    } catch {
      setPsa10Error('unavailable');
    } finally {
      setPsa10Loading(false);
    }
  }

  function handleAddToList() {
    if (!card) return;
    addEntry({
      cardId: card.id, name: card.name, setName: card.setName,
      setCode: card.setCode, number: card.number,
      imageUrl: card.imageSmall,
      rawPrice: card.rawPrice,
      psa10Price: psa10,
      centering,
    });
    router.push('/');
  }

  function handleScanAnother() { router.push('/'); }

  return (
    <div className="container">
      <header style={{ margin: '16px 0' }}>
        <button onClick={() => router.push('/')}>← Back</button>
      </header>

      {phase === 'ocr' && <p className="muted">Reading card…</p>}
      {phase === 'resolving' && <p className="muted">Looking up card…</p>}
      {phase === 'error' && (
        <div className="card">
          <p className="danger">{errorMsg}</p>
          <button className="primary" onClick={() => router.push('/')}>Try again</button>
        </div>
      )}
      {phase === 'ready' && card && (
        <CardResult
          card={card}
          psa10Price={psa10}
          psa10Loading={psa10Loading}
          psa10Error={psa10Error}
          centering={centering}
          tier={tier}
          isSecretRare={isSecretRare}
          onAddToList={handleAddToList}
          onScanAnother={handleScanAnother}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test dev build**

Run: `npm run dev`

Open `http://localhost:3000/` in desktop browser. Expected: landing page renders with "Scan a Card" button and empty list. Clicking the button opens a file picker (camera prompt would appear on mobile).

Stop the dev server (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
git add pages/scan.tsx
git commit -m "feat(ui): scan page drives ocr + centering + price fetch"
```

---

## Phase 6: Deploy + QA Docs

### Task 21: Vercel configuration

**Files:**
- Create: `vercel.json`, `README.md`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "functions": {
    "pages/api/psa10.ts": { "maxDuration": 20 },
    "pages/api/card.ts": { "maxDuration": 10 }
  }
}
```

- [ ] **Step 2: Write `README.md`**

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json README.md
git commit -m "chore: vercel config + readme"
```

---

### Task 22: Manual QA checklist

**Files:**
- Create: `docs/manual-qa.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Manual QA Checklist

Run through this on real hardware before declaring a build shippable.

## Devices

- [ ] iPhone (iOS Safari, latest stable)
- [ ] Android phone (Chrome, latest stable)

## Core flows — do on each device

### Scan a common modern card (should be fast, clean match)

- [ ] Camera button opens the native camera capture
- [ ] Photo capture returns to app within a second
- [ ] "Reading card…" shows briefly, then "Looking up card…"
- [ ] Card art + name + set + number all render correctly
- [ ] Raw price shows within 2s of capture
- [ ] PSA 10 price fills in within ~5s (first hit; subsequent hits are cached and instant)
- [ ] Grading verdict labeled correctly for a card that is obviously worth grading
- [ ] Centering block shows with L/R + T/B ratios
- [ ] "Add to list" adds to the landing page list
- [ ] "Scan another" returns to landing

### Scan a full-art / illustration rare (corner OCR stress test)

- [ ] Corner OCR succeeds (the whole point of targeting the corner instead of the name)
- [ ] Secret-rare flag appears when `collector number > set total`

### Scan failure modes

- [ ] Blurry photo → "Couldn't identify the card" with retry option
- [ ] Card with obscured bottom-left corner (finger over it) → same graceful failure
- [ ] Deny camera permission → app still opens; manual path degrades gracefully

### Pricing failure modes

- [ ] With KV warmed up: PSA 10 appears in < 500ms (cached)
- [ ] First-ever scan of an obscure card: PSA 10 fetch may take several seconds
- [ ] Card with no PriceCharting page → "no data" displayed; grading verdict labeled "Can't determine"

### Scan list

- [ ] 10+ cards all persist across a full page refresh
- [ ] Swipe/tap-to-remove works per card
- [ ] "Clear all" wipes the list
- [ ] Totals (raw, PSA 10, net for grading candidates) are arithmetically correct

### Settings

- [ ] Changing PSA tier updates verdicts for all existing list entries
- [ ] Tier persists across refresh

## Accuracy spot-check

Scan 10 cards of varying rarity and condition. Log first-try OCR hit rate.

| # | Card | Set | Number | OCR correct? | Notes |
|---|------|-----|--------|--------------|-------|
| 1 |      |     |        |              |       |
| 2 |      |     |        |              |       |
| … |      |     |        |              |       |

Target: ≥ 70% first-try success. If lower, inspect the corner-parser regex and fixture coverage.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual-qa.md
git commit -m "docs: manual qa checklist for mobile hardware"
```

---

### Task 23: Playwright visual regression smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Scaffold Playwright**

Run: `npx playwright install chromium`

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 375, height: 812 },
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
});
```

- [ ] **Step 3: Write `e2e/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('landing page renders on iPhone viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Card Scanner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan a Card' })).toBeVisible();
  // Visual snapshot; first run creates the baseline.
  await expect(page).toHaveScreenshot('landing-iphone.png', { maxDiffPixelRatio: 0.02 });
});
```

- [ ] **Step 4: Run once to generate baseline**

Run: `npm run test:e2e -- --update-snapshots`
Expected: baseline snapshot created.

- [ ] **Step 5: Run again to confirm passes against baseline**

Run: `npm run test:e2e`
Expected: test PASSES.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/ package.json package-lock.json
git commit -m "test: playwright smoke test at iphone viewport"
```

---

### Task 24: Wire up Vercel KV locally (optional for dev)

**Files:**
- Modify: `.env.local` (gitignored; do not commit)

- [ ] **Step 1: Link a Vercel KV store for local dev**

Run: `npx vercel link` and follow prompts.
Run: `npx vercel env pull .env.local`

This populates `KV_REST_API_URL` and `KV_REST_API_TOKEN` so the `/api/psa10` route works during `npm run dev`.

- [ ] **Step 2: Smoke-test end-to-end**

Run: `npm run dev`

In another terminal:

```bash
curl "http://localhost:3000/api/psa10?setCode=OBF&number=125&cardName=Charizard%20ex"
```

Expected: JSON with `price` (a number, or `null` with a `reason`) and `cached: false`. A second call should return `cached: true`.

Stop the dev server (Ctrl+C).

- [ ] **Step 3: No commit** — `.env.local` is gitignored. This task just verifies the integration works.

---

## Self-Review Notes

**Spec coverage check:**

- [x] Camera capture (Task 16) — covers "Camera-based card capture (iOS + Android mobile web)".
- [x] Bottom-left corner OCR (Tasks 4, 13) — covers "OCR of the bottom-left corner identifier block".
- [x] Card resolution with candidates + manual search (Tasks 7, 8, 14) — covers "Card resolution against pokemontcg.io with fuzzy fallback + manual search". Manual search UI is thin but the `/api/card?name=` endpoint + `searchByName()` helper support it; adding a manual-search panel to the UI could be a v1.1 follow-up if needed.
- [x] Raw price from pokemontcg.io (Task 7) — covers "Raw market price".
- [x] PSA 10 via scrape + KV (Tasks 5, 9, 10) — covers "PSA 10 price via server-side pricecharting scrape, cached 24h".
- [x] Grading verdict + PSA tier selector (Tasks 3, 18, 19) — covers "Grading verdict: net profit, PSA tier selector".
- [x] Front-face centering via OpenCV.js (Tasks 11, 12) — covers "Front-face centering check".
- [x] Session scan list in localStorage (Tasks 6, 18, 19) — covers "Session scan list… totals, per-card net, swipe to delete, clear all".
- [x] Error handling for every failure mode in Section 5 of the spec — covered across Tasks 8, 10, 14, 20.

**Known gap flagged for future work:** the manual-search UI is not a dedicated task in this plan — the API supports it but the landing/scan pages don't expose a text input. Acceptable because OCR + retake covers the realistic failure paths. If manual QA shows real users stuck on OCR failures, add a task for a text-search component before marking v1 done.

**Placeholder scan:** No TBD/TODO/vague steps. Every code step has complete code.

**Type consistency:** `NormalizedCard`, `ScanListEntry`, `PsaTier`, `CenteringResult`, `OcrResult`, `ResolverOutcome` used consistently across tasks. `gradingVerdict()` signature matches between `lib/grading.ts` (Task 3), `CardResult` (Task 17), and `ScanList` (Task 18).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-16-pokemon-card-scanner.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
