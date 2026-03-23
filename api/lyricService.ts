import {
  LyricFormat,
  buildRawUrl,
  buildExternalApiUrl,
  DEFAULT_FALLBACK_ORDER,
  isValidFormat,
  getLogger,
} from './utils';
import { RepositoryFetcher } from './fetchers/repositoryFetcher';
import { ExternalApiFetcher } from './fetchers/externalApiFetcher';
import type { LyricFetcher, ExternalLyricFetcher } from './interfaces/fetcher';
import type { LyricProviderOptions } from './interfaces/lyricTypes';
import { lyricsCache } from './cache';
import { localLyricCache } from './localLyricCache';
import { isDevModeEnabled, getDevLyric } from './devMode';

// Get logger instance using our custom logger
const logger = getLogger('LyricService');

// Export SearchResult and LyricProviderOptions types for use in index.ts
export type { LyricProviderOptions };

// Result type for the main search function
export type SearchResult =
  | { found: true; id: string; format: LyricFormat; source: 'repository' | 'external'; content: string; translation?: string; romaji?: string }
  | { found: false; id: string; error: string; statusCode?: number };

// If BasicLogger is not imported or defined globally, define it here.
interface BasicLogger {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug?: (...args: any[]) => void;
}

// --- New types for metadata checking ---
export type LyricMetadataResult =
  | {
      found: true;
      id: string;
      availableFormats: LyricFormat[];
      hasTranslation?: boolean; // From external API
      hasRomaji?: boolean;      // From external API
    }
  | { found: false; id: string; error?: string; statusCode?: number };

// --- Lyric Provider Service ---

export class LyricProvider {
  private repoFetcher: LyricFetcher;
  private externalFetcher: ExternalLyricFetcher;

  constructor(externalApiBaseUrl: string | undefined) {
    this.repoFetcher = new RepositoryFetcher();
    this.externalFetcher = new ExternalApiFetcher(externalApiBaseUrl);
  }

