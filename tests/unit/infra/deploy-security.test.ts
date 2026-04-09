import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("deployment security defaults", () => {
  it("uses safer SSH defaults and avoids echoing sudo passwords in deploy-docker", () => {
    const deployDocker = read("deploy-docker.sh");

    expect(deployDocker).toContain("StrictHostKeyChecking=accept-new");
    expect(deployDocker).toContain("remote_sudo()");
    expect(deployDocker).not.toContain("echo '${SSH_PASSWORD}' | sudo -S");
  });

  it("uses https AUTH_URL defaults for deploy scripts", () => {
    expect(read("deploy.sh")).toContain("AUTH_URL=https://${DOMAIN}");
    expect(read("deploy-test-backends.sh")).toContain("AUTH_URL=https://${DOMAIN}");
  });

  it("documents the current single-app-instance requirement for SSE and anti-cheat coordination", () => {
    const readme = read("README.md");
    const deploymentGuide = read("docs/deployment.md");
    const workersGuide = read("docs/judge-workers.md");

    expect(readme).toContain("single app instance");
    expect(deploymentGuide).toContain("single instance");
    expect(workersGuide).toContain("process-local memory");
  });
});
