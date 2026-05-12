import { spawn } from "child_process";
import { join } from "path";
import { cpus } from "os";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import pLimit from "p-limit";
import { isAllowedJudgeDockerImage } from "@/lib/judge/docker-image-validation";
import { logger } from "@/lib/logger";
import { cleanupContainer, inspectContainerState, stopContainer } from "./container-lifecycle";

export const MEMORY_LIMIT_MB = 256;
// Keep aligned with the Rust judge worker so stdout/stderr truncation matches
// between local compiler-run requests and remote judge execution.
export const MAX_OUTPUT_BYTES = 4_194_304; // 4 MiB
export const COMPILE_TMPFS = "/tmp:rw,exec,nosuid,size=1024m";
export const RUN_TMPFS = "/tmp:rw,noexec,nosuid,size=64m";
export const SANDBOX_USER = "65534:65534";
export const SECCOMP_PROFILE_PATH = join(
  process.cwd(),
  "docker/seccomp-profile.json"
);
export const HAS_CUSTOM_SECCOMP_PROFILE = existsSync(SECCOMP_PROFILE_PATH);

let hasLoggedMissingSeccompProfile = false;

/**
 * Module-level concurrency limiter for Docker container spawning.
 * Caps parallel containers to (CPU count - 1), minimum 1, to prevent
 * resource exhaustion when many judge runs are claimed simultaneously.
 */
const executionLimiter = pLimit(Math.max(cpus().length - 1, 1));

export interface DockerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  oomKilled: boolean;
  durationMs: number;
}

export interface DockerRunOptions {
  image: string;
  workspaceDir: string;
  command: string[];
  stdin: Buffer | null;
  timeoutMs: number;
  readOnlyWorkspace: boolean;
  phase: "compile" | "run";
}

/**
 * Execute a command in a Docker container with resource limits and sandboxing.
 * Gated by executionLimiter to cap concurrent container count.
 */
export async function runDocker(opts: DockerRunOptions): Promise<DockerRunResult> {
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
    SANDBOX_USER,
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
        cleanupContainer(containerName).catch((err: unknown) => {
          logger.warn({ err }, "container cleanup failed");
        });
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
      cleanup().catch((err: unknown) => {
        logger.warn({ err }, "container cleanup after spawn failure failed");
      });
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
