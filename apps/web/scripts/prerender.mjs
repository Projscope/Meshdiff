// Build-time static prerendering (SSG), run after both the client build
// (`vite build`) and the SSR build (`vite build --ssr src/entry-server.tsx
// --outDir dist-ssr`) — see package.json's "build" script.
//
// For each route in entry-server.tsx's PRERENDER_ROUTES, this renders the
// page to a real HTML string via react-dom/server (already built into
// dist-ssr/entry-server.js) and writes it into a copy of dist/index.html at
// <route>/index.html, so a plain HTTP fetch — a crawler, curl, a browser
// with JS disabled — gets full H1/H2/body copy in the initial response
// instead of an empty <div id="root">. The client bundle then mounts over
// it exactly as before; this only changes what's in the raw HTML before
// that happens. The actual diff tool (/live and friends) is untouched —
// it isn't in PRERENDER_ROUTES and stays 100% client-rendered.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distDir = path.join(root, "dist");
const ssrEntry = path.join(root, "dist-ssr", "entry-server.js");

async function main() {
  if (!existsSync(ssrEntry)) {
    throw new Error(`SSR bundle not found at ${ssrEntry} — run "vite build --ssr src/entry-server.tsx --outDir dist-ssr" first.`);
  }

  const { renderRoute, ROUTE_META, PRERENDER_ROUTES } = await import(`file://${ssrEntry.replace(/\\/g, "/")}`);
  const template = await readFile(path.join(distDir, "index.html"), "utf-8");

  for (const routePath of Object.keys(PRERENDER_ROUTES)) {
    const bodyHtml = renderRoute(routePath);
    const meta = ROUTE_META[routePath];
    const html = injectIntoTemplate(template, bodyHtml, meta, routePath);

    const outPath =
      routePath === "/"
        ? path.join(distDir, "index.html")
        : path.join(distDir, routePath.replace(/^\//, ""), "index.html");

    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, html, "utf-8");
    console.log(`[prerender] wrote ${path.relative(distDir, outPath)} (${(bodyHtml.length / 1024).toFixed(1)}kb of markup)`);
  }

  // Not part of the published site (netlify.toml publishes apps/web/dist
  // only) but no reason to leave the intermediate SSR bundle on disk.
  await rm(path.join(root, "dist-ssr"), { recursive: true, force: true });
}

function injectIntoTemplate(template, bodyHtml, meta, routePath) {
  let html = template.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);

  if (meta) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    );
  }

  const canonicalUrl = `https://meshdiff.com${routePath}`;
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  );

  return html;
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

main().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
