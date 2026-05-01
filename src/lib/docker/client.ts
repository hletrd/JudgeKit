import { execFile, spawn } from "child_process";
import { promisify } from "util";
import pLimit from "p-limit";
import { logger } from "@/lib/logger";

const exec = promisify(execFile);
// Accept JUDGE_WORKER_URL or COMPILER_RUNNER_URL — both map to the same
// judge-worker sidecar. The COMPILER_RUNNER_URL name is the canonical env
// var (shared with src/lib/compiler/execute.ts); JUDGE_WORKER_URL is accepted
// as an alias for operators who find the name more intuitive.
const JUDGE_WORKER_URL = process.env.JUDGE_WORKER_URL || process.env.COMPILER_RUNNER_URL || "";
const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || process.env.JUDGE_AUTH_TOKEN || "";
const WORKER_DOCKER_API_CONFIG_ERROR =
  JUDGE_WORKER_URL && !RUNNER_AUTH_TOKEN
    ? "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN/JUDGE_AUTH_TOKEN is missing"
    : null;
const USE_WORKER_DOCKER_API = Boolean(JUDGE_WORKER_URL && RUNNER_AUTH_TOKEN);

export interface DockerImage {
  repository: string;
  tag: string;
  id: string;
  created: string;
  size: string;
}

export interface DockerPullProgress {
  status: string;
  error?: string;
}

function isValidImageReference(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/.test(value);
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function callWorkerJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!JUDGE_WORKER_URL) throw new Error("JUDGE_WORKER_URL is not configured");
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${RUNNER_AUTH_TOKEN}`);

  const response = await fetch(`${JUDGE_WORKER_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = await response.json().catch(() => {
    throw new Error("Worker returned non-JSON response");
  }) as T;
  return data;
}

function getWorkerDockerApiConfigError(): string | null {
  return WORKER_DOCKER_API_CONFIG_ERROR;
}

async function callWorkerNoContent(path: string, init?: RequestInit): Promise<void> {
  if (!JUDGE_WORKER_URL) throw new Error("JUDGE_WORKER_URL is not configured");
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${RUNNER_AUTH_TOKEN}`);

  const response = await fetch(`${JUDGE_WORKER_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

async function listDockerImagesLocal(filter?: string): Promise<DockerImage[]> {
  const args = ["images", "--format", "{{json .}}"];
  if (filter) args.push("--filter", `reference=${filter}`);

  try {
    const { stdout } = await exec("docker", args, { timeout: 15_000 });
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          return {
            repository: parsed.Repository,
            tag: parsed.Tag,
            id: parsed.ID,
            created: parsed.CreatedSince ?? parsed.CreatedAt,
            size: parsed.Size,
          };
        } catch {
          // Skip unparseable lines (e.g., Docker warnings, partial output)
          logger.debug({ line }, "[docker] Skipping unparseable line in images output");
          return null;
        }
      })
      .filter((img): img is DockerImage => img !== null);
  } catch {
    return [];
  }
}

async function pullDockerImageLocal(imageTag: string): Promise<{ success: boolean; error?: string }> {
  if (!isValidImageReference(imageTag)) {
    return { success: false, error: "Invalid image tag" };
  }

  try {
    await exec("docker", ["pull", imageTag], { timeout: 300_000 });
    return { success: true };
  } catch (error) {
    logger.error({ error, imageTag }, "[docker] Pull failed");
    return { success: false, error: "Failed to pull Docker image" };
  }
}

async function inspectDockerImageLocal(imageTag: string): Promise<Record<string, unknown> | null> {
  if (!isValidImageReference(imageTag)) {
    return null;
  }

  try {
    const { stdout } = await exec("docker", ["inspect", imageTag], { timeout: 15_000 });
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return null;
  }
}

