import { getLogger } from './utils';

const logger = getLogger('RequestDedupe');

interface PendingRequest {
  id: string;
  controller: AbortController;
  removeAbortListener: () => void;
}

const pendingRequests = new Map<string, PendingRequest>();

export function cancelPendingRequest(id: string): void {
  const pending = pendingRequests.get(id);
  if (pending) {
    logger.debug(`取消pending请求: ${id}`);
    pending.controller.abort();
    pending.removeAbortListener();
    pendingRequests.delete(id);
  }
}

export function cancelAllPendingRequests(): void {
  if (pendingRequests.size === 0) return;

  logger.debug(`取消所有pending请求，共 ${pendingRequests.size} 个`);
  for (const [id, pending] of pendingRequests) {
    pending.controller.abort();
    pending.removeAbortListener();
  }
  pendingRequests.clear();
}

export function createPendingRequest(id: string): { signal: AbortSignal } {
  // 只取消不同 ID 的旧请求（切歌场景）
  // 同 ID 的并发请求不互相取消（避免 search 和 TTML 端点互杀）
  for (const [pendingId, pending] of pendingRequests) {
    if (pendingId !== id) {
      logger.debug(`取消不同ID的pending请求: ${pendingId} (当前: ${id})`);
      pending.controller.abort();
      pending.removeAbortListener();
      pendingRequests.delete(pendingId);
    }
  }

  // 同 ID 已有 pending 时，复用其 signal（多个并发请求共享同一个 abort 生命周期）
  if (pendingRequests.has(id)) {
    return { signal: pendingRequests.get(id)!.controller.signal };
  }

  const controller = new AbortController();

  // 当 signal 被 abort 时自动清理自身，避免内存泄漏
  const onAbort = () => {
    pendingRequests.delete(id);
    controller.signal.removeEventListener('abort', onAbort);
  };
  controller.signal.addEventListener('abort', onAbort);

  pendingRequests.set(id, { id, controller, removeAbortListener: () => controller.signal.removeEventListener('abort', onAbort) });

  return { signal: controller.signal };
}

export function removePendingRequest(id: string): void {
  const pending = pendingRequests.get(id);
  if (pending) {
    pending.removeAbortListener();
  }
  pendingRequests.delete(id);
}

export function getCurrentPendingId(): string | undefined {
  if (pendingRequests.size === 0) return undefined;
  const first = pendingRequests.values().next().value;
  return first?.id;
}
