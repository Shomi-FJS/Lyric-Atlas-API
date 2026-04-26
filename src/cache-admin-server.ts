import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { localLyricCache } from '../api/localLyricCache.js';
import { getLogger } from '../api/utils.js';

const logger = getLogger('CacheAdmin');

const app = new Hono();
const PORT = 8300;
const LYRICS_DEV_DIR = path.join(process.cwd(), 'lyrics-dev');
const SETTINGS_FILE = path.join(process.cwd(), 'cache-admin-settings.json');

let devModeEnabled = false;
let inactiveCleanupEnabled = true;

function parseTTMLMetadata(content: string): Record<string, string[]> {
  const metadata: Record<string, string[]> = {};
  
  const metaRegex = /<amll:meta\s+key="([^"]+)"\s+value="([^"]+)"\s*\/>/g;
  let match;
  
  while ((match = metaRegex.exec(content)) !== null) {
    const key = match[1];
    const value = match[2];
    
    if (!metadata[key]) {
      metadata[key] = [];
    }
    metadata[key].push(value);
  }
  
  return metadata;
}

function extractNcmId(content: string): string | null {
  const metadata = parseTTMLMetadata(content);
  
  if (metadata.ncmMusicId && metadata.ncmMusicId.length > 0) {
    return metadata.ncmMusicId[0];
  }
  
  return null;
}

async function loadSettings(): Promise<void> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    devModeEnabled = settings.devModeEnabled || false;
    inactiveCleanupEnabled = settings.inactiveCleanupEnabled ?? true;
    localLyricCache.setInactiveCleanupEnabled(inactiveCleanupEnabled);
    logger.info(logger.msg('admin.settings_loaded', { status: devModeEnabled }));
  } catch {
    devModeEnabled = false;
    inactiveCleanupEnabled = true;
    localLyricCache.setInactiveCleanupEnabled(inactiveCleanupEnabled);
    logger.info(logger.msg('admin.settings_not_found'));
  }
}

async function saveSettings(): Promise<void> {
  await fs.writeFile(
    SETTINGS_FILE,
    JSON.stringify({ devModeEnabled, inactiveCleanupEnabled }, null, 2)
  );
}

async function ensureLyricsDevDir(): Promise<void> {
  try {
    await fs.mkdir(LYRICS_DEV_DIR, { recursive: true });
  } catch (err) {
    logger.error(logger.msg('admin.create_dev_dir_failed'), err);
  }
}

app.use('*', cors());

app.use('/*', serveStatic({ root: './public' }));

app.get('/api/status', async (c) => {
  return c.json({
    success: true,
    devModeEnabled,
    inactiveCleanupEnabled,
    inactiveDaysThreshold: localLyricCache.getInactiveDaysThreshold(),
    cacheDir: localLyricCache.getCacheDir(),
    devDir: LYRICS_DEV_DIR
  });
});

app.get('/api/cache/list', async (c) => {
  try {
    const meta = localLyricCache.getMeta();
    const cacheDir = localLyricCache.getCacheDir();
    const files = await fs.readdir(cacheDir);
    
    const cacheFiles: Array<{
      id: string;
      filename: string;
      playCount: number;
      lastPlayedAt: number;
      cachedAt: number;
      source: string;
      size: number;
      musicName?: string[];
      artists?: string[];
      album?: string;
    }> = [];
    
    for (const file of files) {
      if (file.endsWith('.ttml')) {
        const id = file.replace('.ttml', '');
        const filePath = path.join(cacheDir, file);
        const stats = await fs.stat(filePath);
        const metaInfo = meta.lyrics[id] || {};
        
        cacheFiles.push({
          id,
          filename: file,
          playCount: metaInfo.playCount || 0,
          lastPlayedAt: metaInfo.lastPlayedAt || 0,
          cachedAt: metaInfo.cachedAt || 0,
          source: metaInfo.source || 'unknown',
          size: stats.size,
          musicName: metaInfo.musicName,
          artists: metaInfo.artists,
          album: metaInfo.album
        });
      }
    }
    
    cacheFiles.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
    
    return c.json({ success: true, files: cacheFiles, total: cacheFiles.length });
  } catch (err) {
    logger.error(logger.msg('admin.get_cache_list_failed'), err);
    return c.json({ success: false, error: '获取缓存列表失败' }, 500);
  }
});

