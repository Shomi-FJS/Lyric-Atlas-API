# TTML 缓存失效修复报告

## 问题概述

在本地已缓存 TTML 数据的情况下，查询 TTML 数据时缓存未生效，导致每次请求都穿透到远程仓库获取数据。远程返回的内容可能与本地缓存版本不同，表现为"缓存被默认替代"。

## 根因分析

经过完整代码审计，定位到以下 6 个深层原因：

### 原因 1：API 响应完全没有 HTTP 缓存头

TTML 直访问问端点 (`/api/ncm-lyrics/:id`) 仅设置了 `Content-Type`，没有设置 `Cache-Control`、`ETag`、`Last-Modified`、`Expires` 等任何缓存控制头。

**影响**：浏览器和 CDN 对每次请求都视为全新请求，无法利用 HTTP 层缓存，每次都穿透到服务端。

### 原因 2：本地文件缓存检查被 `fixedVersion` 参数限制

`lyricService.ts` 中本地文件缓存检查被 `if (fixedVersionQuery === 'ttml')` 包裹。当客户端请求的 `fixedVersion` 参数缺失或不是 `'ttml'` 时，即使本地文件有缓存也会被跳过，直接穿透到远程获取。

**影响**：参数不一致时，本地缓存完全失效。

### 原因 3：`PLAY_COUNT_THRESHOLD = 2` 导致首次请求不缓存

本地文件缓存的写入条件要求歌曲被请求至少 2 次（`playCount >= 2`）。但如果两次请求间隔超过内存缓存 TTL（60 分钟），第二次请求又会重新走远程获取，永远无法满足写入条件。

**影响**：新歌曲即使频繁请求也可能永远无法写入本地文件缓存。

### 原因 4：`checkForUpdates()` 已实现但从未被调用

`LocalLyricCache.checkForUpdates()` 方法已实现（通过 MD5 哈希比对远程内容与本地缓存），但定时器 `startUpdateCheck()` 中仅执行了 `cleanupInactive()`，没有调用 `checkForUpdates()`。

**影响**：远程仓库更新歌词后，本地缓存永远保持旧版本。

### 原因 5：内存缓存容量偏小 + LRU 淘汰

`lyricsCache` 的 `maxSize` 仅为 2000 条，`metadataCache` 为 3000 条。在高频请求场景下，热门歌曲可能被 LRU 淘汰，迫使重新请求远程。

**影响**：高并发时缓存命中率下降。

### 原因 6：缓存键包含 `fallback` 和 `fast` 参数

缓存键格式为 `search:{id}:{format}:{fallback}:{fast}`，其中 `fallback` 和 `fast` 参数的微小变化会产生不同的 key，导致缓存穿透。

**影响**：同一首歌因请求参数差异而无法命中缓存。

---

## 修复方案

### 修复 1：添加 HTTP 缓存头

**文件**：`api/index.ts`、`src/app.ts`

为 TTML 直访问问端点添加 `ETag`（基于内容 MD5 哈希）和 `Cache-Control` 响应头：

```typescript
const contentHash = createHash('md5').update(result.content).digest('hex');
c.header('ETag', `"${contentHash}"`);
c.header('Cache-Control', 'public, max-age=3600, must-revalidate');
```

**效果**：
- 浏览器/CDN 可缓存响应 1 小时
- `ETag` 支持条件请求（`If-None-Match`），内容未变时返回 304
- `must-revalidate` 确保过期后必须校验

### 修复 2：移除 `fixedVersion` 限制，本地文件缓存优先

**文件**：`api/lyricService.ts`

将本地文件缓存检查提升为无条件执行（不再受 `fixedVersionQuery === 'ttml'` 限制），确保只要本地有缓存就优先返回：

```typescript
// 修复前：仅 fixedVersionQuery === 'ttml' 时检查本地缓存
if (fixedVersionQuery === 'ttml') {
  const localCached = await localLyricCache.getCachedLyric(id);
  ...
}

// 修复后：无条件检查本地缓存
const localCached = await localLyricCache.getCachedLyric(id);
if (localCached) { ... }
```

### 修复 3：降低缓存写入阈值

**文件**：`api/localLyricCache.ts`

```typescript
// 修复前
const PLAY_COUNT_THRESHOLD = 2;

// 修复后：首次请求即满足缓存写入条件
const PLAY_COUNT_THRESHOLD = 1;
```

### 修复 4：启用定时更新检查

**文件**：`api/localLyricCache.ts`

在 `startUpdateCheck()` 定时器中添加 `checkForUpdates()` 调用，每 12 小时自动同步远程仓库的 TTML 更新到本地缓存：

