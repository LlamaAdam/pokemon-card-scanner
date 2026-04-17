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

// Numbered steps surface progress to the user so they can report exactly which
// step hangs on mobile (e.g. "stuck on step 3" = Tesseract asset download).
// The numbering is stable across deploys so support issues stay diagnosable.
const STEP_LABELS: Record<number, string> = {
  1: 'Loading captured photo',
  2: 'Starting OCR engine',
  3: 'Downloading OCR assets',
  4: 'Decoding image',
  5: 'Initializing OCR worker',
  6: 'OCR worker ready',
  7: 'Reading card corner',
  8: 'Finished reading',
  9: 'Looking up card in TCG database',
  10: 'Card identified',
  11: 'Fetching PSA 10 price',
  12: 'Price received',
};

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
  const [step, setStep] = useState<number>(0);
  const [stepDetail, setStepDetail] = useState<string>('');

  function setStepNum(n: number, detail?: string) {
    // Console log as well so Safari remote inspector captures the trail even
    // if the UI renders something stale.
    const label = STEP_LABELS[n] ?? 'Unknown';
    // eslint-disable-next-line no-console
    console.log(`[scan] Step ${n}: ${label}${detail ? ` (${detail})` : ''}`);
    setStep(n);
    setStepDetail(detail ?? '');
  }

  useEffect(() => {
    setTier(getSettings().psaTier);
    const url = window.__capturedBlobUrl;
    // Clear the side-channel immediately so a stale URL from a previous
    // scan can't be replayed if the user navigates to /scan directly.
    window.__capturedBlobUrl = undefined;
    if (!url) { router.replace('/'); return; }
    run(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(blobUrl: string) {
    try {
      setPhase('ocr');
      setStepNum(1);
      const blob = await (await fetch(blobUrl)).blob();
      // Blob has been materialized into memory; release the object URL
      // so the underlying File can be garbage-collected.
      URL.revokeObjectURL(blobUrl);

      setStepNum(2);
      // Kick off OCR and centering in parallel.
      // Tesseract's logger fires `recognize-progress` events for two distinct
      // phases: (a) during worker init it reports asset download + API setup,
      // (b) during the recognize pass it reports OCR progress. We track which
      // phase we're in so the same event source doesn't appear to "jump back"
      // from step 7 to step 3.
      let recognizing = false;
      const ocrPromise = ocrCardCorner(blob, (p) => {
        if (p.stage === 'load-module') setStepNum(2, 'importing tesseract.js');
        else if (p.stage === 'decode-image') setStepNum(4);
        else if (p.stage === 'init-worker') setStepNum(5);
        else if (p.stage === 'worker-ready') setStepNum(6);
        else if (p.stage === 'recognize-start') { recognizing = true; setStepNum(7); }
        else if (p.stage === 'recognize-done') setStepNum(8);
        else if (p.stage === 'recognize-progress') {
          const pct = typeof p.percent === 'number' ? Math.round(p.percent * 100) : null;
          const detail = p.detail
            ? `${p.detail}${pct != null ? ` ${pct}%` : ''}`
            : pct != null ? `${pct}%` : '';
          // Pre-recognize events ride step 3 (assets/worker bring-up);
          // recognize-pass events ride step 7 so the numeric step never
          // regresses.
          setStepNum(recognizing ? 7 : 3, detail);
        }
      });
      const centeringPromise = analyzeCentering(blob).catch(() => null);

      const ocr = await ocrPromise;
      setIsSecretRare(ocr.isSecretRare);
      setPhase('resolving');

      setStepNum(9);
      const resolved = await resolveFromOcr(ocr);
      if (resolved.status === 'clean') {
        setStepNum(10, `${resolved.card.name} ${resolved.card.setCode} ${resolved.card.number}`);
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
      // Surface as much as we can. Tesseract.js throws plain objects from
      // inside its worker (not Error instances), which used to collapse to
      // a useless "Unknown error" — stringify the whole thing and log it.
      // eslint-disable-next-line no-console
      console.error('[scan] caught error during run()', e);
      setPhase('error');
      setErrorMsg(describeError(e));
    }
  }

  function describeError(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const obj = e as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj.error === 'string') return obj.error;
      try { return JSON.stringify(obj); } catch { /* fall through */ }
    }
    return 'Unknown error';
  }

  async function fetchPsa10(c: NormalizedCard) {
    setPsa10Loading(true); setPsa10Error(null);
    setStepNum(11);
    try {
      const r = await fetch(
        `/api/psa10?setCode=${encodeURIComponent(c.setCode)}&number=${encodeURIComponent(c.number)}&cardName=${encodeURIComponent(c.name)}`
      );
      if (!r.ok) {
        setPsa10Error('unavailable');
      } else {
        const j = await r.json() as { price: number | null; reason?: string };
        setPsa10(j.price);
        setStepNum(12, j.price != null ? `$${j.price}` : 'no data');
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
      {(phase === 'ocr' || phase === 'resolving') && step > 0 && (
        <p
          className="muted"
          style={{ fontSize: '0.85em', fontVariantNumeric: 'tabular-nums' }}
          data-testid="scan-step"
        >
          Step {step}/12: {STEP_LABELS[step] ?? '…'}
          {stepDetail && ` — ${stepDetail}`}
        </p>
      )}
      {phase === 'error' && (
        <div className="card">
          <p className="danger">{errorMsg}</p>
          {step > 0 && (
            <p
              className="muted"
              style={{ fontSize: '0.85em', fontVariantNumeric: 'tabular-nums' }}
            >
              Stopped at step {step}/12: {STEP_LABELS[step] ?? '…'}
              {stepDetail && ` — ${stepDetail}`}
            </p>
          )}
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
