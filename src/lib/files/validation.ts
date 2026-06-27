import { isImageMimeType } from "./image-processing";
import type { ConfiguredSettings } from "@/lib/system-settings-config";

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

const ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
]);

export function isAllowedMimeType(mimeType: string): boolean {
  return isImageMimeType(mimeType) || ALLOWED_ATTACHMENT_TYPES.has(mimeType);
}

export function isZipMimeType(mimeType: string): boolean {
  return ZIP_MIME_TYPES.has(mimeType);
}

export function validateFileSize(
  sizeBytes: number,
  mimeType: string,
  settings: Pick<ConfiguredSettings, "uploadMaxImageSizeBytes" | "uploadMaxFileSizeBytes">,
): string | null {
  const limit = isImageMimeType(mimeType)
    ? settings.uploadMaxImageSizeBytes
    : settings.uploadMaxFileSizeBytes;
  if (sizeBytes > limit) return "fileTooLarge";
  return null;
}

/**
 * Maximum decompressed size for a single ZIP entry.
 * Prevents a single entry from consuming excessive memory during validation,
 * even when the total archive size is below the overall limit.
 */
const MAX_SINGLE_ENTRY_DECOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Stream a single ZIP entry's decompressed bytes through a running counter and
 * return the entry's total decompressed size, aborting early (without ever
 * holding the full payload in memory) the moment the per-entry cap is exceeded.
 *
 * Returns `null` if the entry exceeds `maxEntryBytes` or the stream errors;
 * otherwise resolves with the entry's decompressed byte count. The caller is
 * responsible for the running total + overall-archive cap.
 *
 * Uses JSZip's typed `nodeStream('nodebuffer')` API (a Node Readable) so we can
 * consume incremental `Buffer` chunks via 'data' events and `destroy()` the
 * stream as soon as the cap is crossed — a zip-bomb entry never materializes
 * its full decompressed payload. (NEW-M8 / C3-N8)
 */
export async function measureEntryStreamedSize(
  entry: { nodeStream(type?: "nodebuffer"): NodeJS.ReadableStream },
  maxEntryBytes: number,
): Promise<number | null> {
  // Use the buffered `Readable` import (not the loose `NodeJS.ReadableStream`
  // type) so `.destroy()` is available for early abort.
  const stream = entry.nodeStream("nodebuffer") as import("node:stream").Readable;
  return new Promise<number | null>((resolve) => {
    let accumulated = 0;
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      // Remove listeners to avoid duplicate resolution after destroy().
      stream.removeAllListeners();
      // Ensure underlying decompression resources are released even on abort.
      if (!stream.destroyed) stream.destroy();
      resolve(value);
    };
    stream.on("data", (chunk: Buffer) => {
      accumulated += chunk.length;
      if (accumulated > maxEntryBytes) {
        // Cap exceeded — abort immediately without consuming further chunks.
        finish(null);
      }
    });
    stream.on("end", () => finish(accumulated));
    stream.on("error", () => finish(null));
  });
}

/**
 * Validate the total decompressed size of a ZIP buffer to prevent ZIP bombs.
 *
 * Reads `uncompressedSize` from each entry's metadata when available (O(1) per
 * entry) instead of decompressing every entry into memory. Falls back to full
 * decompression only when the metadata is missing (e.g., ZIPs using data
 * descriptors without sizes — rare in practice).
 *
 * Per-entry size cap prevents OOM from a ZIP bomb with many small entries
 * that each decompress to a large payload — the total check alone would
 * allow up to 10,000 entries * 50 MB each before triggering. The slow path
 * streams each entry incrementally so a cap-exceeding entry is rejected
 * before its full payload is allocated.
 */
