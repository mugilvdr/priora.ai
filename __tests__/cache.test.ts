import { describe, it, expect } from 'vitest';
import { getCached, setCache, cachedFetch, cacheKey } from '@/lib/search/cache';

describe('cache', () => {
  it('should store and retrieve cached values', () => {
    setCache('test-key', { data: 'hello' });
    const result = getCached<{ data: string }>('test-key');
    expect(result).toEqual({ data: 'hello' });
  });

  it('should return undefined for non-existent keys', () => {
    expect(getCached('nonexistent')).toBeUndefined();
  });

  it('should expire entries after TTL', async () => {
    setCache('ttl-test', 'value', 50); // 50ms TTL
    expect(getCached('ttl-test')).toBe('value');
    await new Promise((r) => setTimeout(r, 60));
    expect(getCached('ttl-test')).toBeUndefined();
  });

  it('cachedFetch should call fetcher on miss and cache result', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return 'fetched-data';
    };

    // First call should invoke fetcher
    const result1 = await cachedFetch('fetch-test', fetcher);
    expect(result1).toBe('fetched-data');
    expect(callCount).toBe(1);

    // Second call should return cached value
    const result2 = await cachedFetch('fetch-test', fetcher);
    expect(result2).toBe('fetched-data');
    expect(callCount).toBe(1); // not called again
  });

  it('cacheKey should normalize and combine source and query', () => {
    const key = cacheKey('USPTO', '  Wireless Charging  ');
    expect(key).toBe('USPTO:wireless charging');
  });
});
