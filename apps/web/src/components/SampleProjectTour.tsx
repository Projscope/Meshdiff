import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useSampleTourDismissed } from "../lib/sampleProjectTour";

interface Step {
  target: string;
  titleKey: string;
  bodyKey: string;
}

const STEPS: Step[] = [
  { target: "upload", titleKey: "sampleTour.uploadTitle", bodyKey: "sampleTour.uploadBody" },
  { target: "stats", titleKey: "sampleTour.statsTitle", bodyKey: "sampleTour.statsBody" },
  { target: "history", titleKey: "sampleTour.historyTitle", bodyKey: "sampleTour.historyBody" },
  { target: "compare", titleKey: "sampleTour.compareTitle", bodyKey: "sampleTour.compareBody" },
  { target: "versions", titleKey: "sampleTour.versionsTitle", bodyKey: "sampleTour.versionsBody" },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const POPOVER_WIDTH = 300;
const GAP = 12;

export default function SampleProjectTour() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useSampleTourDismissed();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // A replay (setTourDismissed(false)) should always restart at step 1,
  // whether it's this mount reacting to its own hook state or a fresh
  // mount picking up an already-false flag.
  useEffect(() => {
    if (!dismissed) setStepIndex(0);
  }, [dismissed]);

  const step = STEPS[stepIndex];

  const recompute = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (dismissed) return;
    recompute();

    const el = step ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    const resizeObserver = el ? new ResizeObserver(recompute) : null;
    if (el && resizeObserver) resizeObserver.observe(el);

    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [dismissed, step, recompute]);

  if (dismissed || !step) return null;

  const finish = () => setDismissed(true);
  const goNext = () => (stepIndex === STEPS.length - 1 ? finish() : setStepIndex((i) => i + 1));
  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  // Position the popover near the target, flipping to whichever side of
  // the viewport actually has room rather than always going one direction.
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const spaceBelow = rect ? viewportHeight - (rect.top + rect.height) : 0;
  const placeAbove = rect ? spaceBelow < 220 && rect.top > 220 : false;

  const popoverStyle: CSSProperties = rect
    ? {
        top: placeAbove ? undefined : rect.top + rect.height + GAP,
        bottom: placeAbove ? viewportHeight - rect.top + GAP : undefined,
        left: Math.min(Math.max(rect.left, 12), viewportWidth - POPOVER_WIDTH - 12),
        width: POPOVER_WIDTH,
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: POPOVER_WIDTH,
      };

  return (
    <>
      {rect && (
        <div
          className="pointer-events-none fixed z-[70] rounded transition-all duration-200"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        />
      )}
      <div
        className="fixed z-[71] rounded-lg border border-ink-700 bg-ink-900 p-4 text-sm shadow-2xl transition-all duration-200"
        style={popoverStyle}
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">
          {t("sampleTour.stepOf", { current: stepIndex + 1, total: STEPS.length })}
        </p>
        <h3 className="mt-1.5 text-sm font-semibold text-ink-50">{t(step.titleKey)}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{t(step.bodyKey)}</p>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-ink-500 hover:text-ink-300"
          >
            {t("sampleTour.skip")}
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="rounded border border-ink-700 px-2.5 py-1 text-xs text-ink-200 hover:border-ink-500"
              >
                {t("sampleTour.back")}
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              className="rounded bg-accent-500 px-2.5 py-1 text-xs font-medium text-chrome-950 hover:bg-accent-400"
            >
              {stepIndex === STEPS.length - 1 ? t("sampleTour.done") : t("sampleTour.next")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
