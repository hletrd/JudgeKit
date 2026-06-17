import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Toolchain detection for the harness smoke layer.
 *
 * Every probe returns a resolved absolute path (or argv prefix) to a WORKING
 * toolchain, or `null` when the language cannot run here. Callers gate their
 * vitest cases on a non-null result with `describe.skipIf` so a missing
 * compiler SKIPS rather than FAILS. Probes validate by actually invoking the
 * tool (e.g. `--version`), not merely by `which`, because some platforms ship
 * stub launchers: macOS `/usr/bin/javac` exists on PATH but errors with "Unable
 * to locate a Java Runtime" when no JDK is installed.
 */

function run(cmd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 20_000 });
    return {
      ok: r.status === 0 && !r.error,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
  } catch {
    return { ok: false, stdout: "", stderr: "" };
  }
}

function which(cmd: string): string | null {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const line = (r.stdout ?? "").split("\n")[0].trim();
  return line || null;
}

/** A binary on PATH that responds 0 to `<bin> <versionArg>`. */
function workingBinary(cmd: string, versionArg = "--version"): string | null {
  const p = which(cmd);
  if (!p) return null;
  return run(p, [versionArg]).ok ? p : null;
}

export const python3 = (): string | null => workingBinary("python3");
export const node = (): string | null => workingBinary("node");
export const go = (): string | null => workingBinary("go", "version");

/**
 * The C++ compiler. The adapter prelude does `#include <bits/stdc++.h>`, a
 * GCC-only convenience header. On Linux with real g++ it is present; on macOS
 * `g++`/`clang++` are Apple clang and lack it, so the caller supplies a shim
 * include dir (see cppShimDir). We just need a C++23-capable driver here.
 */
export function cppCompiler(): string | null {
  for (const cand of ["g++", "clang++"]) {
    const p = workingBinary(cand);
    if (!p) continue;
    // Confirm the driver accepts `-std=c++23`. An older g++/clang++ that does
    // not would FAIL the harness compile rather than skip; preflight the flag on
    // an empty translation unit (preprocess only, no headers) so an unsuitable
    // compiler is treated as absent and SKIPS.
    const probe = spawnSync(p, ["-std=c++23", "-x", "c++", "-E", "-"], {
      input: "",
      encoding: "utf8",
      timeout: 20_000,
    });
    if (probe.status === 0 && !probe.error) return p;
  }
  return null;
}

/**
 * The TypeScript compiler. There may be no global `tsc`, so fall back to the
 * repo-local one resolved through node. Returns an argv array to invoke tsc.
 */
export function tscCommand(): string[] | null {
  const onPath = workingBinary("tsc", "--version");
  if (onPath) return [onPath];
  // Repo-local typescript: resolve the compiler entry via node so we do not
  // depend on `npx` (which can hit the network on a cold cache).
  const r = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(require.resolve('typescript/bin/tsc'))"],
    { encoding: "utf8" },
  );
  if (r.status === 0 && r.stdout.trim()) {
    return [process.execPath, r.stdout.trim()];
  }
  return null;
}

/** Lowest JDK major the harness needs: the Java adapter compiles `--release 25`. */
const MIN_JDK_MAJOR = 25;

/** Parse the major version from `javac -version` output ("javac 25.0.2" -> 25). */
function javacMajor(javac: string): number | null {
  // javac prints its version to stdout on modern JDKs, stderr on older ones.
  const r = run(javac, ["-version"]);
  if (!r.ok) return null;
  const m = `${r.stdout}\n${r.stderr}`.match(/javac\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * A JDK whose `javac` AND `java` both run AND whose `javac` supports the
 * `--release 25` the adapter emits. Prefers the Homebrew openjdk@25 install used
 * by the prior verification, then PATH. `which javac` alone is insufficient on
 * macOS (the /usr/bin stub passes `which` but fails to execute), and a JDK older
 * than 25 would FAIL the `--release 25` compile rather than skip, so the version
 * is checked here and an unsuitable JDK SKIPS cleanly.
 */
export function jdk(): { javac: string; java: string } | null {
  const candidates: Array<{ javac: string; java: string }> = [];
  for (const home of [
    "/opt/homebrew/opt/openjdk@25",
    "/opt/homebrew/opt/openjdk",
    "/usr/local/opt/openjdk@25",
    "/usr/local/opt/openjdk",
  ]) {
    candidates.push({ javac: `${home}/bin/javac`, java: `${home}/bin/java` });
  }
  const pathJavac = which("javac");
  const pathJava = which("java");
  if (pathJavac && pathJava) candidates.push({ javac: pathJavac, java: pathJava });

  for (const c of candidates) {
    if (!existsSync(c.javac) || !existsSync(c.java)) {
      // PATH-resolved entries may not be plain files; still try to run them.
      if (!(c.javac === pathJavac)) continue;
    }
    const major = javacMajor(c.javac);
    if (major !== null && major >= MIN_JDK_MAJOR && run(c.java, ["-version"]).ok) return c;
  }
  return null;
}

/**
 * Docker + the cached `mono:6.12` image required to compile+run C# without a
 * native Mono install. Returns the docker binary path, or null if docker is
 * absent or the image is not already available locally (we never pull over the
 * network during the smoke run).
 */
export function dockerWithMono(): string | null {
  const docker = workingBinary("docker", "--version");
  if (!docker) return null;
  // `docker info` confirms the daemon is reachable (CLI present but daemon
  // down is a common dev state).
  if (!run(docker, ["info"]).ok) return null;
  const img = run(docker, ["image", "inspect", "mono:6.12"]);
  if (!img.ok) return null;
  return docker;
}
