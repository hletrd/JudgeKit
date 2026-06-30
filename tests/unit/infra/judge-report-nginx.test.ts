import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("judge report nginx body-size guardrails", () => {
  it("uses non-deprecated HTTP/2 syntax in nginx configs", () => {
    const sources = [
      ["deploy-docker.sh", read("deploy-docker.sh")],
      ["scripts/online-judge.nginx.conf", read("scripts/online-judge.nginx.conf")],
      ["static-site/static.nginx.conf", read("static-site/static.nginx.conf")],
    ] as const;

    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(/listen\s+\[?::?\]?:?443[^;\n]*\bhttp2\b/);
      expect(source, path).toContain("http2 on;");
    }
  });

  it("keeps a larger body limit only on the final judge result report endpoint", () => {
    const deployDocker = read("deploy-docker.sh");
    const nginxTemplate = read("scripts/online-judge.nginx.conf");

    expect(deployDocker).toMatch(
      /location = \/api\/v1\/judge\/poll \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/
    );
    expect(deployDocker).toMatch(
      /location \/api\/v1\/judge\/ \{[\s\S]*?client_max_body_size 1m;[\s\S]*?\}/
    );

    expect(nginxTemplate).toMatch(
      /location = \/api\/v1\/judge\/poll \{[\s\S]*?client_max_body_size 50M;[\s\S]*?\}/
    );
    expect(nginxTemplate).toMatch(
      /location \/api\/v1\/judge\/ \{[\s\S]*?client_max_body_size 1m;[\s\S]*?\}/
    );
  });
});
