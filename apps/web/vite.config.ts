import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@meshdiff/shared": path.resolve(import.meta.dirname, "../shared/src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("node_modules/react")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/three") || id.includes("node_modules/@react-three")) {
            return "three-vendor";
          }
        },
      },
    },
    // Vite auto-injects <link rel="modulepreload"> for chunks reachable via
    // React.lazy()'s dynamic import()s (router.tsx), even though they're
    // never executed unless that route is actually visited — normally a
    // nice latency win, but three-vendor is ~900KB uncompressed and was
    // still competing with the landing page's LCP image for initial-load
    // bandwidth even though it never runs there (see Lighthouse audit —
    // resourceEntries confirmed initiatorType "other"/prefetch, not
    // "script"/executed, but the bytes were still downloaded). Excluding
    // it from the preload list means it's fetched lazily, on-demand, only
    // once a route that actually needs it (e.g. /live) is visited.
    modulePreload: {
      resolveDependencies: (_filename, deps) => deps.filter((dep) => !dep.includes("three-vendor")),
    },
  },
  test: {
    environment: "node",
  },
});
