import type { LyricFormat } from '../utils';
import type { FetchResult } from './lyricTypes';

export interface LyricFetcher {
  fetch(id: string, format: LyricFormat, signal?: AbortSignal): Promise<FetchResult>;
}

export interface ExternalLyricFetcher {
  fetch(id: string, specificFormat?: 'yrc' | 'lrc', signal?: AbortSignal): Promise<FetchResult & { translation?: string; romaji?: string }>;
}
