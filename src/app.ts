import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { LyricProvider, type SearchResult, getLyricMetadata, LyricMetadataResult } from '../api/lyricService.js';
import { getLogger } from '../api/utils.js';
import { setupCacheCleanup, lyricsCache } from '../api/cache.js';
import { localLyricCache } from '../api/localLyricCache.js';
import crypto from 'crypto';

const apiLogger = getLogger('API');

// --- 模块级单例 & 常量 ---

const EXTERNAL_API_BASE_URL = process?.env?.EXTERNAL_NCM_API_URL;
if (!EXTERNAL_API_BASE_URL) {
  apiLogger.warn('EXTERNAL_NCM_API_URL is not set. External API fallback will be unavailable.');
}

let _lyricProviderSingleton: LyricProvider | null = null;
function getLyricProvider(): LyricProvider {
  if (!_lyricProviderSingleton) {
    _lyricProviderSingleton = new LyricProvider(EXTERNAL_API_BASE_URL);
    apiLogger.info('LyricProvider singleton initialized.');
  }
  return _lyricProviderSingleton;
}

// 预初始化
setupCacheCleanup();
localLyricCache.init().catch((err) => {
  apiLogger.error('Failed to initialize local lyric cache:', err);
});

const app = new Hono().basePath('/api');

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
}));

app.use('*', prettyJSON());

const consoleLoggerShim = {
  info: (...args: any[]) => apiLogger.info(...args),
  warn: (...args: any[]) => apiLogger.warn(...args),
  error: (...args: any[]) => apiLogger.error(...args),
  debug: (...args: any[]) => apiLogger.debug(...args),
};

app.get('/', (c) => {
  return c.json({ message: 'Lyric Atlas API is running.' });
});

app.get('/search', async (c: Context) => {
  const id = c.req.query('id');
  const fallbackQuery = c.req.query('fallback');
  const fixedVersionRaw = c.req.query('fixedVersion');
  const fast = c.req.query('fast') !== undefined;

  if (!id) {
    c.status(400);
    return c.json({ found: false, error: 'Missing id parameter' });
  }

  if (!EXTERNAL_API_BASE_URL && !fast) {
    c.status(500);
    return c.json({ found: false, id, error: 'Server configuration error.' });
  }

  apiLogger.info(`Search request - ID: ${id}, Fixed: ${fixedVersionRaw}, Fallback: ${fallbackQuery}, Fast: ${fast}`);

  try {
    const lyricProvider = getLyricProvider();

    const result: SearchResult = await lyricProvider.search(id, {
      fixedVersion: fixedVersionRaw,
      fallback: fallbackQuery,
      fast,
    });

    if (result.found) {
      apiLogger.info(`Lyrics found for ID: ${id} - Format: ${result.format}, Source: ${result.source}`);
      return c.json(result);
    } else {
      const statusCode = result.statusCode || 404;
      c.status(statusCode as any);
      apiLogger.info(`Lyrics not found for ID: ${id} - Status: ${statusCode}, Error: ${result.error}`);
      return c.json(result);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    apiLogger.error(`Unexpected error during search for ID: ${id} - ${errorMessage}`, error);
    c.status(500);
    return c.json({ found: false, id, error: `Failed to process lyric request: ${errorMessage}` });
  }
});

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
    const contentHash = crypto.createHash('md5').update(content).digest('hex');

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
      const contentHash = crypto.createHash('md5').update(content).digest('hex');

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

export default app;
