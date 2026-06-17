import { afterAll, describe, expect, it } from "vitest";
import { getAdapter } from "@/lib/judge/function-judging/registry";
import { encodeArgs, encodeValue } from "@/lib/judge/function-judging/serialization";
import { SMOKE_CASES, type SmokeCase } from "./support/cases";
import {
  cppCompiler,
  dockerWithMono,
  go,
  jdk,
  node,
  python3,
  tscCommand,
} from "./support/toolchain";
import { exec, makeCppStdcShim, makeTempDir, writeSource } from "./support/run";

/**
 * COMPILE + RUN smoke layer for the function-judging harness adapters.
 *
 * The adapter unit tests (tests/unit/.../adapters/*.test.ts) only diff the
 * GENERATED harness source against committed goldens — they never compile or
 * run it. That blind spot let two real bugs ship: the Java harness never
 * compiled (a stray `\u` in a comment tripped javac's unicode-escape lexer) and
 * C# mangled non-ASCII output under the POSIX locale. This suite closes the gap
 * by ACTUALLY compiling + running each language's assembled harness and
 * asserting its stdout matches the canonical `encodeValue` — byte-identical for
 * exact (non-double) returns, or within float-token tolerance for
 * `double`/`double[]` returns (where per-language textual forms legitimately
 * diverge but the parsed f64 values must agree, exactly as the worker judges).
 *
 * Every language is toolchain-gated via `describe.skipIf`: if the compiler /
 * runtime is missing, that language SKIPS (never FAILS). The suite therefore
 * passes cleanly with only a subset of toolchains present.
 */

/**
 * Assert the program stdout matches `encodeValue` with FLOAT tolerance.
 *
 * The worker's `compare_float_output` splits both sides on whitespace into
 * tokens, requires equal token counts, and compares each token as f64 within
 * abs OR rel tolerance (default 1e-9). We replicate exactly that here, so a
 * `double`/`double[]` return whose per-language textual form diverges (`0.5` vs
 * `0.500000000`, `1e-7` vs `1.0000000000e-07`) still passes as long as the
 * parsed values agree — but a wrong token count or an out-of-tolerance value
 * (a real adapter bug) FAILS.
 */
