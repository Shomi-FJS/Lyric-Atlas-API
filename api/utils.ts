type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LOG_LEVELS: Record<LogLevel, { priority: number; label: string }> = {
  TRACE: { priority: 0, label: '跟踪' },
  DEBUG: { priority: 1, label: '调试' },
  INFO: { priority: 2, label: '信息' },
  WARN: { priority: 3, label: '警告' },
  ERROR: { priority: 4, label: '错误' },
  FATAL: { priority: 5, label: '致命' },
};

const LOG_MESSAGES: Record<string, Record<string, string>> = {
  'cache.initialized': {
    zh: "缓存 '{name}' 已初始化，TTL: {ttl}ms，最大容量: {maxSize}",
    en: "Cache '{name}' initialized with TTL: {ttl}ms, maxSize: {maxSize}"
  },
  'cache.cleanup_interval': {
    zh: "设置缓存清理间隔: {interval}ms",
    en: "Setting up cache cleanup interval: {interval}ms"
  },
  'cache.hit': {
    zh: "缓存命中: {key}",
    en: "Cache hit for key '{key}'"
  },
  'cache.set': {
    zh: "缓存设置: {key}",
    en: "Cache set for key '{key}'"
  },
  'cache.evict': {
    zh: "缓存淘汰: {key} (容量限制)",
    en: "Evicting oldest entry '{key}' due to size limit"
  },
  'cache.expired': {
    zh: "缓存过期: {key}",
    en: "Entry for key '{key}' expired"
  },
  'cache.cleanup': {
    zh: "清理了 {count} 个过期缓存条目",
    en: "Cleaned up {count} expired entries"
  },
  'cache.clear': {
    zh: "清除所有缓存条目",
    en: "Clearing all entries"
  },
  'devmode.initialized': {
    zh: "开发模式已初始化: {status}",
    en: "Dev mode initialized: {status}"
  },
  'devmode.using_file': {
    zh: "开发模式: 使用 lyrics-dev 文件: {id}",
    en: "Dev mode: Using lyrics-dev file for {id}"
  },
  'localcache.initialized': {
    zh: "本地歌词缓存已初始化",
    en: "Local lyric cache initialized"
  },
  'localcache.loaded_meta': {
    zh: "已加载缓存元数据，共 {count} 条记录",
    en: "Loaded cache meta with {count} entries"
  },
  'localcache.cache_hit': {
    zh: "本地缓存命中: {id}",
    en: "Local file cache hit for TTML: {id}"
  },
  'localcache.cached': {
    zh: "已缓存歌词: {id} (来源: {source})",
    en: "Cached lyric for {id} from {source}"
  },
  'localcache.deleted': {
    zh: "已删除缓存: {id}",
    en: "Deleted cache for {id}"
  },
  'localcache.cleaned_inactive': {
    zh: "已清理不活跃缓存: {id}",
    en: "Removed inactive lyric cache for {id}"
  },
  'localcache.play_recorded': {
    zh: "记录当前播放ID: {id}，播放次数: {count}",
    en: "Recorded play for {id}, count: {count}"
  },
  'provider.processing': {
    zh: "处理请求 ID: {id}，格式: {format}，回退: {fallback}",
    en: "Processing ID: {id}, fixed: {format}, fallback: {fallback}"
  },
  'provider.found_repo': {
    zh: "在仓库中找到歌词 (格式: {format})",
    en: "Found in repository (format: {format})"
  },
  'provider.found_external': {
    zh: "在外部API中找到歌词 (格式: {format})",
    en: "Found in external API (format: {format})"
  },
  'provider.not_found': {
    zh: "未找到歌词",
    en: "Lyrics not found"
  },
  'provider.search_start': {
    zh: "开始搜索流程，仓库TTML优先",
    en: "Starting standard search flow. TTML from repo has highest priority."
  },
  'provider.timeout': {
    zh: "搜索超时: {timeout}ms",
    en: "Search timed out globally after {timeout}ms"
  },
  'fetcher.attempting': {
    zh: "尝试获取: {url}",
    en: "Attempting fetch: {url}"
  },
  'fetcher.success': {
    zh: "获取成功: {format}",
    en: "Success for {format}"
  },
  'fetcher.parallel_ttml': {
    zh: "并行获取TTML: {main} 和 {user}",
    en: "Attempting parallel fetch for TTML: {main} and {user}"
  },
  'fetcher.success_main': {
    zh: "主仓库获取成功",
    en: "Success from main repo for TTML"
  },
  'fetcher.success_user': {
    zh: "用户歌词库获取成功",
    en: "Success from user-lyrics for TTML"
  },
  'fetcher.not_found': {
    zh: "未找到: {format}",
    en: "404 for {format}"
  },
  'fetcher.external_attempt': {
    zh: "尝试外部API回退",
    en: "Attempting fetch from external API"
  },
  'fetcher.external_found': {
    zh: "外部API找到歌词: {format}",
    en: "Found and filtered {format} lyrics"
  },
  'admin.settings_loaded': {
    zh: "已加载设置: devModeEnabled={status}",
    en: "Loaded settings: devModeEnabled={status}"
  },
  'admin.server_running': {
    zh: "缓存管理服务器运行中: {url}",
    en: "Cache Admin Server running on {url}"
  },
  'api.search_request': {
    zh: "搜索请求 - ID: {id}，格式: {format}，回退: {fallback}，快速: {fast}",
    en: "Search request - ID: {id}, Fixed: {format}, Fallback: {fallback}, Fast: {fast}"
  },
  'api.found': {
    zh: "找到歌词 ID: {id} - 格式: {format}，来源: {source}",
    en: "Lyrics found for ID: {id} - Format: {format}, Source: {source}"
  },
  'api.not_found': {
    zh: "未找到歌词 ID: {id} - 状态: {status}，错误: {error}",
    en: "Lyrics not found for ID: {id} - Status: {status}, Error: {error}"
  },
  'api.aborted': {
    zh: "搜索请求已取消: {id}",
    en: "Search request aborted for ID: {id}"
  },
  'api.running': {
    zh: "服务器运行中: {url}",
    en: "Server is running on {url}"
  },
  'error.config': {
    zh: "服务器配置错误: {message}",
    en: "Server configuration error: {message}"
  },
  'error.fetch': {
    zh: "获取失败: {message}",
    en: "Fetch failed: {message}"
  },
  'error.parse': {
    zh: "解析失败: {message}",
    en: "Parse error: {message}"
  },
  'error.network': {
    zh: "网络错误: {message}",
    en: "Network error: {message}"
  },
};

