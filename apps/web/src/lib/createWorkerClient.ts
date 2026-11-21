/**
 * Lazily creates a single long-lived Worker and dispatches its responses
 * back to the caller that sent each request, matched by request ID — the
 * "one worker for the whole app's lifetime, avoid re-parsing the module
 * graph on every call" pattern shared by every worker client in this app.
 * Callers keep their own request-shaping/response-caching logic (e.g.
 * voxelDiffWorkerClient.ts's base-geometry cache); this only owns the
 * worker singleton and the pending-request bookkeeping.
 *
 * If the worker dies (an uncaught error, or the browser killing it for running out of
 * memory on a huge model) or is cancelled, every request still waiting is answered with
 * a failure instead of being left hanging, the dead worker is discarded, and the next
 * request starts a fresh one. `onReset` lets a client drop anything it cached about the
 * old worker's state.
 */
export function createWorkerClient<TReq extends { id: number }, TRes extends { id: number; result: unknown }>(
  createWorker: () => Worker,
  options?: { onReset?: () => void },
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
      worker.onerror = (event) => {
        event.preventDefault();
        stop("The analysis stopped unexpectedly. The model may be too large for this computer's memory.");
      };
      worker.onmessageerror = () => stop("The analysis stopped unexpectedly.");
    }
    return worker;
  }

  /** Discards the worker and fails everything waiting on it. */
  function stop(message: string): void {
    const dead = worker;
    worker = null;
    dead?.terminate();
    const waiting = [...pending.values()];
    pending.clear();
    for (const resolve of waiting) resolve({ success: false, error: message } as TRes["result"]);
    options?.onReset?.();
  }

  return {
    nextId: (): number => nextRequestId++,
    /** Stops the worker now; whatever was waiting on it fails with this message. */
    cancel: (message = "Cancelled."): void => stop(message),
    send: (request: TReq, transfer: Transferable[] = []): Promise<TRes["result"]> =>
      new Promise((resolve) => {
        pending.set(request.id, resolve);
        getWorker().postMessage(request, transfer);
      }),
  };
}
