import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@meshdiff/shared": path.resolve(import.meta.dirname, "../../src"),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "node",
  },
});
