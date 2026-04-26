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
  apiLogger.warn(apiLogger.msg('api.external_url_not_set'));
}

let _lyricProviderSingleton: LyricProvider | null = null;
function getLyricProvider(): LyricProvider {
  if (!_lyricProviderSingleton) {
    _lyricProviderSingleton = new LyricProvider(EXTERNAL_API_BASE_URL);
    apiLogger.info(apiLogger.msg('api.provider_init'));
  }
  return _lyricProviderSingleton;
}

// 预初始化
setupCacheCleanup();
localLyricCache.init().catch((err) => {
  apiLogger.error(apiLogger.msg('localcache.init_failed'), err);
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
  const signal = c.req.raw.signal;

  if (!id) {
    c.status(400);
    return c.json({ found: false, error: 'Missing id parameter' });
  }

  if (!EXTERNAL_API_BASE_URL && !fast) {
    c.status(500);
    return c.json({ found: false, id, error: 'Server configuration error.' });
  }

  apiLogger.info(apiLogger.msg('api.search_request', { id, format: fixedVersionRaw || 'auto', fallback: fallbackQuery, fast: fast ? '是' : '否' }));

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
      apiLogger.info(apiLogger.msg('api.not_found', { id, status: statusCode, error: result.error }));
      return c.json(result);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    if (errorMessage === 'Request aborted') {
      apiLogger.info(apiLogger.msg('api.aborted', { id }));
      return new Response(null, { status: 499 });
    }
    apiLogger.error(apiLogger.msg('api.search_error', { id, message: errorMessage }), error);
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

  apiLogger.info(apiLogger.msg('api.metadata_request', { id, fast }));

  try {
    const result: LyricMetadataResult = await getLyricMetadata(id, {
      logger: consoleLoggerShim,
      fast,
    });

    if (result.found) {
      c.header('Cache-Control', 'public, max-age=1800');
      apiLogger.info(apiLogger.msg('api.metadata_found', { id, formats: result.availableFormats.join(', ') }));
      return c.json(result);
    } else {
      const statusCode = result.statusCode || 404;
      c.status(statusCode as any);
      apiLogger.warn(apiLogger.msg('api.metadata_not_found', { id, status: statusCode, error: result.error }));
      return c.json(result);
    }

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    apiLogger.error(apiLogger.msg('api.metadata_handler_error', { id, message: err.message }), err.stack);
    c.status(500);
    return c.json({ found: false, id, error: `处理歌词元数据请求失败: ${err.message}` });
  }
});

app.get('/ncm-lyrics/:id', async (c) => {
  const id = c.req.param('id');
  const signal = c.req.raw.signal;

  if (!id.endsWith('.ttml')) {
    c.status(404);
    return c.text('Not found');
  }

  const songId = id.replace('.ttml', '');

  if (!/^\d+$/.test(songId)) {
    c.status(400);
    return c.text('Invalid song ID');
  }

  apiLogger.info(apiLogger.msg('api.ttml_request', { id: songId }));

  localLyricCache.recordTtmlRequest(songId);
  await localLyricCache.recordPlay(songId);

  try {
    const lyricProvider = getLyricProvider();
    const result = await lyricProvider.search(songId, { fixedVersion: 'ttml', signal });

    if (result.found && result.format === 'ttml') {
      const content = result.content;

      if (localLyricCache.shouldCacheByRequests(songId)) {
        const isCached = await localLyricCache.isCached(songId);
        if (!isCached) {
          await localLyricCache.cacheLyric(songId, content, 'main');
        }
      }

      const contentHash = crypto.createHash('md5').update(content).digest('hex');

      const ifNoneMatch = c.req.header('If-None-Match');
      if (ifNoneMatch === `"${contentHash}"`) {
        apiLogger.info(apiLogger.msg('api.ttml_304', { id: songId }));
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
    if (errorMessage === 'Request aborted') {
      return new Response(null, { status: 499 });
    }
    apiLogger.error(apiLogger.msg('api.ttml_fetch_error', { id: songId, message: errorMessage }));
    c.status(500);
    return c.text('Internal server error');
  }
});

export default app;
