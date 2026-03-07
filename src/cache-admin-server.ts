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

app.get('/', (c) => c.html(getIndexHtml()));

app.get('*', (c) => {
  return c.html(getIndexHtml());
});

function getIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>歌词缓存管理系统</title>
  <style>
    :root {
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --danger: #ef4444;
      --danger-hover: #dc2626;
      --success: #22c55e;
      --warning: #f59e0b;
      --bg: #0f172a;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background: linear-gradient(135deg, var(--bg-card) 0%, #1a1a2e 100%);
      border-bottom: 1px solid var(--border);
      padding: 20px 0;
      margin-bottom: 30px;
    }
    
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }
    
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .subtitle {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-top: 4px;
    }
    
    .dev-mode-toggle {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bg-card);
      padding: 12px 20px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    
    .toggle-label {
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .toggle-switch {
      position: relative;
      width: 52px;
      height: 28px;
      background: var(--border);
      border-radius: 14px;
      cursor: pointer;
      transition: background 0.3s;
    }
    
    .toggle-switch.active {
      background: var(--success);
    }
    
    .toggle-switch::after {
      content: '';
      position: absolute;
      width: 22px;
      height: 22px;
      background: white;
      border-radius: 50%;
      top: 3px;
      left: 3px;
      transition: transform 0.3s;
    }
    
    .toggle-switch.active::after {
      transform: translateX(24px);
    }
    
    .status-badge {
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .status-on {
      background: rgba(34, 197, 94, 0.2);
      color: var(--success);
    }
    
    .status-off {
      background: rgba(148, 163, 184, 0.2);
      color: var(--text-muted);
    }
    
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    
    .tab {
      padding: 10px 20px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.2s;
    }
    
    .tab:hover {
      background: var(--bg-hover);
      color: var(--text);
    }
    
    .tab.active {
      background: var(--primary);
      color: white;
    }
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
    
    .card {
      background: var(--bg-card);
      border-radius: 16px;
      border: 1px solid var(--border);
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: var(--shadow);
    }
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    
    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
    }
    
    .card-count {
      background: var(--bg-hover);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    
    .btn {
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    
    .btn-danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
    }
    
    .btn-danger:hover {
      background: var(--danger);
      color: white;
    }
    
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.8rem;
    }
    
    .upload-area {
      border: 2px dashed var(--border);
      border-radius: 12px;
      padding: 30px;
      text-align: center;
      margin-bottom: 20px;
      transition: all 0.3s;
      cursor: pointer;
    }
    
    .upload-area:hover, .upload-area.dragover {
      border-color: var(--primary);
      background: rgba(99, 102, 241, 0.1);
    }
    
    .upload-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }
    
    .upload-text {
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    
    .file-input {
      display: none;
    }
    
    .form-group {
      margin-bottom: 16px;
    }
    
    .form-label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-input {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.9rem;
      transition: border-color 0.2s;
    }
    
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    
    th {
      font-weight: 600;
      color: var(--text-muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    td {
      font-size: 0.9rem;
    }
    
    tr:hover {
      background: var(--bg-hover);
    }
    
    .id-cell {
      font-family: 'SF Mono', Monaco, monospace;
      color: var(--primary);
    }
    
    .size-cell {
      color: var(--text-muted);
    }
    
    .source-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .source-main {
      background: rgba(99, 102, 241, 0.2);
      color: #a5b4fc;
    }
    
    .source-user {
      background: rgba(168, 85, 247, 0.2);
      color: #d8b4fe;
    }
    
    .source-upload {
      background: rgba(34, 197, 94, 0.2);
      color: #86efac;
    }
    
    .source-unknown {
      background: rgba(148, 163, 184, 0.2);
      color: #cbd5e1;
    }
    
    .actions-cell {
      display: flex;
      gap: 8px;
    }
    
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s;
    }
    
    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    
    .modal {
      background: var(--bg-card);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      border: 1px solid var(--border);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      transform: scale(0.9);
      transition: transform 0.3s;
    }
    
    .modal-overlay.active .modal {
      transform: scale(1);
    }
    
    .modal-icon {
      text-align: center;
      font-size: 3rem;
      margin-bottom: 16px;
    }
    
    .modal-title {
      text-align: center;
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .modal-message {
      text-align: center;
      color: var(--text-muted);
      margin-bottom: 24px;
      line-height: 1.6;
    }
    
    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    
    .modal-actions .btn {
      min-width: 100px;
    }
    
    .btn-secondary {
      background: var(--bg-hover);
      color: var(--text);
    }
    
    .btn-secondary:hover {
      background: var(--border);
    }
    
    .song-info {
      min-width: 150px;
    }
    
    .song-name {
      font-weight: 600;
      color: var(--text);
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }
    
    .song-artists {
      font-size: 0.85rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }
    
    .text-muted {
      color: var(--text-muted);
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    
    .empty-icon {
      font-size: 3rem;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .toast {
      padding: 14px 20px;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 500;
      box-shadow: var(--shadow);
      animation: slideIn 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .toast-success {
      background: rgba(34, 197, 94, 0.9);
      color: white;
    }
    
    .toast-error {
      background: rgba(239, 68, 68, 0.9);
      color: white;
    }
    
    .toast-info {
      background: rgba(99, 102, 241, 0.9);
      color: white;
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .loading {
      display: flex;
      justify-content: center;
      padding: 40px;
    }
    
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .stat-card {
      background: var(--bg);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--primary);
    }
    
    .stat-label {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 4px;
    }
    
    .responsive-table {
      overflow-x: auto;
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 12px;
      }
      
      h1 {
        font-size: 1.4rem;
      }
      
      .header-content {
        flex-direction: column;
        align-items: stretch;
      }
      
      .dev-mode-toggle {
        justify-content: center;
      }
      
      .tabs {
        overflow-x: auto;
        padding-bottom: 8px;
      }
      
      .tab {
        padding: 8px 14px;
        font-size: 0.85rem;
        white-space: nowrap;
      }
      
      .card {
        padding: 16px;
      }
      
      .card-header {
        flex-direction: column;
        align-items: stretch;
      }
      
      table {
        font-size: 0.85rem;
      }
      
      th, td {
        padding: 10px 8px;
      }
      
      .actions-cell {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="header-content">
        <div>
          <h1>🎵 歌词缓存管理系统</h1>
          <p class="subtitle">管理本地歌词缓存与开发模式</p>
        </div>
        <div class="dev-mode-toggle">
          <span class="toggle-label">
            轴词实时预览
            <span id="devModeStatus" class="status-badge status-off">关闭</span>
          </span>
          <div id="devModeSwitch" class="toggle-switch" onclick="toggleDevMode()"></div>
        </div>
      </div>
    </div>
  </header>
  
  <main class="container">
    <div class="tabs">
      <button class="tab active" onclick="switchTab('cache')">📦 缓存管理</button>
      <button class="tab" onclick="switchTab('dev')">🔧 开发文件</button>
      <button class="tab" onclick="switchTab('upload')">⬆️ 上传歌词</button>
    </div>
    
    <div id="cacheTab" class="tab-content active">
      <div class="stats-grid" id="cacheStats">
        <div class="stat-card">
          <div class="stat-value" id="totalFiles">-</div>
          <div class="stat-label">缓存文件数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="totalSize">-</div>
          <div class="stat-label">总大小</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="totalPlays">-</div>
          <div class="stat-label">总播放次数</div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <span class="card-title">缓存文件列表</span>
          <button class="btn btn-primary btn-sm" onclick="loadCacheList()">🔄 刷新</button>
        </div>
        <div id="cacheList" class="responsive-table">
          <div class="loading"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
    
    <div id="devTab" class="tab-content">
      <div class="card">
        <div class="card-header">
          <span class="card-title">开发文件列表 (lyrics-dev)</span>
          <span class="card-count" id="devCount">0 个文件</span>
        </div>
        <div id="devList" class="responsive-table">
          <div class="loading"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
    
    <div id="uploadTab" class="tab-content">
      <div class="card">
        <div class="card-header">
          <span class="card-title">上传歌词到缓存</span>
        </div>
        
        <div class="upload-area" id="uploadArea" onclick="document.getElementById('fileInput').click()">
          <div class="upload-icon">📄</div>
          <p class="upload-text">点击或拖拽 TTML 文件到此处上传</p>
          <p class="upload-text" style="font-size: 0.8rem; margin-top: 8px;">支持自动从TTML文件解析网易云ID</p>
          <input type="file" id="fileInput" class="file-input" accept=".ttml,.xml" onchange="handleFileSelect(event)">
        </div>
        
        <div class="form-group">
          <label class="form-label">歌曲 ID (网易云) <span style="color: var(--text-muted); font-weight: normal;">- 可选，留空自动解析</span></label>
          <input type="text" id="uploadId" class="form-input" placeholder="留空将自动从TTML文件解析">
        </div>
        
        <div class="form-group">
          <label class="form-label">选中的文件</label>
          <input type="text" id="selectedFile" class="form-input" readonly placeholder="未选择文件">
        </div>
        
        <button class="btn btn-primary" onclick="uploadToCache()">上传到缓存</button>
      </div>
      
      <div class="card">
        <div class="card-header">
          <span class="card-title">上传到开发文件夹</span>
        </div>
        
        <div class="upload-area" id="devUploadArea" onclick="document.getElementById('devFileInput').click()">
          <div class="upload-icon">🔧</div>
          <p class="upload-text">点击或拖拽 TTML 文件到此处上传</p>
          <p class="upload-text" style="font-size: 0.8rem; margin-top: 8px;">支持自动从TTML文件解析网易云ID</p>
          <input type="file" id="devFileInput" class="file-input" accept=".ttml,.xml" onchange="handleDevFileSelect(event)">
        </div>
        
        <div class="form-group">
          <label class="form-label">歌曲 ID (网易云) <span style="color: var(--text-muted); font-weight: normal;">- 可选，留空自动解析</span></label>
          <input type="text" id="devUploadId" class="form-input" placeholder="留空将自动从TTML文件解析">
        </div>
        
        <div class="form-group">
          <label class="form-label">选中的文件</label>
          <input type="text" id="devSelectedFile" class="form-input" readonly placeholder="未选择文件">
        </div>
        
        <button class="btn btn-primary" onclick="uploadToDev()">上传到开发文件夹</button>
      </div>
    </div>
  </main>
  
  <div class="toast-container" id="toastContainer"></div>
  
  <div class="modal-overlay" id="confirmModal">
    <div class="modal">
      <div class="modal-icon" id="modalIcon">⚠️</div>
      <div class="modal-title" id="modalTitle">确认删除</div>
      <div class="modal-message" id="modalMessage">确定要删除此缓存文件吗？此操作无法撤销。</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn btn-danger" id="confirmBtn" onclick="confirmDelete()">确认删除</button>
      </div>
    </div>
  </div>
  
  <script>
    let devModeEnabled = false;
    let selectedFile = null;
    let devSelectedFile = null;
    let pendingDeleteId = null;
    let pendingDeleteType = null;
    
    async function init() {
      await loadStatus();
      await loadCacheList();
      await loadDevList();
    }
    
    function showModal(title, message, icon = '⚠️') {
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalMessage').textContent = message;
      document.getElementById('modalIcon').textContent = icon;
      document.getElementById('confirmModal').classList.add('active');
    }
    
    function closeModal() {
      document.getElementById('confirmModal').classList.remove('active');
      pendingDeleteId = null;
      pendingDeleteType = null;
    }
    
    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        devModeEnabled = data.devModeEnabled;
        updateDevModeUI();
      } catch (err) {
        showToast('获取状态失败', 'error');
      }
    }
    
    function updateDevModeUI() {
      const toggle = document.getElementById('devModeSwitch');
      const status = document.getElementById('devModeStatus');
      
      if (devModeEnabled) {
        toggle.classList.add('active');
        status.textContent = '开启';
        status.className = 'status-badge status-on';
      } else {
        toggle.classList.remove('active');
        status.textContent = '关闭';
        status.className = 'status-badge status-off';
      }
    }
    
    async function toggleDevMode() {
      try {
        const res = await fetch('/api/dev-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !devModeEnabled })
        });
        const data = await res.json();
        if (data.success) {
          devModeEnabled = data.devModeEnabled;
          updateDevModeUI();
          showToast(devModeEnabled ? '轴词实时预览已开启' : '轴词实时预览已关闭', 'success');
        }
      } catch (err) {
        showToast('切换失败', 'error');
      }
    }
    
    async function loadCacheList() {
      const container = document.getElementById('cacheList');
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      
      try {
        const res = await fetch('/api/cache/list');
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);
        
        updateStats(data.files);
        
        if (data.files.length === 0) {
          container.innerHTML = \`
            <div class="empty-state">
              <div class="empty-icon">📭</div>
              <p>暂无缓存文件</p>
            </div>
          \`;
          return;
        }
        
        container.innerHTML = \`
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>歌曲信息</th>
                <th>播放次数</th>
                <th>大小</th>
                <th>来源</th>
                <th>最后播放</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              \${data.files.map(f => \`
                <tr>
                  <td class="id-cell">\${f.id}</td>
                  <td>
                    <div class="song-info">
                      \${f.musicName && f.musicName.length > 0 ? \`<div class="song-name">\${f.musicName[0]}</div>\` : ''}
                      \${f.artists && f.artists.length > 0 ? \`<div class="song-artists">\${f.artists.slice(0, 3).join(' / ')}\${f.artists.length > 3 ? '...' : ''}</div>\` : ''}
                      \${!f.musicName && !f.artists ? '<span class="text-muted">-</span>' : ''}
                    </div>
                  </td>
                  <td>\${f.playCount}</td>
                  <td class="size-cell">\${formatSize(f.size)}</td>
                  <td><span class="source-badge source-\${f.source}">\${f.source}</span></td>
                  <td>\${formatDate(f.lastPlayedAt)}</td>
                  <td class="actions-cell">
                    <button class="btn btn-primary btn-sm" onclick="viewCache('\${f.id}')">查看</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteCache('\${f.id}')">删除</button>
                  </td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } catch (err) {
        container.innerHTML = \`<div class="empty-state"><p>加载失败: \${err.message}</p></div>\`;
      }
    }
    
    function updateStats(files) {
      document.getElementById('totalFiles').textContent = files.length;
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      document.getElementById('totalSize').textContent = formatSize(totalSize);
      const totalPlays = files.reduce((sum, f) => sum + f.playCount, 0);
      document.getElementById('totalPlays').textContent = totalPlays;
    }
    
    async function viewCache(id) {
      try {
        const res = await fetch(\`/api/cache/file/\${id}\`);
        if (!res.ok) {
          showToast('文件不存在', 'error');
          return;
        }
        const content = await res.text();
        const blob = new Blob([content], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch (err) {
        showToast('查看失败', 'error');
      }
    }
    
    async function deleteCache(id) {
      pendingDeleteId = id;
      pendingDeleteType = 'cache';
      showModal(
        '确认删除缓存',
        \`确定要删除缓存文件 \${id} 吗？\\n此操作将永久删除该文件，无法撤销。\`,
        '🗑️'
      );
    }
    
    async function deleteDevFile(id) {
      pendingDeleteId = id;
      pendingDeleteType = 'dev';
      showModal(
        '确认删除开发文件',
        \`确定要删除开发文件 \${id} 吗？\\n此操作将永久删除该文件，无法撤销。\`,
        '🗑️'
      );
    }
    
    async function confirmDelete() {
      if (!pendingDeleteId || !pendingDeleteType) return;
      
      const id = pendingDeleteId;
      const type = pendingDeleteType;
      closeModal();
      
      try {
        let res;
        if (type === 'cache') {
          res = await fetch(\`/api/cache/\${id}\`, { method: 'DELETE' });
        } else {
          res = await fetch(\`/api/dev/\${id}\`, { method: 'DELETE' });
        }
        
        const data = await res.json();
        
        if (data.success) {
          showToast('删除成功', 'success');
          if (type === 'cache') {
            loadCacheList();
          } else {
            loadDevList();
          }
        } else {
          showToast(data.error, 'error');
        }
      } catch (err) {
        showToast('删除失败', 'error');
      }
    }
    
    async function loadDevList() {
      const container = document.getElementById('devList');
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      
      try {
        const res = await fetch('/api/dev/list');
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);
        
        document.getElementById('devCount').textContent = \`\${data.files.length} 个文件\`;
        
        if (data.files.length === 0) {
          container.innerHTML = \`
            <div class="empty-state">
              <div class="empty-icon">📁</div>
              <p>开发文件夹为空</p>
            </div>
          \`;
          return;
        }
        
        container.innerHTML = \`
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>歌曲信息</th>
                <th>大小</th>
                <th>修改时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              \${data.files.map(f => \`
                <tr>
                  <td class="id-cell">\${f.id}</td>
                  <td>
                    <div class="song-info">
                      \${f.musicName && f.musicName.length > 0 ? \`<div class="song-name">\${f.musicName[0]}</div>\` : ''}
                      \${f.artists && f.artists.length > 0 ? \`<div class="song-artists">\${f.artists.slice(0, 3).join(' / ')}\${f.artists.length > 3 ? '...' : ''}</div>\` : ''}
                      \${!f.musicName && !f.artists ? '<span class="text-muted">-</span>' : ''}
                    </div>
                  </td>
                  <td class="size-cell">\${formatSize(f.size)}</td>
                  <td>\${formatDate(f.modifiedAt)}</td>
                  <td class="actions-cell">
                    <button class="btn btn-primary btn-sm" onclick="viewDevFile('\${f.id}')">查看</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDevFile('\${f.id}')">删除</button>
                  </td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } catch (err) {
        container.innerHTML = \`<div class="empty-state"><p>加载失败: \${err.message}</p></div>\`;
      }
    }
    
    async function viewDevFile(id) {
      try {
        const res = await fetch(\`/api/dev/file/\${id}\`);
        const content = await res.text();
        const blob = new Blob([content], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch (err) {
        showToast('查看失败', 'error');
      }
    }
    
    function handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        selectedFile = file;
        document.getElementById('selectedFile').value = file.name;
      }
    }
    
    function handleDevFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        devSelectedFile = file;
        document.getElementById('devSelectedFile').value = file.name;
      }
    }
    
    async function uploadToCache() {
      const id = document.getElementById('uploadId').value.trim();
      
      if (!selectedFile) {
        showToast('请选择文件', 'error');
        return;
      }
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (id) {
        formData.append('id', id);
      }
      
      try {
        const res = await fetch('/api/cache/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        if (data.success) {
          let message = \`上传成功 (ID: \${data.id})\`;
          if (data.musicName && data.musicName.length > 0) {
            message += \` - \${data.musicName[0]}\`;
            if (data.artists && data.artists.length > 0) {
              message += \` / \${data.artists[0]}\`;
            }
          }
          showToast(message, 'success');
          document.getElementById('uploadId').value = '';
          document.getElementById('selectedFile').value = '';
          document.getElementById('fileInput').value = '';
          selectedFile = null;
          loadCacheList();
        } else {
          showToast(data.error, 'error');
        }
      } catch (err) {
        showToast('上传失败', 'error');
      }
    }
    
    async function uploadToDev() {
      const id = document.getElementById('devUploadId').value.trim();
      
      if (!devSelectedFile) {
        showToast('请选择文件', 'error');
        return;
      }
      
      const formData = new FormData();
      formData.append('file', devSelectedFile);
      if (id) {
        formData.append('id', id);
      }
      
      try {
        const res = await fetch('/api/dev/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        if (data.success) {
          let message = \`上传成功 (ID: \${data.id})\`;
          if (data.musicName && data.musicName.length > 0) {
            message += \` - \${data.musicName[0]}\`;
            if (data.artists && data.artists.length > 0) {
              message += \` / \${data.artists[0]}\`;
            }
          }
          showToast(message, 'success');
          document.getElementById('devUploadId').value = '';
          document.getElementById('devSelectedFile').value = '';
          document.getElementById('devFileInput').value = '';
          devSelectedFile = null;
          loadDevList();
        } else {
          showToast(data.error, 'error');
        }
      } catch (err) {
        showToast('上传失败', 'error');
      }
    }
    
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      
      event.target.classList.add('active');
      document.getElementById(tab + 'Tab').classList.add('active');
    }
    
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    
    function formatDate(timestamp) {
      if (!timestamp) return '-';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
      if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
      
      return date.toLocaleDateString('zh-CN');
    }
    
    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = \`toast toast-\${type}\`;
      toast.innerHTML = \`
        <span>\${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
        <span>\${message}</span>
      \`;
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
    
    document.getElementById('confirmModal').addEventListener('click', (e) => {
      if (e.target.id === 'confirmModal') {
        closeModal();
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    });
    
    document.getElementById('uploadArea').addEventListener('dragover', (e) => {
      e.preventDefault();
      e.currentTarget.classList.add('dragover');
    });
    
    document.getElementById('uploadArea').addEventListener('dragleave', (e) => {
      e.currentTarget.classList.remove('dragover');
    });
    
    document.getElementById('uploadArea').addEventListener('drop', (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        selectedFile = file;
        document.getElementById('selectedFile').value = file.name;
      }
    });
    
    document.getElementById('devUploadArea').addEventListener('dragover', (e) => {
      e.preventDefault();
      e.currentTarget.classList.add('dragover');
    });
    
    document.getElementById('devUploadArea').addEventListener('dragleave', (e) => {
      e.currentTarget.classList.remove('dragover');
    });
    
    document.getElementById('devUploadArea').addEventListener('drop', (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        devSelectedFile = file;
        document.getElementById('devSelectedFile').value = file.name;
      }
    });
    
    init();
  </script>
</body>
</html>`;
}

export async function startCacheAdminServer(): Promise<void> {
  await loadSettings();
  await ensureLyricsDevDir();
  
  console.log(`[INFO] Cache Admin Server running on http://localhost:${PORT}`);
  
  serve({
    fetch: app.fetch,
    port: PORT
  });
}
