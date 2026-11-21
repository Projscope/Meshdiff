import type { MeshdiffDesktopBridge } from "@meshdiff/shared/desktopBridge";

declare global {
  interface Window {
    /** Injected by the Electron preload script; undefined in a normal browser. */
    meshdiffDesktop?: MeshdiffDesktopBridge;
  }
}

export {};
