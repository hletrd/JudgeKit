import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptPluginConfigForUse,
  decryptPluginSecret,
  encryptPluginSecret,
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
  it("stores plugin secrets verbatim (plaintext policy) and preserves existing values on blank updates", () => {
    // Plaintext storage policy (cycle 8): preparePluginConfigForStorage now
    // keeps both legacy `enc:v1:` values and new plaintext values verbatim.
    // Blank inputs continue to fall back to whatever was stored previously
    // so partial updates don't wipe other secrets.
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
    // New writes go through verbatim (no encryption wrapper).
    expect(prepared.geminiApiKey).toBe("new-gemini-key");
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

    it("returns plaintext verbatim in production under the plaintext-storage policy", () => {
      // Plaintext storage policy (cycle 8): plugin secrets are stored as-is
      // in every environment, so decryptPluginSecret returns plaintext values
      // unchanged rather than throwing. Callers can still opt into the strict
      // mode by passing { allowPlaintextFallback: false }.
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

    it("decryptPluginConfigForUse passes plaintext through under the plaintext-storage policy", () => {
      // Plaintext storage policy (cycle 8): runtime decryption returns
      // plaintext values verbatim instead of clearing them. This is required
      // so operator-typed API keys actually reach the upstream provider
      // SDK without an additional encryption migration step.
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
