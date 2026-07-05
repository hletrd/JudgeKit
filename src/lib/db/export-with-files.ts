import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { streamDatabaseExport, type JudgeKitExport } from "@/lib/db/export";
import { readUploadedFile, resolveStoredPath, writeUploadedFile, ensureUploadsDir, uploadedFileExists } from "@/lib/files/storage";
import { logger } from "@/lib/logger";
import { asc } from "drizzle-orm";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Transform, type TransformCallback } from "node:stream";
import { createWriteStream } from "node:fs";
import { getDbNowUncached } from "@/lib/db-time";

interface BackupIntegrityEntry {
  path: string;
  sha256: string;
  byteLength: number;
}

interface BackupIntegrityManifest {
  version: 1;
  format: "judgekit-backup-integrity";
  createdAt: string;
  database: BackupIntegrityEntry & {
    redactionMode: JudgeKitExport["redactionMode"] | "legacy-unknown";
  };
  uploads: Array<
    BackupIntegrityEntry & {
      storedName: string;
    }
  >;
}

const BACKUP_MANIFEST_PATH = "backup-manifest.json";
export const MAX_BACKUP_ZIP_ENTRIES = 10_000;
export const MAX_BACKUP_ZIP_ENTRY_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_ZIP_DECOMPRESSED_BYTES = 512 * 1024 * 1024;

export type LoadedZipEntry = {
  name: string;
  dir: boolean;
  _data?: {
    uncompressedSize?: number;
  };
};

export type StagedUploadFile = {
  storedName: string;
  stagedPath: string;
  byteLength: number;
};

// Intentionally uses inline createHash rather than hashToken — this computes
// an integrity checksum for backup verification, not a verification hash.
// Divergence from token-hash.ts is acceptable because the checksum is never
// compared against stored DB values that use hashToken(). See C6-6 (cycle 6).
function sha256Hex(data: Buffer | Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex");
}

function createBackupIntegrityManifest(
  dbJson: string,
  dbExport: JudgeKitExport,
  uploads: BackupIntegrityManifest["uploads"],
  dbNow: Date
): BackupIntegrityManifest {
  return {
    version: 1,
    format: "judgekit-backup-integrity",
    createdAt: dbNow.toISOString(),
    database: {
      path: "database.json",
      sha256: sha256Hex(dbJson),
      byteLength: Buffer.byteLength(dbJson),
      redactionMode: dbExport.redactionMode ?? "legacy-unknown",
    },
    uploads,
  };
}

function parseBackupIntegrityManifest(raw: string): BackupIntegrityManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalidBackupManifest");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("invalidBackupManifest");
  }

  const manifest = parsed as Partial<BackupIntegrityManifest>;
  if (
    manifest.version !== 1 ||
    manifest.format !== "judgekit-backup-integrity" ||
    !manifest.database ||
    !Array.isArray(manifest.uploads)
  ) {
    throw new Error("invalidBackupManifest");
  }

  const dbEntry = manifest.database as Partial<BackupIntegrityManifest["database"]>;
  if (
    dbEntry.path !== "database.json" ||
    typeof dbEntry.sha256 !== "string" ||
    typeof dbEntry.byteLength !== "number"
  ) {
    throw new Error("invalidBackupManifest");
  }

  for (const upload of manifest.uploads) {
    if (
      !upload ||
      typeof upload !== "object" ||
      typeof upload.path !== "string" ||
      typeof upload.storedName !== "string" ||
      typeof upload.sha256 !== "string" ||
      typeof upload.byteLength !== "number" ||
      !upload.path.startsWith("uploads/") ||
      upload.path.includes("..") ||
      upload.path.slice("uploads/".length).includes("/")
    ) {
      throw new Error("invalidBackupManifest");
    }
  }

  return manifest as BackupIntegrityManifest;
}

function getDeclaredUncompressedSize(entry: LoadedZipEntry): number {
  const size = entry._data?.uncompressedSize;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    throw new Error("backupZipSizeUnknown");
  }
  return size;
}

export function enforceBackupZipSizeLimits(entries: LoadedZipEntry[]) {
  if (entries.length > MAX_BACKUP_ZIP_ENTRIES) {
    throw new Error("backupZipTooLarge");
  }

  let totalExpandedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;

    const uncompressedSize = getDeclaredUncompressedSize(entry);
    if (uncompressedSize > MAX_BACKUP_ZIP_ENTRY_BYTES) {
      throw new Error("backupZipTooLarge");
    }
    totalExpandedBytes += uncompressedSize;
    if (totalExpandedBytes > MAX_BACKUP_ZIP_DECOMPRESSED_BYTES) {
      throw new Error("backupZipTooLarge");
    }
  }
}

/**
 * Validate the storedName derived from a ZIP upload entry (the entry name with
 * the leading "uploads/" stripped). Mirrors the manifest rule in
 * parseBackupIntegrityManifest: a single flat path segment with no directory
 * separators, parent-directory traversal, or NUL bytes. Throws on anything that
 * could escape the staging directory (zip-slip). Exported for unit testing.
 */
