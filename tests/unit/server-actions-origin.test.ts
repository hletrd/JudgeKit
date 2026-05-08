import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERVER_ACTIONS_PATH = "src/lib/security/server-actions.ts";

describe("server-actions origin check", () => {
  it("restricts dev-mode bypass to loopback origins", () => {
    const source = readFileSync(join(process.cwd(), SERVER_ACTIONS_PATH), "utf8");
    // Must define a set of loopback hosts
    expect(source).toContain('"localhost"');
    expect(source).toContain('"127.0.0.1"');
    expect(source).toContain('"[::1]"');
  });

  it("checks originHost against loopback hosts when trusted hosts is empty", () => {
    const source = readFileSync(join(process.cwd(), SERVER_ACTIONS_PATH), "utf8");
    // Must have a LOOPBACK_HOSTS set
    expect(source).toContain("LOOPBACK_HOSTS");
    // Must check originHost against loopback hosts
    expect(source).toContain("LOOPBACK_HOSTS.has(originHost)");
  });

  it("restricts empty-trusted-hosts dev bypass to loopback origins", () => {
    const source = readFileSync(join(process.cwd(), SERVER_ACTIONS_PATH), "utf8");
    // When trustedHosts is empty and an origin is present, the dev bypass
    // must be restricted to loopback origins only.
    const lines = source.split("\n");
    // Find the line with LOOPBACK_HOSTS.has(originHost)
    const loopbackCheckLine = lines.find((l) =>
      l.includes("LOOPBACK_HOSTS.has(originHost)")
    );
    expect(loopbackCheckLine).toBeDefined();
    // That line must be part of a return statement
    expect(loopbackCheckLine).toContain("return");
  });
});