  private checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }
  }

  private combineSignals(signal1?: AbortSignal, signal2?: AbortSignal): AbortSignal | undefined {
    if (!signal1 && !signal2) return undefined;
    if (!signal1) return signal2;
    if (!signal2) return signal1;
    
    const controller = new AbortController();
    
    const abortHandler = () => controller.abort();
    signal1.addEventListener('abort', abortHandler);
    signal2.addEventListener('abort', abortHandler);
    
    if (signal1.aborted || signal2.aborted) {
      controller.abort();
    }
    
    return controller.signal;
  }

  async search(id: string, options: LyricProviderOptions): Promise<SearchResult> {
    const { fixedVersion: fixedVersionRaw, fallback: fallbackQuery, fast, signal } = options;
    const fixedVersionQuery = fixedVersionRaw?.toLowerCase();
    logger.info(logger.msg('provider.processing', { id, format: fixedVersionQuery || 'auto', fallback: fallbackQuery || 'none' }));

    this.checkAborted(signal);

    if (fixedVersionQuery === 'ttml' && isDevModeEnabled()) {
      const devContent = await getDevLyric(id);
      this.checkAborted(signal);
      if (devContent) {
        logger.info(logger.msg('devmode.using_file', { id }));
        return { found: true, id, format: 'ttml', source: 'repository', content: devContent };
      }
    }

    // 记录播放次数（用于触发缓存阈值机制）
    await localLyricCache.recordPlay(id);

    // 本地文件缓存检查不受 fixedVersion 限制，确保已缓存的 TTML 始终被优先使用
    // 优先走同步快速路径（内存命中时零 await 开销），miss 时再走异步文件读取
    logger.debug(`检查本地缓存: ${id}`);
    const localCached = localLyricCache.getCachedLyricSync(id) ?? await localLyricCache.getCachedLyric(id);
    this.checkAborted(signal);
    if (localCached) {
      logger.info(logger.msg('provider.local_hit', { id }));
      const result: SearchResult = { found: true, id, format: 'ttml', source: 'repository', content: localCached };
      lyricsCache.set(`search:${id}:ttml:normalized`, result);
      return result;
    }
    logger.debug(`本地缓存未命中: ${id}`);

    // 对 TTML 缓存键进行归一化，忽略 fallback/fast 参数差异，避免因参数微变导致缓存穿透
    const cacheKey = fixedVersionQuery === 'ttml'
      ? `search:${id}:ttml:normalized`
      : `search:${id}:${fixedVersionQuery || 'none'}:${fallbackQuery || 'none'}:${fast ? 'fast' : 'full'}`;
    const cachedResult = lyricsCache.get(cacheKey);
    if (cachedResult) {
      // lyricsCache 命中时，若为 TTML 且本地已有更新版本，优先返回本地版本
      if (cachedResult.found && cachedResult.format === 'ttml' && cachedResult.content) {
        const localVersion = localLyricCache.getCachedLyricSync(id);
        if (localVersion) {
          logger.info(logger.msg('provider.local_override_search', { id }));
          const result: SearchResult = { found: true, id, format: 'ttml', source: 'repository', content: localVersion };
          lyricsCache.set(`search:${id}:ttml:normalized`, result);
          return result;
        }
      }
      logger.info(logger.msg('provider.search_cache_hit', { id, key: cacheKey }));
      if (cachedResult.found && cachedResult.format === 'ttml' && cachedResult.content) {
        if (localLyricCache.shouldCache(id)) {
          const isCached = await localLyricCache.isCached(id);
          if (!isCached) {
            await localLyricCache.cacheLyric(id, cachedResult.content, 'main');
          }
        }
      }
      return cachedResult;
    }

    this.checkAborted(signal);

    if (isValidFormat(fixedVersionQuery)) {
      const result = await this.handleFixedVersionSearch(id, fixedVersionQuery, fast, signal);
      if (result.found) {
        lyricsCache.set(cacheKey, result);
      }
      return result;
    }

    logger.info(logger.msg('provider.search_start'));

    const TOTAL_TIMEOUT_MS = 6000;
    const controller = new AbortController();
    const overallTimeoutId = setTimeout(() => {
      logger.warn(logger.msg('provider.timeout', { timeout: TOTAL_TIMEOUT_MS }));
      controller.abort(new Error(`Search timed out after ${TOTAL_TIMEOUT_MS}ms`));
    }, TOTAL_TIMEOUT_MS);

    try {
      // 创建组合中断信号：HTTP请求中断 + 全局超时
      const combinedSignal = this.combineSignals(signal, controller.signal);
      
      const repoTask = this.findAllInRepo(id, fallbackQuery, combinedSignal);
      const externalApiTask = fast ? Promise.resolve(null as SearchResult | null) : this.findInExternalApi(id, combinedSignal);

      if (fast) {
        logger.info(logger.msg('provider.fast_mode_skip_external'));
      }

      const raceWithGlobalTimeout = <T>(task: Promise<T>, taskName: string): Promise<T> => {
        return Promise.race([
          task,
          new Promise<T>((_, reject) => {
            if (controller.signal.aborted) {
              return reject(controller.signal.reason || new Error(`${taskName} aborted due to pre-existing global timeout`));
            }
            controller.signal.addEventListener('abort', () => {
              reject(controller.signal.reason || new Error(`${taskName} aborted by global timeout`));
            });
          })
        ]);
      };

      const [repoResultSettled, externalApiResultSettled] = await Promise.allSettled([
        raceWithGlobalTimeout(repoTask, "Repository search"),
        raceWithGlobalTimeout(externalApiTask, "External API search")
      ]);

      clearTimeout(overallTimeoutId);

      let repoResultFromSettled: (SearchResult & { found: true }) | (SearchResult & { found: false }) | null = null;
      let externalResultFromSettled: (SearchResult & { found: true }) | (SearchResult & { found: false }) | null = null;

      if (repoResultSettled.status === 'fulfilled') {
        repoResultFromSettled = repoResultSettled.value;
      } else {
        logger.warn(logger.msg('provider.repo_task_failed', { error: (repoResultSettled.reason as Error)?.message || String(repoResultSettled.reason) }));
      }

      if (externalApiResultSettled.status === 'fulfilled') {
        externalResultFromSettled = externalApiResultSettled.value;
      } else {
        logger.warn(logger.msg('provider.external_task_failed', { error: (externalApiResultSettled.reason as Error)?.message || String(externalApiResultSettled.reason) }));
      }

      if (repoResultFromSettled?.found && repoResultFromSettled.format === 'ttml') {
        logger.info(logger.msg('provider.repo_hit_ttml', { id }));
        lyricsCache.set(cacheKey, repoResultFromSettled);
        // TTML 获取成功后，立即写入本地缓存
        if (localLyricCache.shouldCache(id)) {
          await localLyricCache.cacheLyric(id, repoResultFromSettled.content, 'main');
          logger.info(logger.msg('provider.local_cached', { id }));
        }
        return repoResultFromSettled;
      }

      if (repoResultFromSettled?.found) {
        logger.info(logger.msg('provider.repo_hit', { id, format: repoResultFromSettled.format.toUpperCase() }));
        lyricsCache.set(cacheKey, repoResultFromSettled);
        return repoResultFromSettled;
      }
      
      if (repoResultSettled.status === 'fulfilled') {
        this.logRepoOutcome(repoResultSettled as PromiseSettledResult<SearchResult | null>);
      } else {
        this.logRepoOutcome(repoResultSettled as PromiseSettledResult<null>); 
      }

      if (externalResultFromSettled?.found) {
        logger.info(logger.msg('provider.external_hit', { id, format: externalResultFromSettled.format.toUpperCase() }));
        lyricsCache.set(cacheKey, externalResultFromSettled);
        return externalResultFromSettled;
      }
      if (externalResultFromSettled && !externalResultFromSettled.found) {
        logger.info(logger.msg('provider.external_not_found', { id, error: externalResultFromSettled.error, status: externalResultFromSettled.statusCode }));
      }

      let finalErrorMsg = "Lyrics not found after checking all sources.";
      let finalStatusCode: number = 404;
      
      const errorsEncountered: string[] = [];
      let wasRepoSearchAttemptedAndFailed = true;
      let wasExternalSearchAttemptedAndFailed = true;

      if (repoResultSettled.status === 'fulfilled') {
        if (repoResultFromSettled && repoResultFromSettled.found) wasRepoSearchAttemptedAndFailed = false;
        else errorsEncountered.push(`Repo: ${repoResultFromSettled?.error || 'Not found or null result'}`);
        if (repoResultFromSettled?.statusCode && repoResultFromSettled.statusCode !== 200 && repoResultFromSettled.statusCode !== 404) {
            finalStatusCode = repoResultFromSettled.statusCode;
        }
      } else {
        errorsEncountered.push(`Repo Error: ${(repoResultSettled.reason as Error)?.message || String(repoResultSettled.reason)}`);
        if (controller.signal.reason === repoResultSettled.reason || (repoResultSettled.reason as Error)?.name === 'AbortError' || String(repoResultSettled.reason).toLowerCase().includes('timeout')) {
            finalStatusCode = 408;
        } else {
            finalStatusCode = (repoResultSettled.reason as any)?.statusCode || 500;
        }
      }

      if (externalApiResultSettled.status === 'fulfilled') {
        if (externalResultFromSettled && externalResultFromSettled.found) wasExternalSearchAttemptedAndFailed = false;
        else errorsEncountered.push(`External API: ${externalResultFromSettled?.error || 'Not found or null result'}`);
        if (wasRepoSearchAttemptedAndFailed && externalResultFromSettled?.statusCode && externalResultFromSettled.statusCode !== 200) {
          if (finalStatusCode === 404 || finalStatusCode === 408 || externalResultFromSettled.statusCode >= 500) {
            finalStatusCode = externalResultFromSettled.statusCode;
          }
        }
      } else {
        errorsEncountered.push(`External API Error: ${(externalApiResultSettled.reason as Error)?.message || String(externalApiResultSettled.reason)}`);
        if (wasRepoSearchAttemptedAndFailed) {
          if (controller.signal.reason === externalApiResultSettled.reason || (externalApiResultSettled.reason as Error)?.name === 'AbortError' || String(externalApiResultSettled.reason).toLowerCase().includes('timeout')) {
            if (finalStatusCode === 404) finalStatusCode = 408;
          } else {
            const externalRejectionStatusCode = (externalApiResultSettled.reason as any)?.statusCode;
            if (finalStatusCode === 404 || finalStatusCode === 408) finalStatusCode = externalRejectionStatusCode || 500;
          }
        }
      }

      if (wasRepoSearchAttemptedAndFailed && wasExternalSearchAttemptedAndFailed && errorsEncountered.length > 0) {
        finalErrorMsg = errorsEncountered.join('; ');
      } else if (controller.signal.aborted && controller.signal.reason instanceof Error && controller.signal.reason.message.startsWith("Search timed out")) {
        finalErrorMsg = controller.signal.reason.message;
        finalStatusCode = 408;
      }

      logger.info(logger.msg('provider.search_end', { id, error: finalErrorMsg, status: finalStatusCode }));
      return { found: false, id, error: finalErrorMsg, statusCode: finalStatusCode };

    } catch (error) {
      clearTimeout(overallTimeoutId);
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(logger.msg('provider.search_error', { id, message: err.message }), err);
      return {
        found: false,
        id,
        error: `Orchestrator error: ${err.message}`,
        statusCode: 500
      };
    }
  }

  private async handleFixedVersionSearch(id: string, fixedVersionQuery: LyricFormat, fast?: boolean, signal?: AbortSignal): Promise<SearchResult> {
    logger.info(logger.msg('provider.fixed_request', { id, format: fixedVersionQuery }));
    
    this.checkAborted(signal);
    
    const cacheKey = `fixed:${id}:${fixedVersionQuery}`;
    const cachedResult = lyricsCache.get(cacheKey);
    if (cachedResult) {
      logger.info(logger.msg('provider.fixed_cache_hit', { id, format: fixedVersionQuery }));
      return cachedResult;
    }

    if ((fixedVersionQuery === 'yrc' || fixedVersionQuery === 'lrc') && !fast) {
      logger.info(logger.msg('provider.fixed_parallel', { format: fixedVersionQuery }));

      const repoPromise = this.repoFetcher.fetch(id, fixedVersionQuery, signal);
      const externalPromise = this.externalFetcher.fetch(id, fixedVersionQuery, signal);

      const [repoFetchResultSettled, externalFetchResultSettled] = await Promise.allSettled([
        repoPromise,
        externalPromise
      ]);

      this.checkAborted(signal);

      if (repoFetchResultSettled.status === 'fulfilled' && repoFetchResultSettled.value.status === 'found') {
        const repoFetchResult = repoFetchResultSettled.value;
        const result: SearchResult = { 
          found: true as const, 
          id, 
          format: repoFetchResult.format, 
          source: 'repository', 
          content: repoFetchResult.content 
        };
        lyricsCache.set(cacheKey, result);
        return result;
      }

      if (externalFetchResultSettled.status === 'fulfilled' && externalFetchResultSettled.value.status === 'found') {
        const externalFetchResult = externalFetchResultSettled.value;
        const result: SearchResult = {
          found: true as const,
          id,
          format: externalFetchResult.format,
          source: 'external',
          content: externalFetchResult.content,
          translation: externalFetchResult.translation,
          romaji: externalFetchResult.romaji
        };
        lyricsCache.set(cacheKey, result);
        return result;
      }
      
      let finalErrorMsg = `Lyrics not found for fixed format ${fixedVersionQuery}.`;
      let finalStatusCode: number | undefined = 404;

      const repoOutcome = repoFetchResultSettled.status === 'fulfilled' ? repoFetchResultSettled.value : null;
      const externalOutcome = externalFetchResultSettled.status === 'fulfilled' ? externalFetchResultSettled.value : null;

      const repoError = repoFetchResultSettled.status === 'rejected' 
        ? repoFetchResultSettled.reason 
        : (repoOutcome?.status === 'error' ? repoOutcome.error : null);
      const externalError = externalFetchResultSettled.status === 'rejected' 
        ? externalFetchResultSettled.reason 
        : (externalOutcome?.status === 'error' ? externalOutcome.error : null);

      const repoStatusCode = repoOutcome?.status === 'error' 
        ? repoOutcome.statusCode 
        : (repoFetchResultSettled.status === 'rejected' ? 500 : null);
      const externalStatusCode = externalOutcome?.status === 'error' 
        ? externalOutcome.statusCode 
        : (externalFetchResultSettled.status === 'rejected' ? 500 : null);
      
      const errors: string[] = [];
      if (repoError) {
        const message = repoError instanceof Error ? repoError.message : String(repoError);
        errors.push(`Repo: ${message}`);
      }
      if (externalError) {
        const message = externalError instanceof Error ? externalError.message : String(externalError);
        errors.push(`External: ${message}`);
      }

      if (errors.length > 0) {
        finalErrorMsg = `Failed to fetch fixed format ${fixedVersionQuery}: ${errors.join('; ')}`;
        if (repoStatusCode && repoStatusCode >= 500) finalStatusCode = repoStatusCode;
        else if (externalStatusCode && externalStatusCode >= 500) finalStatusCode = externalStatusCode;
        else if (repoStatusCode) finalStatusCode = repoStatusCode; // 其他仓库错误码
        else if (externalStatusCode) finalStatusCode = externalStatusCode; // 其他外部API错误码
        else finalStatusCode = 500; // 如果没有具体错误码但有错误信息
      }
      
      return { found: false, id, error: finalErrorMsg, statusCode: finalStatusCode };

    } else { // 对于非 yrc/lrc 格式 (例如 ttml, qrc)，或 fast 模式下，只检查仓库
      logger.info(logger.msg('provider.fixed_repo_only', { format: fixedVersionQuery }));
      try {
        const repoResult = await this.repoFetcher.fetch(id, fixedVersionQuery, signal);
        if (repoResult.status === 'found') {
          const result: SearchResult = { 
            found: true as const, 
            id, 
            format: repoResult.format, 
            source: 'repository', 
            content: repoResult.content 
          };
          lyricsCache.set(cacheKey, result);
          
          // TTML 格式获取成功后，立即写入本地缓存，确保下次请求直接命中
          if (fixedVersionQuery === 'ttml' && localLyricCache.shouldCache(id)) {
            await localLyricCache.cacheLyric(id, repoResult.content, 'main');
            logger.info(logger.msg('provider.local_cached', { id }));
          }
          
          return result;
        }
        
        if (repoResult.status === 'error') {
          return { 
            found: false, 
            id, 
            error: `Repo fetch failed for fixed format ${fixedVersionQuery}: ${repoResult.error.message}`, 
            statusCode: repoResult.statusCode 
          };
        }
        // status === 'notfound'
        return { found: false, id, error: `Lyrics not found for fixed format: ${fixedVersionQuery}`, statusCode: 404 };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(logger.msg('provider.repo_error', { id, format: fixedVersionQuery, message: err.message }));
        return { 
          found: false, 
          id, 
          error: `Unexpected error during search: ${err.message}`, 
          statusCode: 500 
        };
      }
    }
  }

  private async findAllInRepo(id: string, _fallbackQuery: string | undefined, signal?: AbortSignal): Promise<SearchResult | null> {
    // 仓库中 ttml/yrc/lrc/eslrc 格式通常同时存在或同时缺失，
    // 因此只需检查 TTML（最高优先级）即可判断仓库是否有该歌曲的歌词。
    logger.info(logger.msg('provider.repo_ttml_probe', { id }));

    const ttmlCacheKey = `repo:${id}:ttml`;
    const cachedTtml = lyricsCache.get(ttmlCacheKey);
    if (cachedTtml && cachedTtml.status === 'found') {
      logger.info(logger.msg('provider.repo_ttml_cache_hit', { id }));
      return {
        found: true as const,
        id,
        format: cachedTtml.format,
        source: 'repository',
        content: cachedTtml.content
      };
    }

    try {
      const ttmlResult = await this.repoFetcher.fetch(id, 'ttml', signal);
      if (ttmlResult.status === 'found') {
        logger.info(logger.msg('provider.repo_ttml_hit', { id }));
        lyricsCache.set(ttmlCacheKey, ttmlResult);
        return {
          found: true as const,
          id,
          format: ttmlResult.format,
          source: 'repository',
          content: ttmlResult.content
        };
      }
      if (ttmlResult.status === 'error') {
        logger.warn(logger.msg('provider.repo_ttml_error', { id, message: ttmlResult.error.message }));
      } else {
        logger.info(logger.msg('provider.repo_ttml_not_found', { id }));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(logger.msg('provider.repo_ttml_exception', { id, message: msg }));
    }

    return null;
  }

  private async findInExternalApi(id: string, signal?: AbortSignal): Promise<SearchResult> {
    logger.info(logger.msg('provider.external_fallback', { id }));

    const cacheKey = `external:${id}:any`;
    const cachedResult = lyricsCache.get(cacheKey);
    if (cachedResult) {
      logger.info(logger.msg('provider.external_cache_hit', { id }));
      return cachedResult;
    }

    try {
      const externalResult = await this.externalFetcher.fetch(id, undefined, signal);
      
      if (externalResult.status === 'found') {
        const result: SearchResult = {
          found: true as const,
          id,
          format: externalResult.format,
          source: 'external',
          content: externalResult.content,
          translation: externalResult.translation,
          romaji: externalResult.romaji
        };
        
        lyricsCache.set(cacheKey, result);
        
        return result;
      }
      
      if (externalResult.status === 'error') {
        return { 
          found: false, 
          id, 
          error: `External API fallback failed: ${externalResult.error.message}`, 
          statusCode: externalResult.statusCode 
        };
      }
      
      logger.info(logger.msg('provider.external_no_lyrics', { id }));
      return { found: false, id, error: 'Lyrics not found in external API', statusCode: 404 };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(logger.msg('provider.external_exception', { id, message: err.message }));
      
      return {
        found: false,
        id,
        error: `External API error: ${err.message}`,
        statusCode: 502
      };
    }
  }

  private logRepoOutcome(repoResultSettled: PromiseSettledResult<SearchResult | null>) {
    if (repoResultSettled.status === 'rejected') {
      logger.error(logger.msg('provider.repo_outcome_rejected'), repoResultSettled.reason);
    } else if (repoResultSettled.value === null) {
      logger.info(logger.msg('provider.repo_outcome_null'));
    } else if (!repoResultSettled.value.found) {
      logger.info(logger.msg('provider.repo_outcome_not_found', { error: repoResultSettled.value.error }));
    }
    // If fulfilled and found, it was handled earlier.
  }
}

