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
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', fontSize: 14 }}
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