```typescript
private startUpdateCheck(): void {
  this.updateCheckTimer = setInterval(async () => {
    await this.cleanupInactive();
    // 新增：远程更新检查
    const updated = await this.checkForUpdates(async (id) => {
      // 从主仓库和用户仓库并行获取最新内容
      // 通过 MD5 哈希比对，内容变化时更新本地缓存
    });
  }, UPDATE_CHECK_INTERVAL_MS);
}
```

### 修复 5：增大内存缓存容量

**文件**：`api/cache.ts`

```typescript
// 修复前
export const metadataCache = new Cache<any>('metadata', 30 * 60 * 1000, 3000);
export const lyricsCache = new Cache<any>('lyrics', 60 * 60 * 1000, 2000);

// 修复后
export const metadataCache = new Cache<any>('metadata', 30 * 60 * 1000, 5000);
export const lyricsCache = new Cache<any>('lyrics', 60 * 60 * 1000, 5000);
```

### 修复 6：TTML 缓存键归一化

**文件**：`api/lyricService.ts`

对 TTML 请求使用归一化缓存键，忽略 `fallback` 和 `fast` 参数差异：

```typescript
const cacheKey = fixedVersionQuery === 'ttml'
  ? `search:${id}:ttml:normalized`
  : `search:${id}:${fixedVersionQuery || 'none'}:${fallbackQuery || 'none'}:${fast ? 'fast' : 'full'}`;
```

---

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `api/index.ts` | 添加 `ETag` 和 `Cache-Control` 响应头 |
| `src/app.ts` | 添加 `ETag` 和 `Cache-Control` 响应头 |
| `api/lyricService.ts` | 移除本地缓存检查的 `fixedVersion` 限制；TTML 缓存键归一化 |
| `api/localLyricCache.ts` | `PLAY_COUNT_THRESHOLD` 从 2 降为 1；启用 `checkForUpdates()` 定时检查 |
| `api/cache.ts` | `lyricsCache` 和 `metadataCache` 容量从 2000/3000 增至 5000 |
| `api/fetchers/repositoryFetcher.ts` | 为 `fetchUrl` 和 `fetchFromMainRepo` 添加 5 秒超时控制 |
| `api/index.ts` | LyricProvider 单例化；预初始化缓存；ETag 304 支持；metadata 内存快速路径；env 常量化 |
| `src/app.ts` | 同上（Node.js 端同步） |

---

## 修复后的缓存链路

```
客户端请求
  │
  ├─ HTTP 缓存 (ETag + Cache-Control: max-age=3600)
  │    ├─ 304 Not Modified → 直接返回 (内容未变)
  │    └─ 缓存过期 → 继续服务端处理
  │
  ▼
服务端 LyricProvider.search()
  │
  ├─ ① DevMode (lyrics-dev/)
  ├─ ② 本地文件缓存 (lyrics-cache/) ← 不再受 fixedVersion 限制
  ├─ ③ 内存缓存 (Map, TTL 60min, 5000条) ← 缓存键已归一化
  ├─ ④ 远程仓库获取 → 写入所有缓存层
  └─ ⑤ 外部 API 回退
```

---

## 验证方法

1. **HTTP 缓存验证**：使用浏览器 DevTools Network 面板，检查 TTML 请求响应头是否包含 `ETag` 和 `Cache-Control`
2. **本地缓存命中验证**：查看服务端日志中的 `localcache.cache_hit` 记录
3. **更新同步验证**：等待 12 小时后检查 `LocalLyricCache.UpdateCheck` 日志
4. **缓存容量验证**：高频请求后检查 `cache.evict` 日志是否减少

---

## 补充诊断：歌词"闪现后消失"现象

### 现象

用户反馈：歌词先显示，然后迅速变回默认。

### 日志分析

```
14:55:27 - RepositoryFetcher: Attempting parallel fetch for TTML: 31365604
14:55:29 - API: TTML direct access for 1940943649 (本地缓存命中)
14:55:34 - RepositoryFetcher: TTML not found for 31365604  (耗时 7 秒)
```

### 根因

`31365604` **不存在于本地缓存和远程仓库**。`RepositoryFetcher.fetchUrl()` 原先使用原生 `fetch()` 无超时控制，对远程仓库的请求耗时长达 7 秒才返回"未找到"。Apple Music-like Lyrics 桌面客户端在这 7 秒内可能用内置歌词源显示了内容，收到 API 的否定响应后又清空显示。

### 修复

为 `RepositoryFetcher` 的所有远程请求添加 5 秒超时（`AbortController`），防止长时间阻塞导致客户端状态不一致。
