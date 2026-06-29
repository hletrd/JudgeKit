import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/env", () => {
  throw new Error("instrumentation startup modules must not load during production build");
});

describe("instrumentation build phase", () => {
  const originalNextPhase = process.env.NEXT_PHASE;
  const originalNextRuntime = process.env.NEXT_RUNTIME;

  afterEach(() => {
    if (originalNextPhase === undefined) {
      delete process.env.NEXT_PHASE;
    } else {
      process.env.NEXT_PHASE = originalNextPhase;
    }
    if (originalNextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalNextRuntime;
    }
    vi.resetModules();
  });

  it("does not start runtime jobs or database startup work during next build", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.NEXT_RUNTIME;

    const { register } = await import("@/instrumentation");

    await expect(register()).resolves.toBeUndefined();
  });
});
