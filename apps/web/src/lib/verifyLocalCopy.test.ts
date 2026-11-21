import { describe, expect, it } from "vitest";
import { MAX_VERIFY_BYTES, sha256Hex, verifyLocalCopy } from "./verifyLocalCopy";

// SHA-256 of the ASCII string "abc" (FIPS 180-2 test vector).
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("sha256Hex", () => {
  it("matches the published test vector", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe(ABC_SHA256);
  });

  it("hashes an empty file", async () => {
    expect(await sha256Hex(new Blob([]))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("verifyLocalCopy", () => {
  const abc = new Blob(["abc"]);

  it("accepts the same file", async () => {
    expect(await verifyLocalCopy(abc, { sha256: ABC_SHA256, sizeBytes: 3 })).toEqual({ success: true });
  });

  it("rejects a file of the same size but different content", async () => {
    expect(await verifyLocalCopy(new Blob(["abd"]), { sha256: ABC_SHA256, sizeBytes: 3 })).toEqual({
      success: false,
      reason: "different_file",
    });
  });

  it("rejects a different size without needing to hash", async () => {
    expect(await verifyLocalCopy(new Blob(["abcd"]), { sha256: ABC_SHA256, sizeBytes: 3 })).toEqual({
      success: false,
      reason: "wrong_size",
    });
  });

  it("treats the hash as case-sensitive lowercase (what the server stores)", async () => {
    const result = await verifyLocalCopy(abc, { sha256: ABC_SHA256.toUpperCase(), sizeBytes: 3 });
    expect(result.success).toBe(false);
  });

  it("accepts a same-size file when the version has no hash to check against", async () => {
    expect(await verifyLocalCopy(abc, { sha256: null, sizeBytes: 3 })).toEqual({ success: true });
  });

  it("refuses a file too large to hash in a browser tab", async () => {
    const huge = { size: MAX_VERIFY_BYTES + 1 } as Blob;
    expect(await verifyLocalCopy(huge, { sha256: ABC_SHA256, sizeBytes: MAX_VERIFY_BYTES + 1 })).toEqual({
      success: false,
      reason: "too_large",
    });
  });

  it("reports an unreadable file instead of throwing", async () => {
    const broken = { size: 3, arrayBuffer: () => Promise.reject(new Error("read failed")) } as unknown as Blob;
    expect(await verifyLocalCopy(broken, { sha256: ABC_SHA256, sizeBytes: 3 })).toEqual({
      success: false,
      reason: "unreadable",
    });
  });
});
