import { describe, expect, it } from "vitest";
import type { LocalVersion } from "@meshdiff/shared/localLibrary";
import { diffBaseFor } from "./diffBase";

const v = (id: string, missingFile = false): LocalVersion =>
  ({ id, number: 1, fileName: `${id}.stl`, format: "stl", sizeBytes: 1, sha256: "x", createdAt: "", analysis: null, ...(missingFile ? { missingFile: true } : {}) }) as LocalVersion;

describe("diffBaseFor", () => {
  it("is the previous version when it has its file", () => {
    expect(diffBaseFor([v("a"), v("b"), v("c")], 2)?.id).toBe("b");
  });

  it("is nothing for the first version (it is diffed against itself)", () => {
    expect(diffBaseFor([v("a")], 0)).toBeNull();
  });

  it("skips back past versions that have no file on this computer", () => {
    expect(diffBaseFor([v("a"), v("b", true), v("c", true), v("d")], 3)?.id).toBe("a");
  });

  it("is nothing when every earlier version lacks its file", () => {
    expect(diffBaseFor([v("a", true), v("b", true), v("c")], 2)).toBeNull();
  });

  it("does not look at later versions", () => {
    expect(diffBaseFor([v("a"), v("b"), v("c")], 1)?.id).toBe("a");
  });
});
