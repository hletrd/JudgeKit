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
    vi.stubEnv("DATABASE_URL", "postgres://judgekit:judgekit@localhost:5432/judgekit_test");
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

  it("allows multi-instance mode when the postgresql shared coordination backend is declared", async () => {
    process.env.APP_INSTANCE_COUNT = "2";
    process.env.REALTIME_COORDINATION_BACKEND = "postgresql";

    const { getUnsupportedRealtimeGuard, usesSharedRealtimeCoordination } = await import("@/lib/realtime/realtime-coordination");
    const guard = getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events");

    expect(guard).toBeNull();
    expect(usesSharedRealtimeCoordination()).toBe(true);
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported shared-backend configuration values", async () => {
    process.env.APP_INSTANCE_COUNT = "1";
    process.env.REALTIME_COORDINATION_BACKEND = "redis";

    const { getUnsupportedRealtimeGuard } = await import("@/lib/realtime/realtime-coordination");
    const guard = getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events");

    expect(guard).toEqual({
      error: "unsupportedRealtimeBackendConfig",
      message:
        "REALTIME_COORDINATION_BACKEND currently supports only postgresql shared coordination. Unset it or set it to postgresql and keep the database reachable.",
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

  it("escapes user IDs before embedding them in SSE LIKE patterns", async () => {
    const { getSseUserPattern } = await import("@/lib/realtime/realtime-coordination");

    expect(getSseUserPattern("user_100%\\id")).toBe(
      "realtime:sse:user:user\\_100\\%\\\\id:%",
    );
  });
});
