// Thin wrapper around @vercel/kv that falls back to an in-process Map when
// KV_REST_API_URL / KV_REST_API_TOKEN are not set. This lets local `npm run dev`
// work without linking a Vercel KV store; cache is per-process and does not
// survive restarts, but the app stays functional.

export interface KvLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
}

interface MemEntry { value: unknown; expiresAt: number | null; }

function createMemoryKv(): KvLike {
  const store = new Map<string, MemEntry>();
  let warned = false;
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      if (!warned) {
        console.warn(
          '[kv] KV_REST_API_URL / KV_REST_API_TOKEN not set — using in-memory fallback. ' +
          'Cache does not persist across restarts. Link a Vercel KV store for production.',
        );
        warned = true;
      }
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt != null && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
      const expiresAt = opts?.ex != null ? Date.now() + opts.ex * 1000 : null;
      store.set(key, { value, expiresAt });
    },
  };
}

let cached: KvLike | null = null;

export function getKv(): KvLike {
  if (cached) return cached;
  const configured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (configured) {
    // Lazy require so environments without KV don't load @vercel/kv at all.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@vercel/kv') as { kv: KvLike };
    cached = mod.kv;
  } else {
    cached = createMemoryKv();
  }
  return cached;
}

// Test-only reset for re-initializing the cached client between suites.
export function __resetKvForTest(): void {
  cached = null;
}
