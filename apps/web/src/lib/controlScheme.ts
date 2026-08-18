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
 * pans, Shift+middle-mouse-drag orbits, wheel zooms. Left/right clicks are
 * left alone entirely (omitted from mouseButtons, so OrbitControls ignores
 * them) rather than mapped to anything — real CAD tools reserve left-click
 * for selection, and this app uses left-click to place comment pins and
 * measurement points, so leaving it free of camera behavior matches both.
 */
export function useOrbitMouseButtons(scheme: ControlScheme): Partial<{ LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE }> {
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    if (scheme !== "cad") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShiftHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [scheme]);

  if (scheme === "cad") {
    return { MIDDLE: shiftHeld ? MOUSE.ROTATE : MOUSE.PAN };
  }
  return { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
}
