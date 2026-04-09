import type { NextRequest } from "next/server";

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024; // 100 MB

async function readStreamTextWithLimit(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  limit = MAX_IMPORT_BYTES
) {
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      throw new Error("fileTooLarge");
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
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

  const text = await readStreamTextWithLimit(reader, limit);

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

  const reader = file.stream().getReader();
  const text = await readStreamTextWithLimit(reader, limit);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("invalidJson");
  }
}
