// Measures what analysing a model costs, to size the desktop app's triangle limit
// from numbers rather than guesses. Each size runs in a fresh process so its peak
// memory is its own. Run on demand (it takes a few minutes), not in CI:
//
//   node tests/bench-analysis.mjs                 # default sizes
//   node tests/bench-analysis.mjs 100000 750000   # chosen sizes (triangles)
//
// It diffs two sphere meshes of the given size with the real engine (weld/repair, then
// voxel diff with wall-thickness, overhang and hole analysis), the same work the app
// does for a version. Memory is the whole process's peak, which is roughly what the
// app's analysis worker plus the parsed meshes hold at once.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedEngine = path.resolve(appDir, "../shared/src/engine").replace(/\\/g, "/");
const bundle = path.join(os.tmpdir(), "meshdiff-bench-engine.mjs");

if (process.argv[2] === "--child") {
  const triangles = Number(process.argv[3]);
  const { THREE, repairMeshGeometry, computeVoxelDiff } = await import(pathToFileURL(bundle).href);
  // A sphere of ~N triangles (20 * (detail + 1)^2), and a slightly larger one to diff against.
  const detail = Math.max(1, Math.round(Math.sqrt(triangles / 20)) - 1);
  const make = (radius) => repairMeshGeometry(new THREE.IcosahedronGeometry(radius, detail)).geometry;
  const a = make(10);
  const b = make(10.5);
  const count = (g) => (g.getIndex() ? g.getIndex().count : g.getAttribute("position").count) / 3;
  const start = performance.now();
  const result = computeVoxelDiff(a, b, { maxTriangles: Number.POSITIVE_INFINITY });
  const ms = performance.now() - start;
  console.log(
    JSON.stringify({
      triangles: count(a),
      ok: result.success,
      error: result.success ? null : result.error,
      diffSeconds: +(ms / 1000).toFixed(2),
      peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
    }),
  );
  process.exit(0);
}

await build({
  stdin: {
    contents: `
      export * as THREE from "three";
      export { repairMeshGeometry } from "${sharedEngine}/repairMesh.ts";
      export { computeVoxelDiff } from "${sharedEngine}/diffVoxels.ts";
    `,
    resolveDir: path.resolve(appDir, "../shared"),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
  logLevel: "silent",
});

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const targets = sizes.length ? sizes : [50_000, 100_000, 200_000, 500_000, 1_000_000];
console.log(`Machine: ${os.cpus()[0].model.trim()}, ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM, Node ${process.version}\n`);
console.log("triangles/mesh | diff time | peak memory | result");
for (const triangles of targets) {
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--child", String(triangles)], {
    encoding: "utf8",
    timeout: 15 * 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const line = run.stdout.trim().split("\n").pop() ?? "";
  try {
    const r = JSON.parse(line);
    console.log(
      `${String(Math.round(r.triangles)).padStart(14)} | ${String(r.diffSeconds + " s").padStart(9)} | ${String(r.peakRssMB + " MB").padStart(11)} | ${r.ok ? "ok" : r.error}`,
    );
  } catch {
    const reason = run.error?.code === "ETIMEDOUT" ? "timed out (15 min)" : `crashed (exit ${run.status}) ${run.stderr.split("\n")[0]?.slice(0, 120) ?? ""}`;
    console.log(`${String(triangles).padStart(14)} | ${"-".padStart(9)} | ${"-".padStart(11)} | ${reason}`);
  }
}
fs.rmSync(bundle, { force: true });
