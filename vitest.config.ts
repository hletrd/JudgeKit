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
    // Several tests import heavy Next.js page/route module graphs. In isolation
    // they run in well under a second, but under full-suite parallel CPU
    // contention those imports can take 10–15s, blowing the 5s vitest default
    // and causing order-dependent timeout flakes. Give them headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
