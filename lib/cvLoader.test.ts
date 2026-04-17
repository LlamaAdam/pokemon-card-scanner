import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadOpenCv, __resetCvForTest } from './cvLoader';

interface FakeScript { onload: (() => void) | null; src: string; }

interface FakeDocument {
  createElement: ReturnType<typeof vi.fn>;
  head: { appendChild: ReturnType<typeof vi.fn> };
}

interface TestGlobal {
  window: typeof globalThis;
  document: FakeDocument;
  cv?: { Mat: new () => object; __ready: boolean };
}

function asTestGlobal(): TestGlobal {
  return globalThis as unknown as TestGlobal;
}

describe('loadOpenCv', () => {
  beforeEach(() => {
    __resetCvForTest();
    const g = asTestGlobal();
    g.window = globalThis;
    g.document = {
      createElement: vi.fn().mockImplementation(() => {
        const el: FakeScript = { onload: null, src: '' };
        queueMicrotask(() => {
          g.cv = { Mat: function MatCtor() {} as unknown as new () => object, __ready: true };
          el.onload?.();
        });
        return el;
      }),
      head: { appendChild: vi.fn() },
    };
  });

  it('loads the script once and resolves with cv', async () => {
    const cv = (await loadOpenCv()) as unknown as { __ready: boolean };
    expect(cv.__ready).toBe(true);
    const again = await loadOpenCv();
    expect(again).toBe(cv);
    expect(asTestGlobal().document.createElement.mock.calls.length).toBe(1);
  });
});