// --- Metadata Helper Functions ---

// 轻量级检查外部 API 中可用的歌词格式（不读取内容）
async function checkExternalFormatsAvailability(
  id: string,
  logger: BasicLogger
): Promise<{ formats: LyricFormat[]; hasTranslation: boolean; hasRomaji: boolean; error?: Error; statusCode?: number }> {
  const externalUrl = buildExternalApiUrl(id, process.env.EXTERNAL_NCM_API_URL);
  logger.debug?.(`Metadata: Checking external API formats: ${externalUrl}`);
  
  try {
    const externalResponse = await fetch(externalUrl);
    
    if (!externalResponse.ok) {
      logger.warn(`Metadata: External API check failed with status: ${externalResponse.status}`);
      return { 
        formats: [], 
        hasTranslation: false, 
        hasRomaji: false, 
        error: new Error(`External API failed with status ${externalResponse.status}`),
        statusCode: externalResponse.status
      };
    }

    const externalData = await externalResponse.json() as any;
    const availableFormats: LyricFormat[] = [];
    let hasTranslation = false;
    let hasRomaji = false;

    if (externalData?.lrc?.lyric) {
      availableFormats.push('lrc');
    }
    
    if (externalData?.yrc?.lyric) {
      availableFormats.push('yrc');
    }
    
    if (externalData?.tlyric?.lyric) {
      hasTranslation = true;
    }
    
    if (externalData?.romalrc?.lyric) {
      hasRomaji = true;
    }

    logger.debug?.(`Metadata: External API formats found: ${availableFormats.join(', ')}`);
    logger.debug?.(`Metadata: Translation: ${hasTranslation}, Romaji: ${hasRomaji}`);
    
    return { formats: availableFormats, hasTranslation, hasRomaji };
    
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn(`Metadata: External API formats check failed: ${err.message}`);
    
    return { 
      formats: [], 
      hasTranslation: false, 
      hasRomaji: false, 
      error: err,
      statusCode: 502
    };
  }
}

