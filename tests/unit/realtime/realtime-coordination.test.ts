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
    delete process.env.APP_INSTANCE_COUNT;
    delete process.env.WEB_CONCURRENCY;
    delete process.env.REALTIME_COORDINATION_BACKEND;
  });

  it("warns once in single-instance process-local mode and does not block", async () => {
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

  it("allows multi-instance mode when a shared coordination backend is configured", async () => {
    process.env.APP_INSTANCE_COUNT = "3";
    process.env.REALTIME_COORDINATION_BACKEND = "redis";

    const { getUnsupportedRealtimeGuard } = await import("@/lib/realtime/realtime-coordination");

    expect(getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events")).toBeNull();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});
