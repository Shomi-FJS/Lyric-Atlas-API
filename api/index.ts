import { Hono } from 'hono';
import type { Context } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { LyricProvider, type SearchResult, getLyricMetadata, LyricMetadataResult } from './lyricService';
import { getLogger } from './utils';
import { prettyJSON } from 'hono/pretty-json';
import { setupCacheCleanup } from './cache';

// Create a logger instance for the API entrypoint
const apiLogger = getLogger('API');

// 显式声明Edge Runtime
export const runtime = 'edge';

// 配置最接近的边缘区域
export const preferredRegion = 'auto';

// 设置最大并发
export const config = {
  runtime: 'edge'
}

// 启动缓存清理
setupCacheCleanup();

// --- App Setup ---
// Remove the Env type parameter from Hono
const app = new Hono().basePath('/api');

// --- CORS Middleware ---
app.use('*', cors({
  origin: '*', // Configure as needed for production
  allowMethods: ['GET', 'OPTIONS'],
}));

app.use('*', prettyJSON());


// --- Helper to get Env Vars and check ---
// Remove Context type hint related to Env
// Access environment variable directly using process.env
function getExternalApiBaseUrl(): string | undefined {
  // Read directly from process.env provided by Vercel Edge environment
  const url = process?.env?.EXTERNAL_NCM_API_URL;

  if (!url) {
    // Log only once if missing, maybe using a flag or a more robust config check
    apiLogger.error('Server configuration error: EXTERNAL_NCM_API_URL is not set in Vercel environment.');
  }
  return url;
}

// Define consoleLoggerShim if it's not already available globally or via import
// This shim is passed to the lyric service functions.
const consoleLoggerShim = {
    info: (...args: any[]) => apiLogger.info(...args),
    warn: (...args: any[]) => apiLogger.warn(...args),
    error: (...args: any[]) => apiLogger.error(...args),
    debug: (...args: any[]) => apiLogger.debug(...args),
    // Ensure this structure matches the BasicLogger interface expected by your lyricService
};

// --- Routes ---

app.get('/', (c) => {
  apiLogger.info('Root endpoint accessed.'); // Use apiLogger
  return c.json({ message: 'Lyric Atlas API is running.' }); // Updated message
});

// Search route using LyricProvider
// Remove Context type hint related to Env
app.get('/search', async (c: Context) => {
  const id = c.req.query('id');
  const fallbackQuery = c.req.query('fallback');
  const fixedVersionRaw = c.req.query('fixedVersion');
  const fast = c.req.query('fast') !== undefined;
  const signal = c.req.raw.signal;

  apiLogger.info(`Search request - ID: ${id}, Fixed: ${fixedVersionRaw}, Fallback: ${fallbackQuery}, Fast: ${fast}`);

  const externalApiBaseUrl = getExternalApiBaseUrl();

  if (!externalApiBaseUrl && !fast) {
    c.status(500);
    return c.json({ found: false, id, error: 'Server configuration error.' });
  }

  if (!id) {
    apiLogger.warn('Search failed: Missing id parameter.');
    c.status(400);
    return c.json({ found: false, error: 'Missing id parameter' });
  }

  try {
    const lyricProvider = new LyricProvider(externalApiBaseUrl);

    const result: SearchResult = await lyricProvider.search(id, {
      fixedVersion: fixedVersionRaw,
      fallback: fallbackQuery,
      fast,
      signal,
    });

    if (result.found) {
      apiLogger.info(`Lyrics found for ID: ${id} - Format: ${result.format}, Source: ${result.source}`);
      if (result.translation) apiLogger.debug(`Translation found for ID: ${id}`);
      if (result.romaji) apiLogger.debug(`Romaji found for ID: ${id}`);
      return c.json(result);
    } else {
      const statusCode = result.statusCode || 404;
      c.status(statusCode as any);
      apiLogger.info(`Lyrics not found for ID: ${id} - Status: ${statusCode}, Error: ${result.error}`);
      return c.json(result);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    if (errorMessage === 'Request aborted') {
      apiLogger.info(`Search request aborted for ID: ${id}`);
      return new Response(null, { status: 499 });
    }
    apiLogger.error(`Unexpected error during search for ID: ${id} - ${errorMessage}`, error);
    c.status(500);
    return c.json({ found: false, id, error: `Failed to process lyric request: ${errorMessage}` });
  }
});

// --- API Endpoint: /api/lyrics/meta ---
app.get('/lyrics/meta', async (c) => {
  const id = c.req.query('id');
  const fast = c.req.query('fast') !== undefined;

  if (!id) {
    c.status(400);
    return c.json({ found: false, error: 'Missing id parameter' });
  }

  apiLogger.info(`Received metadata request for ID: ${id}, Fast: ${fast}`);

  try {
    const result: LyricMetadataResult = await getLyricMetadata(id, {
      logger: consoleLoggerShim,
      fast,
    });

    if (result.found) {
      apiLogger.info(`Found metadata for ID: ${id}, Formats: ${result.availableFormats.join(', ')}`);
      return c.json(result);
    } else {
      const statusCode = result.statusCode || 404;
      apiLogger.warn(`Metadata not found or error for ID: ${id}. Status: ${statusCode}, Error: ${result.error}`);
      c.status(statusCode as any); 
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

  apiLogger.info(`TTML direct access request for ID: ${songId}`);

  if (!/^\d+$/.test(songId)) {
    c.status(400);
    return c.text('Invalid song ID');
  }

  try {
    const lyricProvider = new LyricProvider(getExternalApiBaseUrl());
    const result = await lyricProvider.search(songId, { fixedVersion: 'ttml' });

    if (result.found && result.format === 'ttml') {
      c.header('Content-Type', 'application/xml; charset=utf-8');
      return c.text(result.content);
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
