import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test",
    },
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "**/node_modules/**",
        "**/.git/**",
        // Unit coverage is for helpers, validators, server routes, and pure
        // logic. UI/page execution is covered by component and Playwright gates.
        "src/app/(dashboard)/**",
        "src/app/(public)/**",
        "src/components/**",
        "src/contexts/**",
        "src/hooks/**",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 40,
        lines: 60,
        // Per-module thresholds for security-critical code
        "src/lib/security/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "src/lib/auth/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
