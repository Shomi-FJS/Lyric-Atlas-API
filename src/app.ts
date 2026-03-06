import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { LyricProvider, type SearchResult, getLyricMetadata, LyricMetadataResult } from '../api/lyricService.js';
import { getLogger } from '../api/utils.js';
import { setupCacheCleanup } from '../api/cache.js';

const apiLogger = getLogger('API');

setupCacheCleanup();

const app = new Hono().basePath('/api');

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
}));

app.use('*', prettyJSON());

function getExternalApiBaseUrl(): string | undefined {
  const url = process?.env?.EXTERNAL_NCM_API_URL;
  if (!url) {
    apiLogger.error('Server configuration error: EXTERNAL_NCM_API_URL is not set.');
  }
  return url;
}

const consoleLoggerShim = {
  info: (...args: any[]) => apiLogger.info(...args),
  warn: (...args: any[]) => apiLogger.warn(...args),
  error: (...args: any[]) => apiLogger.error(...args),
  debug: (...args: any[]) => apiLogger.debug(...args),
};

app.get('/', (c) => {
  apiLogger.info('Root endpoint accessed.');
  return c.json({ message: 'Lyric Atlas API is running.' });
});

app.get('/search', async (c: Context) => {
  const id = c.req.query('id');
  const fallbackQuery = c.req.query('fallback');
  const fixedVersionRaw = c.req.query('fixedVersion');
  const fast = c.req.query('fast') !== undefined;

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

export default app;
