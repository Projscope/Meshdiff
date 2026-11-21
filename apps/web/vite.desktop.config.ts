import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

// Build config for the Electron renderer (see apps/desktop). A separate entry
// from the website: no marketing pages, no prerender, no analytics. The
// bundle is served by the main process over the privileged app:// scheme.
const root = import.meta.dirname;

// publicDir is off so the website's marketing files (sitemap, verification
// files, social images) don't ship in the installer; only the demo models do.
function copyDemoModels(): Plugin {
  return {
    name: "copy-demo-models",
    closeBundle() {
      fs.cpSync(path.resolve(root, "public/demo"), path.resolve(root, "dist-desktop/demo"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyDemoModels()],
  resolve: {
    alias: {
      "@meshdiff/shared": path.resolve(root, "../shared/src"),
    },
  },
  define: {
    "import.meta.env.VITE_DESKTOP": JSON.stringify("true"),
  },
  publicDir: false,
  build: {
    outDir: "dist-desktop",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      input: path.resolve(root, "desktop.html"),
    },
  },
});
