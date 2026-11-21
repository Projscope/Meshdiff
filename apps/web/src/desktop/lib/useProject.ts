import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalProjectDetail } from "@meshdiff/shared/localLibrary";
import { cancelMeshParse } from "../../lib/meshParseWorkerClient";
import { cancelVoxelDiff } from "../../lib/voxelDiffWorkerClient";
import { analyzeVersion } from "./analyzeVersion";
import { isUsableAnalysis } from "./analysisValidity";
import { diffBaseFor } from "./diffBase";
import { errorMessage, library } from "./library";

/** An analysis that runs this long is stopped: the model is too much for this computer. */
export const ANALYSIS_TIMEOUT_MS = 5 * 60_000;

/** Stops whatever analysis is running; it then fails with this message. */
function stopAnalysis(message: string): void {
  cancelMeshParse(message);
  cancelVoxelDiff(message);
}

export interface UseProject {
  /** undefined while loading, null if the project doesn't exist. */
  detail: LocalProjectDetail | null | undefined;
  loadError: string | null;
  /** The version currently being analyzed, if any. */
  analyzingVersionId: string | null;
  /** Analysis failures by version id. */
  analysisErrors: Record<string, string>;
  refresh: () => Promise<void>;
  /** Stops the analysis that is running (it is then shown as cancelled, with a Retry). */
  cancelAnalysis: () => void;
  /** Clears a failed analysis so it runs again. */
  retryAnalysis: (versionId: string) => void;
}

/**
 * Loads a local project and keeps its versions analyzed. A version needs
 * analysis when it has none (just added, or the app closed mid-analysis), when

 * the saved one is damaged, or when it was diffed against a version that's since
 * been deleted. Versions without a file on this computer are left alone. They run one at a
 * time, because the diff worker caches the pair it's working on.
 */
export function useProject(projectId: string): UseProject {
  const [detail, setDetail] = useState<LocalProjectDetail | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzingVersionId, setAnalyzingVersionId] = useState<string | null>(null);
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});
  // A version whose analysis failed is not retried in a loop; it stays failed until the page is reopened.
  const failed = useRef(new Set<string>());
  const mounted = useRef(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await library().getProject(projectId);
      if (mounted.current) {
        setDetail(next);
        setLoadError(null);
      }
    } catch (error) {
      if (mounted.current) setLoadError(errorMessage(error));
    }
  }, [projectId]);

  useEffect(() => {
    failed.current = new Set();
    setDetail(undefined);
    setAnalysisErrors({});
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!detail || analyzingVersionId) return;
    const { versions } = detail;
    const index = versions.findIndex((version, i) => {
      if (failed.current.has(version.id)) return false;
      // A teammate's version that arrived without its file can't be analyzed here; the cloud
      // already holds its stats, which were pulled in with it.
      if (version.missingFile) return false;
      const expected = diffBaseFor(versions, i)?.id ?? null;
      // Also recomputed when a saved analysis is damaged, not just missing or stale.
      return !isUsableAnalysis(version.analysis) || version.analysis.comparedToVersionId !== expected;
    });
    if (index === -1) return;

    const version = versions[index]!;
    const previous = diffBaseFor(versions, index);
    setAnalyzingVersionId(version.id);
    const watchdog = setTimeout(
      () => stopAnalysis("The analysis took longer than 5 minutes and was stopped. This model is too much for this computer to analyse."),
      ANALYSIS_TIMEOUT_MS,
    );
    void (async () => {
      try {
        const analysis = await analyzeVersion(projectId, version, previous);
        await library().saveAnalysis(projectId, version.id, analysis);
        await refresh();
      } catch (error) {
        failed.current.add(version.id);
        if (mounted.current) setAnalysisErrors((current) => ({ ...current, [version.id]: errorMessage(error) }));
      } finally {
        clearTimeout(watchdog);
        if (mounted.current) setAnalyzingVersionId(null);
      }
    })();
  }, [detail, analyzingVersionId, projectId, refresh, retryTick]);

  const cancelAnalysis = useCallback(() => stopAnalysis("Analysis cancelled."), []);
  const retryAnalysis = useCallback((versionId: string) => {
    failed.current.delete(versionId);
    setAnalysisErrors((current) => {
      const { [versionId]: _removed, ...rest } = current;
      return rest;
    });
    setRetryTick((tick) => tick + 1);
  }, []);

  return { detail, loadError, analyzingVersionId, analysisErrors, refresh, cancelAnalysis, retryAnalysis };
}
