import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useTeamTourStage } from "../lib/teamTour";
import { useAccountStatus } from "./ProjectsLayout";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const POPOVER_WIDTH = 300;
const GAP = 12;

/**
 * A single, real-action-gated step (no Next/Back — same idea as
 * SampleProjectTour.tsx's last step) pointing at the sidebar's "New team"
 * button. Advances to "dashboard" itself once a team actually gets
 * created (see ProjectsLayout.tsx's onCreated callback) — Skip is the
 * only way to end it early. Mounted in ProjectsLayout.tsx so it's visible
 * on every /projects/* route the sidebar renders on.
 */
export default function TeamCreateSpotlight() {
  const { t } = useTranslation();
  const [stage, setStage] = useTeamTourStage();
  const { tier } = useAccountStatus();
  const [rect, setRect] = useState<Rect | null>(null);
  // If the user switches their trial choice back to Pro mid-tour, the
  // "New team" button gates to an upgrade prompt instead of the real
  // create form — hide the spotlight (without touching the stage) rather
  // than point at a button that no longer does what this step promises.
  const active = stage === "awaiting-team" && tier === "team";

  const recompute = useCallback(() => {
    const el = document.querySelector('[data-tour="newTeamButton"]');
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  useEffect(() => {
    if (!active) return;
    recompute();

    const el = document.querySelector('[data-tour="newTeamButton"]');
    const resizeObserver = el ? new ResizeObserver(recompute) : null;
    if (el && resizeObserver) resizeObserver.observe(el);

    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [active, recompute]);

  if (!active) return null;

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
          className="pointer-events-none fixed z-70 rounded-sm transition-all duration-200"
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
        className="fixed z-71 rounded-lg border border-ink-700 bg-ink-900 p-4 text-sm shadow-2xl transition-all duration-200"
        style={popoverStyle}
      >
        <h3 className="text-sm font-semibold text-ink-50">{t("teamTour.createTitle")}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{t("teamTour.createBody")}</p>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => setStage("done")} className="text-xs text-ink-500 hover:text-ink-300">
            {t("teamTour.skip")}
          </button>
        </div>
      </div>
    </>
  );
}
