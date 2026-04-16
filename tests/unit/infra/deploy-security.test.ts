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
    expect(deployDocker).toContain('SSHPASS="$SSH_PASSWORD" rsync -e "sshpass -e ssh $SSH_OPTS"');
    expect(deployDocker).not.toContain("echo '${SSH_PASSWORD}' | sudo -S");
    expect(deployDocker).not.toContain(".env.dbcreds");
    expect(deployDocker).toContain("-e POSTGRES_PASSWORD -e PGPASSWORD -e DATABASE_URL");
  });

  it("uses https AUTH_URL defaults for deploy scripts", () => {
    expect(read("deploy.sh")).toContain("AUTH_URL=https://${DOMAIN}");
    expect(read("deploy-test-backends.sh")).toContain("AUTH_URL=https://${DOMAIN}");
  });

  it("hardens dedicated worker deployment artifacts", () => {
    const workerDeploy = read("scripts/deploy-worker.sh");

    expect(workerDeploy).toContain("StrictHostKeyChecking=accept-new");
    expect(workerDeploy).toContain("chmod 600 ${REMOTE_DIR}/.env");
    expect(workerDeploy).not.toContain("cat > ${REMOTE_DIR}/.env");
  });

  it("keeps the rate-limiter sidecar off the host network and disables reset", () => {
    // The rate-limiter-rs is now a docker sidecar (Dockerfile.rate-limiter-rs
    // + docker-compose.production.yml `rate-limiter` service) instead of a
    // host-level systemd unit. Security invariants:
    //   - No host port mapping → the service is only reachable via the
    //     docker-compose network (app → rate-limiter over service DNS).
    //   - Reset endpoint disabled or unset by default.
    const production = read("docker-compose.production.yml");
    const dockerfile = read("Dockerfile.rate-limiter-rs");

    // Service must exist
    expect(production).toContain("  rate-limiter:");
    expect(production).toContain("Dockerfile.rate-limiter-rs");

    // No host port publishing on the rate-limiter service (no 'ports:' inside
    // its block). The app reaches it via `rate-limiter:3001` on the internal
    // docker network.
    const rateLimiterBlock = production.split(/^  [a-z].*:$/m).find((s) =>
      s.includes("Dockerfile.rate-limiter-rs"),
    );
    expect(rateLimiterBlock).toBeDefined();
    expect(rateLimiterBlock!).not.toMatch(/^\s*ports:/m);

    // Reset endpoint must NOT be enabled explicitly.
    expect(production).not.toContain("RATE_LIMITER_ENABLE_RESET=1");
    expect(dockerfile).not.toContain("RATE_LIMITER_ENABLE_RESET=1");
  });

  it("documents both process-local and postgresql-backed realtime coordination modes", () => {
    const readme = read("README.md");
    const deploymentGuide = read("docs/deployment.md");
    const workersGuide = read("docs/judge-workers.md");

    expect(readme).toContain("process-local mode");
    expect(readme).toContain("shared PostgreSQL mode");
    expect(readme).toContain("REALTIME_COORDINATION_BACKEND=postgresql");
    expect(deploymentGuide).toContain("shared PostgreSQL mode");
    expect(deploymentGuide).toContain("REALTIME_SINGLE_INSTANCE_ACK");
    expect(deploymentGuide).toContain("REALTIME_COORDINATION_BACKEND=postgresql");
    expect(workersGuide).toContain("PostgreSQL-backed shared coordination mode");
    expect(workersGuide).toContain("APP_INSTANCE_COUNT=1");
    expect(workersGuide).toContain("REALTIME_COORDINATION_BACKEND=postgresql");
  });

  it("keeps Docker daemon access out of the app container in deployment compose files", () => {
    const production = read("docker-compose.production.yml");
    const testBackends = read("docker-compose.test-backends.yml");
    const dockerfile = read("Dockerfile");
    const productionAppSection = production.split("judge-worker:")[0] ?? production;

    expect(productionAppSection).not.toContain("DOCKER_HOST=tcp://docker-proxy:2375");
    expect(testBackends).toContain("COMPILER_RUNNER_URL=${COMPILER_RUNNER_URL:-http://judge-worker:3001}");
    expect(dockerfile).not.toContain("docker-cli");
    expect(dockerfile).not.toContain("addgroup nextjs docker");
  });

  it("keeps upload persistence and docker-proxy capabilities aligned with the admin deployment contract", () => {
    const production = read("docker-compose.production.yml");
    const workerCompose = read("docker-compose.worker.yml");

    expect(production).toContain("judgekit-app-data:/app/data");
    expect(production).toContain("judgekit-app-data:");
    expect(production).toContain("- IMAGES=1");
    expect(production).toContain("- BUILD=1");
    expect(workerCompose).toContain("- IMAGES=1");
    expect(workerCompose).toContain("- BUILD=1");
    expect(workerCompose).toContain('127.0.0.1:${RUNNER_PORT:-3001}:3001');
  });

  it("keeps the algo web deploy in app-only mode with an external runner URL", () => {
    const algoDeploy = read("scripts/deploy-algo.sh");

    expect(algoDeploy).toContain('REMOTE_RUNNER_URL="http://172.17.0.1:3001"');
    expect(algoDeploy).toContain("INCLUDE_WORKER=false");
    expect(algoDeploy).toContain("--skip-languages");
    expect(algoDeploy).toContain("--no-worker");
    expect(algoDeploy).toContain("--skip-worker-build");
    expect(algoDeploy).toContain("COMPILER_RUNNER_URL=");
  });
});
