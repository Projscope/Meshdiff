import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH = path.resolve(__dirname, "../../src/assets/team-features-explainer.svg");

const SCENES = ["scene1", "scene2", "scene3", "scene4"] as const;

/** Reads the live, animation-driven opacity of each `.sceneN` group —
 * proves the CSS keyframe loop (see the SVG's own <style>) is actually
 * cycling through all four Team-feature scenes in order, not just that
 * the file parses and renders a static first frame. */
async function opacities(page: import("@playwright/test").Page): Promise<Record<string, number>> {
  const values = await page.evaluate((classNames: string[]) => {
    const result: Record<string, number> = {};
    for (const className of classNames) {
      const el = document.querySelector(`.${className}`);
      result[className] = el ? Number(getComputedStyle(el).opacity) : -1;
    }
    return result;
  }, SCENES as unknown as string[]);
  return values;
}

// One checkpoint per scene, timed to land comfortably mid-scene (each
// scene occupies a 4s quarter of the SVG's 16s loop — see sceneFade's
// keyframe percentages) rather than right at a fade boundary, so timing
// jitter in CI can't flip which scene reads as "active".
const CHECKPOINTS: Array<{ atMs: number; activeScene: (typeof SCENES)[number] }> = [
  { atMs: 1500, activeScene: "scene1" },
  { atMs: 5500, activeScene: "scene2" },
  { atMs: 9500, activeScene: "scene3" },
  { atMs: 13500, activeScene: "scene4" },
];

test("team features explainer cycles through all four scenes", async ({ page }) => {
  await page.goto(`file://${SVG_PATH.replace(/\\/g, "/")}`);

  // Loaded once, then we just let time pass on the same page — the CSS
  // animation keeps running in real time the whole way through, exactly
  // as it would for a viewer.
  let elapsed = 0;
  for (const { atMs, activeScene } of CHECKPOINTS) {
    await page.waitForTimeout(atMs - elapsed);
    elapsed = atMs;

    const current = await opacities(page);
    for (const scene of SCENES) {
      if (scene === activeScene) {
        expect(current[scene], `${scene} should be visible at t=${atMs}ms`).toBeGreaterThan(0.9);
      } else {
        expect(current[scene], `${scene} should be hidden at t=${atMs}ms`).toBeLessThan(0.1);
      }
    }

    await page.screenshot({ path: path.join(__dirname, "__screenshots__", `${activeScene}.png`) });
  }
});
