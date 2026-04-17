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
