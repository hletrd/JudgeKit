import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { chmod, mkdir, writeFile, rm, mkdtemp, lstat } from "fs/promises";
import { join } from "path";
import { tmpdir, cpus } from "os";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import pLimit from "p-limit";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { isAllowedJudgeDockerImage } from "@/lib/judge/docker-image-validation";
import { logger } from "@/lib/logger";

const exec = promisify(execFile);

const MEMORY_LIMIT_MB = 256;
// Keep aligned with the Rust judge worker so stdout/stderr truncation matches
// between local compiler-run requests and remote judge execution.
const MAX_OUTPUT_BYTES = 4_194_304; // 4 MiB
const MAX_SOURCE_CODE_BYTES = 64 * 1024; // 64KB
const COMPILE_TMPFS = "/tmp:rw,exec,nosuid,size=1024m";
const RUN_TMPFS = "/tmp:rw,noexec,nosuid,size=64m";
const SECCOMP_PROFILE_PATH = join(
  process.cwd(),
  "docker/seccomp-profile.json"
);

/**
 * Module-level concurrency limiter for Docker container spawning.
 * Caps parallel containers to (CPU count - 1), minimum 1, to prevent
 * resource exhaustion when many judge runs are claimed simultaneously.
 */
const executionLimiter = pLimit(Math.max(cpus().length - 1, 1));

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
const COMPILER_RUNNER_URL = process.env.COMPILER_RUNNER_URL || "";
const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || "";
if (!RUNNER_AUTH_TOKEN && COMPILER_RUNNER_URL && process.env.NODE_ENV === "production") {
  throw new Error(
    "RUNNER_AUTH_TOKEN must be set in production when COMPILER_RUNNER_URL is configured. " +
    "Generate one with: openssl rand -hex 32",
  );
}
if (!RUNNER_AUTH_TOKEN && !COMPILER_RUNNER_URL && process.env.NODE_ENV === "production") {
  logger.debug("RUNNER_AUTH_TOKEN is not set — compiler runner auth disabled (no COMPILER_RUNNER_URL configured)");
}
if (COMPILER_RUNNER_URL && !RUNNER_AUTH_TOKEN) {
  logger.warn(
    "[compiler] COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing — " +
    "runner requests will be unauthenticated. Set RUNNER_AUTH_TOKEN to secure the connection."
  );
}
const COMPILER_RUNNER_CONFIG_ERROR =
  COMPILER_RUNNER_URL && !RUNNER_AUTH_TOKEN
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
const HAS_CUSTOM_SECCOMP_PROFILE = existsSync(SECCOMP_PROFILE_PATH);
let hasLoggedMissingSeccompProfile = false;

export interface CompilerRunOptions {
  /** Source code to compile/run */
  sourceCode: string;
  /** Stdin to feed to the program */
  stdin: string;
  /** Language config from DB */
  language: {
    extension: string;
    dockerImage: string;
    compileCommand: string | null;
    runCommand: string;
  };
  /** Override time limit (ms). Defaults to system setting. */
  timeLimitMs?: number;
}

export interface CompilerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  /** Non-null when compilation fails */
  compileOutput: string | null;
}

interface DockerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  oomKilled: boolean;
  durationMs: number;
}

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
 * Note: \bexec\b was removed from the denylist because (a) the Docker
 * sandbox is the primary security boundary, and (b) "exec" is a common
 * prefix for legitimate tool names (e.g., "exec-compiler"), causing
 * false rejections. The Rust-side validator also does not include "exec".
 *
 * Minor divergence from Rust: \beval\b also rejects tokens like "eval-xxx"
 * where hyphen follows "eval"; the Rust split_whitespace check only rejects
 * the exact token "eval". This is a safe false-positive; no legitimate
 * compile/run command begins with "eval-".
 *
 * Kept in lock-step with judge-worker-rs/src/runner.rs#validate_shell_command.
 * Both validators share the same denylist so a command the Rust runner
 * accepts is also accepted here, and vice versa.
 */
