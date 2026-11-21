import { MIN_MAX_TRIANGLES, type AnalysisLimits } from "@meshdiff/shared/analysisLimits";

/** If the app can't be asked (it always can in the desktop app), assume the website's limit. */
const FALLBACK: AnalysisLimits = { maxTriangles: MIN_MAX_TRIANGLES, totalMemoryMB: 0, freeMemoryMB: 0 };

// Free memory moves around, but not second to second; asking once per analysis run is plenty.
const CACHE_MS = 15_000;
let cached: { at: number; limits: AnalysisLimits } | null = null;

/** What this computer can comfortably analyse right now (see shared/analysisLimits.ts). */
export async function getAnalysisLimits(): Promise<AnalysisLimits> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.limits;
  let limits = FALLBACK;
  try {
    limits = (await window.meshdiffDesktop?.getAnalysisLimits()) ?? FALLBACK;
  } catch {
    limits = FALLBACK;
  }
  cached = { at: now, limits };
  return limits;
}
