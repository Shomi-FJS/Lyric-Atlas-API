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
    logger.info(`Loaded settings: devModeEnabled=${devModeEnabled}`);
  } catch {
    devModeEnabled = false;
    logger.info('No settings file found, using defaults');
  }
}

async function saveSettings(): Promise<void> {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify({ devModeEnabled }, null, 2));
}

async function ensureLyricsDevDir(): Promise<void> {
  try {
    await fs.mkdir(LYRICS_DEV_DIR, { recursive: true });
  } catch (err) {
    logger.error('Failed to create lyrics-dev directory', err);
  }
}

app.use('*', cors());

app.use('/*', serveStatic({ root: './public' }));

app.get('/api/status', async (c) => {
  return c.json({
    success: true,
    devModeEnabled,
    cacheDir: localLyricCache.getCacheDir(),
    devDir: LYRICS_DEV_DIR
  });
});

app.get('/api/cache/list', async (c) => {
  try {
    const meta = await localLyricCache.getMeta();
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
    logger.error('Failed to list cache files', err);
    return c.json({ success: false, error: 'Failed to list cache files' }, 500);
  }
});

app.delete('/api/cache/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'Invalid ID format' }, 400);
  }
  
  try {
    const deleted = await localLyricCache.deleteCache(id);
    if (deleted) {
      logger.info(`Deleted cache for ID: ${id}`);
      return c.json({ success: true, message: `Cache ${id} deleted` });
    } else {
      return c.json({ success: false, error: 'Cache not found' }, 404);
    }
  } catch (err) {
    logger.error('Failed to delete cache', err);
    return c.json({ success: false, error: 'Failed to delete cache' }, 500);
  }
});

app.get('/api/cache/file/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'Invalid ID format' }, 400);
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
      return c.json({ success: false, error: 'File not found' }, 404);
    }
    logger.error('Failed to read cache file', err);
    return c.json({ success: false, error: 'Failed to read cache file' }, 500);
  }
});

app.post('/api/cache/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    let id = formData.get('id') as string | null;
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'Missing file' }, 400);
    }
    
    const content = await file.text();
    
    if (!content.includes('<tt') || !content.includes('xmlns')) {
      return c.json({ success: false, error: 'Invalid TTML format' }, 400);
    }
    
    const metadata = parseTTMLMetadata(content);
    
    if (!id) {
      const extractedId = extractNcmId(content);
      if (!extractedId) {
        return c.json({ success: false, error: 'Cannot extract NCM ID from TTML file. Please provide ID manually.' }, 400);
      }
      id = extractedId;
      logger.info(`Auto-extracted NCM ID: ${id}`);
    }
    
    if (!/^\d+$/.test(id)) {
      return c.json({ success: false, error: 'ID must be numeric' }, 400);
    }
    
    await localLyricCache.cacheLyric(id, content, 'upload');
    logger.info(`Uploaded cache for ID: ${id}`);
    
    return c.json({ 
      success: true, 
      message: `Cache ${id} uploaded successfully`, 
      id,
      musicName: metadata.musicName,
      artists: metadata.artists
    });
  } catch (err) {
    logger.error('Failed to upload cache', err);
    return c.json({ success: false, error: 'Failed to upload cache' }, 500);
  }
});

app.post('/api/dev-mode', async (c) => {
  try {
    const body = await c.req.json();
    devModeEnabled = !!body.enabled;
    await saveSettings();
    logger.info(`Dev mode ${devModeEnabled ? 'enabled' : 'disabled'}`);
    return c.json({ success: true, devModeEnabled });
  } catch (err) {
    logger.error('Failed to update dev mode', err);
    return c.json({ success: false, error: 'Failed to update dev mode' }, 500);
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
    logger.error('Failed to list dev files', err);
    return c.json({ success: false, error: 'Failed to list dev files' }, 500);
  }
});

app.post('/api/dev/upload', async (c) => {
  try {
    await ensureLyricsDevDir();
    const formData = await c.req.formData();
    const file = formData.get('file');
    let id = formData.get('id') as string | null;
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'Missing file' }, 400);
    }
    
    const content = await file.text();
    
    if (!content.includes('<tt') || !content.includes('xmlns')) {
      return c.json({ success: false, error: 'Invalid TTML format' }, 400);
    }
    
    const metadata = parseTTMLMetadata(content);
    
    if (!id) {
      const extractedId = extractNcmId(content);
      if (!extractedId) {
        return c.json({ success: false, error: 'Cannot extract NCM ID from TTML file. Please provide ID manually.' }, 400);
      }
      id = extractedId;
      logger.info(`Auto-extracted NCM ID: ${id}`);
    }
    
    if (!/^\d+$/.test(id)) {
      return c.json({ success: false, error: 'ID must be numeric' }, 400);
    }
    
    const filePath = path.join(LYRICS_DEV_DIR, `${id}.ttml`);
    await fs.writeFile(filePath, content, 'utf-8');
    logger.info(`Uploaded dev file for ID: ${id}`);
    
    return c.json({ 
      success: true, 
      message: `Dev file ${id} uploaded successfully`, 
      id,
      musicName: metadata.musicName,
      artists: metadata.artists
    });
  } catch (err) {
    logger.error('Failed to upload dev file', err);
    return c.json({ success: false, error: 'Failed to upload dev file' }, 500);
  }
});

app.delete('/api/dev/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'Invalid ID format' }, 400);
  }
  
  try {
    const filePath = path.join(LYRICS_DEV_DIR, `${id}.ttml`);
    await fs.unlink(filePath);
    logger.info(`Deleted dev file for ID: ${id}`);
    return c.json({ success: true, message: `Dev file ${id} deleted` });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return c.json({ success: false, error: 'File not found' }, 404);
    }
    logger.error('Failed to delete dev file', err);
    return c.json({ success: false, error: 'Failed to delete dev file' }, 500);
  }
});

app.get('/api/dev/file/:id', async (c) => {
  const id = c.req.param('id');
  
  if (!id || !/^\d+$/.test(id)) {
    return c.json({ success: false, error: 'Invalid ID format' }, 400);
  }
  
  try {
    const filePath = path.join(LYRICS_DEV_DIR, `${id}.ttml`);
    const content = await fs.readFile(filePath, 'utf-8');
    return c.text(content, 200, {
      'Content-Type': 'application/xml; charset=utf-8'
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return c.json({ success: false, error: 'File not found' }, 404);
    }
    logger.error('Failed to read dev file', err);
    return c.json({ success: false, error: 'Failed to read dev file' }, 500);
  }
});

export async function startCacheAdminServer(): Promise<void> {
  await loadSettings();
  await ensureLyricsDevDir();
  
  console.log(`[INFO] Cache Admin Server running on http://localhost:${PORT}`);
  
  serve({
    fetch: app.fetch,
    port: PORT
  });
}
