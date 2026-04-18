import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "judge-worker-rs/src/main.rs"), "utf8");

describe("judge worker runtime loops", () => {
  it("does not hard-code a 30 second heartbeat sleep", () => {
    expect(source).not.toContain("tokio::time::sleep(std::time::Duration::from_secs(30))");
    expect(source).toContain("tokio::time::sleep(heartbeat_interval)");
  });

  it("uses elapsed-time cleanup scheduling instead of an idle-loop counter", () => {
    expect(source).not.toContain("cleanup_counter");
    expect(source).toContain("last_cleanup_at.elapsed() >= cleanup_interval");
  });

  it("supports a help/version fast path so container build verification does not require runtime env vars", () => {
    expect(source).toContain('arg == "--help" || arg == "-h"');
    expect(source).toContain('arg == "--version" || arg == "-V"');
    expect(source).toContain('println!("JudgeKit judge worker")');
  });

  it("fails closed on registration errors unless unregistered mode is explicitly enabled", () => {
    const configSource = readFileSync(join(process.cwd(), "judge-worker-rs/src/config.rs"), "utf8");

    expect(configSource).toContain("JUDGE_ALLOW_UNREGISTERED_MODE");
    expect(source).toContain("Failed to register with app server — exiting because unregistered mode is disabled");
    expect(source).toContain("running in unregistered mode because JUDGE_ALLOW_UNREGISTERED_MODE is enabled");
  });

  it("defaults the runner host to loopback unless deployments opt into a wider bind", () => {
    const configSource = readFileSync(join(process.cwd(), "judge-worker-rs/src/config.rs"), "utf8");
    const workerCompose = readFileSync(join(process.cwd(), "docker-compose.worker.yml"), "utf8");

    expect(configSource).toContain('Defaults to `127.0.0.1`');
    expect(configSource).toContain('"127.0.0.1".to_string()');
    expect(configSource).toContain("RUNNER_AUTH_TOKEN");
    expect(workerCompose).toContain("RUNNER_AUTH_TOKEN=${RUNNER_AUTH_TOKEN:-}");
    expect(workerCompose).toContain("RUNNER_HOST=0.0.0.0");
  });

  it("exposes internal docker-management endpoints through the runner router", () => {
    const runner = readFileSync(join(process.cwd(), "judge-worker-rs/src/runner.rs"), "utf8");

    expect(runner).toContain('.route("/docker/images", get(docker_images_handler))');
    expect(runner).toContain('.route("/docker/build", post(docker_build_handler))');
    expect(runner).toContain('.route("/docker/remove", post(docker_remove_handler))');
  });

  it("includes response bodies when judge claim polling fails", () => {
    const apiSource = readFileSync(join(process.cwd(), "judge-worker-rs/src/api.rs"), "utf8");

    expect(apiSource).toContain('let body = response.text().await.unwrap_or_default();');
    expect(apiSource).toContain('Poll failed: {status} {body}');
  });
});
