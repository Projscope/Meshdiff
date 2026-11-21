import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalProjectDetail } from "@meshdiff/shared/localLibrary";
import { analyzeVersion } from "./analyzeVersion";
import { errorMessage, library } from "./library";

export interface UseProject {
  /** undefined while loading, null if the project doesn't exist. */
  detail: LocalProjectDetail | null | undefined;
  loadError: string | null;
  /** The version currently being analyzed, if any. */
  analyzingVersionId: string | null;
  /** Analysis failures by version id. */
  analysisErrors: Record<string, string>;
  refresh: () => Promise<void>;
}

/**
 * Loads a local project and keeps its versions analyzed. A version needs
 * analysis when it has none (just added, or the app closed mid-analysis) or when
 * it was diffed against a version that's since been deleted. They run one at a
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
      const expected = versions[i - 1]?.id ?? null;
      return version.analysis === null || version.analysis.comparedToVersionId !== expected;
    });
    if (index === -1) return;

    const version = versions[index]!;
    const previous = versions[index - 1] ?? null;
    setAnalyzingVersionId(version.id);
    void (async () => {
      try {
        const analysis = await analyzeVersion(projectId, version, previous);
        await library().saveAnalysis(projectId, version.id, analysis);
        await refresh();
      } catch (error) {
        failed.current.add(version.id);
        if (mounted.current) setAnalysisErrors((current) => ({ ...current, [version.id]: errorMessage(error) }));
      } finally {
        if (mounted.current) setAnalyzingVersionId(null);
      }
    })();
  }, [detail, analyzingVersionId, projectId, refresh]);

  return { detail, loadError, analyzingVersionId, analysisErrors, refresh };
}