app.delete('/api/cache/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'ID 格式无效' }, 400);
  }
  
  try {
    const deleted = await localLyricCache.deleteCache(id);
    if (deleted) {
      // 清除搜索结果缓存，确保下次查询不会返回已删除歌词的旧缓存
      const { lyricsCache } = await import('../api/cache');
      lyricsCache.clear();
      logger.info(logger.msg('admin.cache_deleted', { id }));
      return c.json({ success: true, message: `缓存 ${id} 已删除` });
    } else {
      return c.json({ success: false, error: '缓存不存在' }, 404);
    }
  } catch (err) {
    logger.error(logger.msg('admin.delete_cache_failed'), err);
    return c.json({ success: false, error: '删除缓存失败' }, 500);
  }
});

app.get('/api/cache/file/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'ID 格式无效' }, 400);
  }
  
  try {
    const cacheDir = localLyricCache.getCacheDir();
    const filePath = path.join(cacheDir, `${id}.ttml`);
    const content = await fs.readFile(filePath, 'utf-8');
    return c.text(content, 200, {
      'Content-Type': 'application/xml; charset=utf-8'
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return c.json({ success: false, error: '文件不存在' }, 404);
    }
    logger.error(logger.msg('admin.read_dev_failed'), err);
    return c.json({ success: false, error: '读取缓存文件失败' }, 500);
  }
});

app.post('/api/cache/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    let id = formData.get('id') as string | null;
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: '缺少文件' }, 400);
    }
    
    const content = await file.text();
    
    if (!content.includes('<tt') || !content.includes('xmlns')) {
      return c.json({ success: false, error: '无效的 TTML 格式' }, 400);
    }
    
    const metadata = parseTTMLMetadata(content);
    
    if (!id) {
      const extractedId = extractNcmId(content);
      if (!extractedId) {
        return c.json({ success: false, error: '无法从 TTML 文件中提取网易云 ID，请手动提供 ID' }, 400);
      }
      id = extractedId;
      logger.info(logger.msg('admin.auto_extract_id', { id }));
    }
    
    if (!/^\d+$/.test(id)) {
      return c.json({ success: false, error: 'ID 必须为数字' }, 400);
    }
    
    await localLyricCache.cacheLyric(id, content, 'upload');
    // 清除搜索结果缓存，确保下次查询不会返回旧版本的缓存歌词
    const { lyricsCache } = await import('../api/cache');
    lyricsCache.clear();
    logger.info(logger.msg('admin.cache_uploaded', { id }));
    
    return c.json({ 
      success: true, 
      message: `缓存 ${id} 上传成功`, 
      id,
      musicName: metadata.musicName,
      artists: metadata.artists
    });
  } catch (err) {
    logger.error(logger.msg('admin.upload_cache_failed'), err);
    return c.json({ success: false, error: '上传缓存失败' }, 500);
  }
});

app.post('/api/cache/rebuild-meta', async (c) => {
  try {
    const result = await localLyricCache.rebuildMeta();

    // 清空内存中的搜索结果缓存，确保后续请求使用最新的元数据和歌词内容
    const { lyricsCache, metadataCache } = await import('../api/cache');
    lyricsCache.clear();
    metadataCache.clear();

    logger.info(logger.msg('admin.rebuild_complete', { total: result.total, added: result.added, updated: result.updated, removed: result.removed }));
    return c.json({ success: true, ...result });
  } catch (err) {
    logger.error(logger.msg('admin.rebuild_meta_failed'), err);
    return c.json({ success: false, error: '重建元数据失败' }, 500);
  }
});

