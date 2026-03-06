import { readFile, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './utils';

const logger = getLogger('DevMode');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SETTINGS_FILE = join(__dirname, '..', 'cache-admin-settings.json');
const LYRICS_DEV_DIR = join(__dirname, '..', 'lyrics-dev');

interface DevModeSettings {
  devModeEnabled: boolean;
}

let devModeEnabled = false;
let initialized = false;

export async function initDevMode(): Promise<void> {
  if (initialized) return;
  
  try {
    await access(SETTINGS_FILE);
    const data = await readFile(SETTINGS_FILE, 'utf-8');
    const settings: DevModeSettings = JSON.parse(data);
    devModeEnabled = settings.devModeEnabled || false;
    logger.info(`Dev mode initialized: ${devModeEnabled ? 'enabled' : 'disabled'}`);
  } catch {
    devModeEnabled = false;
    logger.info('No dev mode settings found, using default (disabled)');
  }
  
  initialized = true;
}

export function isDevModeEnabled(): boolean {
  return devModeEnabled;
}

export function getDevDir(): string {
  return LYRICS_DEV_DIR;
}

export async function getDevLyric(id: string): Promise<string | null> {
  if (!devModeEnabled) return null;
  
  try {
    const filePath = join(LYRICS_DEV_DIR, `${id}.ttml`);
    const content = await readFile(filePath, 'utf-8');
    logger.info(`Dev mode: Found lyric for ${id} in lyrics-dev`);
    return content;
  } catch {
    return null;
  }
}
