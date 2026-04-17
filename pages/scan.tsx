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
      const blob = await (await fetch(blobUrl)).blob();
      // Blob has been materialized into memory; release the object URL
      // so the underlying File can be garbage-collected.
      URL.revokeObjectURL(blobUrl);
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
