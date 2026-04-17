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
          <li key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <img src={e.imageUrl} alt="" width={40} style={{ borderRadius: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {e.setCode} {e.number} · raw ${e.rawPrice?.toFixed(2) ?? '—'} · PSA10 ${e.psa10Price?.toFixed(2) ?? '—'}
              </div>
            </div>
            <button onClick={() => onRemove(e.id)} style={{ padding: '6px 10px', fontSize: 12 }} aria-label={`Remove ${e.name}`}>✕</button>
          </li>
        ))}
      </ul>
      <div className="muted" style={{ fontSize: 13, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'grid', gap: 2 }}>
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
