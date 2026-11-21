// Moved to apps/shared so the desktop client can generate the identical
// summary offline. Re-exported here so the API's call sites don't change.
export { generateChangeSummary } from "../../../shared/dist/generateSummary.js";
