import { defineConfig } from "@playwright/test";

// Chromium only — this suite exists to verify one static SVG asset
// animates correctly (see tests/visual/team-features-explainer.spec.ts),
// not to cross-browser-test the whole app, so the full browser matrix
// Playwright ships by default would be pure overhead here.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    colorScheme: "dark",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
