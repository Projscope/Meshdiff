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

  // index.html preloads the homepage hero image unconditionally — on every
  // other prerendered page that image is never used, so the preload just
  // spends first-load bandwidth/priority on a fetch that gets thrown away
  // (confirmed via a "preloaded but not used" console warning in production).
  if (routePath !== "/") {
    html = html.replace(/\s*<link rel="preload" as="image"[^>]*live-diff-preview[^>]*\/>\n?/, "\n");
  }

  if (meta) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    );
    // og:title/twitter:title and their descriptions were otherwise left at
    // index.html's homepage-specific values on every prerendered page —
    // sharing e.g. /stl-diff on Twitter/LinkedIn would show the homepage's
    // title and description instead of the actual page's.
    html = html.replace(
      /<meta property="og:title" content="[^"]*" \/>/,
      `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    );
    html = html.replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    );
    html = html.replace(
      /<meta name="twitter:title" content="[^"]*" \/>/,
      `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    );
    html = html.replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
      `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    );
  }

  // Netlify serves a directory's index.html for a bare path (e.g.
  // /stl-diff) by issuing a 301 to the trailing-slash form (/stl-diff/) —
  // confirmed on production, not just docs. A canonical tag pointing at
  // the pre-redirect URL would tell crawlers to canonicalize onto a URL
  // that immediately redirects away from itself, so this must match the
  // URL actually served (RootLayout's client-side canonical effect
  // already does this post-hydration via location.pathname; this keeps
  // the pre-hydration/no-JS HTML consistent with it).
  const canonicalUrl = routePath === "/" ? "https://meshdiff.com/" : `https://meshdiff.com${routePath}/`;
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${canonicalUrl}" />`,
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
