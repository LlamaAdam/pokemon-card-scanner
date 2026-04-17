import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadOpenCv, __resetCvForTest } from './cvLoader';

describe('loadOpenCv', () => {
  beforeEach(() => {
    __resetCvForTest();
    // stub a minimal global cv and window
    (globalThis as any).window = globalThis;
    (globalThis as any).document = {
      createElement: vi.fn().mockImplementation(() => {
        const el: any = { onload: null as null | (() => void), src: '' };
        queueMicrotask(() => {
          (globalThis as any).cv = { Mat: function () {}, __ready: true };
          el.onload?.();
        });
        return el;
      }),
      head: { appendChild: vi.fn() },
    };
  });

  it('loads the script once and resolves with cv', async () => {
    const cv = await loadOpenCv();
    expect((cv as any).__ready).toBe(true);
    const again = await loadOpenCv();
    expect(again).toBe(cv);
    expect(((globalThis as any).document.createElement as any).mock.calls.length).toBe(1);
  });
});
