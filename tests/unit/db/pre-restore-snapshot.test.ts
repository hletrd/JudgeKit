import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// CYC3-AGG-3 / C1-AGG-24: behavioural test for `takePreRestoreSnapshot`.
// The function depends on the FS, the streamDatabaseExport helper, and the
// logger. Mocking streamDatabaseExport with a tiny Web ReadableStream lets
// us cover the file-mode, filename pattern, prune retention, and unlink-on-
// error paths without needing a real Postgres.

const mocks = vi.hoisted(() => ({
  streamDatabaseExport: vi.fn<() => ReadableStream<Uint8Array>>(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
}));

vi.mock("@/lib/db/export", () => ({
  streamDatabaseExport: mocks.streamDatabaseExport,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  },
}));

// Helper to build a tiny in-memory web ReadableStream that emits a few
// bytes. Web ReadableStream is the prod return type from
// streamDatabaseExport.
function makeBytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function makeErroringStream(err: Error): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.error(err);
    },
  });
}

let tmpDataDir: string;
let originalDataDir: string | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  tmpDataDir = mkdtempSync(join(tmpdir(), "judgekit-prerestore-test-"));
  originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = tmpDataDir;
});

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  // Best-effort cleanup. force:true tolerates partial-write tests.
  rmSync(tmpDataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("takePreRestoreSnapshot", () => {
  it("writes a file with mode 0o600 to ${DATA_DIR}/pre-restore-snapshots/", async () => {
    mocks.streamDatabaseExport.mockReturnValue(
      makeBytesStream(new TextEncoder().encode('{"hello":"world"}')),
    );
    const { takePreRestoreSnapshot } = await import("@/lib/db/pre-restore-snapshot");

    const path = await takePreRestoreSnapshot("0123456789abcdef");

    expect(path).not.toBeNull();
    expect(path).toBeDefined();
    expect(existsSync(path!)).toBe(true);
    // File mode (lower 9 bits) must be 0o600. The umask MAY mask high bits,
    // but createWriteStream with mode:0o600 sets the file owner-only.
    const mode = statSync(path!).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("uses the documented filename pattern pre-restore-<ISO>-<8charActor>.json", async () => {
    mocks.streamDatabaseExport.mockReturnValue(
      makeBytesStream(new TextEncoder().encode("{}")),
    );
    const { takePreRestoreSnapshot } = await import("@/lib/db/pre-restore-snapshot");

    const path = await takePreRestoreSnapshot("abcdef0123456789");

    const filename = path!.split(/[/\\]/).pop()!;
    // ISO-stamp uses date+time with `:` and `.` replaced by `-`.
    expect(filename).toMatch(
      /^pre-restore-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-abcdef01\.json$/,
    );
  });

  it("retains only the most recent RETAIN_LAST_N=5 snapshots", async () => {
    mocks.streamDatabaseExport.mockImplementation(() =>
      makeBytesStream(new TextEncoder().encode("{}")),
    );
    const { takePreRestoreSnapshot } = await import("@/lib/db/pre-restore-snapshot");

    // Take 7 snapshots in sequence. Each call awaits the prune fire-and-
    // forget by yielding microtasks afterwards.
    for (let i = 0; i < 7; i += 1) {
      await takePreRestoreSnapshot(`actor${i.toString().padStart(2, "0")}aa`);
      // Allow the void prune promise to flush.
      for (let j = 0; j < 20; j += 1) {
        await Promise.resolve();
      }
      // Stamps use ISO with millisecond resolution; sleep briefly to ensure
      // distinct mtime/ISO stamps so the prune sort order is deterministic.
      await new Promise((r) => setTimeout(r, 5));
    }

    const snapDir = join(tmpDataDir, "pre-restore-snapshots");
    const remaining = readdirSync(snapDir).filter(
      (n) => n.startsWith("pre-restore-") && n.endsWith(".json"),
    );
    // 7 written, prune retains the most recent 5.
    expect(remaining.length).toBe(5);
  });

  it("unlinks the partial file when the export pipeline fails", async () => {
    const err = new Error("simulated export-stream failure");
    mocks.streamDatabaseExport.mockReturnValue(makeErroringStream(err));
    const { takePreRestoreSnapshot } = await import("@/lib/db/pre-restore-snapshot");

    const path = await takePreRestoreSnapshot("00000000ffff");
    // Function returns null on failure.
    expect(path).toBeNull();

    // No partial files must remain — the cycle-2 unlink-on-error path
    // (CYC2-AGG-2) keeps a later restore from picking up a corrupt file
    // as the "latest snapshot".
    const snapDir = join(tmpDataDir, "pre-restore-snapshots");
    const partial = existsSync(snapDir)
      ? readdirSync(snapDir).filter(
          (n) => n.startsWith("pre-restore-") && n.endsWith(".json"),
        )
      : [];
    expect(partial.length).toBe(0);

    // The error must be logged.
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it("returns the path on success and emits the structured info-log line", async () => {
    mocks.streamDatabaseExport.mockReturnValue(
      makeBytesStream(new TextEncoder().encode("{}")),
    );
    const { takePreRestoreSnapshot } = await import("@/lib/db/pre-restore-snapshot");

    const path = await takePreRestoreSnapshot("actor1234");
    expect(path).not.toBeNull();

    // Cycle-3 CYC3-AGG-1 split the size-unavailable case from the success
    // log. On the happy path stat() succeeds and the info-log is emitted
    // with sizeBytes.
    expect(mocks.loggerInfo).toHaveBeenCalled();
    const infoCall = mocks.loggerInfo.mock.calls.find(
      (call) =>
        typeof call[1] === "string" &&
        call[1] === "[restore] pre-restore snapshot written",
    );
    expect(infoCall, "expected the success info-log line").toBeDefined();
    const ctx = infoCall?.[0] as { path?: string; sizeBytes?: number; actorId?: string } | undefined;
    expect(ctx?.path).toBe(path);
    expect(typeof ctx?.sizeBytes).toBe("number");
    expect(ctx?.actorId).toBe("actor1234");
  });
});