// 简化的 getLyricMetadata 函数 - 仓库格式共存，只需检查 TTML
export async function getLyricMetadata(
  id: string,
  options: {
    logger: BasicLogger;
    fast?: boolean;
  }
): Promise<LyricMetadataResult> {
  const { logger, fast } = options;
  logger.info(logger.msg('provider.metadata_query', { id }));

  const TOTAL_TIMEOUT_MS = 6000;

  const repoTask = checkRepoFormatExistence(id, 'ttml', logger)
    .then(result => ({
      type: 'repo' as const,
      exists: result.exists
    }))
    .catch(() => ({ type: 'repo' as const, exists: false }));

  const externalTask = fast
    ? Promise.resolve({
        type: 'external' as const,
        formats: [] as LyricFormat[],
        hasTranslation: false,
        hasRomaji: false,
        error: undefined as Error | undefined,
      })
    : checkExternalFormatsAvailability(id, logger)
        .then(result => ({ type: 'external' as const, ...result }))
        .catch(err => ({
          type: 'external' as const,
          formats: [] as LyricFormat[],
          hasTranslation: false,
          hasRomaji: false,
          error: err instanceof Error ? err : new Error(String(err))
        }));

  if (fast) {
    logger.info(logger.msg('metadata.fast_mode'));
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Metadata check timed out')), TOTAL_TIMEOUT_MS);
  });

  try {
    const results = await Promise.race([
      Promise.allSettled([repoTask, externalTask]),
      timeoutPromise
    ]);

    const foundFormats = new Set<LyricFormat>();
    let hasTranslation = false;
    let hasRomaji = false;
    let lastError: string | undefined;
    let lastStatusCode: number | undefined;

    for (const settled of results) {
      if (settled.status === 'rejected') continue;

      const result = settled.value;
      if (result.type === 'repo') {
        // 仓库中格式共存：TTML 存在则 ttml/yrc/lrc/eslrc 都存在
        if (result.exists) {
          foundFormats.add('ttml');
          foundFormats.add('yrc');
          foundFormats.add('lrc');
          foundFormats.add('eslrc');
        }
      } else if (result.type === 'external') {
        result.formats.forEach(f => foundFormats.add(f));
        hasTranslation = result.hasTranslation;
        hasRomaji = result.hasRomaji;
        if (result.error) {
          lastError = `External API error: ${result.error.message}`;
          lastStatusCode = (result as any).statusCode;
        }
      }
    }

    const availableFormats = Array.from(foundFormats);
    logger.info(logger.msg('metadata.check_complete', { count: availableFormats.length }));

    if (availableFormats.length > 0) {
      return {
        found: true,
        id,
        availableFormats,
        hasTranslation,
        hasRomaji,
      };
    }

    return {
      found: false,
      id,
      error: lastError || 'No lyric formats found in repository or external API.',
      statusCode: lastStatusCode || 404
    };

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const isTimeout = err.message.includes('timed out');

    logger.warn(logger.msg('metadata.timeout', { message: err.message }));
    return {
      found: false,
      id,
      error: isTimeout ? 'Metadata check timed out' : `Failed to check lyric metadata: ${err.message}`,
      statusCode: isTimeout ? 408 : 500
    };
  }
}

