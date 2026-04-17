import JSZip from "jszip";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { streamDatabaseExport, type JudgeKitExport } from "@/lib/db/export";
import { readUploadedFile, resolveStoredPath, writeUploadedFile, ensureUploadsDir } from "@/lib/files/storage";
import { logger } from "@/lib/logger";
import { asc } from "drizzle-orm";
import { access } from "node:fs/promises";
import { createHash } from "node:crypto";

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

function sha256Hex(data: Buffer | Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex");
}

function createBackupIntegrityManifest(
  dbJson: string,
  dbExport: JudgeKitExport,
  uploads: BackupIntegrityManifest["uploads"]
): BackupIntegrityManifest {
  return {
    version: 1,
    format: "judgekit-backup-integrity",
    createdAt: new Date().toISOString(),
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
      !upload.path.startsWith("uploads/")
    ) {
      throw new Error("invalidBackupManifest");
    }
  }

  return manifest as BackupIntegrityManifest;
}

/**
 * Export database + uploaded files as a ZIP archive.
 * The ZIP contains:
 *   database.json  – standard JudgeKitExport
 *   uploads/       – uploaded files keyed by their storedName
 */
export async function streamBackupWithFiles(signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const zip = new JSZip();

  // 1. Collect database export as JSON
  const dbChunks: Uint8Array[] = [];
  const dbStream = streamDatabaseExport({ signal });

  const dbReader = dbStream.getReader();
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await dbReader.read();
    if (done) break;
    dbChunks.push(value);
  }

  const dbJson = Buffer.concat(dbChunks).toString("utf-8");
  const dbExport = JSON.parse(dbJson) as JudgeKitExport;
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
    } catch {
      // File may have been deleted from disk; skip silently
      skipped++;
    }
  }

  logger.info({ included, skipped, total: fileRecords.length }, "Backup file upload collection complete");
  zip.file(
    BACKUP_MANIFEST_PATH,
    JSON.stringify(createBackupIntegrityManifest(dbJson, dbExport, manifestUploads), null, 2)
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
 * @param zipBuffer - The ZIP file content as a Buffer
 * @returns The parsed database export and count of restored files
 */
export async function restoreFilesFromZip(zipBuffer: Buffer): Promise<{
  dbExport: JudgeKitExport;
  filesRestored: number;
}> {
  const zip = await JSZip.loadAsync(zipBuffer);

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

  // 2. Extract uploaded files to disk
  await ensureUploadsDir();
  let filesRestored = 0;

  const fileEntries = zip.filter(
    (relativePath) => relativePath.startsWith("uploads/") && !relativePath.endsWith("/")
  );
  const manifestUploads = manifest
    ? new Map(manifest.uploads.map((upload) => [upload.path, upload]))
    : null;

  for (const entry of fileEntries) {
    const storedName = entry.name.slice("uploads/".length);
    if (!storedName) continue;

    // Validate: no path traversal
    if (storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")) {
      logger.warn({ storedName }, "Skipping file with invalid name in backup ZIP");
      continue;
    }

    const buffer = await entry.async("nodebuffer");
    if (manifestUploads) {
      const expected = manifestUploads.get(entry.name);
      if (
        !expected ||
        expected.storedName !== storedName ||
        expected.sha256 !== sha256Hex(buffer) ||
        expected.byteLength !== buffer.byteLength
      ) {
        throw new Error("backupIntegrityMismatch");
      }
      manifestUploads.delete(entry.name);
    }
    await writeUploadedFile(storedName, buffer);
    filesRestored++;
  }

  if (manifestUploads && manifestUploads.size > 0) {
    throw new Error("backupIntegrityMismatch");
  }

  logger.info({ filesRestored }, "Restored uploaded files from backup ZIP");

  return { dbExport, filesRestored };
}
