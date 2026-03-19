import { execFile } from "child_process";
import { promisify } from "util";

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

/** Build a Docker image from a Dockerfile in the docker/ directory */
export async function buildDockerImage(
  imageName: string,
  dockerfilePath: string,
): Promise<{ success: boolean; error?: string; logs?: string }> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/.test(imageName)) {
    return { success: false, error: "Invalid image name" };
  }

  try {
    const { stdout, stderr } = await exec(
      "docker",
      ["build", "-t", imageName, "-f", dockerfilePath, "."],
      { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
    );
    return { success: true, logs: (stdout + "\n" + stderr).trim() };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
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
