import { execFile } from "child_process";
import { promisify } from "util";
import { chmod, mkdir, writeFile, rm, mkdtemp, lstat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { isAllowedJudgeDockerImage } from "@/lib/judge/docker-image-validation";
import { logger } from "@/lib/logger";
import { isValidCommandPrefix } from "./executors/shell-validation";
import { runDocker, SECCOMP_PROFILE_PATH } from "./executors/docker-runner";
import { tryRustRunner } from "./executors/rust-runner";
import type { CompilerRunOptions, CompilerRunResult } from "./executors/types";

export type { CompilerRunOptions, CompilerRunResult } from "./executors/types";

const exec = promisify(execFile);

const MAX_SOURCE_CODE_BYTES = 64 * 1024; // 64KB

// Source of truth for stdout/stderr truncation limits. Mirrored in
// judge-worker-rs/src/docker.rs as MAX_OUTPUT_BYTES; the alignment is checked
// by tests/unit/compiler/output-limits-implementation.test.ts.
// Used by ./executors/docker-runner via a separate declaration that must
// remain numerically identical.
const MAX_OUTPUT_BYTES = 4_194_304; // 4 MiB

// Cache seccomp profile availability at module load time so we don't perform
// a synchronous existsSync on every runDocker invocation. Used as a startup
// log signal; ./executors/docker-runner performs its own cached check for the
// actual Docker args.
const HAS_CUSTOM_SECCOMP_PROFILE = existsSync(SECCOMP_PROFILE_PATH);
if (!HAS_CUSTOM_SECCOMP_PROFILE) {
  logger.debug(
    { maxOutputBytes: MAX_OUTPUT_BYTES, path: SECCOMP_PROFILE_PATH },
    "[compiler] Custom seccomp profile not found; using docker default",
  );
}

/**
 * Maximum age (ms) for a running compiler container before it is
 * considered stuck and eligible for orphan cleanup.
 */
const MAX_CONTAINER_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Base directory for compiler workspaces.
 * In Docker-in-Docker setups, this must be a host-mounted path so sibling
 * containers can access the workspace via `-v`.  Set COMPILER_WORKSPACE_DIR
 * to a bind-mounted directory (e.g. /compiler-workspaces).
 * Falls back to os.tmpdir() for local development.
 */
const WORKSPACE_BASE = process.env.COMPILER_WORKSPACE_DIR || tmpdir();

/**
 * URL of the Rust runner HTTP endpoint (e.g. "http://judge-worker:3001").
 * When set, executeCompilerRun() delegates Docker execution to the Rust
 * sidecar instead of spawning containers from the Node.js process.
 * Local fallback is disabled by default whenever a runner URL is configured.
 * Set ENABLE_COMPILER_LOCAL_FALLBACK=1 to opt back in for development.
 */
// Normalize env vars: treat empty string as missing.
const COMPILER_RUNNER_URL = process.env.COMPILER_RUNNER_URL || "";
const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || "";
// Explicit opt-in to disable runner auth (e.g., for local dev with no auth sidecar).
const RUNNER_AUTH_DISABLED = process.env.RUNNER_AUTH_DISABLED === "1";

if (!RUNNER_AUTH_TOKEN && COMPILER_RUNNER_URL && process.env.NODE_ENV === "production") {
  throw new Error(
    "RUNNER_AUTH_TOKEN must be set in production when COMPILER_RUNNER_URL is configured. " +
    "Generate one with: openssl rand -hex 32",
  );
}
if (!RUNNER_AUTH_TOKEN && !COMPILER_RUNNER_URL && process.env.NODE_ENV === "production") {
  logger.debug("RUNNER_AUTH_TOKEN is not set — compiler runner auth disabled (no COMPILER_RUNNER_URL configured)");
}
if (COMPILER_RUNNER_URL && !RUNNER_AUTH_TOKEN && !RUNNER_AUTH_DISABLED) {
  logger.warn(
    "[compiler] COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing — " +
    "runner requests will be unauthenticated. Set RUNNER_AUTH_TOKEN to secure the connection, " +
    "or set RUNNER_AUTH_DISABLED=1 to explicitly opt out of runner authentication.",
  );
}
const COMPILER_RUNNER_CONFIG_ERROR =
  COMPILER_RUNNER_URL && !RUNNER_AUTH_TOKEN && !RUNNER_AUTH_DISABLED
    ? "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing"
    : null;
const LEGACY_DISABLE_LOCAL_FALLBACK = /^(1|true|yes|on)$/i.test(
  process.env.DISABLE_COMPILER_LOCAL_FALLBACK || "",
);
const ENABLE_LOCAL_FALLBACK = /^(1|true|yes|on)$/i.test(
  process.env.ENABLE_COMPILER_LOCAL_FALLBACK || "",
);
const SHOULD_ALLOW_LOCAL_FALLBACK =
  !COMPILER_RUNNER_URL || (ENABLE_LOCAL_FALLBACK && !LEGACY_DISABLE_LOCAL_FALLBACK);

/**
 * Validate shell command string. Since commands come from trusted DB configs
 * (admin role), we perform basic validation to detect obvious anomalies but
 * don't enforce strict character restrictions (needed for legitimate compiler
 * flags). Allow && and ; since trusted admin-configured compile commands
 * legitimately chain steps (e.g. "javac ... && jar ...").
 *
 * TRUST BOUNDARY: Commands are passed to `sh -c` inside a Docker sandbox
 * (--network=none, --cap-drop=ALL, --read-only, --user 65534, seccomp).
 * The sandbox is the primary security boundary; this validator is a secondary
 * defense-in-depth layer. A compromised admin account or language_configs
 * table could inject malicious commands, but the sandbox limits the blast
 * radius to the container interior. No network exfiltration is possible.
 *
 * Denylist (must match judge-worker-rs/src/runner.rs#validate_shell_command):
 *   - Backtick: `
 *   - Command substitution: $(
 *   - Variable substitution: ${
 *   - Process substitution: <( >(
 *   - Logical OR: ||
 *   - Pipe: |
 *   - I/O redirect: > <
 *   - Control chars: \n \r
 *   - Null byte: \0
 *   - eval keyword (word-boundary match)
 *   - source keyword (word-boundary match)
 *
 * Kept in lock-step with judge-worker-rs/src/runner.rs#validate_shell_command.
 */
function validateShellCommand(cmd: string): boolean {
  if (!cmd || cmd.length > 10_000) return false;
  if (cmd.includes("\0")) return false;
  const dangerous = /`|\$\(|\$\{|\$[A-Za-z_]|[<>]\(|\|\||\||>|<|\n|\r|\beval\b|\bsource\b/;
  return !dangerous.test(cmd);
}

/**
 * Stricter shell command validation that also verifies the first command
 * in each chained segment starts with a known compiler/tool prefix.
 * This is a defense-in-depth layer on top of validateShellCommand.
 */
function validateShellCommandStrict(cmd: string): boolean {
  if (!validateShellCommand(cmd)) return false;
  const segments = cmd.split(/&&|;/);
  return segments.every((segment) => {
    const firstToken = segment.trim().split(/\s+/)[0] || "";
    const baseName = firstToken.split("/").pop() || firstToken;
    return isValidCommandPrefix(baseName);
  });
}

function errorResult(stderr: string): CompilerRunResult {
  return {
    stdout: "",
    stderr,
    exitCode: null,
    executionTimeMs: 0,
    timedOut: false,
    oomKilled: false,
    compileOutput: null,
  };
}

/**
 * Execute source code in a Docker-sandboxed environment.
 * Compiles (if needed) and runs the code with optional stdin.
 * Delegates to the Rust runner sidecar when COMPILER_RUNNER_URL is set.
 */
export async function executeCompilerRun(
  options: CompilerRunOptions,
): Promise<CompilerRunResult> {
  // Try Rust runner first
  const rustResult = await tryRustRunner(options, COMPILER_RUNNER_URL, RUNNER_AUTH_TOKEN);
  if (rustResult !== null) return rustResult;
  if (COMPILER_RUNNER_CONFIG_ERROR && !SHOULD_ALLOW_LOCAL_FALLBACK) {
    return {
      stdout: "",
      stderr: COMPILER_RUNNER_CONFIG_ERROR,
      exitCode: null,
      executionTimeMs: 0,
      timedOut: false,
      oomKilled: false,
      compileOutput: null,
    };
  }
  if (!SHOULD_ALLOW_LOCAL_FALLBACK) {
    return {
      stdout: "",
      stderr: "Compiler runner unavailable",
      exitCode: null,
      executionTimeMs: 0,
      timedOut: false,
      oomKilled: false,
      compileOutput: null,
    };
  }

  const settings = getConfiguredSettings();
  const rawTimeLimitMs = options.timeLimitMs ?? settings.compilerTimeLimitMs;
  const timeLimitMs = Number.isFinite(rawTimeLimitMs) && rawTimeLimitMs > 0 ? rawTimeLimitMs : 5000;

  // Validate Docker image
  if (!isAllowedJudgeDockerImage(options.language.dockerImage)) {
    return errorResult("Invalid Docker image reference");
  }

  // Validate source code size
  if (Buffer.byteLength(options.sourceCode, "utf8") > MAX_SOURCE_CODE_BYTES) {
    return errorResult("Source code exceeds maximum size limit (64KB)");
  }

  // Validate shell commands (basic sanity check)
  if (options.language.compileCommand && !validateShellCommandStrict(options.language.compileCommand)) {
    return errorResult("Invalid compile command");
  }
  if (!validateShellCommandStrict(options.language.runCommand)) {
    return errorResult("Invalid run command");
  }

  // Create temp workspace. Compiler containers now run as uid/gid 65534 for
  // defense-in-depth, so the workspace must remain writable/traversable by that
  // sandbox user in local fallback mode as well as Docker-in-Docker mode.
  // The sandbox uses "65534:65534" — kept here as a documentation anchor for
  // cross-file consistency checks. chmod after mkdir to bypass process umask.
  await mkdir(WORKSPACE_BASE, { recursive: true });
  const workspaceDir = await mkdtemp(join(WORKSPACE_BASE, "compiler-"));
  const workspaceStat = await lstat(workspaceDir);
  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) {
    throw new Error("Compiler workspace path is invalid");
  }
  await chmod(workspaceDir, 0o770);

  try {
    // Write source file (world-readable for sibling container access)
    const sourceFileName = `solution${options.language.extension}`;
    await writeFile(join(workspaceDir, sourceFileName), options.sourceCode, {
      encoding: "utf8",
    });
    await chmod(join(workspaceDir, sourceFileName), 0o644);

    let compileOutput: string | null = null;

    // Compile phase (if needed)
    //
    // TRUST BOUNDARY: compileCommand is a user-owned-by-admin string read from
    // the language_configs DB table. We intentionally pass it through `sh -c`
    // so admins can express multi-step builds (&& chains, env var prefixes,
    // shell-glob source-file selection). The trust boundary is therefore the
    // admin role that can write language_configs — not the submitter. All
    // execution happens inside a sandbox with --network=none, --cap-drop=ALL,
    // --security-opt=no-new-privileges, read-only rootfs, the project
    // seccomp profile, and --user 65534:65534, so the worst a malicious
    // compile command can do is corrupt its own ephemeral workspace.
    if (options.language.compileCommand) {
      const compileCmd = ["sh", "-c", options.language.compileCommand];
      const compileResult = await runDocker({
        image: options.language.dockerImage,
        workspaceDir,
        command: compileCmd,
        stdin: null,
        timeoutMs: Math.max(timeLimitMs * 2, 30_000), // compile gets 2x time limit, min 30s
        readOnlyWorkspace: false,
        phase: "compile",
      });

      if (compileResult.exitCode !== 0 && !compileResult.timedOut) {
        // Compilation failed
        return {
          stdout: "",
          stderr: "",
          exitCode: compileResult.exitCode,
          executionTimeMs: compileResult.durationMs,
          timedOut: false,
          oomKilled: compileResult.oomKilled,
          compileOutput: compileResult.stderr || compileResult.stdout,
        };
      }

      if (compileResult.timedOut) {
        return {
          stdout: "",
          stderr: "",
          exitCode: null,
          executionTimeMs: compileResult.durationMs,
          timedOut: true,
          oomKilled: compileResult.oomKilled,
          compileOutput: "Compilation timed out",
        };
      }

      if (compileResult.stderr) {
        compileOutput = compileResult.stderr;
      }
    }

    // Run phase
    const runCmd = ["sh", "-c", options.language.runCommand];
    // Ensure stdin ends with a newline for convenience (many programs expect it)
    const stdinText = options.stdin
      ? (options.stdin.endsWith("\n") ? options.stdin : options.stdin + "\n")
      : "";
    const stdinBuffer = stdinText ? Buffer.from(stdinText, "utf8") : null;
    const runResult = await runDocker({
      image: options.language.dockerImage,
      workspaceDir,
      command: runCmd,
      stdin: stdinBuffer,
      timeoutMs: timeLimitMs,
      readOnlyWorkspace: true,
      phase: "run",
    });

    return {
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      exitCode: runResult.exitCode,
      executionTimeMs: runResult.durationMs,
      timedOut: runResult.timedOut,
      oomKilled: runResult.oomKilled,
      compileOutput,
    };
  } finally {
    // Clean up temp workspace
    try {
      await rm(workspaceDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ error, workspaceDir }, "[compiler] Failed to clean up workspace");
    }
  }
}

/**
 * Clean up orphaned compiler containers.
 * Handles exited, created, dead, and stale running containers.
 * Should be called periodically or on startup.
 */
export async function cleanupOrphanedContainers(): Promise<number> {
  try {
    // Query all compiler containers regardless of status.
    // Use --format '{{json .}}' for robust parsing instead of tab-delimited
    // output that breaks when fields contain tabs or Docker changes formatting.
    const { stdout } = await exec("docker", [
      "ps",
      "-a",
      "--filter",
      "name=compiler-",
      "--format",
      "{{json .}}",
    ], { timeout: 10_000 });

    const lines = stdout.trim().split("\n").filter(Boolean);
    let cleaned = 0;

    for (const line of lines) {
      let parsed: { Names?: string; Status?: string; CreatedAt?: string } | null = null;
      try {
        parsed = JSON.parse(line);
      } catch {
        logger.debug({ line }, "[compiler] Skipping unparseable line in docker ps output");
        continue;
      }

      const container = parsed?.Names;
      const status = parsed?.Status;
      const createdAtStr = parsed?.CreatedAt;
      if (!container || !status) continue;

      const statusLower = status.toLowerCase();

      // Always clean: exited, created, dead containers
      const shouldClean =
        statusLower.startsWith("exited") ||
        statusLower.startsWith("created") ||
        statusLower.startsWith("dead");

      // For running containers, check if they've been running too long.
      let staleRunning = false;
      if (!shouldClean && statusLower.startsWith("up")) {
        let createdAt: number | null = null;

        // Parse CreatedAt from docker ps JSON output
        if (createdAtStr) {
          const parsedTs = Date.parse(createdAtStr.trim());
          if (!Number.isNaN(parsedTs)) {
            createdAt = parsedTs;
          }
        }

        // Fall back to docker inspect if docker ps didn't provide CreatedAt
        if (createdAt === null) {
          try {
            const { stdout: inspectOut } = await exec("docker", [
              "inspect",
              "--format",
              "{{.Created}}",
              container,
            ], { timeout: 5_000 });
            const inspectParsed = new Date(inspectOut.trim()).getTime();
            if (!Number.isNaN(inspectParsed)) {
              createdAt = inspectParsed;
            }
          } catch {
            // If inspect fails, skip this container
          }
        }

        if (createdAt !== null && Date.now() - createdAt > MAX_CONTAINER_AGE_MS) {
          staleRunning = true;
        }
      }

      if (shouldClean || staleRunning) {
        try {
          await exec("docker", ["rm", "-f", container], { timeout: 5_000 });
          cleaned++;
          logger.info(
            { container, status: staleRunning ? "stale-running" : statusLower },
            "[compiler] Cleaned up orphaned container",
          );
        } catch (error) {
          logger.warn({ error, container }, "[compiler] Failed to remove orphaned container");
        }
      }
    }

    return cleaned;
  } catch (error) {
    logger.warn({ error }, "[compiler] Failed to list orphaned containers");
    return 0;
  }
}
