import { describe, expect, it, vi } from "vitest";
import { createWorkerClient } from "./createWorkerClient";

type Req = { id: number };
type Res = { id: number; result: { success: true; data: string } | { success: false; error: string } };

class FakeWorker {
  onmessage: ((event: { data: Res }) => void) | null = null;
  onerror: ((event: { preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  received: Req[] = [];
  postMessage(request: Req) {
    this.received.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, data: string) {
    this.onmessage?.({ data: { id, result: { success: true, data } } });
  }
  crash() {
    this.onerror?.({ preventDefault: () => undefined });
  }
}

function setup(onReset?: () => void) {
  const workers: FakeWorker[] = [];
  const client = createWorkerClient<Req, Res>(
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    { onReset },
  );
  return { client, workers };
}

describe("createWorkerClient", () => {
  it("matches each reply to the request that asked for it", async () => {
    const { client, workers } = setup();
    const a = client.send({ id: client.nextId() });
    const b = client.send({ id: client.nextId() });
    workers[0]!.reply(1, "second");
    workers[0]!.reply(0, "first");
    expect(await a).toEqual({ success: true, data: "first" });
    expect(await b).toEqual({ success: true, data: "second" });
    expect(workers).toHaveLength(1); // one worker for everything
  });

  it("fails every waiting request when the worker crashes, instead of leaving them hanging", async () => {
    const { client, workers } = setup();
    const a = client.send({ id: client.nextId() });
    const b = client.send({ id: client.nextId() });
    workers[0]!.crash();
    for (const result of await Promise.all([a, b])) {
      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toMatch(/too large for this computer's memory/);
    }
    expect(workers[0]!.terminated).toBe(true);
  });

  it("starts a fresh worker for the next request after a crash", async () => {
    const { client, workers } = setup();
    const first = client.send({ id: client.nextId() });
    workers[0]!.crash();
    await first;

    const second = client.send({ id: client.nextId() });
    expect(workers).toHaveLength(2);
    workers[1]!.reply(1, "recovered");
    expect(await second).toEqual({ success: true, data: "recovered" });
  });

  it("cancel stops the worker now and fails what was waiting with the given message", async () => {
    const { client, workers } = setup();
    const waiting = client.send({ id: client.nextId() });
    client.cancel("Analysis cancelled.");
    expect(await waiting).toEqual({ success: false, error: "Analysis cancelled." });
    expect(workers[0]!.terminated).toBe(true);
  });

  it("a reply that arrives from a worker after it was cancelled is ignored", async () => {
    const { client, workers } = setup();
    const waiting = client.send({ id: client.nextId() });
    const old = workers[0]!;
    client.cancel();
    await waiting;
    old.reply(0, "too late"); // must not throw or resolve anything twice
    const next = client.send({ id: client.nextId() });
    workers[1]!.reply(1, "fine");
    expect(await next).toEqual({ success: true, data: "fine" });
  });

  it("cancel with nothing running is harmless", () => {
    const { client, workers } = setup();
    expect(() => client.cancel()).not.toThrow();
    expect(workers).toHaveLength(0);
  });

  it("tells the client to forget what it cached about the old worker", async () => {
    const onReset = vi.fn();
    const { client, workers } = setup(onReset);
    const waiting = client.send({ id: client.nextId() });
    workers[0]!.crash();
    await waiting;
    client.cancel();
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});
