import { execFile, spawn } from "child_process";
import { dirname } from "path";
import { promisify } from "util";
import pLimit from "p-limit";

const exec = promisify(execFile);

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

/** List local Docker images, optionally filtered by reference pattern */
export async function listDockerImages(filter?: string): Promise<DockerImage[]> {
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

/** Pull a Docker image by tag. Returns success/error */
export async function pullDockerImage(imageTag: string): Promise<{ success: boolean; error?: string }> {
  // Validate image tag to prevent command injection
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/.test(imageTag)) {
    return { success: false, error: "Invalid image tag" };
  }

  try {
    await exec("docker", ["pull", imageTag], { timeout: 300_000 }); // 5 min timeout
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

/** Inspect a Docker image */
export async function inspectDockerImage(imageTag: string): Promise<Record<string, unknown> | null> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/.test(imageTag)) {
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

/** Build a Docker image from a Dockerfile. Uses the Dockerfile's parent directory as context. */
export async function buildDockerImage(
  imageName: string,
  dockerfilePath: string,
): Promise<{ success: boolean; error?: string; logs?: string }> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/.test(imageName)) {
    return { success: false, error: "Invalid image name" };
  }
  // Prevent path traversal in dockerfile path
  if (/\.\.|[/\\]/.test(dockerfilePath.replace(/^docker\/Dockerfile\./, ""))) {
    return { success: false, error: "Invalid dockerfile path" };
  }

  // Use the Dockerfile's parent directory as the build context instead of cwd
  const contextDir = dirname(dockerfilePath) || ".";

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

/** Get disk usage info */
export async function getDiskUsage(): Promise<{ total: string; used: string; available: string; usePercent: string } | null> {
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

/** Remove a Docker image */
export async function removeDockerImage(imageTag: string): Promise<{ success: boolean; error?: string }> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/.test(imageTag)) {
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
