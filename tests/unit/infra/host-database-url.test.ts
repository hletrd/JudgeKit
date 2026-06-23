import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveHostRunDatabaseUrl } from "../../../scripts/load-env";

describe("host-run database URL resolution", () => {
  it("leaves Docker service hosts unchanged unless host mode is enabled", () => {
    expect(
      resolveHostRunDatabaseUrl({
        DATABASE_URL: "postgres://judgekit:secret@db:5432/judgekit",
      })
    ).toBe("postgres://judgekit:secret@db:5432/judgekit");
  });

  it("uses an explicit host database URL when host mode is enabled", () => {
    expect(
      resolveHostRunDatabaseUrl({
        JUDGEKIT_HOST_DATABASE_URL: "1",
        DATABASE_URL: "postgres://judgekit:secret@db:5432/judgekit",
        HOST_DATABASE_URL: "postgres://judgekit:secret@127.0.0.1:55432/judgekit",
      })
    ).toBe("postgres://judgekit:secret@127.0.0.1:55432/judgekit");
  });

  it("translates known Docker database hosts to loopback in host mode", () => {
    expect(
      resolveHostRunDatabaseUrl({
        JUDGEKIT_HOST_DATABASE_URL: "1",
        DATABASE_URL: "postgres://judgekit:secret@db:5432/judgekit",
      })
    ).toBe("postgres://judgekit:secret@127.0.0.1:5432/judgekit");
  });

  it("honors explicit loopback host and port overrides", () => {
    expect(
      resolveHostRunDatabaseUrl({
        JUDGEKIT_HOST_DATABASE_URL: "true",
        DATABASE_URL: "postgres://judgekit:secret@db-postgres:5432/judgekit",
        HOST_DATABASE_HOST: "localhost",
        HOST_DATABASE_PORT: "55432",
      })
    ).toBe("postgres://judgekit:secret@localhost:55432/judgekit");
  });

  it("enables host database mode for host-run package scripts", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { scripts: Record<string, string> };

    for (const script of [
      "db:push",
      "db:push:dev",
      "db:studio",
      "seed",
      "languages:sync",
      "test:e2e",
    ]) {
      expect(pkg.scripts[script]).toContain("JUDGEKIT_HOST_DATABASE_URL=1");
    }
  });
});