const FLOAT_TOL = 1e-9;
function assertFloatTokensEqual(actual: string, expected: string, label: string): void {
  const actualTokens = actual.trim() === "" ? [] : actual.trim().split(/\s+/);
  const expectedTokens = expected.trim() === "" ? [] : expected.trim().split(/\s+/);
  expect(
    actualTokens.length,
    `${label}: token count mismatch (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
  ).toBe(expectedTokens.length);
  for (let i = 0; i < expectedTokens.length; i++) {
    const exp = Number(expectedTokens[i]);
    const act = Number(actualTokens[i]);
    expect(Number.isFinite(act), `${label}: non-finite token ${JSON.stringify(actualTokens[i])}`).toBe(true);
    const diff = Math.abs(exp - act);
    const within = diff <= FLOAT_TOL || diff <= FLOAT_TOL * Math.abs(exp);
    expect(
      within,
      `${label}: token[${i}] ${actualTokens[i]} vs ${expectedTokens[i]} outside 1e-9 abs/rel tolerance`,
    ).toBe(true);
  }
}

/**
 * Run one assembled harness binary/script and assert its stdout against the
 * canonical `encodeValue`: byte-identity for exact (non-double) returns, or
 * float-token tolerance for `double`/`double[]` returns (c.float).
 */
function assertCase(
  c: SmokeCase,
  lang: string,
  produceStdout: (source: string, dir: string) => Buffer,
): void {
  const adapter = getAdapter(lang);
  const solution = c.solutions[lang];
  expect(solution, `missing ${lang} solution for case "${c.name}"`).toBeTruthy();

  const { source } = adapter.assemble(c.spec, solution);
  const { dir, cleanup } = makeTempDir(`harness-${lang}`);
  try {
    const actual = produceStdout(source, dir);
    const expected = encodeValue(c.expectedReturn, c.spec.returnType);
    if (c.float) {
      assertFloatTokensEqual(actual.toString("utf8"), expected, `${lang} ${c.name}`);
      return;
    }
    expect(actual.toString("utf8")).toBe(expected);
    // Byte-level guard: catches encoding divergences (e.g. UTF-8 vs `?`
    // replacement) that a string compare on a lossy decode could miss.
    expect(actual.equals(Buffer.from(expected, "utf8"))).toBe(true);
  } finally {
    cleanup();
  }
}

/** The stdin line fed to every harness for a case. */
function stdinFor(c: SmokeCase): string {
  return encodeArgs(c.args, c.spec.params);
}

// ---------------------------------------------------------------------------
// Python — interpret directly.
// ---------------------------------------------------------------------------
const py = python3();
describe.skipIf(!py)("python harness compile+run", () => {
  for (const c of SMOKE_CASES) {
    it(c.name, () => {
      assertCase(c, "python", (source, dir) => {
        const file = writeSource(dir, "main.py", source);
        const r = exec(py!, [file], { input: stdinFor(c) });
        expect(r.error, r.error?.message).toBeUndefined();
        expect(r.status, r.stderr).toBe(0);
        return r.stdoutBuffer;
      });
    });
  }
});

// ---------------------------------------------------------------------------
// JavaScript — run with node.
// ---------------------------------------------------------------------------
const nodeBin = node();
describe.skipIf(!nodeBin)("javascript harness compile+run", () => {
  for (const c of SMOKE_CASES) {
    it(c.name, () => {
      assertCase(c, "javascript", (source, dir) => {
        const file = writeSource(dir, "main.js", source);
        const r = exec(nodeBin!, [file], { input: stdinFor(c) });
        expect(r.error, r.error?.message).toBeUndefined();
        expect(r.status, r.stderr).toBe(0);
        return r.stdoutBuffer;
      });
    });
  }
});

// ---------------------------------------------------------------------------
// TypeScript — tsc compile, then node-run the emitted JS.
// ---------------------------------------------------------------------------
const tsc = tscCommand();
const nodeForTs = node();
describe.skipIf(!tsc || !nodeForTs)("typescript harness compile+run", () => {
  for (const c of SMOKE_CASES) {
    it(c.name, () => {
      assertCase(c, "typescript", (source, dir) => {
        const tsFile = writeSource(dir, "main.ts", source);
        // Compile with strict + Node types, matching the adapter's contract.
        const [tscBin, ...tscArgs] = tsc!;
        const compile = exec(
          tscBin,
          [
            ...tscArgs,
            "--strict",
            "--target",
            "ES2022",
            "--module",
            "CommonJS",
            "--moduleResolution",
            "node",
            "--types",
            "node",
            "--skipLibCheck",
            "--outDir",
            dir,
            tsFile,
          ],
          { cwd: process.cwd() },
        );
        expect(compile.status, compile.stdout + compile.stderr).toBe(0);
        const jsFile = tsFile.replace(/\.ts$/, ".js");
        const r = exec(nodeForTs!, [jsFile], { input: stdinFor(c) });
        expect(r.error, r.error?.message).toBeUndefined();
        expect(r.status, r.stderr).toBe(0);
        return r.stdoutBuffer;
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Go — `go build`, then run the binary.
// ---------------------------------------------------------------------------
const goBin = go();
describe.skipIf(!goBin)("go harness compile+run", () => {
  for (const c of SMOKE_CASES) {
    it(c.name, () => {
      assertCase(c, "go", (source, dir) => {
        const file = writeSource(dir, "main.go", source);
        const out = `${dir}/prog`;
        const build = exec(goBin!, ["build", "-o", out, file], {
          cwd: dir,
          // Force module-less build in a throwaway dir.
          env: { ...process.env, GO111MODULE: "off", GOFLAGS: "" },
        });
        expect(build.status, build.stdout + build.stderr).toBe(0);
        const r = exec(out, [], { input: stdinFor(c) });
        expect(r.error, r.error?.message).toBeUndefined();
        expect(r.status, r.stderr).toBe(0);
        return r.stdoutBuffer;
      });
    });
  }
});

// ---------------------------------------------------------------------------
// C++ (cpp23) — g++/clang++ -std=c++23, with a bits/stdc++.h shim on macOS.
// ---------------------------------------------------------------------------
const cxx = cppCompiler();
describe.skipIf(!cxx)("cpp23 harness compile+run", () => {
  // One shim include dir for the whole describe block (cheap, reused).
  const shimRoot = cxx ? makeTempDir("harness-cpp-shim") : null;
  const includeDir = shimRoot ? makeCppStdcShim(shimRoot.dir) : "";
  afterAll(() => shimRoot?.cleanup());

  for (const c of SMOKE_CASES) {
    it(c.name, () => {
      assertCase(c, "cpp23", (source, dir) => {
        const file = writeSource(dir, "main.cpp", source);
        const out = `${dir}/prog`;
        const build = exec(
          cxx!,
          ["-std=c++23", "-O1", `-I${includeDir}`, file, "-o", out],
          { timeout: 120_000 },
        );
        expect(build.status, build.stdout + build.stderr).toBe(0);
        const r = exec(out, [], { input: stdinFor(c) });
        expect(r.error, r.error?.message).toBeUndefined();
        expect(r.status, r.stderr).toBe(0);
        return r.stdoutBuffer;
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Java — javac --release 25 + java. Entry class is `Main` (adapter emits it).
// ---------------------------------------------------------------------------
const jdkPaths = jdk();
describe.skipIf(!jdkPaths)("java harness compile+run", () => {
  for (const c of SMOKE_CASES) {
    it(c.name, () => {
      assertCase(c, "java", (source, dir) => {
        const file = writeSource(dir, "Main.java", source);
        const outDir = `${dir}/out`;
        const compile = exec(
          jdkPaths!.javac,
          ["--release", "25", "-encoding", "UTF-8", "-d", outDir, file],
          { timeout: 120_000 },
        );
        expect(compile.status, compile.stdout + compile.stderr).toBe(0);
        const r = exec(
          jdkPaths!.java,
          ["-Dfile.encoding=UTF-8", "-cp", outDir, "Main"],
          { input: stdinFor(c) },
        );
        expect(r.error, r.error?.message).toBeUndefined();
        expect(r.status, r.stderr).toBe(0);
        return r.stdoutBuffer;
      });
    });
  }
});

// ---------------------------------------------------------------------------
// C# (csharp) — Mono 6.12 via Docker: mcs to compile, mono to run. The harness
// is written to a temp dir bind-mounted into the container; compile+run happen
// in one `sh -lc` so a single docker invocation covers both.
// ---------------------------------------------------------------------------
const docker = dockerWithMono();
describe.skipIf(!docker)("csharp harness compile+run (mono:6.12 docker)", () => {
  for (const c of SMOKE_CASES) {
    it(c.name, () => {
      assertCase(c, "csharp", (source, dir) => {
        writeSource(dir, "main.cs", source);
        writeSource(dir, "stdin.txt", stdinFor(c));
        const r = exec(
          docker!,
          [
            "run",
            "--rm",
            "-i",
            "-v",
            `${dir}:/work`,
            "-w",
            "/work",
            "mono:6.12",
            "sh",
            "-lc",
            "mcs -out:main.exe main.cs && mono main.exe < stdin.txt",
          ],
          { timeout: 120_000 },
        );
        expect(r.error, r.error?.message).toBeUndefined();
        expect(r.status, r.stderr).toBe(0);
        return r.stdoutBuffer;
      });
    });
  }
});
