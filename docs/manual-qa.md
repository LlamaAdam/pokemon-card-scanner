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