async function buildDockerImageLocal(
  imageName: string,
  dockerfilePath: string,
): Promise<{ success: boolean; error?: string; logs?: string }> {
  if (!isValidImageReference(imageName)) {
    return { success: false, error: "Invalid image name" };
  }
  // Validate that the dockerfilePath starts with the expected prefix before
  // stripping it for traversal checks. Without anchoring, a path like
  // "xdocker/Dockerfile.test" would pass validation with "xtest" remaining
  // (harmless — Docker would fail — but defense-in-depth).
  if (!dockerfilePath.startsWith("docker/Dockerfile.")) {
    return { success: false, error: "Invalid dockerfile path" };
  }
  if (/\.\.|[/\\]/.test(dockerfilePath.slice("docker/Dockerfile.".length))) {
    return { success: false, error: "Invalid dockerfile path" };
  }

  const contextDir = ".";

  // Head+tail buffer strategy: keep the first 32KB (contains Dockerfile
  // commands, build context, and early-stage output — the most useful
  // diagnostic info) plus the last ~2MB-32KB (recent output). A simple
  // tail-only slice would discard the critical prefix.
  const HEAD_SIZE = 32 * 1024;
  const MAX_TOTAL = 2 * 1024 * 1024;
  const TAIL_SIZE = MAX_TOTAL - HEAD_SIZE;

  return new Promise((resolve) => {
    const proc = spawn("docker", ["build", "-t", imageName, "-f", dockerfilePath, contextDir]);
    let head = "";
    let headFinalized = false;
    let tail = "";

    function appendOutput(chunk: string) {
      if (!headFinalized) {
        const remaining = HEAD_SIZE - head.length;
        if (remaining > 0) {
          head += chunk.slice(0, remaining);
          const overflow = chunk.slice(remaining);
          if (overflow) tail += overflow;
        } else {
          headFinalized = true;
          tail += chunk;
        }
        if (head.length >= HEAD_SIZE) headFinalized = true;
      } else {
        tail += chunk;
        if (tail.length > TAIL_SIZE) tail = tail.slice(-TAIL_SIZE);
      }
    }

    proc.stdout.on("data", (chunk: Buffer) => appendOutput(chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => appendOutput(chunk.toString()));

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: "docker build timed out after 600s" });
    }, 600_000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const combined = headFinalized && tail.length > 0
          ? head + "\n... [truncated] ...\n" + tail
          : head + tail;
        resolve({ success: true, logs: combined.trim() });
      } else {
        // Do not expose Docker build stderr/stdout in the API response — it may
        // contain internal paths, env var names, or registry URLs. Full output
        // is already captured in the stdout/stderr handlers above for logging.
        resolve({ success: false, error: "Docker build failed" });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      logger.error({ err, imageName, dockerfilePath }, "[docker] Build process spawn error");
      resolve({ success: false, error: "Build process failed to start" });
    });
  });
}

async function getDiskUsageLocal(): Promise<{ total: string; used: string; available: string; usePercent: string } | null> {
  try {
    const { stdout } = await exec("df", ["-h", "/"], { timeout: 5_000 });
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    return {
      total: parts[1] ?? "?",
      used: parts[2] ?? "?",
      available: parts[3] ?? "?",
      usePercent: parts[4] ?? "?",
    };
  } catch {
    return null;
  }
}

async function removeDockerImageLocal(imageTag: string): Promise<{ success: boolean; error?: string }> {
  if (!isValidImageReference(imageTag)) {
    return { success: false, error: "Invalid image tag" };
  }

  try {
    await exec("docker", ["rmi", imageTag], { timeout: 30_000 });
    return { success: true };
  } catch (error) {
    logger.error({ error, imageTag }, "[docker] Remove failed");
    return { success: false, error: "Failed to remove Docker image" };
  }
}

/** List local Docker images, optionally filtered by reference pattern */
export async function listDockerImages(filter?: string): Promise<DockerImage[]> {
  const configError = getWorkerDockerApiConfigError();
  if (configError) {
    throw new Error(configError);
  }
  if (!USE_WORKER_DOCKER_API) {
    return listDockerImagesLocal(filter);
  }

  const query = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  return await callWorkerJson<DockerImage[]>(`/docker/images${query}`, {
    method: "GET",
  });
}

/** Pull a Docker image by tag. Returns success/error */
export async function pullDockerImage(imageTag: string): Promise<{ success: boolean; error?: string }> {
  const configError = getWorkerDockerApiConfigError();
  if (configError) {
    return { success: false, error: configError };
  }
  if (!USE_WORKER_DOCKER_API) {
    return pullDockerImageLocal(imageTag);
  }

  if (!isValidImageReference(imageTag)) {
    return { success: false, error: "Invalid image tag" };
  }

  try {
    await callWorkerNoContent("/docker/pull", {
      method: "POST",
      body: JSON.stringify({ imageTag }),
    });
    return { success: true };
  } catch (error) {
    logger.error({ error, imageTag }, "[docker] Remote pull failed");
    return { success: false, error: "Failed to pull Docker image" };
  }
}

