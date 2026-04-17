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
