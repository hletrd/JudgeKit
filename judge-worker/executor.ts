import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Language } from "../src/types";
import { compareOutput } from "./comparator";
import { getJudgeAuthToken, getJudgePollUrl, shouldDisableCustomSeccomp } from "./config";
import { LANGUAGE_CONFIGS } from "./languages";

const EXECUTION_CPU_LIMIT = "1";
const MIN_MEMORY_LIMIT_MB = 16;
const COMPILATION_MEMORY_LIMIT_MB = 1024;
const COMPILATION_TIMEOUT_MS = 20_000;
const MIN_TIMEOUT_MS = 100;
const CONTAINER_TMPFS = "/tmp:rw,noexec,nosuid,size=64m";
const SECCOMP_PROFILE_PATH = path.resolve(process.cwd(), "docker/seccomp-profile.json");
const SECCOMP_INIT_ERROR_SNIPPETS = [
  "OCI runtime create failed",
  "error during container init",
  "fsmount:fscontext:proc: operation not permitted",
];
const CUSTOM_SECCOMP_DISABLED = shouldDisableCustomSeccomp();
const RUN_PHASE_SECCOMP_AVAILABLE = existsSync(SECCOMP_PROFILE_PATH);

if (!CUSTOM_SECCOMP_DISABLED && !RUN_PHASE_SECCOMP_AVAILABLE) {
  console.error(
    `Run-phase seccomp profile is missing or unreadable at ${SECCOMP_PROFILE_PATH}. ` +
      "Execution will fail closed until the profile is restored or explicitly disabled."
  );
}

export interface Submission {
  id: string;
  claimToken: string;
  language: Language;
  sourceCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: Array<{
    id: string;
    input: string;
    expectedOutput: string;
  }>;
}

export interface TestResult {
  testCaseId: string;
  status: string;
  actualOutput: string;
  executionTimeMs: number;
  memoryUsedKb: number;
}

type DockerCommandOptions = {
  image: string;
  workspaceDir: string;
  command: string[];
  phase: "compile" | "run";
  input?: string;
  timeoutMs: number;
  memoryLimitMb: number;
  readOnlyWorkspace?: boolean;
};

type DockerCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  oomKilled: boolean;
  durationMs: number;
};

type DockerExecutionOptions = {
  useCustomSeccomp: boolean;
};

class JudgeEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeEnvironmentError";
  }
}

function getMemoryLimitMb(memoryLimitMb: number) {
  return Math.max(MIN_MEMORY_LIMIT_MB, Math.trunc(memoryLimitMb || MIN_MEMORY_LIMIT_MB));
}

function getWorkspaceSourcePath(workspaceDir: string, extension: string) {
  return path.join(workspaceDir, `solution${extension}`);
}

function getMemoryUsageKb(memoryLimitMb: number, oomKilled: boolean) {
  return oomKilled ? getMemoryLimitMb(memoryLimitMb) * 1024 : 0;
}

function getFinalSubmissionStatus(results: TestResult[]) {
  if (results.length === 0) {
    return "accepted";
  }

  const failedResult = results.find((result) => result.status !== "accepted");
  return failedResult?.status ?? "accepted";
}

async function runShellCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function inspectContainerOomKilled(containerName: string) {
  try {
    const result = await runShellCommand("docker", [
      "inspect",
      "--format",
      "{{json .State.OOMKilled}}",
      containerName,
    ]);

    return result.stdout.trim() === "true";
  } catch (error) {
    console.error(`Failed to inspect container ${containerName}:`, error);
    return false;
  }
}

async function killContainer(containerName: string) {
  try {
    await runShellCommand("docker", ["kill", containerName]);
  } catch (error) {
    console.error(`Failed to kill container ${containerName}:`, error);
  }
}

async function removeContainer(containerName: string) {
  try {
    await runShellCommand("docker", ["rm", "-f", containerName]);
  } catch (error) {
    console.error(`Failed to remove container ${containerName}:`, error);
  }
}

function shouldUseCustomSeccompProfile(phase: DockerCommandOptions["phase"]) {
  return phase === "run" && !CUSTOM_SECCOMP_DISABLED;
}

function shouldRetryWithoutCustomSeccomp(stderr: string) {
  return SECCOMP_INIT_ERROR_SNIPPETS.every((snippet) => stderr.includes(snippet));
}

async function runDockerCommandOnce(
  options: DockerCommandOptions,
  executionOptions: DockerExecutionOptions
): Promise<DockerCommandResult> {
  const containerName = `oj-${randomUUID()}`;
  const workspaceMount = options.readOnlyWorkspace
    ? `${options.workspaceDir}:/workspace:ro`
    : `${options.workspaceDir}:/workspace`;
  const pidsLimit = "16";
  const dockerArgs = [
    "run",
    "--name",
    containerName,
    "--network",
    "none",
    "--memory",
    `${getMemoryLimitMb(options.memoryLimitMb)}m`,
    "--cpus",
    EXECUTION_CPU_LIMIT,
    "--pids-limit",
    pidsLimit,
    "--read-only",
    "--tmpfs",
    CONTAINER_TMPFS,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--ulimit",
    "fsize=52428800:52428800",
    "--ulimit",
    "nofile=64:64",
    "-v",
    workspaceMount,
    "-w",
    "/workspace",
  ];

  if (executionOptions.useCustomSeccomp) {
    dockerArgs.push("--security-opt", `seccomp=${SECCOMP_PROFILE_PATH}`);
  }

  if (options.input !== undefined) {
    dockerArgs.push("-i");
  }

  dockerArgs.push(options.image, ...options.command);

  const startedAt = Date.now();

  return new Promise<DockerCommandResult>((resolve, reject) => {
    const child = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      void killContainer(containerName);
    }, Math.max(MIN_TIMEOUT_MS, options.timeoutMs));

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", async (error) => {
      clearTimeout(timeoutHandle);
      await removeContainer(containerName);
      reject(error);
    });

    child.on("close", async (exitCode) => {
      clearTimeout(timeoutHandle);
      const oomKilled = await inspectContainerOomKilled(containerName);
      await removeContainer(containerName);

      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
        oomKilled,
        durationMs: Date.now() - startedAt,
      });
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}

