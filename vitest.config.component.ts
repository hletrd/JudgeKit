import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/component/**/*.test.tsx"],
    setupFiles: ["tests/component/setup.ts"],
    // Bump default timeout from 5s to 30s. The component suite spins up jsdom
    // for ~67 files in parallel, and individual tests sometimes need to wait
    // for React renders, dynamic imports, and side-effect hydration that can
    // exceed 5s under CPU-contended CI/laptop conditions.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text"],
    },
  },
});
