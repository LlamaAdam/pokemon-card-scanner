import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// localStorage polyfill for jsdom
class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(k: string) { return this.store[k] ?? null; }
  setItem(k: string, v: string) { this.store[k] = String(v); }
  removeItem(k: string) { delete this.store[k]; }
  get length() { return Object.keys(this.store).length; }
  key(i: number) { return Object.keys(this.store)[i] ?? null; }
}

beforeEach(() => {
  (globalThis as any).localStorage = new LocalStorageMock();
});
