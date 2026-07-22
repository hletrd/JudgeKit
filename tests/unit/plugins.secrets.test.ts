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
  it("stores new plugin secrets PLAINTEXT verbatim and preserves existing values on blank updates", () => {
    // Plaintext-at-rest: a new secret value is persisted verbatim (NOT
    // encrypted). Blank inputs continue to fall back to whatever was stored
    // previously — including a legacy `enc:v1:` row — passed through verbatim.
    const existingLegacySecret = encryptPluginSecret("existing-openai-key");

    const prepared = preparePluginConfigForStorage(
      "chat-widget",
      {
        provider: "openai",
        openaiApiKey: "",
        claudeApiKey: "",
        geminiApiKey: "new-gemini-key",
      },
      {
        openaiApiKey: existingLegacySecret,
        claudeApiKey: "",
        geminiApiKey: "",
      }
    );

    // Blank input keeps the existing legacy ciphertext verbatim.
    expect(prepared.openaiApiKey).toBe(existingLegacySecret);
    // Blank input with no existing value clears the secret.
    expect(prepared.claudeApiKey).toBeNull();
    // A new value is stored PLAINTEXT — not encrypted.
    expect(prepared.geminiApiKey).toBe("new-gemini-key");
    expect(isEncryptedPluginSecret(prepared.geminiApiKey)).toBe(false);
  });

  it("keeps an existing plaintext secret verbatim on a blank update", () => {
    // The "keep existing" branch must pass a plaintext row through unchanged
    // (not just legacy enc:v1: rows).
    const prepared = preparePluginConfigForStorage(
      "chat-widget",
      { provider: "gemini", geminiApiKey: "" },
      { geminiApiKey: "existing-plaintext-gemini-key" }
    );
    expect(prepared.geminiApiKey).toBe("existing-plaintext-gemini-key");
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

  it("redacts secrets for admin reads and restores them for runtime use (plaintext + legacy)", () => {
    // Redaction is RETAINED under plaintext-at-rest: keys are still blanked and
    // a `${key}Configured` flag is set for the browser. Read-for-use returns a
    // plaintext row verbatim AND still decrypts a legacy `enc:v1:` row.
    const legacyEncrypted = encryptPluginSecret("legacy-live-secret");
    const storedConfig = {
      provider: "openai",
      openaiApiKey: legacyEncrypted, // legacy ciphertext row
      claudeApiKey: "plaintext-live-secret", // plaintext row (new normal)
      geminiApiKey: "",
    };

    const redacted = redactPluginConfigForRead("chat-widget", storedConfig);
    expect(redacted.openaiApiKey).toBe("");
    expect(redacted.openaiApiKeyConfigured).toBe(true);
    expect(redacted.claudeApiKey).toBe("");
    expect(redacted.claudeApiKeyConfigured).toBe(true);
    expect(redacted.geminiApiKeyConfigured).toBe(false);

    const decrypted = decryptPluginConfigForUse("chat-widget", storedConfig);
    expect(decrypted.openaiApiKey).toBe("legacy-live-secret");
    expect(decrypted.claudeApiKey).toBe("plaintext-live-secret");
  });

  it("does not emit a tamper warn when reading plaintext rows for use", () => {
    // Plaintext is the intended at-rest state; the read-for-use path (called on
    // every chat request + admin read) must NOT log a false tamper warning.
    loggerWarnMock.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    try {
      const decrypted = decryptPluginConfigForUse("chat-widget", {
        provider: "gemini",
        geminiApiKey: "plaintext-gemini-key",
      });
      expect(decrypted.geminiApiKey).toBe("plaintext-gemini-key");
      expect(loggerWarnMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
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

  describe("decryptPluginSecret plaintext-at-rest contract", () => {
    it("decrypts a legacy encrypted secret", () => {
      const encrypted = encryptPluginSecret("my-secret");
      expect(decryptPluginSecret(encrypted!)).toBe("my-secret");
    });

    // The plaintext return is opt-in: an unguarded call on a non-enc value
    // still throws so a stray caller is caught rather than silently trusted.
    it("throws on plaintext without the opt-in fallback (guard for stray callers)", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(() => decryptPluginSecret("plaintext-value")).toThrow(
          "decryptPluginSecret() called on non-encrypted value"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("throws on plaintext without the opt-in fallback in non-production too", () => {
      vi.stubEnv("NODE_ENV", "development");
      try {
        expect(() => decryptPluginSecret("plaintext-value")).toThrow(
          "decryptPluginSecret() called on non-encrypted value"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("returns plaintext verbatim with the opt-in fallback", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(decryptPluginSecret("plaintext-value", { allowPlaintextFallback: true })).toBe(
          "plaintext-value"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    // KEY anti-log-spam requirement: plaintext is the intended state, so a clean
    // plaintext read must NOT emit the old "possible data tampering" warn.
    it("does NOT warn on a clean plaintext fallback in production", () => {
      loggerWarnMock.mockClear();
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(decryptPluginSecret("plaintext-value", { allowPlaintextFallback: true })).toBe(
          "plaintext-value"
        );
        expect(loggerWarnMock).not.toHaveBeenCalled();
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

    // Only a genuinely malformed `enc:v1:` value is an error — even with the
    // plaintext fallback enabled, a broken ciphertext must still throw (it is
    // NOT silently returned as if it were plaintext).
    it("still throws on a malformed enc:v1: value even with the plaintext fallback", () => {
      expect(() =>
        decryptPluginSecret("enc:v1:only-two-parts", { allowPlaintextFallback: true })
      ).toThrow(/Malformed encrypted plugin secret/);
    });

    it("decryptPluginConfigForUse returns legacy plaintext rows verbatim (no clear, no warn)", () => {
      // Plaintext-at-rest: a runtime read of a plaintext row now returns the
      // value verbatim (it is a valid secret), not "" — and emits no tamper warn.
      loggerWarnMock.mockClear();
      vi.stubEnv("NODE_ENV", "production");
      try {
        const storedConfig = {
          provider: "openai",
          openaiApiKey: "plaintext-openai-key",
          claudeApiKey: "",
          geminiApiKey: "",
        };
        const decrypted = decryptPluginConfigForUse("chat-widget", storedConfig);
        expect(decrypted.openaiApiKey).toBe("plaintext-openai-key");
        expect(loggerWarnMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
