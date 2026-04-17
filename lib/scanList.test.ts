import { describe, it, expect, beforeEach } from 'vitest';
import { addEntry, listEntries, removeEntry, clearList, type ScanListEntry } from './scanList';

function makeEntry(over: Partial<ScanListEntry> = {}): Omit<ScanListEntry, 'id' | 'scannedAt'> {
  return {
    cardId: 'obf-125', name: 'Charizard ex', setName: 'Obsidian Flames',
    setCode: 'OBF', number: '125', imageUrl: 'https://example/img.png',
    rawPrice: 30, psa10Price: 200,
    centering: { lr: '55/45', tb: '60/40', verdict: 'borderline' },
    ...over,
  };
}

describe('scanList', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => { expect(listEntries()).toEqual([]); });

  it('adds an entry and returns it with id + scannedAt', () => {
    const e = addEntry(makeEntry());
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.scannedAt).toBeGreaterThan(0);
    expect(listEntries()).toHaveLength(1);
  });

  it('removes by id', () => {
    const a = addEntry(makeEntry({ name: 'A' }));
    addEntry(makeEntry({ name: 'B' }));
    removeEntry(a.id);
    expect(listEntries().map(e => e.name)).toEqual(['B']);
  });

  it('clears the list', () => {
    addEntry(makeEntry()); addEntry(makeEntry());
    clearList();
    expect(listEntries()).toEqual([]);
  });

  it('returns entries newest-first', () => {
    const a = addEntry(makeEntry({ name: 'A' }));
    globalThis.__now = a.scannedAt + 1000;
    addEntry(makeEntry({ name: 'B' }));
    globalThis.__now = undefined;
    expect(listEntries().map(e => e.name)).toEqual(['B', 'A']);
  });

  it('survives corrupt localStorage (returns empty, overwrites)', () => {
    localStorage.setItem('cardscan.scanlist.v1', '{not json');
    expect(listEntries()).toEqual([]);
  });
});
