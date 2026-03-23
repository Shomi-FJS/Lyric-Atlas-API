import {
  LyricFormat,
  buildExternalApiUrl,
  filterLyricLines,
  getLogger,
} from '../utils';
import type { FetchResult } from '../interfaces/lyricTypes';
import type { ExternalLyricFetcher } from '../interfaces/fetcher';

const logger = getLogger('ExternalApiFetcher');

const FETCH_TIMEOUT_MS = 5000;

export class ExternalApiFetcher implements ExternalLyricFetcher {
  constructor(private externalApiBaseUrl: string | undefined) {}

  async fetch(id: string, specificFormat?: 'yrc' | 'lrc', signal?: AbortSignal): Promise<FetchResult & { translation?: string; romaji?: string }> {
    if (!this.externalApiBaseUrl) {
      logger.error(logger.msg('fetcher.external_no_url'));
      return { status: 'error', statusCode: 500, error: new Error('External API is not configured.') };
    }

    if (signal?.aborted) {
      return { status: 'error', error: new Error('Request aborted') };
    }

    const externalUrl = buildExternalApiUrl(id, this.externalApiBaseUrl);
    logger.info(logger.msg('fetcher.external_fetch', { id, url: externalUrl }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    const abortHandler = () => controller.abort();
    signal?.addEventListener('abort', abortHandler);

    try {
      const externalResponse = await fetch(externalUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);

      if (signal?.aborted) {
        return { status: 'error', error: new Error('Request aborted') };
      }

      if (!externalResponse.ok) {
        logger.error(logger.msg('fetcher.external_failed', { id, status: externalResponse.status }));
        return { status: 'error', statusCode: 502, error: new Error(`External API failed with status ${externalResponse.status}`) };
      }

      let externalData: any;
      try {
        externalData = await externalResponse.json();
      } catch (parseError) {
        logger.error(logger.msg('fetcher.external_parse_error', { id }), parseError);
        return { status: 'error', statusCode: 502, error: new Error('External API returned invalid JSON.') };
      }

      const translationRaw = filterLyricLines(externalData?.tlyric?.lyric);
      const translation = translationRaw === null ? undefined : translationRaw;
      logger.debug(logger.msg('fetcher.external_translation', { found: translation ? '已找到' : '未找到' }));

      const romajiRaw = filterLyricLines(externalData?.romalrc?.lyric);
      const romaji = romajiRaw === null ? undefined : romajiRaw;
      logger.debug(logger.msg('fetcher.external_romaji', { found: romaji ? '已找到' : '未找到' }));

      let foundFormat: LyricFormat | undefined;
      let foundContent: string | undefined;

      const formatsToTry: (LyricFormat | undefined)[] = specificFormat
        ? [specificFormat]
        : ['yrc', 'lrc'];

      for (const format of formatsToTry) {
        if (!format) continue;
        const key = format === 'yrc' ? 'yrc' : 'lrc';
        const filteredContent = filterLyricLines(externalData?.[key]?.lyric);
        if (filteredContent) {
          logger.info(logger.msg('fetcher.external_hit', { format: format.toUpperCase(), id }));
          foundFormat = format;
          foundContent = filteredContent;
          break;
        }
      }

      if (foundFormat && foundContent) {
        return { status: 'found', format: foundFormat, source: 'external', content: foundContent, translation, romaji };
      }

      logger.info(logger.msg('fetcher.external_no_lyrics', { id, format: specificFormat ? ` (格式: ${specificFormat})` : '' }));
      return { status: 'notfound', format: specificFormat };

    } catch (externalFetchError: any) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      
      if (signal?.aborted || controller.signal.aborted) {
        logger.debug(`外部API请求被中断: ${id}`);
        return { status: 'error', error: new Error('Request aborted') };
      }
      
      logger.error(logger.msg('fetcher.external_network_error', { id }), externalFetchError);
      const error = externalFetchError instanceof Error ? externalFetchError : new Error('Unknown external fetch error');
      return { status: 'error', statusCode: 502, error };
    }
  }
}
