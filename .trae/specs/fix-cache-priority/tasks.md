# Tasks

- [x] Task 1: 移除 RepositoryFetcher 中的本地缓存检查和 recordPlay 调用
  - [x] SubTask 1.1: 移除 `fetch` 方法中的本地缓存检查（第 26-32 行）
  - [x] SubTask 1.2: 移除 `fetch` 方法中的 `recordPlay` 调用（第 60 行）
  - [x] SubTask 1.3: 移除 `fetch` 方法中的缓存写入逻辑（第 61-63 行）

- [x] Task 2: 验证 lyricService 中的缓存逻辑完整性
  - [x] SubTask 2.1: 确认 `recordPlay` 只在 `search` 入口调用一次
  - [x] SubTask 2.2: 确认本地缓存检查在远程查询之前
  - [x] SubTask 2.3: 确认 TTML 获取成功后正确写入缓存

- [x] Task 3: 构建验证
  - [x] SubTask 3.1: 运行 `pnpm run build` 确保无编译错误

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1, Task 2
