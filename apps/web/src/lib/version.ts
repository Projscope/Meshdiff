import pkg from "../../package.json";

/** Single source of truth for the displayed app version — pulls from package.json rather than being hardcoded per-component. */
export const APP_VERSION = pkg.version;
