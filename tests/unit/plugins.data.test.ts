import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_PLUGIN_CONFIG_ENCRYPTION_KEY = process.env.PLUGIN_CONFIG_ENCRYPTION_KEY;

process.env.AUTH_SECRET = "plugin-secret-test-key-material-32chars";
process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "plugin-config-encryption-key-test-material-32chars";

// Restore env after the suite so these mutations don't leak into other test
// files sharing the same worker process.
afterAll(() => {
  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  if (ORIGINAL_PLUGIN_CONFIG_ENCRYPTION_KEY === undefined) delete process.env.PLUGIN_CONFIG_ENCRYPTION_KEY;
  else process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = ORIGINAL_PLUGIN_CONFIG_ENCRYPTION_KEY;
});

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
