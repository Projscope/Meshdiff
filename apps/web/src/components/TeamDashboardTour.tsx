import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTeamTourStage } from "../lib/teamTour";

interface Step {
  target: string;
  titleKey: string;
  bodyKey: string;
}

const STEPS: Step[] = [
  { target: "teamMembers", titleKey: "teamTour.membersTitle", bodyKey: "teamTour.membersBody" },
  { target: "teamInvite", titleKey: "teamTour.inviteTitle", bodyKey: "teamTour.inviteBody" },
  { target: "teamPendingApprovals", titleKey: "teamTour.pendingTitle", bodyKey: "teamTour.pendingBody" },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const POPOVER_WIDTH = 300;
const GAP = 12;

/**
 * The second half of the Team-trial onboarding tour (see teamTour.ts) —
 * a 3-step walkthrough of the freshly-created team's dashboard, same
 * spotlight/popover shape as SampleProjectTour.tsx. Finishing (or
 * skipping) hands off to the existing, untouched Sample Project
 * walkthrough by navigating to /projects — that tour's own "unseen" stage
 * (sampleProjectTour.ts) is independent and just starts on its own, no
 * coordination needed here.
 */
export default function TeamDashboardTour() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stage, setStage] = useTeamTourStage();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const active = stage === "dashboard";

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
    if (!active) return;
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
  }, [active, step, recompute]);

  if (!active || !step) return null;

  function finish() {
    setStage("done");
    navigate("/projects");
  }

  const isLastStep = stepIndex === STEPS.length - 1;
  const goNext = () => (isLastStep ? finish() : setStepIndex((i) => i + 1));
  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

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
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">
          {t("teamTour.stepOf", { current: stepIndex + 1, total: STEPS.length })}
        </p>
        <h3 className="mt-1.5 text-sm font-semibold text-ink-50">{t(step.titleKey)}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{t(step.bodyKey)}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={finish} className="text-xs text-ink-500 hover:text-ink-300">
            {t("teamTour.skip")}
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-sm border border-ink-700 px-2.5 py-1 text-xs text-ink-200 hover:border-ink-500"
              >
                {t("teamTour.back")}
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              className="rounded-sm bg-accent-500 px-2.5 py-1 text-xs font-medium text-chrome-950 hover:bg-accent-400"
            >
              {isLastStep ? t("teamTour.done") : t("teamTour.next")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