app.post('/api/cache/update-remote', async (c) => {
  try {
    const result = await localLyricCache.updateCacheFromRemote();

    // 清空内存缓存
    const { lyricsCache, metadataCache } = await import('../api/cache');
    lyricsCache.clear();
    metadataCache.clear();

    logger.info(logger.msg('admin.update_complete', { updated: result.updated, renamed: result.renamed, notFound: result.notFound }));
    return c.json({ success: true, ...result });
  } catch (err) {
    logger.error(logger.msg('admin.update_cache_failed'), err);
    return c.json({ success: false, error: '缓存更新失败' }, 500);
  }
});

app.post('/api/cache/rebuild-from-ids', async (c) => {
  try {
    const result = await localLyricCache.rebuildFromIdsFile();

    const { lyricsCache, metadataCache } = await import('../api/cache');
    lyricsCache.clear();
    metadataCache.clear();

    logger.info(`从 ncm-ids.json 重构完成: ${result.total} 个文件`);
    return c.json({ success: true, ...result });
  } catch (err) {
    logger.error('从 ncm-ids.json 重构失败', err);
    return c.json({ success: false, error: '重构失败' }, 500);
  }
});

app.post('/api/cache/clear-memory', async (c) => {
  try {
    const { lyricsCache, metadataCache } = await import('../api/cache');
    lyricsCache.clear();
    metadataCache.clear();
    logger.info(logger.msg('admin.clear_memory_done'));
    return c.json({ success: true });
  } catch (err) {
    logger.error(logger.msg('admin.clear_memory_failed'), err);
    return c.json({ success: false, error: '清空内存缓存失败' }, 500);
  }
});

app.post('/api/cache/reset-request-counts', async (c) => {
  try {
    await localLyricCache.resetRequestCounts();
    logger.info(logger.msg('admin.reset_request_counts_done'));
    return c.json({ success: true });
  } catch (err) {
    logger.error(logger.msg('admin.reset_request_counts_failed'), err);
    return c.json({ success: false, error: '重置请求计数失败' }, 500);
  }
});

app.post('/api/dev-mode', async (c) => {
  try {
    const body = await c.req.json();
    devModeEnabled = !!body.enabled;
    await saveSettings();
    logger.info(logger.msg('admin.dev_mode_toggled', { status: devModeEnabled ? '已启用' : '已禁用' }));
    return c.json({ success: true, devModeEnabled });
  } catch (err) {
    logger.error(logger.msg('admin.toggle_dev_failed'), err);
    return c.json({ success: false, error: '更新开发模式失败' }, 500);
  }
});

app.post('/api/inactive-cleanup', async (c) => {
  try {
    const body = await c.req.json();
    inactiveCleanupEnabled = !!body.enabled;
    localLyricCache.setInactiveCleanupEnabled(inactiveCleanupEnabled);
    await saveSettings();
    logger.info(logger.msg('admin.inactive_cleanup_toggled', {
      days: localLyricCache.getInactiveDaysThreshold(),
      status: inactiveCleanupEnabled ? '已启用' : '已禁用'
    }));
    return c.json({
      success: true,
      inactiveCleanupEnabled,
      inactiveDaysThreshold: localLyricCache.getInactiveDaysThreshold()
    });
  } catch (err) {
    logger.error(logger.msg('admin.toggle_inactive_cleanup_failed'), err);
    return c.json({ success: false, error: '切换未活跃清理开关失败' }, 500);
  }
});