function validateShellCommand(cmd: string): boolean {
  if (!cmd || cmd.length > 10_000) return false;
  if (cmd.includes("\0")) return false;
  const dangerous = /`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b|\bsource\b/;
  return !dangerous.test(cmd);
}

/**
 * Known compiler/tool prefixes that may appear as the first command in a
 * compile or run command string. Used by validateShellCommandStrict as a
 * secondary defense-in-depth check on top of validateShellCommand.
 */
const ALLOWED_COMMAND_PREFIXES = [
  "gcc", "g++", "clang", "clang++", "cc", "c++",
  "javac", "java", "jar",
  "go",
  "rustc", "cargo",
  "python3", "python", "pypy3",
  "node",
  "dotnet", "mcs", "mono",
  "ghc", "runhaskell",
  "dart",
  "swiftc",
  "fpc",
  "ruby",
  "kotlinc", "kotlin",
  "scalac", "scala",
  "gdc", "ldc2",
  "vbnc", "vbc",
  "racket",
  "gs",
  "bash", "sh",
  "csc",
  "octave",
  "Rscript",
  "php",
  "perl",
  "lua",
  "awk",
  "sed",
  "powershell", "pwsh",
];

/**
 * Check whether a command basename matches an allowed prefix.
 * Allows exact matches and version-style suffixes (e.g., python3.11, gcc-12,
 * node20) but rejects unrelated strings that merely start with a prefix
 * (e.g., "nodemalicious" must not match "node").
 */
function isValidCommandPrefix(baseName: string): boolean {
  return ALLOWED_COMMAND_PREFIXES.some((prefix) => {
    if (baseName === prefix) return true;
    // Allow version suffixes: digits, dots, dashes, underscores after the prefix
    if (baseName.length > prefix.length) {
      const suffix = baseName.slice(prefix.length);
      return /^[0-9.\-_]+$/.test(suffix);
    }
    return false;
  });
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

/**
 * Parse Docker RFC 3339 timestamp into epoch milliseconds.
 * Handles format like "2024-01-15T10:30:45.123456789Z".
 * Uses full date+time to avoid cross-midnight duration errors.
 */
function parseTimestampEpochMs(s: string): number | null {
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
async function inspectContainerState(
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
async function cleanupContainer(containerName: string): Promise<void> {
  try {
    await exec("docker", ["rm", "-f", containerName], { timeout: 5_000 });
  } catch (error) {
    logger.warn({ error, container: containerName }, "[compiler] Failed to remove container");
  }
}

/**
 * Stop a running container (force kill with -t 0).
 */
function stopContainer(containerName: string): void {
  spawn("docker", ["stop", "-t", "0", containerName], {
    stdio: "ignore",
  }).on("error", (err) => {
    logger.warn({ error: err, container: containerName }, "[compiler] Failed to stop container");
  }).unref();
}

/**
 * Execute a command in a Docker container with resource limits and sandboxing.
 * Gated by executionLimiter to cap concurrent container count.
 */
async function runDocker(opts: {
  image: string;
  workspaceDir: string;
  command: string[];
  stdin: Buffer | null;
  timeoutMs: number;
  readOnlyWorkspace: boolean;
  phase: "compile" | "run";
}): Promise<DockerRunResult> {
  const containerName = `compiler-${randomUUID()}`;

  // Validate image before running
  if (!isAllowedJudgeDockerImage(opts.image)) {
    throw new Error(`Invalid Docker image: ${opts.image}`);
  }

  const workspaceVolume = opts.readOnlyWorkspace
    ? `${opts.workspaceDir}:/workspace:ro`
    : `${opts.workspaceDir}:/workspace`;

  const args: string[] = [
    "run",
    "--name",
    containerName,
    "--network",
    "none",
    "--memory",
    `${MEMORY_LIMIT_MB}m`,
    "--memory-swap",
    `${MEMORY_LIMIT_MB}m`,
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--read-only",
    "--tmpfs",
    opts.phase === "compile" ? COMPILE_TMPFS : RUN_TMPFS,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--ulimit",
    "nofile=1024:1024",
    "--user",
    "65534:65534",
    "-v",
    workspaceVolume,
    "-w",
    "/workspace",
  ];

  // Seccomp profile
  if (HAS_CUSTOM_SECCOMP_PROFILE) {
    args.push(`--security-opt=seccomp=${SECCOMP_PROFILE_PATH}`);
  } else if (!hasLoggedMissingSeccompProfile) {
    hasLoggedMissingSeccompProfile = true;
    logger.warn(
      { path: SECCOMP_PROFILE_PATH },
      "[compiler] Seccomp profile not found; container will run with default seccomp policy"
    );
  }

  if (opts.stdin !== null) {
    args.push("-i");
  }

  args.push("--init", opts.image, ...opts.command);

  logger.debug({ container: containerName, command: args.join(" ") }, "[compiler] Docker run");

  // Gate on the concurrency limiter so we never exceed CPU-count containers
  return executionLimiter(() => {
    let child: ReturnType<typeof spawn> | null = null;
    let killed = false;
    let stdout = "";
    let stderr = "";
    let cleaned = false;
    const start = performance.now();

    // Unified cleanup function to prevent duplicate cleanup
    const cleanup = async (remove = true): Promise<void> => {
      if (cleaned) return;
      cleaned = true;
      if (remove) {
        // Fire and forget - run in background
        cleanupContainer(containerName).catch(() => {});
      }
    };

    // Ensure container is cleaned up even if spawn fails
    try {
      child = spawn("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (spawnError) {
      // spawn() rarely throws (it's the parent process creation that typically succeeds)
      // but if it does, the container may still exist
      cleanup().catch(() => {});
      throw spawnError;
    }

    // Handle stdin
    if (opts.stdin !== null && child.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }

    // Track stream destruction to prevent unbounded growth
    let stdoutClosed = false;
    let stderrClosed = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutClosed || stdout.length >= MAX_OUTPUT_BYTES) {
        stdoutClosed = true;
        child.stdout?.destroy();
        return;
      }
      const remaining = MAX_OUTPUT_BYTES - stdout.length;
      stdout += chunk.toString("utf8", 0, remaining);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrClosed || stderr.length >= MAX_OUTPUT_BYTES) {
        stderrClosed = true;
        child.stderr?.destroy();
        return;
      }
      const remaining = MAX_OUTPUT_BYTES - stderr.length;
      stderr += chunk.toString("utf8", 0, remaining);
    });

    // Set up timeout
    const timer = setTimeout(() => {
      killed = true;
      if (child?.kill("SIGKILL")) {
        stopContainer(containerName);
      }
    }, opts.timeoutMs);
    timer.unref();

    return new Promise<DockerRunResult>((resolve) => {
      const finish = async (wallDurationMs: number) => {
        clearTimeout(timer);

        // Inspect container BEFORE removal so OOM/timing metadata is still available.
        // When the container was killed by the timeout handler (killed=true), Docker
        // may not have finished processing the kill signal or updating the OOM state.
        // Retry the inspect up to 3 times with a short delay to give Docker time to
        // reflect the true container state, especially when OOM and timeout race.
        let state = await inspectContainerState(containerName);
        if (killed && !state.oomKilled) {
          for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise((r) => setTimeout(r, 200));
            state = await inspectContainerState(containerName);
            if (state.oomKilled) break;
          }
        }

        await cleanup(true);

        resolve({
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
          exitCode: child?.exitCode ?? null,
          timedOut: killed && !state.oomKilled,
          oomKilled: state.oomKilled,
          durationMs: state.durationMs ?? wallDurationMs,
        });
      };

      child?.on("close", async () => {
        const durationMs = Math.round(performance.now() - start);
        await finish(durationMs);
      });

      child?.on("error", async (err) => {
        clearTimeout(timer);
        await cleanup(true);
        const durationMs = Math.round(performance.now() - start);
        logger.error({ err }, "[compiler] Container spawn error");

        resolve({
          stdout: "",
          stderr: "Execution failed to start",
          exitCode: null,
          timedOut: false,
          oomKilled: false,
          durationMs,
        });
      });
    });
  });
}

/**
 * Attempt to delegate execution to the Rust runner sidecar.
 * Returns the result on success, or null if the runner is unavailable.
 */
async function tryRustRunner(
  options: CompilerRunOptions,
): Promise<CompilerRunResult | null> {
  if (!COMPILER_RUNNER_URL || !RUNNER_AUTH_TOKEN) return null;

  try {
    const settings = getConfiguredSettings();
    const timeLimitMs = options.timeLimitMs ?? settings.compilerTimeLimitMs;

    const response = await fetch(`${COMPILER_RUNNER_URL}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNNER_AUTH_TOKEN}`,
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
        { status: response.status, url: COMPILER_RUNNER_URL },
        "[compiler] Rust runner returned non-OK status, falling back to local execution",
      );
      return null;
    }

    const data = (await response.json().catch(() => null)) as CompilerRunResult | null;
    if (!data) {
      logger.warn(
        { url: COMPILER_RUNNER_URL },
        "[compiler] Rust runner returned invalid JSON, falling back to local execution",
      );
      return null;
    }
    return data;
  } catch (error) {
    logger.warn(
      { error, url: COMPILER_RUNNER_URL },
      "[compiler] Rust runner unavailable, falling back to local execution",
    );
    return null;
  }
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
  const rustResult = await tryRustRunner(options);
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
  const timeLimitMs = options.timeLimitMs ?? settings.compilerTimeLimitMs;

  // Validate Docker image
  if (!isAllowedJudgeDockerImage(options.language.dockerImage)) {
    return {
      stdout: "",
      stderr: "Invalid Docker image reference",
      exitCode: null,
      executionTimeMs: 0,
      timedOut: false,
      oomKilled: false,
      compileOutput: null,
    };
  }

  // Validate source code size
  if (Buffer.byteLength(options.sourceCode, "utf8") > MAX_SOURCE_CODE_BYTES) {
    return {
      stdout: "",
      stderr: "Source code exceeds maximum size limit (64KB)",
      exitCode: null,
      executionTimeMs: 0,
      timedOut: false,
      oomKilled: false,
      compileOutput: null,
    };
  }

  // Validate shell commands (basic sanity check)
  if (options.language.compileCommand && !validateShellCommandStrict(options.language.compileCommand)) {
    return {
      stdout: "",
      stderr: "Invalid compile command",
      exitCode: null,
      executionTimeMs: 0,
      timedOut: false,
      oomKilled: false,
      compileOutput: null,
    };
  }
  if (!validateShellCommandStrict(options.language.runCommand)) {
    return {
      stdout: "",
      stderr: "Invalid run command",
      exitCode: null,
      executionTimeMs: 0,
      timedOut: false,
      oomKilled: false,
      compileOutput: null,
    };
  }

  // Create temp workspace. Compiler containers now run as uid/gid 65534 for
  // defense-in-depth, so the workspace must remain writable/traversable by that
  // sandbox user in local fallback mode as well as Docker-in-Docker mode.
  // chmod after mkdir to bypass process umask.
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
    // See HIGH-15 in plans/open/2026-04-18-comprehensive-review-remediation.md.
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
    // Query all compiler containers regardless of status
    const { stdout } = await exec("docker", [
      "ps",
      "-a",
      "--filter",
      "name=compiler-",
      "--format",
      "{{.Names}}\t{{.Status}}\t{{.CreatedAt}}",
    ], { timeout: 10_000 });

    const lines = stdout.trim().split("\n").filter(Boolean);
    let cleaned = 0;

    for (const line of lines) {
      const [container, status, createdAtStr] = line.split("\t");
      if (!container || !status) continue;

      const statusLower = status.toLowerCase();

      // Always clean: exited, created, dead containers
      const shouldClean =
        statusLower.startsWith("exited") ||
        statusLower.startsWith("created") ||
        statusLower.startsWith("dead");

      // For running containers, check if they've been running too long.
      // Prefer the CreatedAt from `docker ps` output (already in the format
      // string) to avoid a redundant `docker inspect` call per container.
      let staleRunning = false;
      if (!shouldClean && statusLower.startsWith("up")) {
        let createdAt: number | null = null;

        // Parse CreatedAt from docker ps output (format: "2026-04-19 12:34:56 +0000 UTC")
        if (createdAtStr) {
          const parsed = Date.parse(createdAtStr.trim());
          if (!Number.isNaN(parsed)) {
            createdAt = parsed;
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