function getLogLanguage(): 'zh' | 'en' {
  const lang = process.env.LOG_LANGUAGE?.toLowerCase();
  if (lang === 'en') return 'en';
  return 'zh';
}

function formatMessage(key: string, params: Record<string, any> = {}): string {
  const lang = getLogLanguage();
  const template = LOG_MESSAGES[key]?.[lang] || LOG_MESSAGES[key]?.['en'] || key;
  
  return template.replace(/\{(\w+)\}/g, (_, param) => {
    return params[param] !== undefined ? String(params[param]) : `{${param}}`;
  });
}

export function getLogger(category: string) {
  const log = (level: LogLevel, ...args: any[]) => {
    const levelInfo = LOG_LEVELS[level];
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}][${levelInfo.label}][${category}]`;
    console[level.toLowerCase() as 'trace' | 'debug' | 'info' | 'warn' | 'error'](prefix, ...args);
  };

  return {
    trace: (...args: any[]) => log('TRACE', ...args),
    debug: (...args: any[]) => log('DEBUG', ...args),
    info: (...args: any[]) => log('INFO', ...args),
    warn: (...args: any[]) => log('WARN', ...args),
    error: (...args: any[]) => log('ERROR', ...args),
    fatal: (...args: any[]) => log('FATAL', ...args),
    msg: formatMessage,
  };
}

const utilsLogger = getLogger('Utils');

export type LyricFormat = 'ttml' | 'yrc' | 'lrc' | 'eslrc' | 'tlyric' | 'romalrc';

export const ALLOWED_FORMATS: LyricFormat[] = ['ttml', 'yrc', 'lrc', 'eslrc', 'tlyric', 'romalrc'];

// Default *fallback* order, excluding ttml initially
export const DEFAULT_FALLBACK_ORDER: LyricFormat[] = ['yrc', 'lrc', 'eslrc'];

export const isValidFormat = (format: string | undefined | null): format is LyricFormat => {
  if (!format) return false;
  return ALLOWED_FORMATS.includes(format as LyricFormat);
};

export const buildRawUrl = (id: string, format: LyricFormat): string => {
  const sanitizedId = encodeURIComponent(id);
  const baseUrl = 'https://amlldb.bikonoo.com/ncm-lyrics/';
  return `${baseUrl}${sanitizedId}.${format}`;
};

export const buildUserLyricUrl = (id: string): string => {
  const sanitizedId = encodeURIComponent(id);
  return `https://raw.githubusercontent.com/Shomi-FJS/amll-ttml-db/main/user-lyrics/${sanitizedId}.ttml`;
};

// buildExternalApiUrl now relies on EXTERNAL_API_BASE_URL being set externally
export const buildExternalApiUrl = (id: string, externalApiBaseUrl: string | undefined): string => {
  if (!externalApiBaseUrl) {
    // Log this error
    utilsLogger.error("External API base URL is not configured when building URL.");
    throw new Error("External API base URL is not configured.");
  }
  return `${externalApiBaseUrl}?id=${encodeURIComponent(id)}`;
}

// Define a regex to match typical LRC/YRC timestamp lines
export const LYRIC_LINE_REGEX = /^\[(?:\d{2}:\d{2}\.\d{2,3}|\d+,\d+)\]/;

// Helper function to extract valid lyric lines
export const filterLyricLines = (rawLyrics: string | undefined | null): string | null => {
  if (!rawLyrics) {
    return null;
  }
  const lines = rawLyrics.split('\n');
  const filteredLines = lines.filter(line => LYRIC_LINE_REGEX.test(line.trim()));
  return filteredLines.length > 0 ? filteredLines.join('\n') : null;
};
