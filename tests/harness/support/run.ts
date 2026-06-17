import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A spawned step's outcome, with captured streams for diagnostics. */
export interface StepResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout as raw bytes — needed for byte-identical comparison of UTF-8. */
  stdoutBuffer: Buffer;
  error?: Error;
}

/** Spawn a command, optionally feeding `input` on stdin. Never throws. */
export function exec(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {},
): StepResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    timeout: opts.timeout ?? 90_000,
    env: opts.env ?? process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  const stdoutBuffer = (r.stdout as Buffer) ?? Buffer.alloc(0);
  return {
    status: r.status,
    stdout: stdoutBuffer.toString("utf8"),
    stderr: (r.stderr ?? Buffer.alloc(0)).toString("utf8"),
    stdoutBuffer,
    error: r.error ?? undefined,
  };
}

/** Create a fresh temp dir and guarantee its removal via the returned cleanup. */
export function makeTempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort; the OS reaps tmp eventually */
      }
    },
  };
}

export function writeSource(dir: string, filename: string, source: string): string {
  const p = join(dir, filename);
  writeFileSync(p, source, "utf8");
  return p;
}

/**
 * Provide a GCC-style `bits/stdc++.h` convenience header for the C++ harness on
 * platforms whose compiler lacks it (Apple clang on macOS). Real g++ on Linux
 * already ships it, in which case the caller passes no extra include dir. The
 * shim only `#include`s standard headers the adapter prelude actually uses
 * (iostream, string, vector, cmath, cstdio, cstdlib, cctype, unordered_map for
 * student solutions, etc.), so it is a faithful stand-in, not a behavioral hack.
 */
export function makeCppStdcShim(parentDir: string): string {
  const includeDir = join(parentDir, "shim-include");
  mkdirSync(join(includeDir, "bits"), { recursive: true });
  writeFileSync(
    join(includeDir, "bits", "stdc++.h"),
    [
      "#pragma once",
      "#include <algorithm>",
      "#include <array>",
      "#include <bitset>",
      "#include <cctype>",
      "#include <cmath>",
      "#include <cstdint>",
      "#include <cstdio>",
      "#include <cstdlib>",
      "#include <cstring>",
      "#include <deque>",
      "#include <functional>",
      "#include <iostream>",
      "#include <limits>",
      "#include <map>",
      "#include <numeric>",
      "#include <queue>",
      "#include <set>",
      "#include <sstream>",
      "#include <stack>",
      "#include <string>",
      "#include <tuple>",
      "#include <unordered_map>",
      "#include <unordered_set>",
      "#include <utility>",
      "#include <vector>",
      "",
    ].join("\n"),
    "utf8",
  );
  return includeDir;
}
