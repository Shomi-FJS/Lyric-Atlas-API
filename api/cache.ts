import { getLogger } from './utils';

const logger = getLogger('Cache');

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private ttl: number;
  private name: string;
  private maxSize: number;

  constructor(name: string, ttlInMs: number, maxSize: number = 1000) {
    this.cache = new Map();
    this.ttl = ttlInMs;
    this.name = name;
    this.maxSize = maxSize;
    logger.info(logger.msg('cache.initialized', { name, ttl: ttlInMs, maxSize }));
  }

  get(key: string): T | null {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (now - entry.timestamp > this.ttl) {
      logger.debug(logger.msg('cache.expired', { key }));
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);

    logger.debug(logger.msg('cache.hit', { key }));
    return entry.data;
  }

  set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        logger.debug(logger.msg('cache.evict', { key: oldestKey }));
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    logger.info(logger.msg('cache.set', { key }));
  }

  invalidate(key: string): boolean {
    logger.info(logger.msg('cache.invalidate', { key }));
    return this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    logger.info(logger.msg('cache.clear'));
    this.cache.clear();
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(logger.msg('cache.cleanup', { count: cleaned }));
    }
    return cleaned;
  }
}

export const metadataCache = new Cache<any>('metadata', 30 * 60 * 1000, 5000);

export const lyricsCache = new Cache<any>('lyrics', 60 * 60 * 1000, 5000);

export function setupCacheCleanup(intervalMs: number = 15 * 60 * 1000): ReturnType<typeof setInterval> {
  logger.info(logger.msg('cache.cleanup_interval', { interval: intervalMs }));
  return setInterval(() => {
    metadataCache.cleanup();
    lyricsCache.cleanup();
  }, intervalMs);
} 