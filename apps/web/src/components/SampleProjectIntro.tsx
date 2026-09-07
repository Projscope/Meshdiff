import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { setTourDismissed, useSampleTourDismissed } from "../lib/sampleProjectTour";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TARGET = "sampleProjectCard";
const POPOVER_WIDTH = 300;
const GAP = 12;

/**
 * The walkthrough's very first beat — a welcome banner on the Projects list
 * itself, spotlighting the Sample Project card. No Next/Back: the "action"
 * is clicking the actual card into ProjectDetailPage, where
 * SampleProjectTour picks up at step 1 (same "unseen" stage the whole way
 * through — see sampleProjectTour.ts). Only Skip ends it early.
 */
export default function SampleProjectIntro() {
  const { t } = useTranslation();
  const [dismissed] = useSampleTourDismissed();
  const [rect, setRect] = useState<Rect | null>(null);

  const recompute = useCallback(() => {
    const el = document.querySelector(`[data-tour="${TARGET}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  useEffect(() => {
    if (dismissed) return;
    recompute();

    const el = document.querySelector(`[data-tour="${TARGET}"]`);
    const resizeObserver = el ? new ResizeObserver(recompute) : null;
    if (el && resizeObserver) resizeObserver.observe(el);

    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [dismissed, recompute]);

  if (dismissed) return null;

  const skip = () => setTourDismissed(true);

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
        <h3 className="text-sm font-semibold text-ink-50">{t("sampleTour.introTitle")}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{t("sampleTour.introBody")}</p>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={skip} className="text-xs text-ink-500 hover:text-ink-300">
            {t("sampleTour.skip")}
          </button>
        </div>
      </div>
    </>
  );
}
