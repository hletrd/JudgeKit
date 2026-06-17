import path from "node:path";
import { defineConfig } from "vitest/config";

// Dedicated config for the function-judging harness SMOKE layer. Unlike
// tests/unit (which only diffs generated harness source against committed
// goldens), these specs actually COMPILE + RUN each language's assembled
// harness and assert the program's stdout is byte-identical to the canonical
// serialization.ts `encodeValue`. That spawns real compilers (g++/clang++,
// javac, go, tsc) and even a Docker container for C# (Mono 6.12), so it is kept
// OUT of the fast `npm run test:unit` run and behind its own `test:harness`
// script. Each language is toolchain-gated: missing toolchains SKIP, never
// FAIL. Timeouts are generous because cold compiles (especially the C# Docker
// path) can be slow.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/harness/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Compilers are CPU/IO heavy; run the per-language files serially so a
    // laptop is not swamped by parallel g++/javac/docker invocations.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text"],
    },
  },
});
