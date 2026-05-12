import { getConfiguredSettings } from "@/lib/system-settings-config";
import { logger } from "@/lib/logger";
import type { CompilerRunOptions, CompilerRunResult } from "./types";

/**
 * Attempt to delegate execution to the Rust runner sidecar.
 * Returns the result on success, or null if the runner is unavailable.
 */
export async function tryRustRunner(
  options: CompilerRunOptions,
  runnerUrl: string,
  runnerAuthToken: string,
): Promise<CompilerRunResult | null> {
  if (!runnerUrl || !runnerAuthToken) return null;

  try {
    const settings = getConfiguredSettings();
    const rawTimeLimitMs = options.timeLimitMs ?? settings.compilerTimeLimitMs;
    const timeLimitMs = Number.isFinite(rawTimeLimitMs) && rawTimeLimitMs > 0 ? rawTimeLimitMs : 5000;
    if (timeLimitMs !== rawTimeLimitMs) {
      logger.warn(
        { rawTimeLimitMs },
        "[compiler] Invalid compilerTimeLimitMs fallback to default (5000ms)",
      );
    }

    const response = await fetch(`${runnerUrl}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runnerAuthToken}`,
      },
      body: JSON.stringify({
        sourceCode: options.sourceCode,
        stdin: options.stdin,
        extension: options.language.extension,
        dockerImage: options.language.dockerImage,
        compileCommand: options.language.compileCommand,
        runCommand: options.language.runCommand,
        timeLimitMs,
      }),
      signal: AbortSignal.timeout(Math.max(timeLimitMs * 4, 120_000)),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, url: runnerUrl },
        "[compiler] Rust runner returned non-OK status, falling back to local execution",
      );
      return null;
    }

    const parsed = await response.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") {
      logger.warn(
        { url: runnerUrl },
        "[compiler] Rust runner returned invalid JSON, falling back to local execution",
      );
      return null;
    }
    const data = parsed as Record<string, unknown>;
    // Validate response shape to prevent propagating malformed data when the
    // sidecar returns valid JSON with unexpected fields (e.g., error envelope).
    if (
      typeof data.stdout !== "string" ||
      typeof data.stderr !== "string" ||
      typeof data.timedOut !== "boolean" ||
      typeof data.oomKilled !== "boolean"
    ) {
      logger.warn(
        { url: runnerUrl, data },
        "[compiler] Rust runner returned unexpected response shape, falling back to local execution",
      );
      return null;
    }
    return {
      stdout: data.stdout,
      stderr: data.stderr,
      exitCode: typeof data.exitCode === "number" ? data.exitCode : null,
      executionTimeMs: typeof data.executionTimeMs === "number" ? data.executionTimeMs : 0,
      timedOut: data.timedOut,
      oomKilled: data.oomKilled,
      compileOutput: typeof data.compileOutput === "string" ? data.compileOutput : null,
    };
  } catch (error) {
    logger.warn(
      { error, url: runnerUrl },
      "[compiler] Rust runner unavailable, falling back to local execution",
    );
    return null;
  }
}
