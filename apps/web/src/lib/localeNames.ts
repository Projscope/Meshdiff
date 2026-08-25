// Native Intl.DisplayNames — no static country/language table to maintain.
// Falls back to the raw code if the runtime lacks the API or the value
// isn't a recognizable region/language tag (e.g. "unknown").
const countryDisplay =
  typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const languageDisplay =
  typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;

export function countryName(code: string): string {
  if (!countryDisplay) return code;
  try {
    return countryDisplay.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string): string {
  if (!languageDisplay) return code;
  try {
    return languageDisplay.of(code) ?? code;
  } catch {
    return code;
  }
}
