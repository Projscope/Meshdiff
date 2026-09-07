import type { ReactNode } from "react";

interface PrintabilityRulesTooltipProps {
  children: ReactNode;
  className?: string;
}

/**
 * Hover wrapper explaining how the pass/warn/fail printability gate is
 * computed — mirrors assessPrintability() in
 * apps/shared/src/engine/diffVoxels.ts, so keep the two in sync if the
 * thresholds ever change.
 */
export default function PrintabilityRulesTooltip({ children, className }: PrintabilityRulesTooltipProps) {
  return (
    <span className={`group relative ${className ?? "inline-block"}`}>
      {children}
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-ink-700 bg-ink-900 p-3 text-left text-xs text-ink-300 opacity-0 shadow-xl transition group-hover:opacity-100">
        <span className="block font-semibold text-ink-200">How printability is determined</span>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>
            <span className="font-medium text-accent-fg-400">Pass</span> — no issues detected.
          </li>
          <li>
            <span className="font-medium text-amber-400">Warn</span> — thin walls (&lt;0.8mm), overhang angle
            &gt;55°, or unsupported area &gt;20%.
          </li>
          <li>
            <span className="font-medium text-red-400">Fail</span> — overhang angle &gt;60° or unsupported area
            &gt;30%.
          </li>
        </ul>
      </span>
    </span>
  );
}
