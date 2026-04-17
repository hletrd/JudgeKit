import { isImageMimeType } from "./image-processing";
import type { ConfiguredSettings } from "@/lib/system-settings-config";
import JSZip from "jszip";

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
 * Validate the total decompressed size of a ZIP buffer to prevent ZIP bombs.
 * Iterates all entries and sums their uncompressed sizes. Returns an error
 * message key if the total exceeds maxDecompressedSizeBytes, null otherwise.
 */
export async function validateZipDecompressedSize(
  buffer: Buffer,
  maxDecompressedSizeBytes: number,
): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(buffer, { createFolders: false });
    const entries = Object.values(zip.files).filter((e) => !e.dir);
    // Limit the number of entries to prevent ZIP bomb with millions of tiny files
    if (entries.length > 10000) return "zipDecompressedSizeExceeded";
    let totalUncompressed = 0;
    for (const entry of entries) {
      // JSZip doesn't expose uncompressed size without decompressing,
      // so we use async() with a size accumulator. Decompress entry by
      // entry and abort early if the running total exceeds the limit.
      const content = await entry.async("uint8array");
      totalUncompressed += content.length;
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
