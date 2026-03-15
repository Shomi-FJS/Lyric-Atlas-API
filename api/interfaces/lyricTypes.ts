import type { LyricFormat } from '../utils';

export type FetchResult =
  | { status: 'found'; format: LyricFormat; content: string; source: 'repository' | 'external' }
  | { status: 'notfound'; format?: LyricFormat }
  | { status: 'error'; format?: LyricFormat; statusCode?: number; error: Error };

export type SearchResult =
  | { found: true; id: string; format: LyricFormat; source: 'repository' | 'external'; content: string; translation?: string; romaji?: string }
  | { found: false; id: string; error: string; statusCode?: number };

export interface LyricProviderOptions {
  fixedVersion?: string;
  fallback?: string;
  fast?: boolean;
  signal?: AbortSignal;
}
