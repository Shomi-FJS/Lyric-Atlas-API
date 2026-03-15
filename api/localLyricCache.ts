import { getLogger } from './utils';
import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, unlink, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const logger = getLogger('LocalLyricCache');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, '..', 'lyrics-cache');
const META_FILE = join(CACHE_DIR, 'cache-meta.json');
const PLAY_COUNT_THRESHOLD = 2;
const INACTIVE_DAYS_THRESHOLD = 15;
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const MAX_MEMORY_CACHE_SIZE = 500;

interface LyricMeta {
  playCount: number;
  lastPlayedAt: number;
  cachedAt: number;
  contentHash: string;
  source: 'main' | 'user' | 'upload';
  musicName?: string[];
  artists?: string[];
  album?: string;
}

interface CacheMeta {
  lyrics: Record<string, LyricMeta>;
  lastUpdateCheck: number;
}

export class LocalLyricCache {
  private meta: CacheMeta;
  private initialized: boolean = false;
  private updateCheckTimer: ReturnType<typeof setInterval> | null = null;
  private contentCache: Map<string, { content: string; timestamp: number }> = new Map();

  constructor() {
    this.meta = { lyrics: {}, lastUpdateCheck: 0 };
  }

  parseTTMLMetadata(content: string): { musicName: string[]; artists: string[]; album: string[] } {
    const result = { musicName: [] as string[], artists: [] as string[], album: [] as string[] };
    
    const metaRegex = /<amll:meta\s+key="([^"]+)"\s+value="([^"]+)"\s*\/>/g;
    let match;
    
    while ((match = metaRegex.exec(content)) !== null) {
      const key = match[1];
      const value = match[2];
      
      if (key === 'musicName') {
        result.musicName.push(value);
      } else if (key === 'artists') {
        result.artists.push(value);
      } else if (key === 'album') {
        result.album.push(value);
      }
    }
    
    return result;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.ensureCacheDir();
      await this.loadMeta();
      this.initialized = true;
      this.startUpdateCheck();
      logger.info(logger.msg('localcache.initialized'));
    } catch (err) {
      logger.error('初始化本地歌词缓存失败:', err);
    }
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await access(CACHE_DIR);
    } catch {
      await mkdir(CACHE_DIR, { recursive: true });
      logger.info(`创建缓存目录: ${CACHE_DIR}`);
    }
  }

  private async loadMeta(): Promise<void> {
    try {
      const data = await readFile(META_FILE, 'utf-8');
      this.meta = JSON.parse(data);
      logger.info(logger.msg('localcache.loaded_meta', { count: Object.keys(this.meta.lyrics).length }));
    } catch {
      this.meta = { lyrics: {}, lastUpdateCheck: 0 };
      await this.saveMeta();
    }
  }

  private async saveMeta(): Promise<void> {
    try {
      await writeFile(META_FILE, JSON.stringify(this.meta, null, 2));
    } catch (err) {
      logger.error('Failed to save cache meta:', err);
    }
  }

  private getCacheFilePath(id: string): string {
    return join(CACHE_DIR, `${id}.ttml`);
  }

  private computeHash(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  async recordPlay(id: string): Promise<void> {
    if (!this.meta.lyrics[id]) {
      this.meta.lyrics[id] = {
        playCount: 0,
        lastPlayedAt: Date.now(),
        cachedAt: 0,
        contentHash: '',
        source: 'main'
      };
    }

    this.meta.lyrics[id].playCount++;
    this.meta.lyrics[id].lastPlayedAt = Date.now();
    await this.saveMeta();

    logger.debug(logger.msg('localcache.play_recorded', { id, count: this.meta.lyrics[id].playCount }));
  }

  async shouldCache(id: string): Promise<boolean> {
    const meta = this.meta.lyrics[id];
    if (!meta) return false;
    return meta.playCount >= PLAY_COUNT_THRESHOLD;
  }

  async isCached(id: string): Promise<boolean> {
    try {
      await access(this.getCacheFilePath(id));
      return true;
    } catch {
      return false;
    }
  }

  async getCachedLyric(id: string): Promise<string | null> {
    const cached = this.contentCache.get(id);
    if (cached) {
      this.recordPlay(id).catch(() => {});
      return cached.content;
    }
    
    try {
      const content = await readFile(this.getCacheFilePath(id), 'utf-8');
      
      if (this.contentCache.size >= MAX_MEMORY_CACHE_SIZE) {
        const oldestKey = this.contentCache.keys().next().value;
        if (oldestKey) {
          this.contentCache.delete(oldestKey);
        }
      }
      
      this.contentCache.set(id, { content, timestamp: Date.now() });
      this.recordPlay(id).catch(() => {});
      return content;
    } catch {
      return null;
    }
  }

  async cacheLyric(id: string, content: string, source: 'main' | 'user' | 'upload'): Promise<void> {
    const hash = this.computeHash(content);
    const filePath = this.getCacheFilePath(id);
    const metadata = this.parseTTMLMetadata(content);

    try {
      await writeFile(filePath, content, 'utf-8');

      if (this.contentCache.size >= MAX_MEMORY_CACHE_SIZE) {
        const oldestKey = this.contentCache.keys().next().value;
        if (oldestKey) {
          this.contentCache.delete(oldestKey);
        }
      }
      this.contentCache.set(id, { content, timestamp: Date.now() });

      if (!this.meta.lyrics[id]) {
        this.meta.lyrics[id] = {
          playCount: 0,
          lastPlayedAt: Date.now(),
          cachedAt: 0,
          contentHash: '',
          source
        };
      }

      this.meta.lyrics[id].cachedAt = Date.now();
      this.meta.lyrics[id].contentHash = hash;
      this.meta.lyrics[id].source = source;
      
      if (metadata.musicName.length > 0) {
        this.meta.lyrics[id].musicName = metadata.musicName;
      }
      if (metadata.artists.length > 0) {
        this.meta.lyrics[id].artists = metadata.artists;
      }
      if (metadata.album.length > 0) {
        this.meta.lyrics[id].album = metadata.album[0];
      }

      await this.saveMeta();
      logger.info(logger.msg('localcache.cached', { id, source }));
    } catch (err) {
      logger.error(`缓存歌词失败 ${id}:`, err);
    }
  }

  async deleteCache(id: string): Promise<boolean> {
    this.contentCache.delete(id);
    
    try {
      const filePath = this.getCacheFilePath(id);
      await unlink(filePath);
      delete this.meta.lyrics[id];
      await this.saveMeta();
      logger.info(logger.msg('localcache.deleted', { id }));
      return true;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        delete this.meta.lyrics[id];
        await this.saveMeta();
        return false;
      }
      logger.error(`删除缓存失败 ${id}:`, err);
      return false;
    }
  }

  getCacheDir(): string {
    return CACHE_DIR;
  }

  async getMeta(): Promise<CacheMeta> {
    return this.meta;
  }

  async cleanupInactive(): Promise<number> {
    const now = Date.now();
    const inactiveThreshold = INACTIVE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [id, meta] of Object.entries(this.meta.lyrics)) {
      if (now - meta.lastPlayedAt > inactiveThreshold) {
        try {
          await unlink(this.getCacheFilePath(id));
          this.contentCache.delete(id);
          delete this.meta.lyrics[id];
          cleaned++;
          logger.info(logger.msg('localcache.cleaned_inactive', { id }));
        } catch (err) {
          logger.error(`清理缓存失败 ${id}:`, err);
        }
      }
    }

    if (cleaned > 0) {
      await this.saveMeta();
    }

    return cleaned;
  }

  async checkForUpdates(fetchFn: (id: string) => Promise<{ content: string; source: 'main' | 'user' } | null>): Promise<number> {
    let updated = 0;

    for (const [id, meta] of Object.entries(this.meta.lyrics)) {
      if (meta.cachedAt === 0) continue;

      try {
        const result = await fetchFn(id);
        if (!result) continue;

        const newHash = this.computeHash(result.content);
        if (newHash !== meta.contentHash) {
          await this.cacheLyric(id, result.content, result.source);
          updated++;
          logger.info(`Updated lyric for ${id}`);
        }
      } catch (err) {
        logger.error(`Failed to check update for ${id}:`, err);
      }
    }

    this.meta.lastUpdateCheck = Date.now();
    await this.saveMeta();

    return updated;
  }

  private startUpdateCheck(): void {
    this.updateCheckTimer = setInterval(async () => {
      logger.info('Starting periodic update check...');
      await this.cleanupInactive();
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  stopUpdateCheck(): void {
    if (this.updateCheckTimer) {
      clearInterval(this.updateCheckTimer);
      this.updateCheckTimer = null;
    }
  }
}

export const localLyricCache = new LocalLyricCache();