async function runDockerCommand(options: DockerCommandOptions): Promise<DockerCommandResult> {
  const useCustomSeccomp = shouldUseCustomSeccompProfile(options.phase);

  if (useCustomSeccomp && !RUN_PHASE_SECCOMP_AVAILABLE) {
    throw new JudgeEnvironmentError(
      "Judge sandbox unavailable: the run-phase seccomp profile is missing or unreadable."
    );
  }

  const firstAttempt = await runDockerCommandOnce(options, { useCustomSeccomp });

  if (useCustomSeccomp && shouldRetryWithoutCustomSeccomp(firstAttempt.stderr)) {
    console.error(
      `Run-phase seccomp profile failed for ${options.image}; refusing to retry without custom seccomp.`
    );

    throw new JudgeEnvironmentError(
      "Judge sandbox unavailable: the run-phase seccomp profile could not be applied."
    );
  }

  return firstAttempt;
}

export async function executeSubmission(submission: Submission): Promise<void> {
  const config = LANGUAGE_CONFIGS[submission.language];
  if (!config) {
    await reportJudgeUpdate(submission.id, submission.claimToken, {
      status: "compile_error",
      compileOutput: "Unsupported language",
      results: [],
    });
    return;
  }

  await reportJudgeUpdate(submission.id, submission.claimToken, { status: "judging" });

  const workspaceDir = await mkdtemp(path.join(tmpdir(), "online-judge-"));
  let compileOutput = "";

  try {
    await chmod(workspaceDir, 0o777);
    await writeFile(
      getWorkspaceSourcePath(workspaceDir, config.extension),
      submission.sourceCode,
      "utf8"
    );
    await chmod(getWorkspaceSourcePath(workspaceDir, config.extension), 0o644);

    if (config.compileCommand) {
      const compilation = await runDockerCommand({
        image: config.dockerImage,
        workspaceDir,
        command: config.compileCommand,
        phase: "compile",
        timeoutMs: Math.max(COMPILATION_TIMEOUT_MS, submission.timeLimitMs * 5),
        memoryLimitMb: Math.max(COMPILATION_MEMORY_LIMIT_MB, submission.memoryLimitMb),
      });

      compileOutput = [compilation.stdout, compilation.stderr].filter(Boolean).join("\n").trim();

      if (compilation.timedOut) {
        await reportJudgeUpdate(submission.id, submission.claimToken, {
          status: "compile_error",
          compileOutput: "Compilation timed out",
          results: [],
        });
        return;
      }

      if (compilation.oomKilled || compilation.exitCode !== 0) {
        await reportJudgeUpdate(submission.id, submission.claimToken, {
          status: "compile_error",
          compileOutput: compileOutput || "Compilation failed",
          results: [],
        });
        return;
      }
    }

    const results: TestResult[] = [];

    for (const testCase of submission.testCases) {
      const execution = await runDockerCommand({
        image: config.dockerImage,
        workspaceDir,
        command: config.runCommand,
        phase: "run",
        input: testCase.input,
        timeoutMs: Math.max(MIN_TIMEOUT_MS, submission.timeLimitMs),
        memoryLimitMb: submission.memoryLimitMb,
        readOnlyWorkspace: true,
      });

      let status = "accepted";

      if (execution.timedOut) {
        status = "time_limit";
      } else if (execution.oomKilled || execution.exitCode === 137) {
        status = "memory_limit";
      } else if ((execution.exitCode ?? 1) !== 0) {
        status = "runtime_error";
      } else if (!compareOutput(testCase.expectedOutput, execution.stdout)) {
        status = "wrong_answer";
      }

      results.push({
        testCaseId: testCase.id,
        status,
        actualOutput: execution.stdout,
        executionTimeMs: execution.durationMs,
        memoryUsedKb: getMemoryUsageKb(submission.memoryLimitMb, execution.oomKilled),
      });

      if (status !== "accepted") {
        break;
      }
    }

    await reportJudgeUpdate(submission.id, submission.claimToken, {
      status: getFinalSubmissionStatus(results),
      compileOutput,
      results,
    });
  } catch (error) {
    console.error(`Failed to execute submission ${submission.id}:`, error);

    const errorMessage =
      error instanceof JudgeEnvironmentError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Judge execution failed";

    await reportJudgeUpdate(submission.id, submission.claimToken, {
      status: "runtime_error",
      compileOutput: errorMessage,
      results: [],
    });
  } finally {
    await rm(workspaceDir, { force: true, recursive: true });
  }
}

async function reportJudgeUpdate(
  submissionId: string,
  claimToken: string,
  payload: Record<string, unknown>
): Promise<void> {
  const pollUrl = getJudgePollUrl();
  const authToken = getJudgeAuthToken();

  try {
    const response = await fetch(pollUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submissionId, claimToken, ...payload }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error("Failed to report judge update:", response.status, responseText);
    }
  } catch (error) {
    console.error("Failed to report judge update:", error);
  }
}