export function assertSafeUploadStoredName(storedName: string): void {
  if (
    storedName.length === 0 ||
    storedName.includes("/") ||
    storedName.includes("\\") ||
    storedName.includes("..") ||
    storedName.includes("\0")
  ) {
    throw new Error("invalidUploadPath");
  }
}

async function streamEntryToStaging(
  entry: {
    name: string;
    nodeStream(type: "nodebuffer"): NodeJS.ReadableStream;
  },
  stagingDir: string,
  expected?: BackupIntegrityEntry & { storedName: string }
): Promise<StagedUploadFile> {
  const storedName = entry.name.slice("uploads/".length);

  // Zip-slip guard: entry.name comes from the archive's central directory, which
  // is attacker-controllable and is NOT covered by the manifest validation
  // (parseBackupIntegrityManifest). The `startsWith("uploads/")` filter alone
  // still admits a crafted "uploads/../../etc/…" entry, so validate the derived
  // storedName here and confirm the resolved target is a direct child of
  // stagingDir before opening any write stream.
  assertSafeUploadStoredName(storedName);
  const stagingRoot = path.resolve(stagingDir);
  const stagedPath = path.join(stagingRoot, storedName);
  if (path.dirname(stagedPath) !== stagingRoot) {
    throw new Error("invalidUploadPath");
  }

  const hash = createHash("sha256");
  let byteLength = 0;
  const hasher = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      hash.update(chunk);
      byteLength += chunk.length;
      callback(null, chunk);
    },
  });

  await pipeline(entry.nodeStream("nodebuffer"), hasher, createWriteStream(stagedPath, { mode: 0o600 }));

  const actualHash = hash.digest("hex");
  if (
    expected &&
    (expected.storedName !== storedName ||
      expected.sha256 !== actualHash ||
      expected.byteLength !== byteLength)
  ) {
    throw new Error("backupIntegrityMismatch");
  }

  return { storedName, stagedPath, byteLength };
}

/**
 * Export database + uploaded files as a ZIP archive.
 * The ZIP contains:
 *   database.json  – standard JudgeKitExport
 *   uploads/       – uploaded files keyed by their storedName
 *
 * @param signal - Optional AbortSignal to cancel the export
 * @param dbNow - Optional DB server timestamp. When provided, avoids an extra
 *   SELECT NOW() round-trip and ensures consistency with the caller's time
 *   reference. Falls back to getDbNowUncached() when omitted.
 */
export async function streamBackupWithFiles(signal?: AbortSignal, dbNow?: Date): Promise<ReadableStream<Uint8Array>> {
  // Use caller-provided DB time or fetch once so the manifest createdAt
  // matches the export snapshot. Passing dbNow from the route handler avoids
  // redundant SELECT NOW() round-trips across the backup pipeline.
  const resolvedDbNow = dbNow ?? await getDbNowUncached();
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // 1. Collect database export as JSON
  const dbChunks: Uint8Array[] = [];
  const dbStream = streamDatabaseExport({ signal, dbNow: resolvedDbNow });

  const dbReader = dbStream.getReader();
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await dbReader.read();
      if (done) break;
      dbChunks.push(value);
    }
  } catch (error) {
    // Propagate abort errors without wrapping so the route handler can
    // distinguish client disconnects from actual backup failures.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error("backupStreamReadFailed", { cause: error });
  } finally {
    dbReader.releaseLock();
  }

  const dbJson = Buffer.concat(dbChunks).toString("utf-8");
  const dbExport = JSON.parse(dbJson);
  zip.file("database.json", dbJson);

  // 2. Collect file records from DB
  const fileRecords = await db
    .select({ storedName: files.storedName })
    .from(files)
    .orderBy(asc(files.createdAt));

  // 3. Add each file to the ZIP
  const uploadsFolder = zip.folder("uploads")!;
  const manifestUploads: BackupIntegrityManifest["uploads"] = [];
  let included = 0;
  let skipped = 0;

  for (const record of fileRecords) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      await access(resolveStoredPath(record.storedName));
      const buffer = await readUploadedFile(record.storedName);
      uploadsFolder.file(record.storedName, buffer);
      manifestUploads.push({
        path: `uploads/${record.storedName}`,
        storedName: record.storedName,
        sha256: sha256Hex(buffer),
        byteLength: buffer.byteLength,
      });
      included++;
    } catch (err) {
      // Propagate abort errors so the route handler can detect client disconnects.
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      // File may have been deleted from disk; skip silently
      skipped++;
    }
  }

  logger.info({ included, skipped, total: fileRecords.length }, "Backup file upload collection complete");
  zip.file(
    BACKUP_MANIFEST_PATH,
    JSON.stringify(createBackupIntegrityManifest(dbJson, dbExport, manifestUploads, resolvedDbNow), null, 2)
  );

  // 4. Generate ZIP as a Web ReadableStream
  const blob = await zip.generateAsync({ type: "uint8array" }, (metadata) => {
    void metadata;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(blob);
      controller.close();
    },
  });
}

