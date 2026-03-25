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

const FETCH_TIMEOUT_MS = 1200;

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

  /**
   * TTML 镜像请求去重：同 ID 并发请求共享同一个 fetch Promise，
   * 避免两个端点（/search 和 /ncm-lyrics）各自发起一组镜像请求互相竞争。
   * Promise 一旦 settle 就从 map 中移除，后续请求会发起新的 fetch。
   */
  private inflightTtmlFetches = new Map<string, Promise<FetchResult>>();

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

    // TTML 请求去重：同 ID 只发起一次镜像并行拉取
    const dedupeKey = id;
    const inflight = this.inflightTtmlFetches.get(dedupeKey);
    if (inflight) {
      logger.debug(logger.msg('fetcher.dedupe_hit', { id }));
      return inflight;
    }

    const fetchPromise = this.fetchTtmlFromMirrors(id, signal).finally(() => {
      this.inflightTtmlFetches.delete(dedupeKey);
    });

    this.inflightTtmlFetches.set(dedupeKey, fetchPromise);
    return fetchPromise;
  }

  private async fetchTtmlFromMirrors(id: string, signal?: AbortSignal): Promise<FetchResult> {
    const format: LyricFormat = 'ttml';
    const mainRepoUrl = buildRawUrl(id, format);
    const mirrorUrls = buildMirrorUrls(id, format);
    const allUrls = [mainRepoUrl, ...mirrorUrls];

    logger.info(logger.msg('fetcher.parallel_ttml_urls', { id, urls: allUrls.join(', ') }));

    try {
      // 竞速模式：Promise.any 只要有一个返回 found 就立即返回
      // 不等所有请求完成，大幅降低响应延迟
      const result = await Promise.any([
        ...allUrls.map(async (url, index) => {
          const res = await this.fetchUrl(url, format, signal);
          if (res.status === 'found') {
            const sourceName = index === 0 ? '主仓库' : `镜像${index}`;
            logger.info(logger.msg('fetcher.mirror_hit', { id, source: sourceName, url }));
            return res;
          }
          // notfound 或 error 都抛错，让 Promise.any 继续等
          throw res;
        }),
        createAbortPromise(signal)
      ]);
      
      return result as FetchResult;
    } catch (err) {
      // Promise.any 的 AggregateError：所有请求都失败
      if (signal?.aborted || (err instanceof Error && err.message === 'Request aborted')) {
        return { status: 'error', format, error: new Error('Request aborted') };
      }
      
      // 检查是否全部返回 notfound（而非超时/错误）
      if (err instanceof AggregateError) {
        const allNotFound = err.errors.every(
          (e: any) => e?.status === 'notfound'
        );
        if (allNotFound) {
          logger.info(logger.msg('fetcher.all_mirrors_missed', { id }));
          return { status: 'notfound', format };
        }
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
