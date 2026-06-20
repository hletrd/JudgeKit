import { afterEach, describe, expect, it, vi } from "vitest";

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}));

const VALID_KEY = "a".repeat(64);
const ORIGINAL_ENCRYPTION_KEY = process.env.NODE_ENCRYPTION_KEY;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

async function loadEncryption(key: string | null = VALID_KEY, nodeEnv = "test") {
  if (key === null) {
    delete mutableEnv.NODE_ENCRYPTION_KEY;
  } else {
    mutableEnv.NODE_ENCRYPTION_KEY = key;
  }
  mutableEnv.NODE_ENV = nodeEnv;
  vi.resetModules();
  return import("@/lib/security/encryption");
}

afterEach(() => {
  if (ORIGINAL_ENCRYPTION_KEY === undefined) {
    delete mutableEnv.NODE_ENCRYPTION_KEY;
  } else {
    mutableEnv.NODE_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  }
  if (ORIGINAL_NODE_ENV === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
  }
  vi.clearAllMocks();
});

describe("security encryption helpers", () => {
  it("requires a configured 32-byte hex key", async () => {
    const missing = await loadEncryption(null);
    expect(() => missing.encrypt("secret")).toThrow("NODE_ENCRYPTION_KEY must be set");

    const invalid = await loadEncryption("abc");
    expect(() => invalid.encrypt("secret")).toThrow("32-byte");
  });

  it("encrypts with the enc prefix and decrypts back to the original plaintext", async () => {
    const { encrypt, decrypt } = await loadEncryption();

    const encoded = encrypt("smtp-secret");

    expect(encoded).toMatch(/^enc:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(decrypt(encoded)).toBe("smtp-secret");
  });

  it("rejects plaintext unless migration fallback is explicitly enabled", async () => {
    const { decrypt } = await loadEncryption();

    expect(() => decrypt("legacy-secret")).toThrow("non-encrypted value");
    expect(decrypt("legacy-secret", { allowPlaintextFallback: true })).toBe("legacy-secret");
  });

  it("logs production plaintext fallback for audit review", async () => {
    const { decrypt } = await loadEncryption(VALID_KEY, "production");

    expect(decrypt("legacy-secret", { allowPlaintextFallback: true })).toBe("legacy-secret");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { prefix: "legacy-sec" },
      expect.stringContaining("possible data tampering")
    );
  });

  it("rejects malformed or tampered ciphertext", async () => {
    const { encrypt, decrypt } = await loadEncryption();

    expect(() => decrypt("enc:only-one-part")).toThrow("Invalid encrypted value format");

    const parts = encrypt("secret").split(":");
    parts[3] = "0".repeat(parts[3].length);
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("fully redacts non-empty secrets and returns null for absent values", async () => {
    const { redactSecret } = await loadEncryption();

    expect(redactSecret("secret")).toBe("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022");
    expect(redactSecret("")).toBeNull();
    expect(redactSecret(null)).toBeNull();
    expect(redactSecret(undefined)).toBeNull();
  });
});
