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
    logger.info(`Cache '${name}' initialized with TTL: ${ttlInMs}ms, maxSize: ${maxSize}`);
  }

  get(key: string): T | null {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (now - entry.timestamp > this.ttl) {
      logger.debug(`Cache '${this.name}': Entry for key '${key}' expired`);
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);

    logger.debug(`Cache '${this.name}': Hit for key '${key}'`);
    return entry.data;
  }

  set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        logger.debug(`Cache '${this.name}': Evicting oldest entry '${oldestKey}' due to size limit`);
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    logger.debug(`Cache '${this.name}': Set key '${key}'`);
  }

  invalidate(key: string): boolean {
    logger.debug(`Cache '${this.name}': Invalidating key '${key}'`);
    return this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    logger.info(`Cache '${this.name}': Clearing all entries`);
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
      logger.info(`Cache '${this.name}': Cleaned up ${cleaned} expired entries`);
    }
    return cleaned;
  }
}

export const metadataCache = new Cache<any>('metadata', 30 * 60 * 1000, 3000);

export const lyricsCache = new Cache<any>('lyrics', 60 * 60 * 1000, 2000);

export function setupCacheCleanup(intervalMs: number = 15 * 60 * 1000): ReturnType<typeof setInterval> {
  logger.info(`Setting up cache cleanup interval: ${intervalMs}ms`);
  return setInterval(() => {
    metadataCache.cleanup();
    lyricsCache.cleanup();
  }, intervalMs);
} 