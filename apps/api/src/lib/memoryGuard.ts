// Mesh diffing (voxelization, BVH construction, wall-thickness raycasting)
// is the most memory-intensive work this server does. A per-mesh triangle
// cap (see MAX_TRIANGLES_PER_MESH in diffVoxels.ts) bounds the worst case
// for a single request in isolation, but doesn't account for memory
// already in use by other concurrent requests at the moment a new heavy
// request starts — and a single request that pushes the process over its
// container's memory limit crashes the WHOLE instance, taking down every
// other in-flight request with it, not just the one that caused it.
//
// This checks current RSS against a safety margin before starting the
// expensive part of finalize()/diff(), rejecting cleanly with a 503 (safe
// to retry) instead of letting V8/the OS kill the process outright.
const DEFAULT_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2GB, matches Render Standard
// Trip well before actually hitting the ceiling — this only sees memory
// already resident at the moment of the check, not what the upcoming
// request's own allocations will add on top of it.
const SAFETY_FRACTION = 0.7;

function memoryLimitBytes(): number {
  const configured = process.env.MEMORY_LIMIT_BYTES ? Number(process.env.MEMORY_LIMIT_BYTES) : NaN;
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LIMIT_BYTES;
}

export function isUnderMemoryPressure(): boolean {
  return process.memoryUsage().rss > memoryLimitBytes() * SAFETY_FRACTION;
}
