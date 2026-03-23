import {
  LyricFormat,
  buildRawUrl,
  buildMirrorUrls,
  getLogger,
} from '../utils';
import { localLyricCache } from '../localLyricCache';
import type { FetchResult } from '../interfaces/lyricTypes';
import type { LyricFetcher } from '../interfaces/fetcher';

const logger = getLogger('RepositoryFetcher');

const FETCH_TIMEOUT_MS = 5000;

function createAbortPromise(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request aborted'));
      return;
    }
    signal?.addEventListener('abort', () => {
      reject(new Error('Request aborted'));
    });
  });
}

export class RepositoryFetcher implements LyricFetcher {
  private cacheInitialized = false;

  async initCache(): Promise<void> {
    if (!this.cacheInitialized) {
      await localLyricCache.init();
      this.cacheInitialized = true;
    }
  }

  async fetch(id: string, format: LyricFormat, signal?: AbortSignal): Promise<FetchResult> {
    await this.initCache();

    if (signal?.aborted) {
      return { status: 'error', format, error: new Error('Request aborted') };
    }

    if (format !== 'ttml') {
      return this.fetchFromMainRepo(id, format, signal);
    }

    const mainRepoUrl = buildRawUrl(id, format);
    const mirrorUrls = buildMirrorUrls(id, format);
    const allUrls = [mainRepoUrl, ...mirrorUrls];

    logger.info(logger.msg('fetcher.parallel_ttml_urls', { id, urls: allUrls.join(', ') }));

    try {
      const abortPromise = createAbortPromise(signal);
      
      const results = await Promise.race([
        Promise.allSettled(allUrls.map(url => this.fetchUrl(url, format, signal))),
        abortPromise
      ]);

      for (let i = 0; i < results.length; i++) {
        const settled = results[i];
        if (settled.status === 'fulfilled' && settled.value.status === 'found') {
          const sourceName = i === 0 ? '主仓库' : `镜像${i}`;
          logger.info(logger.msg('fetcher.mirror_hit', { id, source: sourceName, url: allUrls[i] }));
          return settled.value;
        }
      }

      if (signal?.aborted) {
        return { status: 'error', format, error: new Error('Request aborted') };
      }

      logger.info(logger.msg('fetcher.all_mirrors_missed', { id }));
      return { status: 'notfound', format };
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.message === 'Request aborted')) {
        logger.debug(`请求被中断: ${id}`);
        return { status: 'error', format, error: new Error('Request aborted') };
      }
      logger.error(logger.msg('fetcher.network_error', { format: format.toUpperCase() }), err);
      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      return { status: 'error', format, error };
    }
  }

  private async fetchFromMainRepo(id: string, format: LyricFormat, signal?: AbortSignal): Promise<FetchResult> {
    const url = buildRawUrl(id, format);
    logger.info(logger.msg('fetcher.fetch_format', { id, format: format.toUpperCase(), url }));
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    const abortHandler = () => controller.abort();
    signal?.addEventListener('abort', abortHandler);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);

      if (response.ok) {
        const content = await response.text();
        logger.info(logger.msg('fetcher.fetch_success', { format: format.toUpperCase(), id, status: response.status }));
        return { status: 'found', format, content, source: 'repository' };
      } else if (response.status === 404) {
        logger.info(logger.msg('fetcher.fetch_404', { format: format.toUpperCase(), id }));
        return { status: 'notfound', format };
      } else {
        logger.error(logger.msg('fetcher.request_failed', { format: format.toUpperCase(), id, status: response.status }));
        return { status: 'error', format, statusCode: response.status, error: new Error(`HTTP error ${response.status}`) };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      
      if (signal?.aborted || controller.signal.aborted) {
        logger.debug(`请求被中断: ${id}`);
        return { status: 'error', format, error: new Error('Request aborted') };
      }
      
      logger.error(logger.msg('fetcher.network_error_id', { format: format.toUpperCase(), id }), err);
      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      return { status: 'error', format, error };
    }
  }

  private async fetchUrl(url: string, format: LyricFormat, signal?: AbortSignal): Promise<FetchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    const abortHandler = () => controller.abort();
    signal?.addEventListener('abort', abortHandler);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);

      if (response.ok) {
        const content = await response.text();
        return { status: 'found', format, content, source: 'repository' };
      } else {
        return { status: 'notfound', format };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      
      if (signal?.aborted || controller.signal.aborted) {
        return { status: 'error', format, error: new Error('Request aborted') };
      }
      
      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      return { status: 'error', format, error };
    }
  }
}
