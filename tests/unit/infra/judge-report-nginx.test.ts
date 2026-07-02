import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function extractFunction(source: string, name: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${name}() {`));
  if (start === -1) {
    throw new Error(`Function ${name} not found in source`);
  }
  const end = lines.findIndex((line, index) => index > start && line === "}");
  if (end === -1) {
    throw new Error(`Function ${name} has no closing brace`);
  }
  return lines.slice(start, end + 1).join("\n");
}

function supportsHttp2On(version: string): boolean {
  const fn = extractFunction(read("deploy-docker.sh"), "nginx_version_supports_http2_on");
  try {
    execFileSync("bash", [
      "-c",
      `${fn}; nginx_version_supports_http2_on "$1"`,
      "bash",
      version,
    ]);
    return true;
  } catch {
    return false;
  }
}

describe("judge report nginx body-size guardrails", () => {
  it("uses non-deprecated HTTP/2 syntax in static nginx templates", () => {
    const sources = [
      ["scripts/online-judge.nginx.conf", read("scripts/online-judge.nginx.conf")],
      ["static-site/static.nginx.conf", read("static-site/static.nginx.conf")],
    ] as const;

    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(/listen\s+\[?::?\]?:?443[^;\n]*\bhttp2\b/);
      expect(source, path).toContain("http2 on;");
    }
  });

  it("generates HTTP/2 syntax compatible with the remote nginx version", () => {
    const deployDocker = read("deploy-docker.sh");

    // Must detect the remote nginx version and choose a syntax.
    expect(deployDocker).toContain("detect_nginx_http2_mode");
    expect(deployDocker).toContain("nginx_version_supports_http2_on");

    // Must support modern `http2 on;` for nginx >= 1.25.1.
    expect(deployDocker).toContain("http2 on;");

    // Must support legacy `listen ... http2` for older nginx (e.g. Ubuntu 1.24.0).
    expect(deployDocker).toMatch(/listen\s+\[?::?\]?:?443[^;\n]*\bhttp2\b/);
  });

  it("correctly classifies nginx versions for the http2 directive", () => {
    expect(supportsHttp2On("1.24.0"), "1.24.0 should use legacy syntax").toBe(false);
    expect(supportsHttp2On("1.25.0"), "1.25.0 should use legacy syntax").toBe(false);
    expect(supportsHttp2On("1.25.1"), "1.25.1 should support http2 on;").toBe(true);
    expect(supportsHttp2On("1.26.0"), "1.26.0 should support http2 on;").toBe(true);
    expect(supportsHttp2On("2.0.0"), "2.0.0 should support http2 on;").toBe(true);
  });

  it("parses real nginx -v output formats", () => {
    const deployDocker = read("deploy-docker.sh");
    expect(deployDocker).toContain(
      "sed -n 's/.*nginx\\/\\([0-9][0-9]*\\.[0-9][0-9]*\\.[0-9][0-9]*\\).*/\\1/p'"
    );

    function parseNginxVersion(line: string): string {
      return execFileSync("bash", [
        "-c",
        `line=$1; printf '%s\\n' "$line" | sed -n 's/.*nginx\\/\\([0-9][0-9]*\\.[0-9][0-9]*\\.[0-9][0-9]*\\).*/\\1/p'`,
        "bash",
        line,
      ])
        .toString()
        .trim();
    }

    expect(parseNginxVersion("nginx version: nginx/1.24.0 (Ubuntu)")).toBe("1.24.0");
    expect(parseNginxVersion("nginx/1.25.1")).toBe("1.25.1");
    expect(parseNginxVersion("nginx version: nginx/1.26.0-2ubuntu7.13")).toBe("1.26.0");
    expect(parseNginxVersion("nginx version: nginx/2.0.0 (foo)")).toBe("2.0.0");
    expect(parseNginxVersion("not nginx output")).toBe("");
  });

  it("keeps a larger body limit on the catch-all and judge result report endpoint", () => {
    const deployDocker = read("deploy-docker.sh");
    const nginxTemplate = read("scripts/online-judge.nginx.conf");

    // Strip the allowed location blocks before checking for any other 50M
    // directive, because the naive server-block regex would match the location
    // block itself (it lives inside a server block).
    const allowedPollBlock = /location = \/api\/v1\/judge\/poll \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/g;
    const allowedCatchAllBlock = /location \/ \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/g;
    expect(deployDocker.replace(allowedPollBlock, "").replace(allowedCatchAllBlock, "")).not.toContain(
      "client_max_body_size 50M;"
    );
    expect(deployDocker).toMatch(
      /location = \/api\/v1\/judge\/poll \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/
    );
    expect(deployDocker).toMatch(/location \/ \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/);
    expect(deployDocker).toMatch(
      /location \/api\/v1\/judge\/ \{[\s\S]*?client_max_body_size 1m;[\s\S]*?\}/
    );

    expect(nginxTemplate).toMatch(
      /location = \/api\/v1\/judge\/poll \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/
    );
    expect(nginxTemplate).toMatch(
      /location \/api\/v1\/judge\/ \{[\s\S]*?client_max_body_size 1m;[\s\S]*?\}/
    );
    expect(nginxTemplate).toMatch(
      /location \/ \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/
    );
    expect(nginxTemplate).not.toMatch(
      /location \/ \{[\s\S]*?client_max_body_size 1m;[\s\S]*?\}/
    );
  });
});
