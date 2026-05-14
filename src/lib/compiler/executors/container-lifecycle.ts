import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { logger } from "@/lib/logger";

const exec = promisify(execFile);

/**
 * Parse Docker RFC 3339 timestamp into epoch milliseconds.
 * Handles format like "2024-01-15T10:30:45.123456789Z".
 * Uses full date+time to avoid cross-midnight duration errors.
 */
export function parseTimestampEpochMs(s: string): number | null {
  try {
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) return null;
    return ms;
  } catch {
    return null;
  }
}

/**
 * Inspect a stopped container for OOM status and actual execution time.
 * Uses Docker's State.StartedAt / State.FinishedAt timestamps which exclude
 * container creation and namespace/cgroup setup overhead.
 */
export async function inspectContainerState(
  containerName: string,
): Promise<{ oomKilled: boolean; durationMs: number | null }> {
  try {
    const { stdout } = await exec("docker", [
      "inspect",
      "--format",
      "{{.State.OOMKilled}} {{.State.StartedAt}} {{.State.FinishedAt}}",
      containerName,
    ], { timeout: 5_000 });

    const parts = stdout.trim().split(" ");
    const oomKilled = parts[0] === "true";

    let durationMs: number | null = null;
    if (parts.length >= 3) {
      const startMs = parseTimestampEpochMs(parts[1]);
      const endMs = parseTimestampEpochMs(parts[2]);

      if (startMs !== null && endMs !== null && endMs >= startMs) {
        durationMs = endMs - startMs;
      }
    }

    return { oomKilled, durationMs };
  } catch (error) {
    logger.warn({ error, container: containerName }, "[compiler] Failed to inspect container");
    return { oomKilled: false, durationMs: null };
  }
}

/**
 * Kill and remove a Docker container.
 */
export async function cleanupContainer(containerName: string): Promise<void> {
  try {
    await exec("docker", ["rm", "-f", containerName], { timeout: 5_000 });
  } catch (error) {
    logger.warn({ error, container: containerName }, "[compiler] Failed to remove container");
  }
}

/**
 * Stop a running container (force kill with -t 0).
 */
export function stopContainer(containerName: string): void {
  spawn("docker", ["stop", "-t", "0", containerName], {
    stdio: "ignore",
  }).on("error", (err) => {
    logger.warn({ error: err, container: containerName }, "[compiler] Failed to stop container");
  });
}