/** Inspect a Docker image */
export async function inspectDockerImage(imageTag: string): Promise<Record<string, unknown> | null> {
  const configError = getWorkerDockerApiConfigError();
  if (configError) {
    throw new Error(configError);
  }
  if (!USE_WORKER_DOCKER_API) {
    return inspectDockerImageLocal(imageTag);
  }

  if (!isValidImageReference(imageTag)) {
    return null;
  }

  try {
    return await callWorkerJson<Record<string, unknown>>("/docker/inspect", {
      method: "POST",
      body: JSON.stringify({ imageTag }),
    });
  } catch {
    return null;
  }
}

/** Build a Docker image from a Dockerfile using the repo root as the build context. */
export async function buildDockerImage(
  imageName: string,
  dockerfilePath: string,
): Promise<{ success: boolean; error?: string; logs?: string }> {
  const configError = getWorkerDockerApiConfigError();
  if (configError) {
    return { success: false, error: configError };
  }
  if (!USE_WORKER_DOCKER_API) {
    return buildDockerImageLocal(imageName, dockerfilePath);
  }

  if (!isValidImageReference(imageName)) {
    return { success: false, error: "Invalid image name" };
  }
  if (!dockerfilePath.startsWith("docker/Dockerfile.")) {
    return { success: false, error: "Invalid dockerfile path" };
  }
  if (/\.\.|[/\\]/.test(dockerfilePath.slice("docker/Dockerfile.".length))) {
    return { success: false, error: "Invalid dockerfile path" };
  }

  try {
    const response = await callWorkerJson<{ logs: string }>("/docker/build", {
      method: "POST",
      body: JSON.stringify({ imageName, dockerfilePath }),
    });
    return { success: true, logs: response.logs };
  } catch (error) {
    logger.error({ error, imageName }, "[docker] Remote build failed");
    return { success: false, error: "Failed to build Docker image" };
  }
}

/** Get disk usage info */
export async function getDiskUsage(): Promise<{ total: string; used: string; available: string; usePercent: string } | null> {
  const configError = getWorkerDockerApiConfigError();
  if (configError) {
    throw new Error(configError);
  }
  if (!USE_WORKER_DOCKER_API) {
    return getDiskUsageLocal();
  }

  try {
    return await callWorkerJson<{ total: string; used: string; available: string; usePercent: string }>("/docker/disk-usage", {
      method: "GET",
    });
  } catch {
    return null;
  }
}

/** Remove a Docker image */
export async function removeDockerImage(imageTag: string): Promise<{ success: boolean; error?: string }> {
  const configError = getWorkerDockerApiConfigError();
  if (configError) {
    return { success: false, error: configError };
  }
  if (!USE_WORKER_DOCKER_API) {
    return removeDockerImageLocal(imageTag);
  }

  if (!isValidImageReference(imageTag)) {
    return { success: false, error: "Invalid image tag" };
  }

  try {
    await callWorkerNoContent("/docker/remove", {
      method: "POST",
      body: JSON.stringify({ imageTag }),
    });
    return { success: true };
  } catch (error) {
    logger.error({ error, imageTag }, "[docker] Remote remove failed");
    return { success: false, error: "Failed to remove Docker image" };
  }
}

/** Remove a list of Docker images by tag, up to 3 in parallel */
export async function removeDockerImages(
  tags: string[],
): Promise<{ removed: string[]; errors: string[] }> {
  const removed: string[] = [];
  const errors: string[] = [];
  const limiter = pLimit(3);

  const results = await Promise.all(
    tags.map((tag) =>
      limiter(async () => {
        const result = await removeDockerImage(tag);
        return { tag, result };
      }),
    ),
  );

  for (const { tag, result } of results) {
    if (result.success) {
      removed.push(tag);
    } else {
      errors.push(`${tag}: ${result.error}`);
    }
  }

  return { removed, errors };
}
