/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" only in the Electron desktop renderer build (vite.desktop.config.ts). */
  readonly VITE_DESKTOP?: string;
}
