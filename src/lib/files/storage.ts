import { mkdir, writeFile, unlink, readFile, access, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";

function getDataDir(): string {
  return process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH, "..")
    : join(process.cwd(), "data");
}

export function getUploadsDir(): string {
  return join(getDataDir(), "uploads");
}

export async function ensureUploadsDir(): Promise<void> {
  await mkdir(getUploadsDir(), { recursive: true });
}

const SAFE_STORED_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]+$/;

export function resolveStoredPath(storedName: string): string {
  if (!SAFE_STORED_NAME_RE.test(storedName) || storedName.includes("..")) {
    throw new Error("Invalid stored file name");
  }
  return join(getUploadsDir(), storedName);
}

export async function writeUploadedFile(storedName: string, data: Buffer): Promise<void> {
  await ensureUploadsDir();
  await writeFile(resolveStoredPath(storedName), data, { mode: 0o600 });
}

export async function deleteUploadedFile(storedName: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(storedName));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function readUploadedFile(storedName: string): Promise<Buffer> {
  return readFile(resolveStoredPath(storedName));
}

export async function uploadedFileExists(storedName: string): Promise<boolean> {
  try {
    await access(resolveStoredPath(storedName));
    return true;
  } catch {
    return false;
  }
}

export function createUploadedFileReadStream(storedName: string): import("node:fs").ReadStream {
  return createReadStream(resolveStoredPath(storedName));
}

export async function getUploadedFileStats(storedName: string): Promise<import("node:fs").Stats> {
  return stat(resolveStoredPath(storedName));
}
