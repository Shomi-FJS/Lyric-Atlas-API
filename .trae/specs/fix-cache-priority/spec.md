# 缓存优先级与播放计数修复 Spec

## Why
当前缓存机制存在多个问题：
1. `recordPlay` 被重复调用（lyricService + repositoryFetcher），导致播放次数虚高
2. `RepositoryFetcher` 重复检查本地缓存，与 `lyricService` 的检查冲突
3. 缓存写入逻辑分散在多处，不一致且难以维护
4. 用户反馈"播放次数达到阈值但本地缓存文件不存在"

## What Changes
- 统一 `recordPlay` 调用位置：只在 `lyricService.search` 入口处调用
- 移除 `RepositoryFetcher` 中的本地缓存检查和 `recordPlay` 调用
- 统一缓存写入逻辑：只在 `lyricService` 中处理
- 确保"播放2次触发缓存"机制正确工作

## Impact
- Affected code: `api/lyricService.ts`, `api/fetchers/repositoryFetcher.ts`

## ADDED Requirements

### Requirement: 统一播放计数
系统 SHALL 只在 `lyricService.search` 入口处调用 `recordPlay`，避免重复计数。

#### Scenario: 播放计数正确
- **WHEN** 用户请求歌词
- **THEN** 播放次数只增加 1，不重复增加

### Requirement: 本地缓存优先检查
系统 SHALL 在 `lyricService.search` 中优先检查本地缓存，命中后直接返回，不调用 `RepositoryFetcher`。

#### Scenario: 本地缓存命中
- **WHEN** 本地缓存存在
- **THEN** 直接返回缓存内容，不查询远程源

#### Scenario: 本地缓存未命中
- **WHEN** 本地缓存不存在
- **THEN** 查询远程源，获取成功后根据播放次数决定是否缓存

### Requirement: 统一缓存写入逻辑
系统 SHALL 只在 `lyricService` 中处理缓存写入，`RepositoryFetcher` 只负责获取数据。

#### Scenario: TTML 获取成功后缓存
- **WHEN** TTML 格式从远程获取成功
- **AND** 播放次数达到阈值（>= 2）
- **THEN** 写入本地缓存

## MODIFIED Requirements

### Requirement: RepositoryFetcher 职责简化
`RepositoryFetcher` 只负责从远程源获取数据，不检查本地缓存，不调用 `recordPlay`，不写入缓存。

#### Scenario: TTML 格式获取
- **WHEN** 请求 TTML 格式
- **THEN** 直接从远程源获取，返回结果给调用方处理
