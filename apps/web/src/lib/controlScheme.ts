import { useEffect, useState } from "react";
import { MOUSE } from "three";

export type ControlScheme = "meshdiff" | "cad";

const STORAGE_KEY = "meshdiff_control_scheme";
// localStorage's own "storage" event only fires in OTHER tabs, not the tab
// that made the change — this custom event is how every viewer instance on
// THIS tab (e.g. the two side-by-side panes on Compare) hears about a
// change made via any one of them, since the scheme is one global,
// localStorage-backed preference, not per-viewer state.
const CHANGE_EVENT = "meshdiff:control-scheme-change";

function readStored(): ControlScheme {
  return localStorage.getItem(STORAGE_KEY) === "cad" ? "cad" : "meshdiff";
}

export function setControlScheme(scheme: ControlScheme): void {
  localStorage.setItem(STORAGE_KEY, scheme);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * The active camera control scheme, shared across every viewer on the page
 * (and persisted across visits) — switching it once in any viewer applies
 * everywhere, immediately.
 */
export function useControlScheme(): [ControlScheme, (scheme: ControlScheme) => void] {
  const [scheme, setScheme] = useState<ControlScheme>(() => readStored());

  useEffect(() => {
    const onChange = () => setScheme(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [scheme, setControlScheme];
}

/**
 * Maps the active scheme to OrbitControls' `mouseButtons` prop.
 *
 * "meshdiff" mirrors Three.js's own OrbitControls defaults (left-click
 * orbit, right-click pan, wheel zoom) — what this app always used before
 * this setting existed.
 *
 * "cad" matches Fusion 360 and AutoCAD (the two most common tools among a
 * 3D-printing/CAD audience that use the *same* binding, per user research —
 * SolidWorks/Blender swap which action gets the Shift modifier, so no
 * single scheme matches every CAD tool exactly): plain middle-mouse-drag
 * pans, Shift+middle-mouse-drag orbits, wheel zooms.
 *
 * The Shift swap is NOT implemented here in JS — three-stdlib's own
 * OrbitControls.onMouseDown already inverts PAN<->ROTATE when
 * event.shiftKey (or ctrl/meta) is held at mousedown, for whichever action
 * mouseButtons maps a button to. An earlier version of this hook also
 * tracked Shift itself and flipped MIDDLE between PAN/ROTATE in React
 * state — since that ran *in addition to* Three's own inversion, holding
 * Shift ended up inverting twice and canceling out (my code set MIDDLE to
 * ROTATE, then Three saw shiftKey and inverted ROTATE back to PAN), so
 * Shift+middle-drag silently did nothing different from plain middle-drag.
 * Just mapping MIDDLE to PAN unconditionally and letting Three's own
 * modifier check do the inversion is the correct, and much simpler, fix.
 *
 * Left-click is left alone entirely (omitted from mouseButtons, so
 * OrbitControls ignores it) — real CAD tools reserve left-click for
 * selection, and this app uses left-click to place comment pins and
 * measurement points. Right-click gets a pan fallback (redundant with
 * Shift+middle-drag) rather than being left alone too: OrbitControls
 * always calls preventDefault() on contextmenu whenever it's enabled,
 * regardless of whether RIGHT is mapped to anything (see three.js's own
 * onContextMenu) — so an unmapped right-click doesn't even fall through
 * to the browser's native context menu, it's just a dead click with zero
 * feedback. Also helps trackpad/laptop users with no real middle button.
 */
export function useOrbitMouseButtons(scheme: ControlScheme): Partial<{ LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE }> {
  if (scheme === "cad") {
    return { MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };
  }
  return { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
}

/**
 * Human-readable legend for the active scheme — kept as the single source
 * of truth alongside useOrbitMouseButtons() so the two can't drift apart
 * (ControlSchemeSelect.tsx renders this directly, one entry per action).
 */
export const CONTROL_SCHEME_LEGEND: Record<ControlScheme, Array<{ label: string; combo: string }>> = {
  meshdiff: [
    { label: "Pan", combo: "Right-click + drag" },
    { label: "Orbit/Rotate", combo: "Left-click + drag" },
    { label: "Zoom", combo: "Scroll wheel" },
    { label: "Left Click", combo: "Orbit/rotate camera" },
    { label: "Right Click", combo: "Pan camera" },
  ],
  cad: [
    { label: "Pan", combo: "Middle-click + drag (or right-click + drag)" },
    { label: "Orbit/Rotate", combo: "Shift + middle-click + drag" },
    { label: "Zoom", combo: "Scroll wheel" },
    { label: "Left Click", combo: "Free — select / place pins, no camera action" },
    { label: "Right Click", combo: "Pan camera" },
  ],
};
