import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createHash } from "node:crypto";

const {
  dbSelectMock,
  streamDatabaseExportMock,
  readUploadedFileMock,
  writeUploadedFileMock,
  ensureUploadsDirMock,
  resolveStoredPathMock,
  accessMock,
  uploadedFileExistsMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  streamDatabaseExportMock: vi.fn(),
  readUploadedFileMock: vi.fn(),
  writeUploadedFileMock: vi.fn(),
  ensureUploadsDirMock: vi.fn(),
  resolveStoredPathMock: vi.fn((storedName: string) => `/tmp/${storedName}`),
  accessMock: vi.fn(),
  uploadedFileExistsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  files: {
    storedName: "storedName",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  asc: vi.fn((value: unknown) => value),
}));

vi.mock("@/lib/db/export", () => ({
  streamDatabaseExport: streamDatabaseExportMock,
}));

vi.mock("@/lib/files/storage", () => ({
  readUploadedFile: readUploadedFileMock,
  resolveStoredPath: resolveStoredPathMock,
  writeUploadedFile: writeUploadedFileMock,
  ensureUploadsDir: ensureUploadsDirMock,
  uploadedFileExists: uploadedFileExistsMock,
}));

vi.mock("node:fs/promises", () => ({
  access: accessMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createJsonStream(value: unknown) {
  const encoder = new TextEncoder();
  const text = JSON.stringify(value);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

async function readStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function sha256Hex(data: Buffer | Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex");
}

describe("export-with-files integrity manifests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamDatabaseExportMock.mockReturnValue(
      createJsonStream({
        version: 1,
        exportedAt: "2026-04-17T00:00:00.000Z",
        sourceDialect: "postgresql",
        appVersion: "test",
        redactionMode: "full-fidelity",
        tables: {},
      })
    );
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue([{ storedName: "upload-1.bin" }]),
      })),
    });
    accessMock.mockResolvedValue(undefined);
    readUploadedFileMock.mockResolvedValue(Buffer.from("hello upload"));
    ensureUploadsDirMock.mockResolvedValue(undefined);
    writeUploadedFileMock.mockResolvedValue(undefined);
    // By default every restored file is present on disk after writing.
    uploadedFileExistsMock.mockResolvedValue(true);
  });

  it("embeds a checksum manifest alongside database.json and uploads", async () => {
    const { streamBackupWithFiles } = await import("@/lib/db/export-with-files");

    const stream = await streamBackupWithFiles();
    const zipBuffer = await readStream(stream);
    const zip = await JSZip.loadAsync(zipBuffer);

    const dbJson = await zip.file("database.json")!.async("text");
    const uploadBuffer = await zip.file("uploads/upload-1.bin")!.async("nodebuffer");
    const manifest = JSON.parse(await zip.file("backup-manifest.json")!.async("text"));

    expect(manifest.database.redactionMode).toBe("full-fidelity");
    expect(manifest.database.sha256).toBe(sha256Hex(dbJson));
    expect(manifest.uploads).toEqual([
      {
        path: "uploads/upload-1.bin",
        storedName: "upload-1.bin",
        sha256: sha256Hex(uploadBuffer),
        byteLength: uploadBuffer.byteLength,
      },
    ]);
  });

  it("rejects ZIP backups whose manifest hash does not match the payload", async () => {
    const { restoreFilesFromZip } = await import("@/lib/db/export-with-files");
    const zip = new JSZip();
    const dbJson = JSON.stringify({
      version: 1,
      exportedAt: "2026-04-17T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      redactionMode: "full-fidelity",
      tables: {},
    });

    zip.file("database.json", dbJson);
    zip.file("uploads/upload-1.bin", Buffer.from("hello upload"));
    zip.file(
      "backup-manifest.json",
      JSON.stringify({
        version: 1,
        format: "judgekit-backup-integrity",
        createdAt: "2026-04-17T00:00:00.000Z",
        database: {
          path: "database.json",
          sha256: "wrong-hash",
          byteLength: Buffer.byteLength(dbJson),
          redactionMode: "full-fidelity",
        },
        uploads: [
          {
            path: "uploads/upload-1.bin",
            storedName: "upload-1.bin",
            sha256: sha256Hex(Buffer.from("hello upload")),
            byteLength: Buffer.byteLength("hello upload"),
          },
        ],
      })
    );

    await expect(restoreFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow(
      "backupIntegrityMismatch"
    );
  });

  it("restores legacy ZIP backups that do not include a checksum manifest", async () => {
    const { restoreFilesFromZip } = await import("@/lib/db/export-with-files");
    const zip = new JSZip();
    const dbJson = JSON.stringify({
      version: 1,
      exportedAt: "2026-04-17T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      tables: {},
    });

    zip.file("database.json", dbJson);
    zip.file("uploads/upload-1.bin", Buffer.from("hello upload"));

    const result = await restoreFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }));

    expect(result.filesRestored).toBe(1);
    expect(writeUploadedFileMock).toHaveBeenCalledWith("upload-1.bin", Buffer.from("hello upload"));
  });

  it("parses ZIP backups without mutating upload storage", async () => {
    const { parseBackupZip } = await import("@/lib/db/export-with-files");
    const zip = new JSZip();
    const dbJson = JSON.stringify({
      version: 1,
      exportedAt: "2026-04-17T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      tables: {},
    });

    zip.file("database.json", dbJson);
    zip.file("uploads/upload-1.bin", Buffer.from("hello upload"));

    const result = await parseBackupZip(await zip.generateAsync({ type: "nodebuffer" }));

    expect(result.uploads).toEqual([
      { storedName: "upload-1.bin", buffer: Buffer.from("hello upload") },
    ]);
    expect(writeUploadedFileMock).not.toHaveBeenCalled();
  });

  it("skips path-traversal upload entries when restoring ZIP backups", async () => {
    const { restoreFilesFromZip } = await import("@/lib/db/export-with-files");
    const zip = new JSZip();
    const dbJson = JSON.stringify({
      version: 1,
      exportedAt: "2026-04-17T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      tables: {},
    });

    zip.file("database.json", dbJson);
    zip.file("uploads/upload-1.bin", Buffer.from("hello upload"));
    zip.file("uploads/../escape.bin", Buffer.from("should skip"));

    const result = await restoreFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }));

    expect(result.filesRestored).toBe(1);
    expect(writeUploadedFileMock).toHaveBeenCalledTimes(1);
    expect(writeUploadedFileMock).toHaveBeenCalledWith("upload-1.bin", Buffer.from("hello upload"));
  });

  it("rejects ZIP backups with too many expanded entries", async () => {
    const {
      MAX_BACKUP_ZIP_ENTRIES,
      enforceBackupZipSizeLimits,
    } = await import("@/lib/db/export-with-files");

    expect(() => enforceBackupZipSizeLimits(
      Array.from({ length: MAX_BACKUP_ZIP_ENTRIES + 1 }, (_, index) => ({
        name: `uploads/${index}.bin`,
        dir: false,
        _data: { uncompressedSize: 0 },
      }))
    )).toThrow("backupZipTooLarge");
  });

  it("rejects ZIP backups with an oversized expanded entry", async () => {
    const {
      MAX_BACKUP_ZIP_ENTRY_BYTES,
      enforceBackupZipSizeLimits,
    } = await import("@/lib/db/export-with-files");

    expect(() => enforceBackupZipSizeLimits([
      {
        name: "uploads/large.bin",
        dir: false,
        _data: { uncompressedSize: MAX_BACKUP_ZIP_ENTRY_BYTES + 1 },
      },
    ])).toThrow("backupZipTooLarge");
  });

  it("rejects ZIP backups whose total expanded size exceeds the cap", async () => {
    const {
      MAX_BACKUP_ZIP_DECOMPRESSED_BYTES,
      enforceBackupZipSizeLimits,
    } = await import("@/lib/db/export-with-files");

    const half = Math.floor(MAX_BACKUP_ZIP_DECOMPRESSED_BYTES / 2);
    expect(() => enforceBackupZipSizeLimits([
      { name: "uploads/a.bin", dir: false, _data: { uncompressedSize: half } },
      { name: "uploads/b.bin", dir: false, _data: { uncompressedSize: half } },
      { name: "uploads/c.bin", dir: false, _data: { uncompressedSize: 1 } },
    ])).toThrow("backupZipTooLarge");
  });

  describe("restoreParsedBackupFiles post-write consistency verification (AGG-1 partial)", () => {
    it("returns the count when every written file is present on disk", async () => {
      const { restoreParsedBackupFiles } = await import("@/lib/db/export-with-files");
      uploadedFileExistsMock.mockResolvedValue(true);

      const count = await restoreParsedBackupFiles([
        { storedName: "upload-1.bin", buffer: Buffer.from("a") },
        { storedName: "upload-2.bin", buffer: Buffer.from("b") },
      ]);

      expect(count).toBe(2);
      expect(writeUploadedFileMock).toHaveBeenCalledTimes(2);
      expect(uploadedFileExistsMock).toHaveBeenCalledTimes(2);
    });

    it("throws fileRestoreIncomplete naming the missing files after a silent partial write", async () => {
      const { restoreParsedBackupFiles } = await import("@/lib/db/export-with-files");
      // Simulate a silent partial write: writeUploadedFile did not throw, but
      // uploadedFileExists reports upload-2.bin as absent on disk.
      uploadedFileExistsMock.mockImplementation(async (storedName: string) =>
        storedName !== "upload-2.bin"
      );

      const promise = restoreParsedBackupFiles([
        { storedName: "upload-1.bin", buffer: Buffer.from("a") },
        { storedName: "upload-2.bin", buffer: Buffer.from("b") },
        { storedName: "upload-3.bin", buffer: Buffer.from("c") },
      ]);

      // The error must be the structured fileRestoreIncomplete signal and carry
      // the missing names so the route's audit surfaces them. Revert-RED:
      // removing the verification makes this resolve to 3 instead of throwing.
      await expect(promise).rejects.toThrow("fileRestoreIncomplete");
      await expect(promise).rejects.toMatchObject({
        message: "fileRestoreIncomplete",
        missing: ["upload-2.bin"],
      });
    });
  });
});
