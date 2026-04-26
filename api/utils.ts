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
  'localcache.play_debounced': {
    zh: "播放去抖，忽略重复计数: {id}",
    en: "Play debounced, skipping duplicate count for {id}"
  },
  'localcache.request_counts_loaded': {
    zh: "已加载 TTML 请求计数: {count} 条",
    en: "Loaded TTML request counts: {count} entries"
  },
  'localcache.save_request_counts_failed': {
    zh: "保存 TTML 请求计数失败",
    en: "Failed to save TTML request counts"
  },
  'localcache.ttml_request_recorded': {
    zh: "记录 TTML 请求: {id}，累计次数: {count}",
    en: "Recorded TTML request for {id}, count: {count}"
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
  'fetcher.success_repo': {
    zh: "用户歌词库获取成功",
    en: "Success from repo for TTML"
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
  'api.search_error': {
    zh: "搜索时发生意外错误 ID: {id} - {message}",
    en: "Unexpected error during search for ID: {id} - {message}"
  },
  'api.metadata_request': {
    zh: "收到元数据请求 ID: {id}, 快速: {fast}",
    en: "Received metadata request for ID: {id}, Fast: {fast}"
  },
  'api.metadata_found': {
    zh: "找到元数据 ID: {id}, 格式: {formats}",
    en: "Found metadata for ID: {id}, Formats: {formats}"
  },
  'api.metadata_not_found': {
    zh: "未找到元数据 ID: {id}. 状态: {status}, 错误: {error}",
    en: "Metadata not found or error for ID: {id}. Status: {status}, Error: {error}"
  },
  'api.ttml_304': {
    zh: "TTML 304 未修改 ID: {id}",
    en: "TTML 304 Not Modified for ID: {id}"
  },
  'api.ttml_request': {
    zh: "TTML 直接访问请求 ID: {id}",
    en: "TTML direct access request for ID: {id}"
  },
  'api.ttml_fetch_error': {
    zh: "获取 TTML 失败 ID: {id} - {message}",
    en: "Error fetching TTML for ID: {id} - {message}"
  },
  'api.provider_init': {
    zh: "LyricProvider 单例已初始化",
    en: "LyricProvider singleton initialized"
  },
  'api.external_url_not_set': {
    zh: "EXTERNAL_NCM_API_URL 未设置，外部 API 回退将不可用",
    en: "EXTERNAL_NCM_API_URL is not set. External API fallback will be unavailable."
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
  // --- LyricService 搜索流程 ---
  'provider.local_hit': {
    zh: "[命中本地缓存] {id}",
    en: "[Local cache hit] {id}"
  },
  'provider.local_override_search': {
    zh: "[命中本地缓存(覆盖搜索缓存)] {id}",
    en: "[Local cache hit (overriding search cache)] {id}"
  },
  'provider.local_cached': {
    zh: "[已写入本地缓存] {id}",
    en: "[Written to local cache] {id}"
  },
  'provider.search_cache_hit': {
    zh: "[命中搜索结果缓存] {id} (key: {key})",
    en: "[Search cache hit] {id} (key: {key})"
  },
  'provider.fast_mode_skip_external': {
    zh: "快速模式已启用，跳过外部API回退",
    en: "Fast mode enabled, skipping external API fallback"
  },
  'provider.repo_task_failed': {
    zh: "仓库搜索任务失败或超时: {error}",
    en: "Repository search task failed or timed out: {error}"
  },
  'provider.external_task_failed': {
    zh: "外部API搜索任务失败或超时: {error}",
    en: "External API search task failed or timed out: {error}"
  },
  'provider.repo_hit_ttml': {
    zh: "[命中仓库] TTML {id}",
    en: "[Repo hit] TTML {id}"
  },
  'provider.repo_hit': {
    zh: "[命中仓库] {format} {id}",
    en: "[Repo hit] {format} {id}"
  },
  'provider.external_hit': {
    zh: "[命中外部API] {format} {id}",
    en: "[External API hit] {format} {id}"
  },
  'provider.external_not_found': {
    zh: "[外部API] 未找到歌词 {id} (error: {error}, status: {status})",
    en: "[External API] No lyrics found for {id} (error: {error}, status: {status})"
  },
  'provider.search_end': {
    zh: "[搜索结束] {id} - 错误: \"{error}\", status: {status}",
    en: "[Search end] {id} - error: \"{error}\", status: {status}"
  },
  'provider.search_error': {
    zh: "[搜索异常] {id}: {message}",
    en: "[Search exception] {id}: {message}"
  },
  'provider.fixed_request': {
    zh: "[固定格式请求] {id}, 格式: {format}",
    en: "[Fixed format request] {id}, format: {format}"
  },
  'provider.fixed_cache_hit': {
    zh: "[命中搜索结果缓存] {id} (fixed: {format})",
    en: "[Search cache hit] {id} (fixed: {format})"
  },
  'provider.fixed_parallel': {
    zh: "[固定格式 {format}] 并行查询仓库和外部API",
    en: "[Fixed format {format}] Parallel query repo and external API"
  },
  'provider.fixed_repo_only': {
    zh: "[固定格式 {format}] 仅查询仓库",
    en: "[Fixed format {format}] Repo only"
  },
  'provider.repo_error': {
    zh: "[仓库请求失败] {id} 格式 {format}: {message}",
    en: "[Repo request failed] {id} format {format}: {message}"
  },
  'provider.repo_ttml_probe': {
    zh: "[仓库搜索] 检查 TTML（格式共存，TTML 作为探测） {id}",
    en: "[Repo search] Checking TTML (coexistent formats, TTML as probe) {id}"
  },
  'provider.repo_ttml_cache_hit': {
    zh: "[命中搜索结果缓存] {id} (repo:ttml)",
    en: "[Search cache hit] {id} (repo:ttml)"
  },
  'provider.repo_ttml_hit': {
    zh: "[命中仓库] TTML {id}",
    en: "[Repo hit] TTML {id}"
  },
  'provider.repo_ttml_error': {
    zh: "[仓库错误] 获取 TTML 失败 {id}: {message}",
    en: "[Repo error] Failed to fetch TTML {id}: {message}"
  },
  'provider.repo_ttml_not_found': {
    zh: "[仓库] TTML 未找到 {id}，跳过其他仓库格式（格式共存）",
    en: "[Repo] TTML not found for {id}, skipping other repo formats (coexistent formats)"
  },
  'provider.repo_ttml_exception': {
    zh: "[仓库异常] 获取 TTML 出错 {id}: {message}",
    en: "[Repo exception] Error fetching TTML {id}: {message}"
  },
  'provider.external_fallback': {
    zh: "[外部API回退] {id}",
    en: "[External API fallback] {id}"
  },
  'provider.external_cache_hit': {
    zh: "[命中搜索结果缓存] {id} (external)",
    en: "[Search cache hit] {id} (external)"
  },
  'provider.external_no_lyrics': {
    zh: "[外部API] 未找到可用歌词 {id}",
    en: "[External API] No usable lyrics found for {id}"
  },
  'provider.external_exception': {
    zh: "[外部API异常] {id}: {message}",
    en: "[External API exception] {id}: {message}"
  },
  'provider.repo_outcome_rejected': {
    zh: "[仓库搜索] Promise 被 reject",
    en: "[Repo search] Promise rejected"
  },
  'provider.repo_outcome_null': {
    zh: "[仓库搜索] 未找到适用的格式或歌词",
    en: "[Repo search] No applicable formats or lyrics found"
  },
  'provider.repo_outcome_not_found': {
    zh: "[仓库搜索] 未找到歌词 (错误: {error})",
    en: "[Repo search] No lyrics found (error: {error})"
  },
  'provider.metadata_query': {
    zh: "[元数据查询] {id}",
    en: "[Metadata query] {id}"
  },
  // --- RepositoryFetcher ---
  'fetcher.local_hit': {
    zh: "[命中本地缓存] {id}",
    en: "[Local cache hit] {id}"
  },
  'fetcher.parallel_ttml_urls': {
    zh: "[并行拉取 TTML] {id}: {urls}",
    en: "[Parallel TTML fetch] {id}: {urls}"
  },
  'fetcher.mirror_hit': {
    zh: "[命中{source}] {id} ({url})",
    en: "[Hit {source}] {id} ({url})"
  },
  'fetcher.all_mirrors_missed': {
    zh: "[所有镜像源均未命中] {id}",
    en: "[All mirrors missed] {id}"
  },
  'fetcher.network_error': {
    zh: "[网络错误] {format}",
    en: "[Network error] {format}"
  },
  'fetcher.fetch_format': {
    zh: "[拉取 {format}] {id}: {url}",
    en: "[Fetching {format}] {id}: {url}"
  },
  'fetcher.fetch_success': {
    zh: "[拉取成功] {format} {id} (status: {status})",
    en: "[Fetch success] {format} {id} (status: {status})"
  },
  'fetcher.fetch_404': {
    zh: "[404] {format} {id}",
    en: "[404] {format} {id}"
  },
  'fetcher.request_failed': {
    zh: "[请求失败] {format} {id} (HTTP {status})",
    en: "[Request failed] {format} {id} (HTTP {status})"
  },
  'fetcher.network_error_id': {
    zh: "[网络错误] {format} {id}",
    en: "[Network error] {format} {id}"
  },
  // --- ExternalApiFetcher ---
  'fetcher.external_no_url': {
    zh: "[外部API] 未配置基础 URL",
    en: "[External API] Base URL not configured"
  },
  'fetcher.external_fetch': {
    zh: "[拉取外部API] {id}: {url}",
    en: "[Fetching external API] {id}: {url}"
  },
  'fetcher.external_failed': {
    zh: "[外部API失败] {id} (status: {status})",
    en: "[External API failed] {id} (status: {status})"
  },
  'fetcher.external_parse_error': {
    zh: "[外部API] JSON 解析失败 {id}",
    en: "[External API] JSON parse failed {id}"
  },
  'fetcher.external_translation': {
    zh: "[外部API] 翻译歌词: {found}",
    en: "[External API] Translation lyrics: {found}"
  },
  'fetcher.external_romaji': {
    zh: "[外部API] 罗马音歌词: {found}",
    en: "[External API] Romaji lyrics: {found}"
  },
  'fetcher.external_hit': {
    zh: "[命中外部API] {format} {id}",
    en: "[External API hit] {format} {id}"
  },
  'fetcher.external_no_lyrics': {
    zh: "[外部API] 未找到可用歌词 {id}{format}",
    en: "[External API] No usable lyrics found for {id}{format}"
  },
  'fetcher.external_network_error': {
    zh: "[外部API] 网络错误 {id}",
    en: "[External API] Network error {id}"
  },
  // --- LocalLyricCache ---
  'localcache.dir_created': {
    zh: "创建缓存目录: {dir}",
    en: "Cache directory created: {dir}"
  },
  'localcache.cache_failed': {
    zh: "缓存歌词失败 {id}",
    en: "Failed to cache lyric {id}"
  },
  'localcache.delete_failed': {
    zh: "删除缓存失败 {id}",
    en: "Failed to delete cache {id}"
  },
  'localcache.cleanup_failed': {
    zh: "清理缓存失败 {id}",
    en: "Failed to cleanup cache {id}"
  },
  'localcache.rebuild_start': {
    zh: "[重建索引] 开始扫描 lyrics-cache 目录",
    en: "[Rebuild index] Starting to scan lyrics-cache directory"
  },
  'localcache.rebuild_added': {
    zh: "[{total}] {id} - 新增 ({song})",
    en: "[{total}] {id} - Added ({song})"
  },
  'localcache.rebuild_updated': {
    zh: "[{total}] {id} - 已更新 ({song})",
    en: "[{total}] {id} - Updated ({song})"
  },
  'localcache.rebuild_removed': {
    zh: "[清理] {id} - 已移除（文件不存在）",
    en: "[Cleanup] {id} - Removed (file not found)"
  },
  'localcache.rebuild_end': {
    zh: "[重建索引] 完成 - 总计: {total}, 新增: {added}, 更新: {updated}, 移除: {removed}",
    en: "[Rebuild index] Done - Total: {total}, Added: {added}, Updated: {updated}, Removed: {removed}"
  },
  'localcache.update_speedtest': {
    zh: "[更新缓存] 开始测速 {count} 个源（使用 {probeId} 探测）",
    en: "[Update cache] Speed testing {count} sources (probe with {probeId})"
  },
  'localcache.update_speedtest_result': {
    zh: "[更新缓存] 测速完成 - 选择「{name}」（{ms}ms）",
    en: "[Update cache] Speed test done - Selected \"{name}\" ({ms}ms)"
  },
  'localcache.update_start': {
    zh: "[更新缓存] 开始从「{name}」更新 {total} 个文件",
    en: "[Update cache] Starting to update {total} files from \"{name}\""
  },
  'localcache.update_skip_no_file': {
    zh: "[{processed}/{total}] {id} - 跳过（本地文件不存在）",
    en: "[{processed}/{total}] {id} - Skipped (local file not found)"
  },
  'localcache.update_not_found': {
    zh: "[{processed}/{total}] {id} - 未找到",
    en: "[{processed}/{total}] {id} - Not found"
  },
  'localcache.update_rename_skip': {
    zh: "[{processed}/{total}] {id} - 更名跳过（{target}.ttml 已存在）",
    en: "[{processed}/{total}] {id} - Rename skipped ({target}.ttml already exists)"
  },
  'localcache.update_renamed': {
    zh: "[{processed}/{total}] {id} - 已更名 → {target}.ttml",
    en: "[{processed}/{total}] {id} - Renamed → {target}.ttml"
  },
  'localcache.update_content_updated': {
    zh: "[{processed}/{total}] {id} - 内容已更新",
    en: "[{processed}/{total}] {id} - Content updated"
  },
  'localcache.update_skipped': {
    zh: "[{processed}/{total}] {id} - 跳过",
    en: "[{processed}/{total}] {id} - Skipped"
  },
  'localcache.update_error': {
    zh: "[{processed}/{total}] {id} - 错误",
    en: "[{processed}/{total}] {id} - Error"
  },
  'localcache.update_end': {
    zh: "[更新缓存] 完成 [{name}] - 更新: {updated}, 更名: {renamed}, 未找到: {notFound}, 跳过: {skipped}, 错误: {errors}",
    en: "[Update cache] Done [{name}] - Updated: {updated}, Renamed: {renamed}, Not found: {notFound}, Skipped: {skipped}, Errors: {errors}"
  },
  'localcache.update_all_unavailable': {
    zh: "[更新缓存] 所有镜像源均不可用，取消更新",
    en: "[Update cache] All mirrors unavailable, update cancelled"
  },
  'localcache.update_source_detail': {
    zh: "  {name}: {detail}",
    en: "  {name}: {detail}"
  },
  'localcache.init_failed': {
    zh: "初始化本地歌词缓存失败",
    en: "Failed to initialize local lyric cache"
  },
  'localcache.save_meta_failed': {
    zh: "保存缓存元数据失败",
    en: "Failed to save cache meta"
  },
  'localcache.parse_failed': {
    zh: "rebuildMeta: 解析文件失败 {file}",
    en: "rebuildMeta: Failed to parse file {file}"
  },
  'localcache.periodic_maintenance': {
    zh: "开始定期维护...",
    en: "Starting periodic maintenance..."
  },
  'localcache.inactive_cleanup_skipped': {
    zh: "已跳过未活跃清理（开关已关闭）",
    en: "Inactive cleanup skipped (toggle disabled)"
  },
  'localcache.periodic_updated': {
    zh: "定期更新: {count} 个歌词已从远程更新",
    en: "Periodic update: {count} lyric(s) updated from remote"
  },
  'localcache.periodic_failed': {
    zh: "定期更新检查失败",
    en: "Periodic update check failed"
  },
  'localcache.check_update': {
    zh: "Updated lyric for {id}",
    en: "Updated lyric for {id}"
  },
  'localcache.check_update_failed': {
    zh: "检查更新失败 {id}",
    en: "Failed to check update for {id}"
  },
  // --- CacheAdmin ---
  'admin.settings_not_found': {
    zh: "未找到设置文件，使用默认值",
    en: "Settings file not found, using defaults"
  },
  'admin.create_dev_dir_failed': {
    zh: "创建 lyrics-dev 目录失败",
    en: "Failed to create lyrics-dev directory"
  },
  'admin.cache_deleted': {
    zh: "已删除缓存: {id}",
    en: "Cache deleted: {id}"
  },
  'admin.cache_uploaded': {
    zh: "已上传缓存: {id}",
    en: "Cache uploaded: {id}"
  },
  'admin.auto_extract_id': {
    zh: "自动提取网易云 ID: {id}",
    en: "Auto-extracted NCM ID: {id}"
  },
  'admin.dev_uploaded': {
    zh: "已上传开发文件: {id}",
    en: "Dev file uploaded: {id}"
  },
  'admin.dev_deleted': {
    zh: "已删除开发文件: {id}",
    en: "Dev file deleted: {id}"
  },
  'admin.dev_mode_toggled': {
    zh: "开发模式{status}",
    en: "Dev mode {status}"
  },
  'admin.inactive_cleanup_toggled': {
    zh: "未活跃歌词清理（{days}天）{status}",
    en: "Inactive lyric cleanup ({days}d) {status}"
  },
  'admin.toggle_inactive_cleanup_failed': {
    zh: "切换未活跃清理开关失败",
    en: "Failed to toggle inactive cleanup"
  },
  'admin.rebuild_complete': {
    zh: "元数据重建完成: total={total}, added={added}, updated={updated}, removed={removed}",
    en: "Meta rebuild complete: total={total}, added={added}, updated={updated}, removed={removed}"
  },
  'admin.update_complete': {
    zh: "缓存更新完成: updated={updated}, renamed={renamed}, notFound={notFound}",
    en: "Cache update complete: updated={updated}, renamed={renamed}, notFound={notFound}"
  },
  'admin.get_cache_list_failed': {
    zh: "获取缓存列表失败",
    en: "Failed to get cache list"
  },
  'admin.delete_cache_failed': {
    zh: "删除缓存失败",
    en: "Failed to delete cache"
  },
  'admin.upload_cache_failed': {
    zh: "上传缓存失败",
    en: "Failed to upload cache"
  },
  'admin.rebuild_meta_failed': {
    zh: "重建元数据失败",
    en: "Failed to rebuild meta"
  },
  'admin.update_cache_failed': {
    zh: "缓存更新失败",
    en: "Failed to update cache"
  },
  'admin.toggle_dev_failed': {
    zh: "更新开发模式失败",
    en: "Failed to toggle dev mode"
  },
  'admin.get_dev_list_failed': {
    zh: "获取开发文件列表失败",
    en: "Failed to get dev file list"
  },
  'admin.upload_dev_failed': {
    zh: "上传开发文件失败",
    en: "Failed to upload dev file"
  },
  'admin.delete_dev_failed': {
    zh: "删除开发文件失败",
    en: "Failed to delete dev file"
  },
  'admin.read_dev_failed': {
    zh: "读取开发文件失败",
    en: "Failed to read dev file"
  },
  'admin.clear_memory_done': {
    zh: "已清空内存缓存（搜索缓存 + 元数据缓存），未触及文件缓存",
    en: "In-memory caches (search + metadata) cleared; file cache untouched"
  },
  'admin.clear_memory_failed': {
    zh: "清空内存缓存失败",
    en: "Failed to clear in-memory caches"
  },
  'admin.reset_request_counts_done': {
    zh: "已重置 TTML 请求计数",
    en: "TTML request counts reset"
  },
  'admin.reset_request_counts_failed': {
    zh: "重置 TTML 请求计数失败",
    en: "Failed to reset TTML request counts"
  },
  'localcache.init_skipped': {
    zh: "本地缓存初始化跳过（Edge Runtime 预期行为）: {message}",
    en: "Local cache init skipped (expected on Edge Runtime): {message}"
  },
  'api.metadata_handler_error': {
    zh: "元数据处理器异常 ID: {id} - {message}",
    en: "Unexpected error during API metadata handler for ID: {id} - {message}"
  },
  'httpclient.retry': {
    zh: "重试 {attempt}/{retries} - {url}",
    en: "Retry {attempt}/{retries} for {url}"
  },
  'httpclient.request_failed': {
    zh: "请求失败 {url}: {message}",
    en: "Request failed for {url}: {message}"
  },
  'httpclient.fetch_failed': {
    zh: "获取失败 {url}: {message}",
    en: "Fetch failed for {url}: {message}"
  },
  'cache.invalidate': {
    zh: "使缓存条目失效: {key}",
    en: "Invalidating key '{key}'"
  },
  // --- Metadata ---
  'metadata.fast_mode': {
    zh: "快速模式已启用，跳过外部API检查",
    en: "Fast mode enabled, skipping external API check"
  },
  'metadata.check_complete': {
    zh: "检查完成，找到 {count} 个格式",
    en: "Check completed with {count} formats found"
  },
  'metadata.timeout': {
    zh: "元数据检查超时: {message}",
    en: "Metadata check timed out: {message}"
  },
  'metadata.error': {
    zh: "元数据检查失败: {message}",
    en: "Metadata check failed: {message}"
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

export const buildMirrorUrls = (id: string, format: LyricFormat): string[] => {
  const sanitizedId = encodeURIComponent(id);
  return [
    `https://amll.mirror.dimeta.top/api/db/ncm-lyrics/${sanitizedId}.${format}`,
    `https://amll-ttml-db.gbclstudio.cn/ncm-lyrics/${sanitizedId}.${format}`,
  ];
};

// buildExternalApiUrl now relies on EXTERNAL_API_BASE_URL being set externally
export const buildExternalApiUrl = (id: string, externalApiBaseUrl: string | undefined): string => {
  if (!externalApiBaseUrl) {
    utilsLogger.error(utilsLogger.msg('error.config', { message: "External API base URL is not configured" }));
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