app.get('/api/dev/list', async (c) => {
  try {
    await ensureLyricsDevDir();
    const files = await fs.readdir(LYRICS_DEV_DIR);
    
    const devFiles: Array<{
      id: string;
      filename: string;
      size: number;
      modifiedAt: number;
      musicName?: string[];
      artists?: string[];
      album?: string;
    }> = [];
    
    for (const file of files) {
      if (file.endsWith('.ttml')) {
        const id = file.replace('.ttml', '');
        const filePath = path.join(LYRICS_DEV_DIR, file);
        const stats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const metadata = parseTTMLMetadata(content);
        
        devFiles.push({
          id,
          filename: file,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
          musicName: metadata.musicName.length > 0 ? metadata.musicName : undefined,
          artists: metadata.artists.length > 0 ? metadata.artists : undefined,
          album: metadata.album.length > 0 ? metadata.album[0] : undefined
        });
      }
    }
    
    devFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);
    
    return c.json({ success: true, files: devFiles, total: devFiles.length });
  } catch (err) {
    logger.error(logger.msg('admin.get_dev_list_failed'), err);
    return c.json({ success: false, error: '获取开发文件列表失败' }, 500);
  }
});

app.post('/api/dev/upload', async (c) => {
  try {
    await ensureLyricsDevDir();
    const formData = await c.req.formData();
    const file = formData.get('file');
    let id = formData.get('id') as string | null;
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: '缺少文件' }, 400);
    }
    
    const content = await file.text();
    
    if (!content.includes('<tt') || !content.includes('xmlns')) {
      return c.json({ success: false, error: '无效的 TTML 格式' }, 400);
    }
    
    const metadata = parseTTMLMetadata(content);
    
    if (!id) {
      const extractedId = extractNcmId(content);
      if (!extractedId) {
        return c.json({ success: false, error: '无法从 TTML 文件中提取网易云 ID，请手动提供 ID' }, 400);
      }
      id = extractedId;
      logger.info(logger.msg('admin.auto_extract_id', { id }));
    }
    
    if (!/^\d+$/.test(id)) {
      return c.json({ success: false, error: 'ID 必须为数字' }, 400);
    }
    
    const filePath = path.join(LYRICS_DEV_DIR, `${id}.ttml`);
    await fs.writeFile(filePath, content, 'utf-8');
    logger.info(logger.msg('admin.dev_uploaded', { id }));
    
    return c.json({ 
      success: true, 
      message: `开发文件 ${id} 上传成功`, 
      id,
      musicName: metadata.musicName,
      artists: metadata.artists
    });
  } catch (err) {
    logger.error(logger.msg('admin.upload_dev_failed'), err);
    return c.json({ success: false, error: '上传开发文件失败' }, 500);
  }
});

app.delete('/api/dev/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'ID 格式无效' }, 400);
  }
  
  try {
    const filePath = path.join(LYRICS_DEV_DIR, `${id}.ttml`);
    await fs.unlink(filePath);
    logger.info(logger.msg('admin.dev_deleted', { id }));
    return c.json({ success: true, message: `开发文件 ${id} 已删除` });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return c.json({ success: false, error: '文件不存在' }, 404);
    }
    logger.error(logger.msg('admin.delete_dev_failed'), err);
    return c.json({ success: false, error: '删除开发文件失败' }, 500);
  }
});

app.get('/api/dev/file/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'ID 格式无效' }, 400);
  }
  
  try {
    const filePath = path.join(LYRICS_DEV_DIR, `${id}.ttml`);
    const content = await fs.readFile(filePath, 'utf-8');
    return c.text(content, 200, {
      'Content-Type': 'application/xml; charset=utf-8'
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return c.json({ success: false, error: '文件不存在' }, 404);
    }
    logger.error(logger.msg('admin.read_dev_failed'), err);
    return c.json({ success: false, error: '读取开发文件失败' }, 500);
  }
});

export async function startCacheAdminServer(): Promise<void> {
  await loadSettings();
  await ensureLyricsDevDir();
  
  logger.info(logger.msg('admin.server_running', { url: `http://localhost:${PORT}` }));
  
  serve({
    fetch: app.fetch,
    port: PORT
  });
}
