import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTrustedServerActionOrigin: vi.fn<() => Promise<boolean>>(),
  auth: vi.fn<() => Promise<{ user: { id: string; role: string } } | null>>(),
  resolveCapabilities: vi.fn<(role: string) => Promise<Set<string>>>(),
  checkServerActionRateLimit: vi.fn<() => { error: string } | null>(),
  buildServerActionAuditContext: vi.fn<() => Promise<Record<string, string>>>(),
  recordAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
  loggerError: vi.fn(),
  dbInsertValues: vi.fn(),
}));

vi.mock("@/lib/security/server-actions", () => ({
  isTrustedServerActionOrigin: mocks.isTrustedServerActionOrigin,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: mocks.resolveCapabilities,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  checkServerActionRateLimit: mocks.checkServerActionRateLimit,
}));

vi.mock("@/lib/audit/events", () => ({
  buildServerActionAuditContext: mocks.buildServerActionAuditContext,
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
  };
});

vi.mock("@/lib/db/schema", () => ({
  tags: {
    id: "tags.id",
    name: "tags.name",
    color: "tags.color",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((...args: unknown[]) => {
        mocks.dbInsertValues(...args);
        return Promise.resolve();
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "tag-1", name: "Algorithms" }])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCapabilities.mockImplementation((role: string) =>
    Promise.resolve(new Set(role === "admin" || role === "super_admin" ? ["system.settings"] : []))
  );
  mocks.checkServerActionRateLimit.mockReturnValue(null);
  mocks.buildServerActionAuditContext.mockResolvedValue({
    ipAddress: "127.0.0.1",
    userAgent: "test",
    requestMethod: "SERVER_ACTION",
    requestPath: "/dashboard/admin/tags",
  });
});

describe("tag management actions", () => {
  it("returns unauthorized when the caller lacks system.settings", async () => {
    const { createTag } = await import("@/lib/actions/tag-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "viewer-1", role: "ops_viewer" } });
    mocks.resolveCapabilities.mockResolvedValue(new Set());

    const result = await createTag("Algorithms", "#ff0000");
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("allows a custom role with system.settings", async () => {
    const { createTag } = await import("@/lib/actions/tag-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "ops-1", role: "ops_manager" } });
    mocks.resolveCapabilities.mockResolvedValue(new Set(["system.settings"]));

    const result = await createTag("Algorithms", "#ff0000");
    expect(result).toEqual({ success: true });
    expect(mocks.dbInsertValues).toHaveBeenCalled();
  });

  it("returns unauthorized when the server action origin is untrusted", async () => {
    const { createTag } = await import("@/lib/actions/tag-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await createTag("Algorithms", "#ff0000");
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });
});
