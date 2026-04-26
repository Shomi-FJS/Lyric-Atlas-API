import { getLogger } from './utils';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile, writeFile, mkdir, unlink, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const logger = getLogger('LocalLyricCache');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, '..', 'lyrics-cache');
const META_FILE = join(CACHE_DIR, 'cache-meta.json');
const IDS_FILE = join(CACHE_DIR, 'ncm-ids.json');
const REQUEST_COUNTS_FILE = join(CACHE_DIR, 'ttml-request-counts.json');
const PLAY_COUNT_THRESHOLD = 3;
const TTML_REQUEST_THRESHOLD = 2;
const INACTIVE_DAYS_THRESHOLD = 14;
const PLAY_DEBOUNCE_MS = 5000;
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const MAX_MEMORY_CACHE_SIZE = 500;
const FLUSH_INTERVAL_MS = 3000; // 防抖写入间隔（毫秒）

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

  // 防抖写入
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty: boolean = false;
  private ttmlRequestCounts: Map<string, number> = new Map();
  private requestCountsDirty: boolean = false;
  // 互斥锁
  private writeLock: Promise<void> = Promise.resolve();
  // 操作锁（防止 rebuildMeta / updateCacheFromRemote 并发执行）
  private operationLock: Promise<void> = Promise.resolve();
  // 是否在定时维护中清理长时间未播放的歌词（默认开启）
  private inactiveCleanupEnabled: boolean = true;

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
      if (key === 'musicName') result.musicName.push(value);
      else if (key === 'artists') result.artists.push(value);
      else if (key === 'album') result.album.push(value);
    }
    return result;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.ensureCacheDir();
      await this.loadMeta();
      await this.loadRequestCounts();
      await this.saveIdsFile();
      this.initialized = true;
      this.startUpdateCheck();
      logger.info(logger.msg('localcache.initialized'));
    } catch (err) {
      logger.error(logger.msg('localcache.init_failed'), err);
    }
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await access(CACHE_DIR);
    } catch {
      await mkdir(CACHE_DIR, { recursive: true });
      logger.info(logger.msg('localcache.dir_created', { dir: CACHE_DIR }));
    }
  }

  private async loadMeta(): Promise<void> {
    try {
      const data = await readFile(META_FILE, 'utf-8');
      this.meta = JSON.parse(data);
      let staleCleaned = 0;
      for (const [id, m] of Object.entries(this.meta.lyrics)) {
        if (m.cachedAt > 0) {
          try {
            await access(this.getCacheFilePath(id));
          } catch {
            m.cachedAt = 0;
            m.contentHash = '';
            staleCleaned++;
            logger.warn(logger.msg('localcache.stale_meta_cleaned', { id }));
          }
        }
      }
      if (staleCleaned > 0) {
        await this.saveMetaNow();
      }
      logger.info(logger.msg('localcache.loaded_meta', { count: Object.keys(this.meta.lyrics).length }));
    } catch {
      this.meta = { lyrics: {}, lastUpdateCheck: 0 };
      await this.saveMetaNow();
    }
  }

  private async saveMetaNow(): Promise<void> {
    this.writeLock = this.writeLock.then(async () => {
      try {
        await writeFile(META_FILE, JSON.stringify(this.meta));
        await this.saveIdsFile();
      } catch (err) {
        this.dirty = true;
        logger.error(logger.msg('localcache.save_meta_failed'), err);
      }
    });
    await this.writeLock;
  }

  // 保存 ncm-ids.json：缓存文件夹中所有 TTML 对应的 NCM ID 列表（每行一个）
  private async saveIdsFile(): Promise<void> {
    try {
      const ids = Object.entries(this.meta.lyrics)
        .filter(([, m]) => m.cachedAt > 0)
        .map(([id]) => id)
        .sort((a, b) => Number(a) - Number(b));
      await writeFile(IDS_FILE, JSON.stringify(ids, null, 2));
    } catch (err) {
      logger.error(logger.msg('localcache.save_meta_failed'), err);
    }
  }

  private async loadRequestCounts(): Promise<void> {
    try {
      const data = await readFile(REQUEST_COUNTS_FILE, 'utf-8');
      const parsed: Record<string, number> = JSON.parse(data);
      this.ttmlRequestCounts = new Map(Object.entries(parsed));
      logger.debug(logger.msg('localcache.request_counts_loaded', { count: this.ttmlRequestCounts.size }));
    } catch {
      this.ttmlRequestCounts = new Map();
    }
  }

  private async saveRequestCounts(): Promise<void> {
    try {
      const obj: Record<string, number> = {};
      for (const [id, count] of this.ttmlRequestCounts) {
        obj[id] = count;
      }
      await writeFile(REQUEST_COUNTS_FILE, JSON.stringify(obj));
    } catch (err) {
      this.requestCountsDirty = true;
      logger.error(logger.msg('localcache.save_request_counts_failed'), err);
    }
  }

  recordTtmlRequest(id: string): number {
    const prev = this.ttmlRequestCounts.get(id) ?? 0;
    const next = prev + 1;
    this.ttmlRequestCounts.set(id, next);
    this.requestCountsDirty = true;
    this.scheduleFlush();
    logger.debug(logger.msg('localcache.ttml_request_recorded', { id, count: next }));
    return next;
  }

  shouldCacheByRequests(id: string): boolean {
    return (this.ttmlRequestCounts.get(id) ?? 0) >= TTML_REQUEST_THRESHOLD;
  }

  async resetRequestCounts(): Promise<void> {
    this.ttmlRequestCounts.clear();
    this.requestCountsDirty = true;
    await this.saveRequestCounts();
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const metaDirty = this.dirty;
      const reqDirty = this.requestCountsDirty;
      if (metaDirty) {
        this.dirty = false;
        this.saveMetaNow().catch(() => {});
      }
      if (reqDirty) {
        this.requestCountsDirty = false;
        this.saveRequestCounts().catch(() => {});
      }
    }, FLUSH_INTERVAL_MS);
  }

  private getCacheFilePath(id: string): string {
    return join(CACHE_DIR, `${id}.ttml`);
  }

  private computeHash(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  async recordPlay(id: string): Promise<void> {
    const now = Date.now();
    if (!this.meta.lyrics[id]) {
      this.meta.lyrics[id] = {
        playCount: 0,
        lastPlayedAt: 0,
        cachedAt: 0,
        contentHash: '',
        source: 'main'
      };
    }
    const meta = this.meta.lyrics[id];
    if (now - meta.lastPlayedAt < PLAY_DEBOUNCE_MS) {
      logger.debug(logger.msg('localcache.play_debounced', { id }));
      return;
    }
    meta.playCount++;
    meta.lastPlayedAt = now;
    this.scheduleFlush();
    logger.debug(logger.msg('localcache.play_recorded', { id, count: meta.playCount }));
  }

  shouldCache(id: string): boolean {
    const meta = this.meta.lyrics[id];
    if (!meta) return false;
    return meta.playCount > PLAY_COUNT_THRESHOLD;
  }

  async isCached(id: string): Promise<boolean> {
    try {
      await access(this.getCacheFilePath(id));
      return true;
    } catch {
      return false;
    }
  }

  // 同步快速路径：内存命中时零开销返回，避免 async/await 微任务开销
  getCachedLyricSync(id: string): string | null {
    const cached = this.contentCache.get(id);
    if (cached) {
      if (!existsSync(this.getCacheFilePath(id))) {
        this.contentCache.delete(id);
        return null;
      }
      // 更新访问顺序（真正的 LRU：delete + 重新 set 将 key 移到尾部）
      this.contentCache.delete(id);
      this.contentCache.set(id, cached);
      return cached.content;
    }
    return null;
  }

  async getCachedLyric(id: string): Promise<string | null> {
    const cached = this.contentCache.get(id);
    if (cached) {
      try {
        await access(this.getCacheFilePath(id));
      } catch {
        this.contentCache.delete(id);
        return null;
      }
      this.contentCache.delete(id);
      this.contentCache.set(id, cached);
      logger.debug(`内存缓存命中: ${id}`);
      return cached.content;
    }

    try {
      const content = await readFile(this.getCacheFilePath(id), 'utf-8');
      if (this.contentCache.size >= MAX_MEMORY_CACHE_SIZE) {
        const oldestKey = this.contentCache.keys().next().value;
        if (oldestKey) this.contentCache.delete(oldestKey);
      }
      this.contentCache.set(id, { content, timestamp: Date.now() });
      logger.debug(`文件缓存命中: ${id}`);
      return content;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        logger.debug(`本地缓存文件不存在: ${id}`);
      } else {
        logger.warn(`读取本地缓存失败: ${id}`, err.message);
      }
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
        if (oldestKey) this.contentCache.delete(oldestKey);
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

      if (metadata.musicName.length > 0) this.meta.lyrics[id].musicName = metadata.musicName;
      if (metadata.artists.length > 0) this.meta.lyrics[id].artists = metadata.artists;
      if (metadata.album.length > 0) this.meta.lyrics[id].album = metadata.album[0];

      this.scheduleFlush();
      logger.info(logger.msg('localcache.cached', { id, source }));
    } catch (err) {
      logger.error(logger.msg('localcache.cache_failed', { id }), err);
    }
  }

  async deleteCache(id: string): Promise<boolean> {
    this.contentCache.delete(id);
    this.ttmlRequestCounts.delete(id);
    this.requestCountsDirty = true;
    await this.clearSearchCache();

    try {
      const filePath = this.getCacheFilePath(id);
      await unlink(filePath);
      delete this.meta.lyrics[id];
      this.scheduleFlush();
      logger.info(logger.msg('localcache.deleted', { id }));
      return true;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        delete this.meta.lyrics[id];
        this.scheduleFlush();
        return false;
      }
      logger.error(logger.msg('localcache.delete_failed', { id }), err);
      return false;
    }
  }

  private async clearSearchCache(): Promise<void> {
    try {
      const { lyricsCache, metadataCache } = await import('./cache');
      lyricsCache.clear();
      metadataCache.clear();
    } catch (err) {
      logger.warn('清理内存搜索缓存失败', err);
    }
  }

  getCacheDir(): string {
    return CACHE_DIR;
  }

  getMeta(): CacheMeta {
    return this.meta;
  }

  setInactiveCleanupEnabled(enabled: boolean): void {
    this.inactiveCleanupEnabled = enabled;
  }

  isInactiveCleanupEnabled(): boolean {
    return this.inactiveCleanupEnabled;
  }

  getInactiveDaysThreshold(): number {
    return INACTIVE_DAYS_THRESHOLD;
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
          logger.error(logger.msg('localcache.cleanup_failed', { id }), err);
        }
      }
    }

    if (cleaned > 0) {
      this.scheduleFlush();
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
          logger.info(logger.msg('localcache.check_update', { id }));
        }
      } catch (err) {
        logger.error(logger.msg('localcache.check_update_failed', { id }), err);
      }
    }

    this.meta.lastUpdateCheck = Date.now();
    this.scheduleFlush();

    return updated;
  }

  // 强制立即将脏数据刷盘（用于优雅关闭）
  async flush(): Promise<void> {
    if (this.dirty) {
      this.dirty = false;
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      await this.saveMetaNow();
    }
  }

  // 重建元数据：扫描 lyrics-cache 目录下所有 TTML 文件，重新解析并生成 cache-meta.json
  async rebuildMeta(): Promise<{ total: number; added: number; updated: number; removed: number }> {
    return new Promise((resolve) => {
      this.operationLock = this.operationLock.then(async () => {
        try {
          resolve(await this._doRebuildMeta());
        } catch (err) {
          resolve({ total: 0, added: 0, updated: 0, removed: 0 });
        }
      });
    });
  }

  private async _doRebuildMeta(): Promise<{ total: number; added: number; updated: number; removed: number }> {
    const { readdir, stat } = await import('fs/promises');
    let total = 0, added = 0, updated = 0, removed = 0;

    const files = await readdir(CACHE_DIR);
    const existingIds = new Set<string>();

    logger.info(logger.msg('localcache.rebuild_start'));

    for (const file of files) {
      if (!file.endsWith('.ttml')) continue;
      const id = file.replace('.ttml', '');
      existingIds.add(id);
      total++;

      try {
        const content = await readFile(join(CACHE_DIR, file), 'utf-8');
        const hash = this.computeHash(content);
        const metadata = this.parseTTMLMetadata(content);
        const fileStat = await stat(join(CACHE_DIR, file));

        const oldMeta = this.meta.lyrics[id];
        const isCached = oldMeta && oldMeta.cachedAt > 0;

        if (!oldMeta) {
          added++;
          const songInfo = metadata.musicName.length > 0 ? `${metadata.musicName[0]}` : id;
          logger.info(logger.msg('localcache.rebuild_added', { total, id, song: songInfo }));
        } else if (oldMeta.contentHash !== hash || !isCached) {
          updated++;
          const songInfo = metadata.musicName.length > 0 ? `${metadata.musicName[0]}` : id;
          logger.info(logger.msg('localcache.rebuild_updated', { total, id, song: songInfo }));
        }

        this.meta.lyrics[id] = {
          playCount: oldMeta?.playCount || 0,
          lastPlayedAt: oldMeta?.lastPlayedAt || fileStat.mtimeMs,
          cachedAt: isCached ? oldMeta.cachedAt : Math.floor(fileStat.mtimeMs),
          contentHash: hash,
          source: oldMeta?.source || (fileStat.mtimeMs === 0 ? 'main' : (oldMeta?.source || 'main')),
          ...(metadata.musicName.length > 0 ? { musicName: metadata.musicName } : {}),
          ...(metadata.artists.length > 0 ? { artists: metadata.artists } : {}),
          ...(metadata.album.length > 0 ? { album: metadata.album[0] } : {}),
        };

        this.setContentCache(id, content);
      } catch (err) {
        logger.error(logger.msg('localcache.parse_failed', { file }), err);
      }
    }

    for (const id of Object.keys(this.meta.lyrics)) {
      if (!existingIds.has(id)) {
        delete this.meta.lyrics[id];
        this.contentCache.delete(id);
        removed++;
        logger.info(logger.msg('localcache.rebuild_removed', { id }));
      }
    }

    await this.saveMetaNow();
    logger.info(logger.msg('localcache.rebuild_end', { total, added, updated, removed }));
    return { total, added, updated, removed };
  }

  // 从镜像源更新缓存：对比远程 TTML 内容，检查 ncmMusicId 并自动更正文件名
  async updateCacheFromRemote(): Promise<{
    total: number;
    updated: number;
    skipped: number;
    renamed: number;
    notFound: number;
    errors: number;
    details: Array<{ id: string; action: string; detail: string }>;
  }> {
    // 操作锁：防止并发执行
    return new Promise((resolve) => {
      this.operationLock = this.operationLock.then(async () => {
        try {
          resolve(await this._doUpdateCacheFromRemote());
        } catch (err) {
          resolve({
            total: 0, updated: 0, skipped: 0, renamed: 0, notFound: 0, errors: 1,
            details: [{ id: '', action: 'error', detail: String(err) }]
          });
        }
      });
    });
  }

  private async _doUpdateCacheFromRemote(): Promise<{
    total: number;
    updated: number;
    skipped: number;
    renamed: number;
    notFound: number;
    errors: number;
    details: Array<{ id: string; action: string; detail: string }>;
  }> {
    const { rename } = await import('fs/promises');
    const { buildRawUrl, buildMirrorUrls } = await import('./utils');

    // ======== 第一步：测速选择最快镜像源 ========
    const candidates = [
      { name: '主仓库', buildUrl: (id: string) => buildRawUrl(id, 'ttml') },
      { name: '镜像1', buildUrl: (id: string) => buildMirrorUrls(id, 'ttml')[0] },
      { name: '镜像2', buildUrl: (id: string) => buildMirrorUrls(id, 'ttml')[1] },
    ];

    const ids = Object.keys(this.meta.lyrics);
    const total = ids.length;
    const probeId = ids[0]; // 取第一个 ID 做 probe

    logger.info(logger.msg('localcache.update_speedtest', { count: candidates.length, probeId }));

    const probeResults = await Promise.allSettled(
      candidates.map(async (c) => {
        const url = c.buildUrl(probeId);
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(url, { signal: controller.signal, method: 'HEAD' });
          clearTimeout(timeoutId);
          return { ...c, url, ms: Date.now() - start, ok: resp.ok };
        } catch {
          return { ...c, url, ms: 99999, ok: false };
        }
      })
    );

    // 选择最快且可用的源
    const available = probeResults
      .filter(r => r.status === 'fulfilled' && r.value.ok)
      .map(r => (r as PromiseFulfilledResult<{ name: string; buildUrl: (id: string) => string; url: string; ms: number; ok: boolean }>).value)
      .sort((a, b) => a.ms - b.ms);

    if (available.length === 0) {
      logger.warn(logger.msg('localcache.update_all_unavailable'));
      return { total, updated: 0, skipped: 0, renamed: 0, notFound: 0, errors: 0, details: [] };
    }

    const fastest = available[0];
    logger.info(logger.msg('localcache.update_speedtest_result', { name: fastest.name, ms: fastest.ms }));
    available.forEach(s => logger.info(logger.msg('localcache.update_source_detail', { name: s.name, detail: s.ok ? `${s.ms}ms ✓` : '不可用 ✗' })));

    // ======== 第二步：从最快源逐个更新 ========
    const details: Array<{ id: string; action: string; detail: string }> = [];
    let updated = 0, skipped = 0, renamed = 0, notFound = 0, errors = 0;
    logger.info(logger.msg('localcache.update_start', { name: fastest.name, total }));
    let processed = 0;

    for (const id of ids) {
      processed++;
      try {
        const filePath = this.getCacheFilePath(id);
        try {
          await access(filePath);
        } catch {
          skipped++;
          details.push({ id, action: 'skip', detail: '本地文件不存在' });
          logger.info(logger.msg('localcache.update_skip_no_file', { processed, total, id }));
          continue;
        }

        const localContent = await readFile(filePath, 'utf-8');
        const localHash = this.computeHash(localContent);

        // 只从最快源拉取
        const url = fastest.buildUrl(id);
        let remoteText: string | null = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (resp.ok) remoteText = await resp.text();
        } catch {}

        if (!remoteText) {
          notFound++;
          details.push({ id, action: 'not_found', detail: `${fastest.name} 未找到` });
      logger.info(logger.msg('localcache.update_not_found', { processed, total, id }));
          continue;
        }

        const remoteNcmId = this.extractNcmMusicId(remoteText);
        const remoteHash = this.computeHash(remoteText);

        if (remoteNcmId && remoteNcmId !== id && /^\d+$/.test(remoteNcmId)) {
          const newPath = this.getCacheFilePath(remoteNcmId);
          let targetExists = false;
          try { await access(newPath); targetExists = true; } catch {}

          if (targetExists) {
            details.push({ id, action: 'rename_skip', detail: `目标 ${remoteNcmId}.ttml 已存在` });
            if (remoteHash !== localHash) {
              await writeFile(filePath, remoteText, 'utf-8');
              this.setContentCache(id, remoteText);
              const metadata = this.parseTTMLMetadata(remoteText);
              if (this.meta.lyrics[id]) {
                Object.assign(this.meta.lyrics[id], {
                  contentHash: remoteHash,
                  ...(metadata.musicName.length > 0 ? { musicName: metadata.musicName } : {}),
                  ...(metadata.artists.length > 0 ? { artists: metadata.artists } : {}),
                  ...(metadata.album.length > 0 ? { album: metadata.album[0] } : {}),
                });
              }
              updated++;
            }
            renamed++;
            logger.info(logger.msg('localcache.update_rename_skip', { processed, total, id, target: remoteNcmId }));
          } else {
            await rename(filePath, newPath);
            this.contentCache.delete(id);
            this.setContentCache(remoteNcmId, remoteText);
            if (this.meta.lyrics[id]) {
              this.meta.lyrics[remoteNcmId] = {
                ...this.meta.lyrics[id],
                contentHash: remoteHash,
                cachedAt: Date.now(),
              };
              delete this.meta.lyrics[id];
            }
            const metadata = this.parseTTMLMetadata(remoteText);
            if (this.meta.lyrics[remoteNcmId]) {
              Object.assign(this.meta.lyrics[remoteNcmId], {
                ...(metadata.musicName.length > 0 ? { musicName: metadata.musicName } : {}),
                ...(metadata.artists.length > 0 ? { artists: metadata.artists } : {}),
                ...(metadata.album.length > 0 ? { album: metadata.album[0] } : {}),
              });
            }
            details.push({ id, action: 'renamed', detail: `${id}.ttml → ${remoteNcmId}.ttml` });
            renamed++;
            updated++;
            logger.info(logger.msg('localcache.update_renamed', { processed, total, id, target: remoteNcmId }));
          }
          continue;
        }

        if (remoteHash !== localHash) {
          await writeFile(filePath, remoteText, 'utf-8');
          this.setContentCache(id, remoteText);
          const metadata = this.parseTTMLMetadata(remoteText);
          if (this.meta.lyrics[id]) {
            Object.assign(this.meta.lyrics[id], {
              contentHash: remoteHash,
              ...(metadata.musicName.length > 0 ? { musicName: metadata.musicName } : {}),
              ...(metadata.artists.length > 0 ? { artists: metadata.artists } : {}),
              ...(metadata.album.length > 0 ? { album: metadata.album[0] } : {}),
            });
          }
          updated++;
          details.push({ id, action: 'updated', detail: '内容已更新' });
          logger.info(logger.msg('localcache.update_content_updated', { processed, total, id }));
        } else {
          skipped++;
          details.push({ id, action: 'skipped', detail: '内容相同' });
          logger.info(logger.msg('localcache.update_skipped', { processed, total, id }));
        }
      } catch (err) {
        errors++;
        details.push({ id, action: 'error', detail: String(err) });
        logger.error(logger.msg('localcache.update_error', { processed, total, id }), err);
      }
    }

    await this.saveMetaNow();
    logger.info(logger.msg('localcache.update_end', { name: fastest.name, updated, renamed, notFound, skipped, errors }));
    return { total, updated, skipped, renamed, notFound, errors, details };
  }

  // 安全地将条目写入 contentCache，遵守大小限制
  private setContentCache(id: string, content: string): void {
    if (this.contentCache.size >= MAX_MEMORY_CACHE_SIZE) {
      const oldestKey = this.contentCache.keys().next().value;
      if (oldestKey) this.contentCache.delete(oldestKey);
    }
    this.contentCache.set(id, { content, timestamp: Date.now() });
  }

  private extractNcmMusicId(content: string): string | null {
    const match = content.match(/<amll:meta\s+key="ncmMusicId"\s+value="([^"]+)"\s*\/>/);
    return match ? match[1] : null;
  }

  async rebuildFromIdsFile(): Promise<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    notFound: number;
    errors: number;
    details: Array<{ id: string; action: string; detail: string }>;
  }> {
    return new Promise((resolve) => {
      this.operationLock = this.operationLock.then(async () => {
        try {
          resolve(await this._doRebuildFromIdsFile());
        } catch (err) {
          resolve({
            total: 0, created: 0, updated: 0, skipped: 0, notFound: 0, errors: 1,
            details: [{ id: '', action: 'error', detail: String(err) }]
          });
        }
      });
    });
  }

  private async _doRebuildFromIdsFile(): Promise<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    notFound: number;
    errors: number;
    details: Array<{ id: string; action: string; detail: string }>;
  }> {
    const { buildRawUrl, buildMirrorUrls } = await import('./utils');

    let ids: string[];
    try {
      const idsContent = await readFile(IDS_FILE, 'utf-8');
      ids = JSON.parse(idsContent);
      if (!Array.isArray(ids)) {
        throw new Error('ncm-ids.json 格式无效');
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        logger.warn('ncm-ids.json 文件不存在，使用当前缓存的 ID 列表');
        ids = Object.keys(this.meta.lyrics);
      } else {
        throw err;
      }
    }

    const total = ids.length;
    const details: Array<{ id: string; action: string; detail: string }> = [];
    let created = 0, updated = 0, skipped = 0, notFound = 0, errors = 0;

    logger.info(`开始从 ncm-ids.json 重构 TTML 文件，共 ${total} 个 ID`);

    const candidates = [
      { name: '主仓库', buildUrl: (id: string) => buildRawUrl(id, 'ttml') },
      { name: '镜像1', buildUrl: (id: string) => buildMirrorUrls(id, 'ttml')[0] },
      { name: '镜像2', buildUrl: (id: string) => buildMirrorUrls(id, 'ttml')[1] },
    ];

    const probeId = ids[0];
    if (!probeId) {
      return { total: 0, created: 0, updated: 0, skipped: 0, notFound: 0, errors: 0, details: [] };
    }

    logger.info(`测速选择最快镜像源，探测 ID: ${probeId}`);
    const probeResults = await Promise.allSettled(
      candidates.map(async (c) => {
        const url = c.buildUrl(probeId);
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(url, { signal: controller.signal, method: 'HEAD' });
          clearTimeout(timeoutId);
          return { ...c, url, ms: Date.now() - start, ok: resp.ok };
        } catch {
          return { ...c, url, ms: 99999, ok: false };
        }
      })
    );

    const available = probeResults
      .filter(r => r.status === 'fulfilled' && r.value.ok)
      .map(r => (r as PromiseFulfilledResult<{ name: string; buildUrl: (id: string) => string; url: string; ms: number; ok: boolean }>).value)
      .sort((a, b) => a.ms - b.ms);

    if (available.length === 0) {
      logger.warn('所有镜像源均不可用');
      return { total, created: 0, updated: 0, skipped: 0, notFound: 0, errors: 0, details: [] };
    }

    const fastest = available[0];
    logger.info(`选择最快源: ${fastest.name} (${fastest.ms}ms)`);

    let processed = 0;
    for (const id of ids) {
      processed++;
      try {
        const filePath = this.getCacheFilePath(id);
        let localExists = false;
        let localContent: string | null = null;
        let localHash: string | null = null;

        try {
          localContent = await readFile(filePath, 'utf-8');
          localHash = this.computeHash(localContent);
          localExists = true;
        } catch {
          localExists = false;
        }

        const url = fastest.buildUrl(id);
        let remoteText: string | null = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (resp.ok) remoteText = await resp.text();
        } catch {}

        if (!remoteText) {
          notFound++;
          details.push({ id, action: 'not_found', detail: `${fastest.name} 未找到` });
          logger.info(`[${processed}/${total}] ${id}: 远程未找到`);
          continue;
        }

        const remoteHash = this.computeHash(remoteText);
        const remoteNcmId = this.extractNcmMusicId(remoteText);
        const metadata = this.parseTTMLMetadata(remoteText);

        if (!localExists) {
          await writeFile(filePath, remoteText, 'utf-8');
          this.setContentCache(id, remoteText);
          this.meta.lyrics[id] = {
            playCount: 0,
            lastPlayedAt: Date.now(),
            cachedAt: Date.now(),
            contentHash: remoteHash,
            source: 'main',
            ...(metadata.musicName.length > 0 ? { musicName: metadata.musicName } : {}),
            ...(metadata.artists.length > 0 ? { artists: metadata.artists } : {}),
            ...(metadata.album.length > 0 ? { album: metadata.album[0] } : {}),
          };
          created++;
          const songInfo = metadata.musicName.length > 0 ? metadata.musicName[0] : id;
          details.push({ id, action: 'created', detail: `新建: ${songInfo}` });
          logger.info(`[${processed}/${total}] ${id}: 新建文件 (${songInfo})`);
        } else if (remoteHash !== localHash) {
          await writeFile(filePath, remoteText, 'utf-8');
          this.setContentCache(id, remoteText);
          if (this.meta.lyrics[id]) {
            Object.assign(this.meta.lyrics[id], {
              contentHash: remoteHash,
              cachedAt: Date.now(),
              ...(metadata.musicName.length > 0 ? { musicName: metadata.musicName } : {}),
              ...(metadata.artists.length > 0 ? { artists: metadata.artists } : {}),
              ...(metadata.album.length > 0 ? { album: metadata.album[0] } : {}),
            });
          } else {
            this.meta.lyrics[id] = {
              playCount: 0,
              lastPlayedAt: Date.now(),
              cachedAt: Date.now(),
              contentHash: remoteHash,
              source: 'main',
              ...(metadata.musicName.length > 0 ? { musicName: metadata.musicName } : {}),
              ...(metadata.artists.length > 0 ? { artists: metadata.artists } : {}),
              ...(metadata.album.length > 0 ? { album: metadata.album[0] } : {}),
            };
          }
          updated++;
          details.push({ id, action: 'updated', detail: '内容已更新' });
          logger.info(`[${processed}/${total}] ${id}: 内容已更新`);
        } else {
          skipped++;
          details.push({ id, action: 'skipped', detail: '内容相同' });
          logger.info(`[${processed}/${total}] ${id}: 内容相同，跳过`);
        }
      } catch (err) {
        errors++;
        details.push({ id, action: 'error', detail: String(err) });
        logger.error(`[${processed}/${total}] ${id}: 处理失败`, err);
      }
    }

    await this.saveMetaNow();
    logger.info(`重构完成: 总数=${total}, 新建=${created}, 更新=${updated}, 跳过=${skipped}, 未找到=${notFound}, 错误=${errors}`);
    return { total, created, updated, skipped, notFound, errors, details };
  }

  private startUpdateCheck(): void {
    this.updateCheckTimer = setInterval(async () => {
      logger.info(logger.msg('localcache.periodic_maintenance'));
      if (this.inactiveCleanupEnabled) {
        await this.cleanupInactive();
      } else {
        logger.info(logger.msg('localcache.inactive_cleanup_skipped'));
      }

      try {
        const { buildRawUrl, getLogger } = await import('./utils');
        const updateLogger = getLogger('LocalLyricCache.UpdateCheck');
        const updated = await this.checkForUpdates(async (id: string) => {
          try {
            const mainUrl = buildRawUrl(id, 'ttml');
            const mainResult = await fetch(mainUrl).then(r => r.ok ? r.text() : null).catch(() => null);
            if (mainResult) return { content: mainResult, source: 'main' as const };
            return null;
          } catch {
            return null;
          }
        });
        if (updated > 0) {
          updateLogger.info(logger.msg('localcache.periodic_updated', { count: updated }));
        }
      } catch (err) {
        logger.error(logger.msg('localcache.periodic_failed'), err);
      }
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
