import type { NextRequest } from "next/server";

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Read a stream into a Uint8Array with a byte-length limit.
 * Uses buffer-based accumulation instead of string concatenation to avoid:
 * (1) UTF-16 doubling of memory for multi-byte content (JS strings are UTF-16)
 * (2) Intermediate string allocations during concatenation (GC pressure)
 * (3) Peak memory being 3x the upload size (string + parse result)
 *
 * Peak memory is now ~1x the upload size for the buffer, plus the parsed result.
 */
async function readStreamBytesWithLimit(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  limit = MAX_IMPORT_BYTES
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      throw new Error("fileTooLarge");
    }
    chunks.push(value);
  }

  // Concatenate all chunks into a single Uint8Array
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export async function readJsonBodyWithLimit<T = unknown>(
  request: NextRequest,
  limit = MAX_IMPORT_BYTES
): Promise<T> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > limit) {
      throw new Error("fileTooLarge");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error("invalidJson");
  }

  const bytes = await readStreamBytesWithLimit(reader, limit);
  const text = new TextDecoder().decode(bytes);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("invalidJson");
  }
}

export async function readUploadedJsonFileWithLimit<T = unknown>(
  file: File,
  limit = MAX_IMPORT_BYTES
): Promise<T> {
  if (file.size > limit) {
    throw new Error("fileTooLarge");
  }

  // Use file.arrayBuffer() directly — file.size is already validated,
  // so we can read the entire file without streaming overhead.
  // This avoids the string concatenation and UTF-16 doubling issues
  // that the previous streaming approach had.
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder().decode(buffer);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("invalidJson");
  }
}
