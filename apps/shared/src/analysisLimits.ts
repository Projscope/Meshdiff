import { MAX_TRIANGLES_PER_MESH } from "./engine/diffVoxels.js";

/** What this computer can reasonably analyse, worked out from its memory. */
export interface AnalysisLimits {
  /** The largest mesh, in triangles, the app will try to analyse. */
  maxTriangles: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
}

/**
 * Measured on a desktop CPU (apps/desktop/tests/bench-analysis.mjs): analysing a pair of
 * meshes costs about 1.4 KB of memory per triangle (per mesh) and about 8 microseconds,
 * scaling linearly up to at least 2 million triangles. Parsing the file, copies handed to
 * the worker and the 3D view hold more on top of that, so the budget assumes twice the
 * measured cost.
 */
export const BYTES_PER_TRIANGLE = 3000;
/** Never accept less than the web app does. */
export const MIN_MAX_TRIANGLES = MAX_TRIANGLES_PER_MESH;
/** Beyond this the analysis itself takes minutes even on a fast computer. */
export const MAX_MAX_TRIANGLES = 1_000_000;
/** Share of the memory we are willing to use; the rest is left for the system and other apps. */
const MEMORY_SHARE = 0.4;
/** Don't count on more than half of the installed memory, even if more is free right now. */
const TOTAL_SHARE = 0.5;

const MB = 1024 * 1024;

/**
 * The triangle limit for this computer: a fixed share of the memory that is free (and not
 * more than half the installed memory), divided by what a triangle costs, kept between
 * what the website accepts and a ceiling past which analysis is just slow. A 16 GB machine
 * lands on the ceiling; a 4 GB one with little free memory stays near the website's limit.
 */
export function computeAnalysisLimits(totalBytes: number, freeBytes: number): AnalysisLimits {
  const usable = Math.max(0, Math.min(freeBytes, totalBytes * TOTAL_SHARE)) * MEMORY_SHARE;
  const raw = Math.floor(usable / BYTES_PER_TRIANGLE);
  // Round down to a tidy number so the message reads "up to 340,000", not "341,207".
  const step = raw >= 100_000 ? 10_000 : 5_000;
  const rounded = Math.floor(raw / step) * step;
  return {
    maxTriangles: Math.min(MAX_MAX_TRIANGLES, Math.max(MIN_MAX_TRIANGLES, rounded)),
    totalMemoryMB: Math.round(totalBytes / MB),
    freeMemoryMB: Math.round(freeBytes / MB),
  };
}

/**
 * Turns the engine's terse "Mesh has N triangles, exceeding the M limit for diffing" into
 * something a person can act on, and passes any other message through unchanged.
 */
export function friendlyAnalysisError(message: string, limits: Pick<AnalysisLimits, "maxTriangles">): string {
  const match = /Mesh has (more than )?([\d,.\s]+) triangles, exceeding/.exec(message);
  if (!match) return message;
  const found = match[1] ? `more than ${limits.maxTriangles.toLocaleString()}` : match[2]!.trim();
  return (
    `This model has ${found} triangles, and this computer can analyse up to ${limits.maxTriangles.toLocaleString()}. ` +
    `Simplify or decimate the mesh in your CAD or slicer program, then add it again. ` +
    `The file is still safely in your library; it just can't be analysed, compared or synced until it is smaller.`
  );
}

/** A binary STL states its triangle count up front, so an oversized one can be refused before parsing. */
export function binaryStlTriangleCount(bytes: ArrayBuffer | Uint8Array): number | null {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength < 84) return null;
  const count = new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(80, true);
  // 84 bytes of header plus 50 per triangle; anything else is an ASCII STL (which starts with "solid").
  return view.byteLength === 84 + count * 50 ? count : null;
}
