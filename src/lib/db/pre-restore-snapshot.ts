import { mkdir, writeFile, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { streamDatabaseExport } from "./export";

const SNAPSHOT_DIR_NAME = "pre-restore-snapshots";
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
 * own emergency rollback artifact, not a portable export.
 */
export async function takePreRestoreSnapshot(actorId: string): Promise<string | null> {
  const dir = snapshotDir();
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    logger.error({ err, dir }, "[restore] failed to create pre-restore snapshot dir");
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `pre-restore-${stamp}-${actorId.slice(0, 8)}.json`;
  const fullPath = join(dir, filename);

  try {
    const stream = streamDatabaseExport({ sanitize: false });
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    await writeFile(fullPath, merged);
    logger.info(
      { path: fullPath, sizeBytes: total, actorId },
      "[restore] pre-restore snapshot written",
    );
    void pruneOldSnapshots(dir).catch((err) => {
      logger.warn({ err, dir }, "[restore] failed to prune old snapshots");
    });
    return fullPath;
  } catch (err) {
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
