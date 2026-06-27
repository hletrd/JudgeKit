import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted logger warn spy so the C4-4 plaintext-fallback audit-trail warn is
// observable without depending on pino's real transport.
const loggerWarnMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  },
}));

import {
  decryptPluginConfigForUse,
  decryptPluginSecret,
  encryptPluginConfigSecrets,
  encryptPluginSecret,
  isEncryptedPluginSecret,
  preparePluginConfigForStorage,
  redactPluginConfigForAudit,
  redactPluginConfigForRead,
} from "@/lib/plugins/secrets";

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_PLUGIN_CONFIG_ENCRYPTION_KEY = process.env.PLUGIN_CONFIG_ENCRYPTION_KEY;

process.env.AUTH_SECRET = "plugin-secret-test-key-material-32chars";
process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "plugin-config-encryption-key-test-material-32chars";

// Reset env before each test to test different scenarios
beforeEach(() => {
  process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "plugin-config-encryption-key-test-material-32chars";
  vi.resetModules();
});

// Restore env after the suite so these mutations (including in-test deletes)
// don't leak into other test files sharing the same worker process.
afterAll(() => {
  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  if (ORIGINAL_PLUGIN_CONFIG_ENCRYPTION_KEY === undefined) delete process.env.PLUGIN_CONFIG_ENCRYPTION_KEY;
  else process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = ORIGINAL_PLUGIN_CONFIG_ENCRYPTION_KEY;
});

