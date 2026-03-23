import { Hono } from 'hono';
import type { Context } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { LyricProvider, type SearchResult, getLyricMetadata, LyricMetadataResult } from './lyricService';
import { getLogger } from './utils';
import { prettyJSON } from 'hono/pretty-json';
import { setupCacheCleanup, lyricsCache } from './cache';
import { localLyricCache } from './localLyricCache';
import { createHash } from 'crypto';

const apiLogger = getLogger('API');

// 显式声明Edge Runtime
export const runtime = 'edge';

// 配置最接近的边缘区域
export const preferredRegion = 'auto';

// 设置最大并发
export const config = {
  runtime: 'edge'
}

// --- 模块级单例 & 常量（避免每次请求重复创建） ---

// 一次性读取环境变量，缓存为常量
const EXTERNAL_API_BASE_URL = process?.env?.EXTERNAL_NCM_API_URL;
if (!EXTERNAL_API_BASE_URL) {
  apiLogger.warn('EXTERNAL_NCM_API_URL is not set in environment. External API fallback will be unavailable.');
}

// 单例 LyricProvider：复用 repoFetcher 和 externalFetcher
let _lyricProviderSingleton: LyricProvider | null = null;
function getLyricProvider(): LyricProvider {
  if (!_lyricProviderSingleton) {
    _lyricProviderSingleton = new LyricProvider(EXTERNAL_API_BASE_URL);
    apiLogger.info('LyricProvider singleton initialized.');
  }
  return _lyricProviderSingleton;
}

// 预初始化：启动缓存清理 + 本地缓存（仅 Node.js 环境）
setupCacheCleanup();
localLyricCache.init().catch((err) => {
  // Edge Runtime 下 fs 不可用，静默忽略
  apiLogger.debug(`Local cache init skipped (expected on Edge Runtime): ${err}`);
});

// --- App Setup ---
const app = new Hono().basePath('/api');

// --- CORS Middleware ---
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
}));

app.use('*', prettyJSON());


// --- Logger Shim (只创建一次) ---
const consoleLoggerShim = {
  info: (...args: any[]) => apiLogger.info(...args),
  warn: (...args: any[]) => apiLogger.warn(...args),
  error: (...args: any[]) => apiLogger.error(...args),
  debug: (...args: any[]) => apiLogger.debug(...args),
};

// --- Routes ---

app.get('/', (c) => {
  return c.json({ message: 'Lyric Atlas API is running.' });
});