/**
 * Restore uploaded files and extract database.json from a ZIP backup archive.
 *
 * Prefer `parseBackupZip` + `restoreParsedBackupFiles` in destructive restore
 * routes so DB validation/import can finish before live uploaded files mutate.
 */
export async function restoreFilesFromZip(zipBuffer: Buffer): Promise<{
  dbExport: JudgeKitExport;
  filesRestored: number;
}> {
  const stagingDir = await mkdtemp(path.join(tmpdir(), "judgekit-restore-"));
  try {
    const parsed = await parseBackupZip(zipBuffer, stagingDir);
    const filesRestored = await restoreParsedBackupFiles(parsed.uploads);
    return { dbExport: parsed.dbExport, filesRestored };
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function parseBackupZip(
  zipBuffer: Buffer,
  stagingDir: string
): Promise<{
  dbExport: JudgeKitExport;
  uploads: StagedUploadFile[];
}> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipBuffer);
  enforceBackupZipSizeLimits(Object.values(zip.files) as LoadedZipEntry[]);

  // 1. Extract database.json
  const dbEntry = zip.file("database.json");
  if (!dbEntry) {
    throw new Error("missingDatabaseJson");
  }

  const dbJson = await dbEntry.async("text");
  const manifestEntry = zip.file(BACKUP_MANIFEST_PATH);
  const manifest = manifestEntry
    ? parseBackupIntegrityManifest(await manifestEntry.async("text"))
    : null;

  if (manifest) {
    const actualDbHash = sha256Hex(dbJson);
    if (
      manifest.database.sha256 !== actualDbHash ||
      manifest.database.byteLength !== Buffer.byteLength(dbJson)
    ) {
      throw new Error("backupIntegrityMismatch");
    }
  }

  let dbExport: JudgeKitExport;
  try {
    dbExport = JSON.parse(dbJson);
  } catch {
    throw new Error("invalidDatabaseJson");
  }

  // 2. Stream uploads/ entries to the staging directory, validating checksums
  // incrementally. The restore route runs the DB transaction only after all
  // files are staged and verified.
  const uploads: StagedUploadFile[] = [];
  const fileEntries = zip.filter(
    (relativePath) => relativePath.startsWith("uploads/") && !relativePath.endsWith("/")
  );
  const manifestUploads = manifest
    ? new Map(manifest.uploads.map((upload) => [upload.path, upload]))
    : null;

  for (const entry of fileEntries) {
    const storedName = entry.name.slice("uploads/".length);
    if (!storedName) continue;

    // Validate: no path traversal. Normalize first to catch encoded variants,
    // then reject any path that escapes the uploads directory.
    const normalized = path.normalize(storedName);
    if (normalized.includes("/") || normalized.includes("\\") || normalized.startsWith("..") || normalized === "..") {
      logger.warn({ storedName, normalized }, "Skipping file with invalid name in backup ZIP");
      continue;
    }

    const expected = manifestUploads ? manifestUploads.get(entry.name) : undefined;
    const staged = await streamEntryToStaging(entry, stagingDir, expected ?? undefined);
    if (expected) {
      manifestUploads!.delete(entry.name);
    }
    uploads.push(staged);
  }

  if (manifestUploads && manifestUploads.size > 0) {
    throw new Error("backupIntegrityMismatch");
  }

  logger.info({ filesPendingRestore: uploads.length }, "Validated uploaded files from backup ZIP");

  return { dbExport, uploads };
}

export async function restoreParsedBackupFiles(
  uploads: StagedUploadFile[]
): Promise<number> {
  await ensureUploadsDir();
  for (const upload of uploads) {
    const buffer = await readFile(upload.stagedPath);
    await writeUploadedFile(upload.storedName, buffer);
  }

  // Post-write consistency verification (AGG-1 partial). The DB transaction
  // commits BEFORE this function runs, so a silent partial write — an
  // intermittent I/O error that leaves some files absent without throwing —
  // would leave the DB referencing blobs that do not exist on disk, and the
  // route would return success. Re-check every expected file is present; if any
  // are missing, throw a structured error naming them so the route's catch
  // records a durable audit + returns a clear restoreFailed surface (instead of
  // a false success). The full atomic fix (staging-then-rename) is deferred —
  // see plan/cycle-7-2026-06-28-review-remediation.md Phase B.
  const missing: string[] = [];
  for (const upload of uploads) {
    if (!(await uploadedFileExists(upload.storedName))) {
      missing.push(upload.storedName);
    }
  }
  if (missing.length > 0) {
    logger.error(
      {
        filesExpected: uploads.length,
        filesRestored: uploads.length - missing.length,
        filesMissing: missing.length,
        missing,
      },
      "[restore] post-write verification found missing upload files (DB already committed)"
    );
    const err = new Error("fileRestoreIncomplete") as Error & { missing?: string[] };
    err.missing = missing;
    throw err;
  }

  logger.info({ filesRestored: uploads.length }, "Restored uploaded files from backup ZIP");
  return uploads.length;
}
