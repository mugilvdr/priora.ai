// Simple in-memory TTL cache with LRU eviction for external API responses.
// Reduces redundant API calls when the same query terms hit multiple search rounds.
// On Vercel serverless, cache persists only within a single function invocation
// (i.e., within one background search run), which is the useful window anyway.

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  accessedAt: number;
}

const MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

const store = new Map<string, CacheEntry<unknown>>();

function evictStale(): void {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now > entry.expiresAt) store.delete(key);
  });
}

function evictLRU(): void {
  if (store.size <= MAX_ENTRIES) return;

  // Find the least recently accessed entry
  let oldestKey = '';
  let oldestTime = Infinity;
  store.forEach((entry, key) => {
    if (entry.accessedAt < oldestTime) {
      oldestTime = entry.accessedAt;
      oldestKey = key;
    }
  });
  if (oldestKey) store.delete(oldestKey);
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  entry.accessedAt = Date.now();
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  evictStale();
  evictLRU();
  store.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    accessedAt: Date.now(),
  });
}

/**
 * Wrap an async fetcher with caching. If the key exists in cache, return cached data.
 * Otherwise call the fetcher, cache the result, and return it.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  const data = await fetcher();
  setCache(key, data, ttlMs);
  return data;
}

/** Build a cache key from a source name and query string */
export function cacheKey(source: string, query: string): string {
  return `${source}:${query.toLowerCase().trim().slice(0, 200)}`;
}
