// A project page loads its comparison history by firing a diff request for
// EVERY consecutive version pair at once (ProjectDetailPage.tsx's refresh())
// — for a project with N versions, that's N-1 concurrent /diff requests on
// every page load and after every upload. Any single diff comfortably fits
// under the per-mesh triangle cap (see MAX_TRIANGLES_PER_MESH), but several
// running at the same instant all share this one process's memory, and that
// — not any individual file's size — is what was actually crashing the
// Render instance (confirmed: crashes happened within ~1 minute of a fresh
// restart, before any single request could plausibly have built up memory
// on its own).
//
// This serializes every finalize()/diff() computation process-wide, so at
// most one is ever actually running at a time regardless of how many
// requests arrive concurrently — a simple async queue, not a real
// semaphore, since Node is single-threaded and this only needs to order
// async work, not coordinate real parallelism.
let queue: Promise<void> = Promise.resolve();

export async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const previous = queue;
  let release: () => void = () => {};
  queue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
