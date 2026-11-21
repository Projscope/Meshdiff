import { build } from "esbuild";

// Main and preload are bundled into single CommonJS files so the packaged app
// needs no node_modules at all (electron-builder can't reliably resolve
// hoisted npm-workspace dependencies). Only `electron` itself stays external.
// Where the cloud lives is baked in at build time (the release workflow sets these).
// A plain `npm run build` leaves them empty and the app runs fully locally; set the
// same names in the environment at runtime to point a build at another stack.
const define = {
  __MESHDIFF_API_URL__: JSON.stringify(process.env.MESHDIFF_API_URL ?? ""),
  __MESHDIFF_SUPABASE_URL__: JSON.stringify(process.env.MESHDIFF_SUPABASE_URL ?? ""),
  __MESHDIFF_SUPABASE_ANON_KEY__: JSON.stringify(process.env.MESHDIFF_SUPABASE_ANON_KEY ?? ""),
};

const common = {
  define,
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
