// In-memory LRU cache with TTL and namespacing
// Swappable: keep API minimal so we can later replace with Redis without touching call sites.
import LRUCache from 'lru-cache';

const ttlSec = parseInt(process.env.CACHE_TTL || '60', 10); // default 60s
const maxItems = parseInt(process.env.CACHE_MAX || '500', 10);

const cache = new LRUCache({
  max: maxItems,
  ttl: ttlSec * 1000,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

const nsKey = (ns, key) => `${ns}:${key}`;

export const get = (ns, key) => cache.get(nsKey(ns, key));
export const set = (ns, key, value, ttlMs) => cache.set(nsKey(ns, key), value, { ttl: ttlMs ?? ttlSec * 1000 });
export const del = (ns, key) => cache.delete(nsKey(ns, key));
export const has = (ns, key) => cache.has(nsKey(ns, key));

// Bulk helpers
export const delByPrefix = (prefix) => {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
};

export const wrap = async (ns, key, fn, ttlMs) => {
  const k = nsKey(ns, key);
  if (cache.has(k)) return cache.get(k);
  const value = await fn();
  cache.set(k, value, { ttl: ttlMs ?? ttlSec * 1000 });
  return value;
};

export default {
  get,
  set,
  del,
  has,
  delByPrefix,
  wrap,
};
