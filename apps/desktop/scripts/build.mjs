import { build } from "esbuild";

// Main and preload are bundled into single CommonJS files so the packaged app
// needs no node_modules at all (electron-builder can't reliably resolve
// hoisted npm-workspace dependencies). Only `electron` itself stays external.
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  external: ["electron"],
};

await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: "dist/main.cjs" });
await build({ ...common, entryPoints: ["src/preload/index.ts"], outfile: "dist/preload.cjs" });
