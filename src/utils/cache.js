'use strict';

// Simple generic TTL cache (Map-based) used across the bot for:
// - group settings, auto-replies, banned words, custom commands lookups.
// Default TTL = 30 seconds (per spec).
const DEFAULT_TTL = 30000;

class TTLCache {
  constructor(ttl = DEFAULT_TTL) {
    this.ttl = ttl;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttl) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.store.set(key, { value, ts: Date.now() });
    return value;
  }

  invalidate(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

// Periodically sweep expired entries from all registered caches
const registered = [];
function register(cache) {
  registered.push(cache);
  return cache;
}

setInterval(() => {
  const now = Date.now();
  for (const cache of registered) {
    for (const [key, entry] of cache.store.entries()) {
      if (now - entry.ts > cache.ttl) cache.store.delete(key);
    }
  }
}, 60000);

module.exports = { TTLCache, register, DEFAULT_TTL };
