import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("compiler execute implementation", () => {
  it("keeps local fallback workspaces writable for the non-root sandbox user", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain('"65534:65534"');
    expect(source).toContain("await chmod(workspaceDir, 0o777);");
    expect(source).toContain("await chmod(join(workspaceDir, sourceFileName), 0o644);");
  });

  it("keeps the legacy deploy path compatible with compiler workspace creation", () => {
    const source = readFileSync(join(process.cwd(), "deploy.sh"), "utf8");

    expect(source).toContain("sudo chown 1001:1001 /compiler-workspaces");
    expect(source).toContain("sudo chmod 0700 /compiler-workspaces");
  });

  it("makes local compiler fallback opt-in when a worker runner is configured", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");
    const productionCompose = readFileSync(join(process.cwd(), "docker-compose.production.yml"), "utf8");
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    expect(source).toContain("ENABLE_COMPILER_LOCAL_FALLBACK");
    expect(source).toContain("SHOULD_ALLOW_LOCAL_FALLBACK");
    expect(source).toContain('stderr: "Compiler runner unavailable"');
    expect(productionCompose).not.toContain("DISABLE_COMPILER_LOCAL_FALLBACK=1");
    expect(readme).toContain("ENABLE_COMPILER_LOCAL_FALLBACK=1");
  });

  it("keeps runner auth and shell-command validation aligned with the Rust worker", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain("const RUNNER_AUTH_TOKEN");
    expect(source).toContain("process.env.RUNNER_AUTH_TOKEN || process.env.JUDGE_AUTH_TOKEN");
    expect(source).toContain("COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN/JUDGE_AUTH_TOKEN is missing");
    expect(source).toContain("&&|\\|\\||;|\\||>|<|\\n|\\r");
  });

  it("caches seccomp profile availability instead of checking synchronously on every run", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain("const HAS_CUSTOM_SECCOMP_PROFILE = existsSync(SECCOMP_PROFILE_PATH);");
    expect(source).not.toContain("if (existsSync(SECCOMP_PROFILE_PATH))");
  });
});