export async function validateZipDecompressedSize(
  buffer: Buffer,
  maxDecompressedSizeBytes: number,
): Promise<string | null> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer, { createFolders: false });
    const entries = Object.values(zip.files).filter((e) => !e.dir);
    // Limit the number of entries to prevent ZIP bomb with millions of tiny files
    if (entries.length > 10000) return "zipDecompressedSizeExceeded";

    // Fast path: read uncompressedSize from ZIP metadata without decompressing.
    // This avoids allocating hundreds of MB of memory for the common case.
    // JSZip exposes entry._data.uncompressedSize after loadAsync for most ZIPs.
    let totalUncompressed = 0;
    let allMetadataAvailable = true;
    for (const entry of entries) {
      const metadataSize: number | undefined = (entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
      if (metadataSize === undefined) {
        allMetadataAvailable = false;
        break;
      }
      // Per-entry size cap: reject any single entry that decompresses beyond
      // this limit to prevent OOM before the total accumulator can catch it.
      if (metadataSize > MAX_SINGLE_ENTRY_DECOMPRESSED_BYTES) {
        return "zipDecompressedSizeExceeded";
      }
      totalUncompressed += metadataSize;
      if (totalUncompressed > maxDecompressedSizeBytes) {
        return "zipDecompressedSizeExceeded";
      }
    }

    if (allMetadataAvailable) {
      return null; // All entries within limits
    }

    // Slow path: some entries lack metadata (data descriptors without sizes).
    // Stream entry by entry, accumulating a running byte counter and aborting
    // the moment a per-entry or total cap is exceeded. Streaming (rather than
    // `entry.async("uint8array")`) is essential here: a zip-bomb entry whose
    // data descriptor hides the size can decompress to gigabytes, and the
    // non-streaming `.async()` call materializes the entire payload into a
    // single Uint8Array BEFORE the size check can fire — OOMing the process.
    // `internalStream()` emits incremental chunks via 'data' events, so we can
    // `pause()` and reject as soon as the counter crosses the cap, letting GC
    // reclaim the partial buffer without ever holding the full payload.
    // (NEW-M8 / C3-N8)
    totalUncompressed = 0;
    for (const entry of entries) {
      const entrySize = await measureEntryStreamedSize(
        entry,
        MAX_SINGLE_ENTRY_DECOMPRESSED_BYTES,
      );
      if (entrySize === null) return "zipDecompressedSizeExceeded";
      totalUncompressed += entrySize;
      if (totalUncompressed > maxDecompressedSizeBytes) {
        return "zipDecompressedSizeExceeded";
      }
    }
    return null;
  } catch {
    // If we can't parse the ZIP, reject it
    return "zipDecompressedSizeExceeded";
  }
}

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".webp",
  "image/png": ".webp",
  "image/gif": ".webp",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/markdown": ".md",
};

export function getExtensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? ".bin";
}

// ── Magic-byte verification ──────────────────────────────────────────────────

/**
 * Known magic-byte signatures for supported non-image MIME types.
 * Used to verify that uploaded file content matches the declared MIME type,
 * preventing disguised executable uploads.
 *
 * Each entry maps a MIME type to a list of acceptable byte signatures
 * (any match passes — some formats have multiple valid signatures).
 */
const MAGIC_SIGNATURES: Record<string, Array<{ offset: number; bytes: Buffer }>> = (() => {
  const entries: Record<string, Array<{ offset: number; bytes: Buffer }>> = {};
  // PDF: starts with %PDF-
  entries["application/pdf"] = [{ offset: 0, bytes: Buffer.from("%PDF-", "ascii") }];
  // ZIP: starts with PK\x03\x04 (local file header) or PK\x05\x06 (empty archive)
  entries["application/zip"] = [
    { offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
    { offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x05, 0x06]) },
  ];
  entries["application/x-zip-compressed"] = entries["application/zip"];
  return entries;
})();

/**
 * Verify that the file content matches the declared MIME type by checking
 * magic-byte signatures. Returns true if the content matches, false if it
 * does not match or if the MIME type has no defined signature (reject by
 * default — add new signatures to MAGIC_SIGNATURES when adding new types
 * to ALLOWED_ATTACHMENT_TYPES).
 *
 * Images are verified by `sharp` during processing (not here).
 * Text types (text/plain, text/csv, text/markdown) have no binary signature,
 * so we verify they don't contain null bytes (which would indicate binary
 * content disguised as text).
 */
export function verifyFileMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  // Images are verified by sharp during processImage — skip here
  if (isImageMimeType(declaredMimeType)) {
    return true;
  }

  // Text types: no binary signature, but verify no null bytes. Sample three
  // regions (start, middle, end) to catch files with a text prefix followed
  // by binary content, without scanning the entire file for large uploads.
  if (declaredMimeType.startsWith("text/")) {
    const SLICE_SIZE = 8192;
    const slices = [buffer.subarray(0, Math.min(buffer.length, SLICE_SIZE))];
    if (buffer.length > SLICE_SIZE) {
      slices.push(buffer.subarray(-SLICE_SIZE));
      if (buffer.length > SLICE_SIZE * 3) {
        const midStart = Math.floor(buffer.length / 2) - Math.floor(SLICE_SIZE / 2);
        slices.push(buffer.subarray(Math.max(SLICE_SIZE, midStart), Math.min(buffer.length - SLICE_SIZE, midStart + SLICE_SIZE)));
      }
    }
    return !slices.some((slice) => slice.includes(0x00));
  }

  // Check known magic-byte signatures
  const signatures = MAGIC_SIGNATURES[declaredMimeType];
  if (!signatures) {
    // No signature defined for this MIME type — reject by default.
    // When adding a new MIME type to ALLOWED_ATTACHMENT_TYPES, you MUST also
    // add a corresponding signature to MAGIC_SIGNATURES (or document why the
    // type cannot be verified). This prevents accidentally allowing
    // unverified content through the upload pipeline.
    return false;
  }

  for (const sig of signatures) {
    const start = sig.offset;
    const end = start + sig.bytes.length;
    if (buffer.length < end) continue;
    if (buffer.subarray(start, end).equals(sig.bytes)) {
      return true;
    }
  }

  return false;
}
