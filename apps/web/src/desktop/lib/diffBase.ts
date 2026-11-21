import type { LocalVersion } from "@meshdiff/shared/localLibrary";

/**
 * The version a version is diffed against: the nearest earlier one whose model file is on
 * this computer. Usually that is simply the version before it. It differs once a team
 * project has versions here that arrived without a file (a teammate's): the diff engine
 * needs both files, so it skips back past them. null means "diff it against itself", the
 * same as a project's first version.
 */
export function diffBaseFor(versions: LocalVersion[], index: number): LocalVersion | null {
  for (let i = index - 1; i >= 0; i--) {
    if (!versions[i]!.missingFile) return versions[i]!;
  }
  return null;
}
