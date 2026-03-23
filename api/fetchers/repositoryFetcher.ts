import {
  LyricFormat,
  buildRawUrl,
  buildUserLyricUrl,
  getLogger,
} from '../utils';
import { localLyricCache } from '../localLyricCache';
import type { FetchResult } from '../interfaces/lyricTypes';
import type { LyricFetcher } from '../interfaces/fetcher';

const logger = getLogger('RepositoryFetcher');

export class RepositoryFetcher implements LyricFetcher {
  private cacheInitialized = false;

  async initCache(): Promise<void> {
    if (!this.cacheInitialized) {
      await localLyricCache.init();
      this.cacheInitialized = true;
    }
  }

  async fetch(id: string, format: LyricFormat): Promise<FetchResult> {
    await this.initCache();

    if (format === 'ttml') {
      const cachedContent = await localLyricCache.getCachedLyric(id);
      if (cachedContent) {
        logger.info(`Cache hit for TTML: ${id}`);
        return { status: 'found', format, content: cachedContent, source: 'repository' };
      }
    }

    if (format !== 'ttml') {
      return this.fetchFromMainRepo(id, format);
    }

    const mainRepoUrl = buildRawUrl(id, format);
    const userRepoUrl = buildUserLyricUrl(id);

    logger.info(`Attempting parallel fetch for TTML: ${mainRepoUrl} and ${userRepoUrl}`);

    try {
      const [mainRepoResult, userRepoResult] = await Promise.allSettled([
        this.fetchUrl(mainRepoUrl, format),
        this.fetchUrl(userRepoUrl, format)
      ]);

      let result: FetchResult | null = null;
      let source: 'main' | 'user' = 'main';

      if (mainRepoResult.status === 'fulfilled' && mainRepoResult.value.status === 'found') {
        logger.info(`Success from main repo for TTML`);
        result = mainRepoResult.value;
        source = 'main';
      } else if (userRepoResult.status === 'fulfilled' && userRepoResult.value.status === 'found') {
        logger.info(`Success from user-lyrics for TTML`);
        result = userRepoResult.value;
        source = 'user';
      }

      if (result) {
        await localLyricCache.recordPlay(id);

        if (await localLyricCache.shouldCache(id)) {
          await localLyricCache.cacheLyric(id, result.content!, source);
        }

        return result;
      }

      logger.info(`TTML not found in both repos`);
      return { status: 'notfound', format };
    } catch (err) {
      logger.error(`Network error for ${format.toUpperCase()}`, err);
      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      return { status: 'error', format, error };
    }
  }

  private async fetchFromMainRepo(id: string, format: LyricFormat): Promise<FetchResult> {
    const url = buildRawUrl(id, format);
    logger.info(`Attempting fetch for ${format.toUpperCase()}: ${url}`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const content = await response.text();
        logger.info(`Success for ${format.toUpperCase()} (status: ${response.status})`);
        return { status: 'found', format, content, source: 'repository' };
      } else if (response.status === 404) {
        logger.info(`404 for ${format.toUpperCase()}`);
        return { status: 'notfound', format };
      } else {
        logger.error(`Failed for ${format.toUpperCase()} with HTTP status ${response.status}`);
        return { status: 'error', format, statusCode: response.status, error: new Error(`HTTP error ${response.status}`) };
      }
    } catch (err) {
      logger.error(`Network error for ${format.toUpperCase()}`, err);
      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      if (error.name === 'AbortError') {
        return { status: 'error', format, error: new Error(`Fetch timeout: ${url}`) };
      }
      return { status: 'error', format, error };
    }
  }

  private async fetchUrl(url: string, format: LyricFormat): Promise<FetchResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const content = await response.text();
        return { status: 'found', format, content, source: 'repository' };
      } else {
        return { status: 'notfound', format };
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      if (error.name === 'AbortError') {
        return { status: 'error', format, error: new Error(`Fetch timeout: ${url}`) };
      }
      return { status: 'error', format, error };
    }
  }
}
