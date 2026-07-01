import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

describe("writeUploadedFile permissions", () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "judgekit-storage-"));
    process.env.DATABASE_PATH = join(tempDir, "data", "judge.db");
  });

  it("writes uploaded files with mode 0o600", async () => {
    const { writeUploadedFile } = await import("@/lib/files/storage");
    await writeUploadedFile("test-file.txt", Buffer.from("hello"));

    const stats = statSync(join(tempDir, "data", "uploads", "test-file.txt"));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("creates the uploads directory if it does not exist", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "judgekit-storage-fresh-"));
    process.env.DATABASE_PATH = join(fresh, "data", "judge.db");

    const { writeUploadedFile, uploadedFileExists } = await import("@/lib/files/storage");
    await writeUploadedFile("fresh.txt", Buffer.from("world"));

    expect(await uploadedFileExists("fresh.txt")).toBe(true);
  });
});

// Vitest runs tests in the same process; clean up the temp dirs once the suite
// finishes so later suites don't reuse a stale DATABASE_PATH.
process.on("exit", () => {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});
