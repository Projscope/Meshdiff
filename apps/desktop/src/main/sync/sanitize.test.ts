import { describe, expect, it } from "vitest";
import type { CloudComment, CloudVersion } from "./cloudApi";
import { cleanRemoteComment, cleanRemoteVersion } from "./sanitize";

const version = (over: Partial<CloudVersion> = {}): CloudVersion => ({
  id: "01HZ0000000000000000000001", versionNumber: 1, fileName: "bracket.stl", fileFormat: "stl", fileSizeBytes: 100,
  storageMode: "local", contentSha256: "a".repeat(64), changeSummary: "ok", printabilityStatus: "pass", approvalStatus: "in_review",
  createdAt: "2026-01-01T00:00:00Z", uploaderEmail: "a@b.c", ...over,
});
const comment = (over: Partial<CloudComment> = {}): CloudComment => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", versionId: "01HZ0000000000000000000001", parentCommentId: null, body: "Too thin",
  position: [1, 2, 3], normal: null, status: "open", authorEmail: "a@b.c", createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z", deletedAt: null, ...over,
});

describe("cleanRemoteVersion", () => {
  it("passes a well-formed version through", () => {
    expect(cleanRemoteVersion(version())).toEqual(version());
  });

  it.each([
    ["a bad id", { id: "../../x" }],
    ["version number 0", { versionNumber: 0 }],
    ["a fractional version number", { versionNumber: 1.5 }],
    ["an unknown format", { fileFormat: "exe" }],
    ["a negative size", { fileSizeBytes: -1 }],
    ["an absurd size", { fileSizeBytes: 1e15 }],
    ["an unknown storage mode", { storageMode: "remote" as never }],
    ["a malformed hash", { contentSha256: "XYZ" }],
    ["an empty name", { fileName: "   " }],
    ["a bad date", { createdAt: "yesterday" }],
  ])("drops a version with %s", (_label, over) => {
    expect(cleanRemoteVersion(version(over as Partial<CloudVersion>))).toBeNull();
  });

  it("keeps a null hash (a version uploaded through the website)", () => {
    expect(cleanRemoteVersion(version({ contentSha256: null, storageMode: "cloud" }))?.contentSha256).toBeNull();
  });

  it("reduces a file name to just its name, without control characters", () => {
    expect(cleanRemoteVersion(version({ fileName: "..\..\evil\u0000/part.stl" }))?.fileName).toBe("part.stl");
  });

  it("limits free text and ignores an unknown printability value", () => {
    const cleaned = cleanRemoteVersion(version({ changeSummary: "x".repeat(5000), printabilityStatus: "great" as never }))!;
    expect(cleaned.changeSummary).toHaveLength(2000);
    expect(cleaned.printabilityStatus).toBeNull();
  });

  it("survives junk instead of throwing", () => {
    expect(cleanRemoteVersion(null as never)).toBeNull();
    expect(cleanRemoteVersion("x" as never)).toBeNull();
  });
});

describe("cleanRemoteComment", () => {
  it("passes a well-formed comment through, copying its arrays", () => {
    const input = comment({ normal: [0, 0, 1] });
    const out = cleanRemoteComment(input)!;
    expect(out).toEqual(input);
    expect(out.position).not.toBe(input.position);
  });

  it.each([
    ["a non-UUID id", { id: "1" }],
    ["a bad version id", { versionId: "x" }],
    ["a bad parent id", { parentCommentId: "nope" }],
    ["an empty body", { body: "   " }],
    ["a huge body", { body: "x".repeat(5001) }],
    ["a position with NaN", { position: [1, Number.NaN, 3] as never }],
    ["a position of the wrong length", { position: [1, 2] as never }],
    ["a non-numeric position", { position: ["1", "2", "3"] as never }],
    ["a bad normal", { normal: [1, 2] as never }],
    ["an unknown status", { status: "closed" as never }],
    ["a bad timestamp", { updatedAt: "soon" }],
  ])("drops a comment with %s", (_label, over) => {
    expect(cleanRemoteComment(comment(over as Partial<CloudComment>))).toBeNull();
  });

  it("keeps multi-line bodies but strips other control characters", () => {
    expect(cleanRemoteComment(comment({ body: "line one\nline two\u0000\u0007" }))?.body).toBe("line one\nline two");
  });

  it("survives junk instead of throwing", () => {
    expect(cleanRemoteComment(undefined as never)).toBeNull();
  });
});
