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

    // C4-4 / AGG-10: the plaintext-readable fallback default was flipped from
    // true to false. An attacker who can write plaintext to a secret column
    // must NOT be able to bypass the GCM auth tag by default. This is the
    // revert-RED guard: removing the `?? false` default makes this test fail.
    it("throws on plaintext by default after the C4-4 default flip", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(() => decryptPluginSecret("plaintext-value")).toThrow(
          "decryptPluginSecret() called on non-encrypted value"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("throws on plaintext by default in non-production too", () => {
      vi.stubEnv("NODE_ENV", "development");
      try {
        expect(() => decryptPluginSecret("plaintext-value")).toThrow(
          "decryptPluginSecret() called on non-encrypted value"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("allows explicit plaintext fallback even in production (migration opt-in)", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(decryptPluginSecret("plaintext-value", { allowPlaintextFallback: true })).toBe(
          "plaintext-value"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    // C4-4 audit trail: the fallback CODE remains (explicit opt-in) and still
    // emits the production warn-log so migration callers are observable. The
    // warn trail is what makes the fallback safe to keep for migration.
    it("emits a production warn when the explicit fallback is used (C4-4 audit trail)", () => {
      loggerWarnMock.mockClear();
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(decryptPluginSecret("plaintext-value", { allowPlaintextFallback: true })).toBe(
          "plaintext-value"
        );
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

    it("does not warn on explicit plaintext fallback outside production", () => {
      loggerWarnMock.mockClear();
      vi.stubEnv("NODE_ENV", "development");
      try {
        expect(
          decryptPluginSecret("plaintext-value", { allowPlaintextFallback: true })
        ).toBe("plaintext-value");
        expect(loggerWarnMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("decryptPluginConfigForUse clears legacy plaintext rows via the contained failure mode", () => {
      // Post C4-4 flip: runtime decryption of a legacy plaintext row hits the
      // default-false fallback, the throw is caught in decryptPluginConfigForUse,
      // and the value becomes "" (a non-functional secret + logged error) rather
      // than crashing the process or silently passing plaintext through.
      vi.stubEnv("NODE_ENV", "production");
      try {
        const storedConfig = {
          provider: "openai",
          openaiApiKey: "not-encrypted",
          claudeApiKey: "",
          geminiApiKey: "",
        };
        const decrypted = decryptPluginConfigForUse("chat-widget", storedConfig);
        expect(decrypted.openaiApiKey).toBe("");
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
