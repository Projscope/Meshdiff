/**
 * Lazily creates a single long-lived Worker and dispatches its responses
 * back to the caller that sent each request, matched by request ID — the
 * "one worker for the whole app's lifetime, avoid re-parsing the module
 * graph on every call" pattern shared by every worker client in this app.
 * Callers keep their own request-shaping/response-caching logic (e.g.
 * voxelDiffWorkerClient.ts's base-geometry cache); this only owns the
 * worker singleton and the pending-request bookkeeping.
 */
export function createWorkerClient<TReq extends { id: number }, TRes extends { id: number; result: unknown }>(
  createWorker: () => Worker,
) {
  let worker: Worker | null = null;
  let nextRequestId = 0;
  const pending = new Map<number, (result: TRes["result"]) => void>();

  function getWorker(): Worker {
    if (!worker) {
      worker = createWorker();
      worker.onmessage = (event: MessageEvent<TRes>) => {
        const resolve = pending.get(event.data.id);
        if (!resolve) return; // stale/unknown request (shouldn't happen) — drop it
        pending.delete(event.data.id);
        resolve(event.data.result);
      };
    }
    return worker;
  }

  return {
    nextId: (): number => nextRequestId++,
    send: (request: TReq, transfer: Transferable[] = []): Promise<TRes["result"]> =>
      new Promise((resolve) => {
        pending.set(request.id, resolve);
        getWorker().postMessage(request, transfer);
      }),
  };
}
