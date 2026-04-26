# Lyric Atlas API — Agent Guide

## 项目概述

Lyric Atlas API 是一个为 Apple Music Like Lyrics (AMLL) 播放器提供歌词服务的本地代理服务器。核心功能：

- 从 GitHub 仓库（amll-ttml-db）拉取 TTML 格式歌词
- 回落到外部网易云 API 获取 YRC/LRC 歌词
- 播放计数驱动的本地缓存：同一首歌播放次数 >= 2 次后自动缓存 TTML 文件到本地
- 定期检查远程更新并同步本地缓存
- Cache Admin UI（端口 8300）：管理本地缓存、触发重建索引

## 环境搭建

```bash
pnpm install
cp .env.example .env
```

## 启动命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式，主 API 服务（端口 3000） |
| `pnpm start` | 生产模式，主 API 服务（端口 3000） |
| `pnpm cache-admin` | 单独启动 Cache Admin 服务（端口 8300） |
| `pnpm build` | 构建产物到 dist/ |
| `pnpm prod` | 运行构建产物 |
| `npx tsc --noEmit` | TypeScript 类型检查（无输出表示通过） |

本地运行时 `src/local-server.ts` 是入口，等待 `localLyricCache.init()` 完成后才启动 HTTP 服务。

## 关键源文件

```
api/
  localLyricCache.ts      # 本地缓存核心：播放计数、文件读写、meta 管理
  lyricService.ts         # 歌词查询编排：本地缓存优先 -> lyricsCache LRU -> 远程拉取
  cache.ts                # 内存 LRU 缓存（lyricsCache / metadataCache）
  fetchers/
    repositoryFetcher.ts  # 从 GitHub 镜像并行拉取 TTML
    externalApiFetcher.ts # 外部网易云 API
src/
  local-server.ts         # Node.js 服务入口
  app.ts                  # Hono 路由定义（本地版）
  cache-admin-server.ts   # 端口 8300 管理界面
lyrics-cache/
  *.ttml                  # 缓存的歌词文件
  cache-meta.json         # 每首歌的播放次数、缓存时间、内容 hash 等
  ncm-ids.json            # 已成功缓存的 NCM ID 列表（仅 cachedAt > 0）
```

## 缓存机制

### 触发条件
- `PLAY_COUNT_THRESHOLD = 2`：playCount >= 2 时触发本地写入
- `recordPlay()` 只在 `lyricService.search()` 入口处调用一次，不在 fetcher 中重复调用

### 写入流程
1. 第 1 次请求：playCount=1，远程拉取，结果存入 `lyricsCache` LRU（内存，TTL 1h）
2. 第 2 次请求：playCount=2，`lyricsCache` 命中，`shouldCache()=true`，调用 `cacheLyric()` 写入 `.ttml` + 更新 meta
3. 第 3 次起：本地文件命中，直接返回

### 防抖写盘（scheduleFlush）
- 3 秒防抖，批量写 `cache-meta.json` 和 `ncm-ids.json`
- 写入失败时恢复 `dirty=true`，下次定时器触发时重试

### 索引文件区别
- `cache-meta.json`：包含所有有播放记录的 ID（含未缓存的，cachedAt 可为 0）
- `ncm-ids.json`：只包含 cachedAt > 0 的 ID（即磁盘上实际存在 .ttml 文件的）

### 启动时校验
- `init()` 加载 `cache-meta.json` 后，会对每个 `cachedAt > 0` 的条目验证磁盘文件是否存在
- 文件缺失的条目会被重置（cachedAt=0, contentHash=''），防止内存 meta 与磁盘状态不一致

## 注意事项

- **不要直接手动删除 `lyrics-cache/*.ttml`**，应通过 Cache Admin UI（/admin/cache/delete）删除，以确保同步清理内存缓存和 lyricsCache LRU
- Vercel Edge Runtime 不支持 `fs`，本地缓存功能仅在 Node.js 环境（`src/local-server.ts`）下生效
- `repositoryFetcher.ts` 只负责从远程拉取数据，不调用 `recordPlay`，不写缓存
