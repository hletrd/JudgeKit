import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function readIfExists(relativePath: string) {
  const path = join(process.cwd(), relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function executableLines(source: string) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

describe("deploy storage and target safety contracts", () => {
  it("does not run destructive Docker prune commands from automated deploy paths", () => {
    const automatedPaths = [
      "deploy-docker.sh",
      "deploy.sh",
      "scripts/docker-disk-cleanup.sh",
      "scripts/rebuild-worker-language-images.sh",
    ];

    for (const path of automatedPaths) {
      const source = executableLines(read(path));
      expect(source, path).not.toMatch(/docker\s+volume\s+prune\b/);
      expect(source, path).not.toMatch(/docker\s+system\s+prune[^\n]*--volumes/);
      expect(source, path).not.toMatch(/docker\s+image\s+prune\s+-af\b/);
    }

    const deployDocker = read("deploy-docker.sh");
    expect(deployDocker).toContain("docker image prune -f");
    expect(deployDocker).toContain("docker builder prune -af");
    expect(deployDocker).toContain("docker buildx history rm --all");
  });

  it("fails closed for known target selection footguns", () => {
    const deployDocker = read("deploy-docker.sh");
    const defaultEnv = readIfExists(".env.deploy");
    const algoEnv = readIfExists(".env.deploy.algo");
    const worvEnv = readIfExists(".env.deploy.worv");
    const auraeduEnv = readIfExists(".env.deploy.auraedu");

    expect(deployDocker).toContain('DEPLOY_TARGET="auraedu"');
    expect(deployDocker).toContain("Unknown DEPLOY_TARGET");
    expect(deployDocker).toContain("Expected one of: algo, worv, auraedu (alias: oj)");

    if (defaultEnv) {
      expect(defaultEnv).not.toContain("DOMAIN=oj-internal.maum.ai");
    }
    if (algoEnv) {
      expect(algoEnv).toContain("REMOTE_HOST=algo.xylolabs.com");
      expect(algoEnv).toContain("INCLUDE_WORKER=false");
      expect(algoEnv).toContain("BUILD_WORKER_IMAGE=false");
      expect(algoEnv).toContain("SKIP_LANGUAGES=true");
    }
    expect(deployDocker).toContain('REMOTE_HOST}" == "algo.xylolabs.com"');
    expect(deployDocker).toContain("algo.xylolabs.com is the app server only");

    if (worvEnv) {
      expect(worvEnv).toContain("REMOTE_HOST=test.worv.ai");
      expect(worvEnv).toContain("DOMAIN=test.worv.ai");
    }
    expect(worvEnv).not.toContain("oj.worv.ai");
    if (auraeduEnv) {
      expect(auraeduEnv).toContain("REMOTE_HOST=oj.auraedu.me");
    }
  });

  it("uses target-provided runner and auth URLs before app startup", () => {
    const deployDocker = read("deploy-docker.sh");
    const worvEnv = readIfExists(".env.deploy.worv");

    if (worvEnv) {
      expect(worvEnv).toContain("COMPILER_RUNNER_URL=http://172.31.62.69:3001");
    }
    expect(deployDocker).toContain('COMPILER_RUNNER_DEFAULT="${COMPILER_RUNNER_URL:-http://host.docker.internal:3001}"');
    expect(deployDocker).toContain("upsert_env_literal COMPILER_RUNNER_URL");
    expect(deployDocker).toContain("upsert_env_literal AUTH_URL");

    const authUrlIndex = deployDocker.indexOf("upsert_env_literal AUTH_URL");
    const composeUpIndex = deployDocker.indexOf("docker compose ${COMPOSE_DEPLOY_FILES} --env-file .env.production up -d");
    expect(authUrlIndex).toBeGreaterThanOrEqual(0);
    expect(composeUpIndex).toBeGreaterThanOrEqual(0);
    expect(authUrlIndex).toBeLessThan(composeUpIndex);
    expect(deployDocker).not.toContain("sed -i 's|^AUTH_URL=.*|AUTH_URL=");
  });

  it("checks Docker storage roots before app and worker builds", () => {
    const deployDocker = read("deploy-docker.sh");
    const cleanupScript = read("scripts/docker-disk-cleanup.sh");
    const rebuildScript = read("scripts/rebuild-worker-language-images.sh");

    for (const source of [deployDocker, cleanupScript, rebuildScript]) {
      expect(source).toContain("docker info --format '{{.DockerRootDir}}'");
      expect(source).toContain("/judge-workspaces");
    }

    const appPreflightIndex = deployDocker.indexOf('preflight_docker_storage "app ${REMOTE_HOST}" remote true');
    const appBuildIndex = deployDocker.indexOf("Building app image on ${REMOTE_HOST}");
    expect(appPreflightIndex).toBeGreaterThanOrEqual(0);
    expect(appBuildIndex).toBeGreaterThanOrEqual(0);
    expect(appPreflightIndex).toBeLessThan(appBuildIndex);

    const workerPreflightIndex = deployDocker.indexOf('preflight_docker_storage "worker ${WHOST}" _worker_ssh true');
    const workerBuildIndex = deployDocker.indexOf("build judge-worker image (no-cache)");
    expect(workerPreflightIndex).toBeGreaterThanOrEqual(0);
    expect(workerBuildIndex).toBeGreaterThanOrEqual(0);
    expect(workerPreflightIndex).toBeLessThan(workerBuildIndex);
    expect(deployDocker).toContain('SKIP_BUILD=true — skipping worker source sync, image build, and restart');
  });
});
