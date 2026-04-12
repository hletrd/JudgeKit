import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerWarnMock, loggerErrorMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    error: loggerErrorMock,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("realtime coordination guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.APP_INSTANCE_COUNT;
    delete process.env.WEB_CONCURRENCY;
    delete process.env.REALTIME_COORDINATION_BACKEND;
    delete process.env.REALTIME_SINGLE_INSTANCE_ACK;
  });

  it("warns once in declared single-instance process-local mode and does not block", async () => {
    process.env.APP_INSTANCE_COUNT = "1";
    const { getUnsupportedRealtimeGuard } = await import("@/lib/realtime/realtime-coordination");

    expect(getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events")).toBeNull();
    expect(getUnsupportedRealtimeGuard("/api/v1/contests/[assignmentId]/anti-cheat")).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("blocks multi-instance mode when no shared coordination backend is configured", async () => {
    process.env.APP_INSTANCE_COUNT = "2";

    const { getUnsupportedRealtimeGuard } = await import("@/lib/realtime/realtime-coordination");
    const guard = getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events");

    expect(guard).toEqual({
      error: "unsupportedMultiInstanceRealtime",
      message: "Configure shared realtime coordination or keep the web app to a single instance for this route.",
    });
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unimplemented shared-backend configuration instead of treating it as real coordination", async () => {
    process.env.APP_INSTANCE_COUNT = "1";
    process.env.REALTIME_COORDINATION_BACKEND = "redis";

    const { getUnsupportedRealtimeGuard } = await import("@/lib/realtime/realtime-coordination");
    const guard = getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events");

    expect(guard).toEqual({
      error: "unsupportedRealtimeBackendConfig",
      message:
        "REALTIME_COORDINATION_BACKEND is reserved until shared realtime coordination is implemented. Unset it and keep APP_INSTANCE_COUNT=1 (or REALTIME_SINGLE_INSTANCE_ACK=1).",
    });
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit single-instance declaration in production-like environments", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { getUnsupportedRealtimeGuard } = await import("@/lib/realtime/realtime-coordination");
    const guard = getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events");

    expect(guard).toEqual({
      error: "realtimeDeploymentDeclarationRequired",
      message:
        "Declare APP_INSTANCE_COUNT=1 (or REALTIME_SINGLE_INSTANCE_ACK=1) before using process-local realtime routes in production.",
    });
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });

  it("allows an explicit single-instance acknowledgment when replica count is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.REALTIME_SINGLE_INSTANCE_ACK = "1";

    const { getUnsupportedRealtimeGuard } = await import("@/lib/realtime/realtime-coordination");

    expect(getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events")).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });
});
