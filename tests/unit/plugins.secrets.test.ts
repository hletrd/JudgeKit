import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptPluginConfigForUse,
  decryptPluginSecret,
  encryptPluginSecret,
  preparePluginConfigForStorage,
  redactPluginConfigForAudit,
  redactPluginConfigForRead,
} from "@/lib/plugins/secrets";

process.env.AUTH_SECRET = "plugin-secret-test-key-material-32chars";
process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "plugin-config-encryption-key-test-material-32chars";

// Reset env before each test to test different scenarios
beforeEach(() => {
  process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "plugin-config-encryption-key-test-material-32chars";
  vi.resetModules();
});

describe("plugin secret helpers", () => {
  it("encrypts secret fields before storage and preserves existing encrypted secrets on blank updates", () => {
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
    expect(typeof prepared.geminiApiKey).toBe("string");
    expect(String(prepared.geminiApiKey)).not.toBe("new-gemini-key");
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

    it("throws in production when value is not encrypted", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(() => decryptPluginSecret("plaintext-value")).toThrow(
          "decryptPluginSecret() called on non-encrypted value"
        );
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

    it("decryptPluginConfigForUse handles production plaintext by clearing the value", () => {
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
