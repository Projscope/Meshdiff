// Voxelization + BVH wall-thickness raycasting load the full mesh into
// memory multiple times over (raw buffers, then BVH nodes on top) — an
// oversized mesh was observed crashing the whole Render instance with an
// unrecoverable V8 heap OOM, taking down every other in-flight request with
// it. 50MB matches the documented performance target (CLAUDE.md: "under
// 50MB"). Enforced twice: at upload time against the client-reported size
// (versions.ts), and again here against the actual downloaded blob — a
// client could under-report size at upload time and then push a larger file
// straight to the signed URL, so the upload-time check alone isn't a real
// boundary.
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function exceedsMaxFileSize(blob: Blob): boolean {
  return blob.size > MAX_FILE_BYTES;
}
