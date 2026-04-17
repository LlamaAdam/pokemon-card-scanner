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
