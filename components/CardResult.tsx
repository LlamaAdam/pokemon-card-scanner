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