describe("plugin secret helpers", () => {
  it("encrypts plugin secrets for storage and preserves existing values on blank updates", () => {
    // Blank inputs continue to fall back to whatever was stored previously
    // so partial updates don't wipe other secrets. Existing plaintext rows are
    // encrypted opportunistically when the admin saves the form.
    const existingSecret = encryptPluginSecret("existing-openai-key");

    const prepared = preparePluginConfigForStorage(
      "chat-widget",
      {
        provider: "openai",
        openaiApiKey: "",
        claudeApiKey: "",
        geminiApiKey: "new-gemini-key",
      },
      {
        openaiApiKey: existingSecret,
        claudeApiKey: "",
        geminiApiKey: "",
      }
    );

    expect(prepared.openaiApiKey).toBe(existingSecret);
    expect(prepared.claudeApiKey).toBeNull();
    expect(isEncryptedPluginSecret(prepared.geminiApiKey)).toBe(true);
    expect(decryptPluginSecret(prepared.geminiApiKey as string)).toBe("new-gemini-key");
  });

  it("rejects malformed enc:v1: payloads on the storage path (defense in depth)", () => {
    // Plaintext storage policy (cycle 8): plaintext writes pass through, but
    // an `enc:v1:`-prefixed value MUST still be well-formed because the read
    // path will attempt decryption. A malformed token would corrupt the row.
    expect(() =>
      preparePluginConfigForStorage(
        "chat-widget",
        {
          provider: "openai",
          openaiApiKey: "enc:v1:not-base64",
          claudeApiKey: "",
          geminiApiKey: "",
        },
        {}
      )
    ).toThrow(/Malformed encrypted plugin secret/);
  });

  it("accepts a well-formed enc:v1: payload (legacy migration path)", () => {
    const encrypted = encryptPluginSecret("legacy-secret")!;
    const prepared = preparePluginConfigForStorage(
      "chat-widget",
      {
        provider: "openai",
        openaiApiKey: encrypted,
        claudeApiKey: "",
        geminiApiKey: "",
      },
      {}
    );
    expect(prepared.openaiApiKey).toBe(encrypted);
  });

  it("encrypts plaintext legacy config values for backup/export serialization", () => {
    const encrypted = encryptPluginConfigSecrets("chat-widget", {
      provider: "openai",
      openaiApiKey: "plain-openai",
      claudeApiKey: "",
      assistantName: "Tutor",
    });

    expect(isEncryptedPluginSecret(encrypted.openaiApiKey)).toBe(true);
    expect(decryptPluginSecret(encrypted.openaiApiKey as string)).toBe("plain-openai");
    expect(encrypted.claudeApiKey).toBe("");
    expect(encrypted.assistantName).toBe("Tutor");
  });

  it("redacts secrets for admin reads and restores them for runtime use", () => {
    const encrypted = encryptPluginSecret("live-secret");
    const storedConfig = {
      provider: "openai",
      openaiApiKey: encrypted,
      claudeApiKey: "",
      geminiApiKey: "",
    };

    const redacted = redactPluginConfigForRead("chat-widget", storedConfig);
    expect(redacted.openaiApiKey).toBe("");
    expect(redacted.openaiApiKeyConfigured).toBe(true);

    const decrypted = decryptPluginConfigForUse("chat-widget", storedConfig);
    expect(decrypted.openaiApiKey).toBe("live-secret");
  });

  it("redacts secret keys in audit payloads", () => {
    const audit = redactPluginConfigForAudit("chat-widget", {
      provider: "openai",
      openaiApiKey: "secret-1",
      claudeApiKey: "secret-2",
      assistantName: "Tutor",
    });

    expect(audit.openaiApiKey).toBe("[REDACTED]");
    expect(audit.claudeApiKey).toBe("[REDACTED]");
    expect(audit.assistantName).toBe("Tutor");
  });

  describe("H-08: Missing PLUGIN_CONFIG_ENCRYPTION_KEY", () => {
    it("throws error when PLUGIN_CONFIG_ENCRYPTION_KEY is not set", async () => {
      delete process.env.PLUGIN_CONFIG_ENCRYPTION_KEY;
      vi.resetModules();

      const secrets = await import("@/lib/plugins/secrets");

      expect(() => secrets.encryptPluginSecret("test")).toThrow(
        "PLUGIN_CONFIG_ENCRYPTION_KEY must be set"
      );
    });

    it("throws error when PLUGIN_CONFIG_ENCRYPTION_KEY is empty string", async () => {
      process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "";
      vi.resetModules();

      const secrets = await import("@/lib/plugins/secrets");

      expect(() => secrets.encryptPluginSecret("test")).toThrow(
        "PLUGIN_CONFIG_ENCRYPTION_KEY must be set"
      );
    });
  });

  describe("decryptPluginSecret plaintext fallback", () => {
    it("decrypts a valid encrypted secret", () => {
      const encrypted = encryptPluginSecret("my-secret");
      expect(decryptPluginSecret(encrypted!)).toBe("my-secret");
    });

    it("returns plaintext verbatim in production for legacy rows", () => {
      // Legacy plaintext rows remain readable until the next plugin save or
      // export path encrypts them. Callers can still opt into strict mode by
      // passing { allowPlaintextFallback: false }.
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(decryptPluginSecret("plaintext-value")).toBe("plaintext-value");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("still rejects plaintext when callers opt out of the fallback", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(() =>
          decryptPluginSecret("plaintext-value", { allowPlaintextFallback: false })
        ).toThrow("decryptPluginSecret() called on non-encrypted value");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("returns plaintext as-is in non-production", () => {
      vi.stubEnv("NODE_ENV", "development");
      try {
        expect(decryptPluginSecret("plaintext-value")).toBe("plaintext-value");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("allows explicit plaintext fallback even in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(decryptPluginSecret("plaintext-value", { allowPlaintextFallback: true })).toBe(
          "plaintext-value"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    // C4-4 partial: the plaintext fallback is the known attack surface, and
    // the default flip is gated on an audit cycle (encryption.ts:18-22). Until
    // then the fallback must be OBSERVABLE in production — the warn trail is
    // the audit signal whose review is the exit criterion for the flip.
    it("emits a production warn when falling back to plaintext (C4-4 audit trail)", () => {
      loggerWarnMock.mockClear();
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(decryptPluginSecret("plaintext-value")).toBe("plaintext-value");
        expect(loggerWarnMock).toHaveBeenCalledTimes(1);
        expect(loggerWarnMock).toHaveBeenCalledWith(
          expect.objectContaining({ prefix: "plaintext-" }),
          expect.stringContaining("fell back to plaintext")
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("does not warn when decrypting a properly encrypted value", () => {
      loggerWarnMock.mockClear();
      vi.stubEnv("NODE_ENV", "production");
      const encrypted = encryptPluginSecret("my-secret");
      loggerWarnMock.mockClear();
      try {
        expect(decryptPluginSecret(encrypted!)).toBe("my-secret");
        expect(loggerWarnMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("does not warn on plaintext fallback outside production", () => {
      loggerWarnMock.mockClear();
      vi.stubEnv("NODE_ENV", "development");
      try {
        expect(decryptPluginSecret("plaintext-value")).toBe("plaintext-value");
        expect(loggerWarnMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("decryptPluginConfigForUse passes plaintext through for legacy rows", () => {
      // Runtime decryption returns legacy plaintext values verbatim instead of
      // clearing them, so pre-migration API keys keep working until the next
      // admin save encrypts the row.
      vi.stubEnv("NODE_ENV", "production");
      try {
        const storedConfig = {
          provider: "openai",
          openaiApiKey: "not-encrypted",
          claudeApiKey: "",
          geminiApiKey: "",
        };
        const decrypted = decryptPluginConfigForUse("chat-widget", storedConfig);
        expect(decrypted.openaiApiKey).toBe("not-encrypted");
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
