import { getLogger } from './utils';

const logger = getLogger('RequestDedupe');

interface PendingRequest {
  controller: AbortController;
  reject: (reason: unknown) => void;
}

const pendingRequests = new Map<string, PendingRequest>();

export function cancelPendingRequest(id: string): void {
  const pending = pendingRequests.get(id);
  if (pending) {
    logger.debug(`取消pending请求: ${id}`);
    pending.controller.abort();
    pending.reject(new Error('Request cancelled by new request'));
    pendingRequests.delete(id);
  }
}

export function createPendingRequest(id: string): { signal: AbortSignal; promise: Promise<unknown> } {
  cancelPendingRequest(id);
  
  const controller = new AbortController();
  let reject: (reason: unknown) => void;
  const promise = new Promise((_, rej) => {
    reject = rej;
  });
  
  pendingRequests.set(id, { controller, reject: reject! });
  
  return { signal: controller.signal, promise };
}

export function removePendingRequest(id: string): void {
  pendingRequests.delete(id);
}