// Search route using LyricProvider (单例)
app.get('/search', async (c: Context) => {
  const id = c.req.query('id');
  const fallbackQuery = c.req.query('fallback');
  const fixedVersionRaw = c.req.query('fixedVersion');
  const fast = c.req.query('fast') !== undefined;
  const signal = c.req.raw.signal;

  if (!id) {
    c.status(400);
    return c.json({ found: false, error: '缺少 id 参数' });
  }

  if (!EXTERNAL_API_BASE_URL && !fast) {
    c.status(500);
    return c.json({ found: false, id, error: '服务器配置错误' });
  }

  apiLogger.info(apiLogger.msg('api.search_request', { id, format: fixedVersionRaw || 'auto', fallback: fallbackQuery || 'none', fast: fast ? '是' : '否' }));

  try {
    const lyricProvider = getLyricProvider();

    const result: SearchResult = await lyricProvider.search(id, {
      fixedVersion: fixedVersionRaw,
      fallback: fallbackQuery,
      fast,
      signal,
    });

    if (result.found) {
      apiLogger.info(apiLogger.msg('api.found', { id, format: result.format, source: result.source }));
      return c.json(result);
    } else {
      const statusCode = result.statusCode || 404;
      c.status(statusCode as any);
      apiLogger.info(apiLogger.msg('api.not_found', { id, status: statusCode, error: result.error || '未知错误' }));
      return c.json(result);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    if (errorMessage === 'Request aborted') {
      apiLogger.info(apiLogger.msg('api.aborted', { id }));
      return new Response(null, { status: 499 });
    }
    apiLogger.error(`搜索时发生意外错误 ID: ${id} - ${errorMessage}`, error);
    c.status(500);
    return c.json({ found: false, id, error: `处理歌词请求失败: ${errorMessage}` });
  }
});

// Metadata endpoint
app.get('/lyrics/meta', async (c) => {
  const id = c.req.query('id');
  const fast = c.req.query('fast') !== undefined;

  if (!id) {
    c.status(400);
    return c.json({ found: false, error: 'Missing id parameter' });
  }

  // 先检查内存缓存中的 TTML 存在性，快速响应（避免远程 HEAD 请求）
  const ttmlCacheKey = `repo:${id}:ttml`;
  const cachedTtml = lyricsCache.get(ttmlCacheKey);
  if (cachedTtml && cachedTtml.status === 'found') {
    c.header('Cache-Control', 'public, max-age=1800');
    return c.json({
      found: true,
      id,
      availableFormats: ['ttml', 'yrc', 'lrc', 'eslrc'],
    });
  }

  apiLogger.info(`Received metadata request for ID: ${id}, Fast: ${fast}`);

  try {
    const result: LyricMetadataResult = await getLyricMetadata(id, {
      logger: consoleLoggerShim,
      fast,
    });

    if (result.found) {
      c.header('Cache-Control', 'public, max-age=1800');
      apiLogger.info(`Found metadata for ID: ${id}, Formats: ${result.availableFormats.join(', ')}`);
      return c.json(result);
    } else {
      const statusCode = result.statusCode || 404;
      c.status(statusCode as any);
      apiLogger.warn(`Metadata not found or error for ID: ${id}. Status: ${statusCode}, Error: ${result.error}`);
      return c.json(result);
    }

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    apiLogger.error({ msg: `Unexpected error during API metadata handler for ID: ${id}`, error: err.message, stack: err.stack });
    c.status(500);
    return c.json({ found: false, id, error: `Failed to process lyric metadata request: ${err.message}` });
  }
});

// TTML direct access endpoint (with ETag 304 support)
app.get('/ncm-lyrics/:id', async (c) => {
  const id = c.req.param('id');

  if (!id.endsWith('.ttml')) {
    c.status(404);
    return c.text('Not found');
  }

  const songId = id.replace('.ttml', '');

  if (!/^\d+$/.test(songId)) {
    c.status(400);
    return c.text('Invalid song ID');
  }

  // 先用归一化内存缓存键快速检查（纯同步操作，零 I/O）
  const memCacheKey = `search:${songId}:ttml:normalized`;
  const memCached = lyricsCache.get(memCacheKey);
  if (memCached && memCached.found && memCached.format === 'ttml' && memCached.content) {
    const content = memCached.content;
    const contentHash = createHash('md5').update(content).digest('hex');

    // ETag 条件请求：内容未变则返回 304，节省带宽
    const ifNoneMatch = c.req.header('If-None-Match');
    if (ifNoneMatch === `"${contentHash}"`) {
      apiLogger.info(`TTML 304 Not Modified for ID: ${songId}`);
      return new Response(null, { status: 304 });
    }

    c.header('Content-Type', 'application/xml; charset=utf-8');
    c.header('ETag', `"${contentHash}"`);
    c.header('Cache-Control', 'public, max-age=3600, must-revalidate');
    return c.text(content);
  }

  apiLogger.info(`TTML direct access request for ID: ${songId}`);

  try {
    const lyricProvider = getLyricProvider();
    const result = await lyricProvider.search(songId, { fixedVersion: 'ttml' });

    if (result.found && result.format === 'ttml') {
      const content = result.content;
      const contentHash = createHash('md5').update(content).digest('hex');

      // ETag 条件请求
      const ifNoneMatch = c.req.header('If-None-Match');
      if (ifNoneMatch === `"${contentHash}"`) {
        apiLogger.info(`TTML 304 Not Modified for ID: ${songId}`);
        return new Response(null, { status: 304 });
      }

      c.header('Content-Type', 'application/xml; charset=utf-8');
      c.header('ETag', `"${contentHash}"`);
      c.header('Cache-Control', 'public, max-age=3600, must-revalidate');
      return c.text(content);
    } else {
      c.status(404);
      return c.text('TTML lyrics not found');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    apiLogger.error(`Error fetching TTML for ID: ${songId} - ${errorMessage}`);
    c.status(500);
    return c.text('Internal server error');
  }
});

// --- Export for Vercel ---
export default handle(app)
