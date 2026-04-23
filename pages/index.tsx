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

    // Pre-warm OpenCV.js while the user is deciding what to scan. The
    // card-detect step on /scan depends on an 8MB WASM bundle loaded from
    // docs.opencv.org, and on a cold cache Firefox times out card-detect
    // against its 3.5s guard and falls back to the looser image-relative
    // crop. Kicking off the download here — via a low-priority `idle`
    // callback so it never competes with the initial paint — lets the
    // browser finish the fetch in the background, so by the time the user
    // captures a photo and routes to /scan, loadOpenCv() resolves from its
    // module-level cache in ~0ms instead of hitting the network. This is a
    // best-effort optimization: we swallow errors and rely on /scan's
    // existing timeout+fallback path if the preload never completes.
    const preload = () => {
      import('@/lib/cvLoader')
        .then((m) => m.loadOpenCv())
        .catch(() => null);
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(preload);
    } else {
      // Safari <16 and older Firefox lack requestIdleCallback; a short
      // setTimeout achieves the same goal of yielding to first paint.
      setTimeout(preload, 200);
    }
  }, []);

  function handleCapture(file: File) {
    // Stash file in sessionStorage-adjacent blob URL and navigate to /scan.
    const url = URL.createObjectURL(file);
    window.__capturedBlobUrl = url;
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
