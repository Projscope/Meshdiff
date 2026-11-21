/** Largest file a browser can hash in one go (SubtleCrypto has no streaming
 * mode, so the whole file is read into memory first). */
export const MAX_VERIFY_BYTES = 512 * 1024 * 1024;

export type CopyVerification =
  | { success: true }
  | { success: false; reason: "too_large" | "wrong_size" | "different_file" | "unreadable" };

export async function sha256Hex(data: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Checks that a file a reviewer picked is the exact model a desktop user synced
 * (which only stored its hash). Nothing is uploaded; the file stays in the tab.
 *
 * The size is compared first because it is free and catches the common mix-up
 * (a different export of the same part) without reading the file at all.
 */
export async function verifyLocalCopy(
  file: Blob,
  expected: { sha256: string | null; sizeBytes: number },
): Promise<CopyVerification> {
  if (file.size !== expected.sizeBytes) return { success: false, reason: "wrong_size" };
  if (file.size > MAX_VERIFY_BYTES) return { success: false, reason: "too_large" };
  // A version synced without a hash can't be checked; accept a same-size file
  // rather than lock the reviewer out of their own copy.
  if (!expected.sha256) return { success: true };
  try {
    return (await sha256Hex(file)) === expected.sha256 ? { success: true } : { success: false, reason: "different_file" };
  } catch {
    return { success: false, reason: "unreadable" };
  }
}
