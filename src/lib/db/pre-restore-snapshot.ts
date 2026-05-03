import { mkdir, chmod, readdir, stat, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { streamDatabaseExport } from "./export";

const SNAPSHOT_DIR_NAME = "pre-restore-snapshots";
/**
 * Number of pre-restore snapshots to retain on disk before pruning.
 *
 * Sized for emergency rollback rather than long-term archival: 5 keeps
 * roughly the last week of weekly restore exercises (or 5 ad-hoc rollbacks)
 * before the operator must intervene. Increasing this consumes more disk;
 * on a production-sized DB each snapshot can be hundreds of MB. Decreasing
 * below 2 risks losing the prior snapshot if the most recent one is corrupt
 * or incomplete.
 */
const RETAIN_LAST_N = 5;

function snapshotDir(): string {
  // Honour the existing DATA_DIR env var if set (deploy-docker.sh maps this to
  // a persistent volume); otherwise default to ./data which is gitignored.
  const dataDir = process.env.DATA_DIR ?? "./data";
  return join(dataDir, SNAPSHOT_DIR_NAME);
}

/**
 * Stream the live DB to a timestamped JSON file before a destructive
 * importDatabase() call. Returns the path on success, null on failure.
 *
 * The snapshot is full-fidelity (sanitize=false) — it is the operator's
 * own emergency rollback artifact, not a portable export. Because it
 * contains password hashes, encrypted column ciphertexts, and JWT
 * secrets in their stored form, the file is created with mode 0o600
 * and the parent directory is locked down to 0o700 (best-effort: chmod
 * failures are logged but do not abort the snapshot).
 *
 * The export is streamed directly to disk via node:stream/promises
 * pipeline so memory usage stays bounded; the previous implementation
 * buffered the entire dump into a single Uint8Array, which doubled
 * peak memory on production-sized databases. The on-disk file size
 * is read back via fs.stat() for the success log line — a previous
 * iteration counted bytes during the pipeline pump but the wrapper
 * was unnecessary code for a single observability field (cycle-2
 * C2-AGG-3 simplification).
 *
 * On pipeline failure we attempt to unlink the partial file so a
 * later operator-initiated restore does not pick up a truncated
 * artifact as the "latest snapshot" (cycle-2 C2-AGG-2).
 */
export async function takePreRestoreSnapshot(actorId: string): Promise<string | null> {
  const dir = snapshotDir();
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    logger.error({ err, dir }, "[restore] failed to create pre-restore snapshot dir");
    return null;
  }

  // Best-effort directory permission tightening. Do NOT abort the snapshot if
  // chmod fails (e.g., directory owned by a different uid on a shared volume);
  // the per-file 0o600 mode below is the primary safeguard.
  try {
    await chmod(dir, 0o700);
  } catch (err) {
    logger.warn(
      { err, dir },
      "[restore] could not chmod 0o700 snapshot dir; relying on per-file 0o600",
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `pre-restore-${stamp}-${actorId.slice(0, 8)}.json`;
  const fullPath = join(dir, filename);

  try {
    // The streamDatabaseExport return type is the global Web ReadableStream;
    // Readable.fromWeb expects the node:stream/web type. The two share the
    // same runtime structure, so a typed cast is sufficient (matches the
    // pre-cycle-2 pattern that imported the same NodeReadableStream type).
    const exportStream = streamDatabaseExport({
      sanitize: false,
    }) as unknown as NodeReadableStream<Uint8Array>;
    await pipeline(
      Readable.fromWeb(exportStream),
      createWriteStream(fullPath, { mode: 0o600 }),
    );
    // Read the on-disk size after the pipeline closes. This is the
    // authoritative byte count for the artifact and avoids the
    // previous in-pipeline counter wrapper. Split the stat-failure
    // case into a separate warn line so an operator reading the log
    // can distinguish "stat failed" from "actually empty file"
    // (cycle-3 CYC3-AGG-1). A single chained `?.size ?? 0` would
    // log `sizeBytes: 0` on stat failure, indistinguishable from a
    // genuinely empty (zero-byte) snapshot.
    const stStat = await stat(fullPath).catch(() => null);
    if (stStat === null) {
      logger.warn(
        { path: fullPath, actorId },
        "[restore] pre-restore snapshot written but size unavailable (stat failed)",
      );
    } else {
      logger.info(
        { path: fullPath, sizeBytes: stStat.size, actorId },
        "[restore] pre-restore snapshot written",
      );
    }
    void pruneOldSnapshots(dir).catch((err) => {
      logger.warn({ err, dir }, "[restore] failed to prune old snapshots");
    });
    return fullPath;
  } catch (err) {
    // Clean up any partial write so a later restore cannot mistake a
    // truncated file for a valid rollback artifact. Best-effort —
    // failure to unlink is logged via the surrounding error log.
    await unlink(fullPath).catch(() => {});
    logger.error({ err, fullPath }, "[restore] failed to write pre-restore snapshot");
    return null;
  }
}

async function pruneOldSnapshots(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  const candidates = entries.filter(
    (name) => name.startsWith("pre-restore-") && name.endsWith(".json"),
  );
  if (candidates.length <= RETAIN_LAST_N) return;

  // Sort newest-first by mtime so we keep the most recent N.
  const withStats = await Promise.all(
    candidates.map(async (name) => {
      const fullPath = join(dir, name);
      try {
        const s = await stat(fullPath);
        return { name, fullPath, mtimeMs: s.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const valid = withStats.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  valid.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const entry of valid.slice(RETAIN_LAST_N)) {
    try {
      await unlink(entry.fullPath);
    } catch {
      // Best-effort prune; ignore failures.
    }
  }
}