// 更新 checkRepoFormatExistence 函数以支持超时
async function checkRepoFormatExistence(
  id: string,
  format: LyricFormat,
  logger: BasicLogger
): Promise<{ format: LyricFormat; exists: boolean; error?: Error }> {
  const url = buildRawUrl(id, format);
  logger.debug?.(`Metadata: Checking repo existence for ${format.toUpperCase()}: ${url}`);
  
  try {
    // 设置 2 秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      logger.debug?.(`Metadata: Repo format ${format.toUpperCase()} exists`);
      return { format, exists: true };
    } else if (response.status === 404) {
      logger.debug?.(`Metadata: Repo format ${format.toUpperCase()} does not exist`);
      return { format, exists: false };
    } else {
      logger.warn(`Metadata: Repo format ${format.toUpperCase()} check returned status ${response.status}`);
      return { format, exists: false, error: new Error(`HTTP error ${response.status}`) };
    }
  } catch (err) {
    // 检查是否是超时错误
    if (err instanceof Error && err.name === 'AbortError') {
      logger.warn(`Metadata: Repo check for ${format} timed out after 2 seconds`);
      return { format, exists: false, error: new Error('Request timed out') };
    }
    
    const error = err instanceof Error ? err : new Error('Unknown fetch error');
    logger.error(`Metadata: Repo check for ${format} failed: ${error.message}`);
    return { format, exists: false, error };
  }
}