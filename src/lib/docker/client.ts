import { execFile, spawn } from "child_process";
import { promisify } from "util";
import pLimit from "p-limit";

const exec = promisify(execFile);
const JUDGE_WORKER_URL = process.env.COMPILER_RUNNER_URL || "";
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

  return response.json() as Promise<T>;
}

function getWorkerDockerApiConfigError(): string | null {
  return WORKER_DOCKER_API_CONFIG_ERROR;
}

async function callWorkerNoContent(path: string, init?: RequestInit): Promise<void> {
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
        const parsed = JSON.parse(line);
        return {
          repository: parsed.Repository,
          tag: parsed.Tag,
          id: parsed.ID,
          created: parsed.CreatedSince ?? parsed.CreatedAt,
          size: parsed.Size,
        };
      });
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
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
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
  if (/\.\.|[/\\]/.test(dockerfilePath.replace(/^docker\/Dockerfile\./, ""))) {
    return { success: false, error: "Invalid dockerfile path" };
  }

  const contextDir = ".";

  return new Promise((resolve) => {
    const proc = spawn("docker", ["build", "-t", imageName, "-f", dockerfilePath, contextDir]);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 2 * 1024 * 1024) stdout = stdout.slice(-2 * 1024 * 1024);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 2 * 1024 * 1024) stderr = stderr.slice(-2 * 1024 * 1024);
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: "docker build timed out after 600s" });
    }, 600_000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ success: true, logs: (stdout + "\n" + stderr).trim() });
      } else {
        resolve({ success: false, error: stderr.trim() || stdout.trim() });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
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
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
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
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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
  if (/\.\.|[/\\]/.test(dockerfilePath.replace(/^docker\/Dockerfile\./, ""))) {
    return { success: false, error: "Invalid dockerfile path" };
  }

  try {
    const response = await callWorkerJson<{ logs: string }>("/docker/build", {
      method: "POST",
      body: JSON.stringify({ imageName, dockerfilePath }),
    });
    return { success: true, logs: response.logs };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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
