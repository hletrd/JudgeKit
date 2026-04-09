import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(rows);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

process.env.AUTH_SECRET = "plugin-secret-test-key-material-32chars";
process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "plugin-config-encryption-key-test-material-32chars";

describe("plugin data reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts plugin secrets by default", async () => {
    const { encryptPluginSecret } = await import("@/lib/plugins/secrets");
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          enabled: true,
          config: {
            provider: "openai",
            openaiApiKey: encryptPluginSecret("sk-live"),
            claudeApiKey: "",
            geminiApiKey: "",
          },
          updatedAt: new Date("2026-04-04T00:00:00.000Z"),
        },
      ])
    );

    const { getPluginState } = await import("@/lib/plugins/data");
    const state = await getPluginState("chat-widget");

    expect(state?.config.openaiApiKey).toBe("");
    expect(state?.config.openaiApiKeyConfigured).toBe(true);
  });

  it("returns decrypted secrets only when explicitly requested", async () => {
    const { encryptPluginSecret } = await import("@/lib/plugins/secrets");
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          enabled: true,
          config: {
            provider: "openai",
            openaiApiKey: encryptPluginSecret("sk-live"),
            claudeApiKey: "",
            geminiApiKey: "",
          },
          updatedAt: new Date("2026-04-04T00:00:00.000Z"),
        },
      ])
    );

    const { getPluginState } = await import("@/lib/plugins/data");
    const state = await getPluginState("chat-widget", { includeSecrets: true });

    expect(state?.config.openaiApiKey).toBe("sk-live");
  });
});
