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
if (!RUNNER_AUTH_TOKEN && process.env.NODE_ENV === "production") {
  logger.error("RUNNER_AUTH_TOKEN is not set in production — compiler runner auth disabled");
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
 * Validate shell command string. Since commands come from trusted DB configs,
 * we perform basic validation to detect obvious anomalies but don't enforce
 * strict character restrictions (needed for legitimate compiler flags).
 * Allow && and ; since trusted admin-configured compile commands legitimately
 * chain steps (e.g. "javac ... && jar ...").
 */
function validateShellCommand(cmd: string): boolean {
  if (!cmd || cmd.length > 10_000) return false;
  if (cmd.includes("\0")) return false;
  const dangerous = /`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b/;
  return !dangerous.test(cmd);
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

  logger.info({ container: containerName, command: args.join(" ") }, "[compiler] Docker run");

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

        // Inspect container BEFORE removal so OOM/timing metadata is still available
        const state = await inspectContainerState(containerName);

        await cleanup(true);

        resolve({
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
          exitCode: child?.exitCode ?? null,
          timedOut: killed,
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

        resolve({
          stdout: "",
          stderr: err.message,
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

    const data = await response.json() as CompilerRunResult;
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
  if (options.language.compileCommand && !validateShellCommand(options.language.compileCommand)) {
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
  if (!validateShellCommand(options.language.runCommand)) {
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
  await chmod(workspaceDir, 0o777);

  try {
    // Write source file (world-readable for sibling container access)
    const sourceFileName = `solution${options.language.extension}`;
    await writeFile(join(workspaceDir, sourceFileName), options.sourceCode, {
      encoding: "utf8",
    });
    await chmod(join(workspaceDir, sourceFileName), 0o644);

    let compileOutput: string | null = null;

    // Compile phase (if needed)
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
      const [container, status] = line.split("\t");
      if (!container || !status) continue;

      const statusLower = status.toLowerCase();

      // Always clean: exited, created, dead containers
      const shouldClean =
        statusLower.startsWith("exited") ||
        statusLower.startsWith("created") ||
        statusLower.startsWith("dead");

      // For running containers, check if they've been running too long
      let staleRunning = false;
      if (!shouldClean && statusLower.startsWith("up")) {
        try {
          const { stdout: inspectOut } = await exec("docker", [
            "inspect",
            "--format",
            "{{.Created}}",
            container,
          ], { timeout: 5_000 });
          const createdAt = new Date(inspectOut.trim()).getTime();
          if (!Number.isNaN(createdAt) && Date.now() - createdAt > MAX_CONTAINER_AGE_MS) {
            staleRunning = true;
          }
        } catch {
          // If inspect fails, skip this container
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
