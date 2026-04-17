// Thin wrapper around @upstash/redis that falls back to an in-process Map
// when no Upstash credentials are set. This lets local `npm run dev` work
// without a real Redis; the in-memory cache is per-process and does not
// survive restarts, but the app stays functional.
//
// Accepts either the Upstash-native env names (UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN) or the legacy Vercel KV names (KV_REST_API_URL /
// KV_REST_API_TOKEN) so existing Vercel deployments keep working.

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
          '[kv] No Upstash Redis credentials set (UPSTASH_REDIS_REST_URL / ' +
          'UPSTASH_REDIS_REST_TOKEN, or legacy KV_REST_API_URL / KV_REST_API_TOKEN) — ' +
          'using in-memory fallback. Cache does not persist across restarts.',
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

function getConfiguredCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

interface UpstashSetOpts { ex?: number }
interface UpstashRedis {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: UpstashSetOpts): Promise<unknown>;
}

let cached: KvLike | null = null;

export function getKv(): KvLike {
  if (cached) return cached;
  const creds = getConfiguredCreds();
  if (creds) {
    // Lazy require so environments without Upstash don't load the SDK at all.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@upstash/redis') as { Redis: new (c: { url: string; token: string }) => UpstashRedis };
    const client = new mod.Redis({ url: creds.url, token: creds.token });
    cached = {
      async get<T = unknown>(key: string): Promise<T | null> {
        return client.get<T>(key);
      },
      async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
        await client.set(key, value, opts?.ex != null ? { ex: opts.ex } : undefined);
      },
    };
  } else {
    cached = createMemoryKv();
  }
  return cached;
}

// Test-only reset for re-initializing the cached client between suites.
export function __resetKvForTest(): void {
  cached = null;
}
