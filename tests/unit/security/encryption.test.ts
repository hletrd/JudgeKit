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
const ORIGINAL_PREVIOUS_KEY = process.env.NODE_ENCRYPTION_KEY_PREVIOUS;
const mutableEnv = process.env as Record<string, string | undefined>;

async function loadEncryption(
  key: string | null = VALID_KEY,
  nodeEnv = "test",
  previousKey?: string | null
) {
  if (key === null) {
    delete mutableEnv.NODE_ENCRYPTION_KEY;
  } else {
    mutableEnv.NODE_ENCRYPTION_KEY = key;
  }
  if (previousKey === undefined) {
    delete mutableEnv.NODE_ENCRYPTION_KEY_PREVIOUS;
  } else if (previousKey === null) {
    delete mutableEnv.NODE_ENCRYPTION_KEY_PREVIOUS;
  } else {
    mutableEnv.NODE_ENCRYPTION_KEY_PREVIOUS = previousKey;
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
  if (ORIGINAL_PREVIOUS_KEY === undefined) {
    delete mutableEnv.NODE_ENCRYPTION_KEY_PREVIOUS;
  } else {
    mutableEnv.NODE_ENCRYPTION_KEY_PREVIOUS = ORIGINAL_PREVIOUS_KEY;
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

    expect(encoded).toMatch(/^enc:v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
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
    // A versioned value missing payload segments is also malformed.
    expect(() => decrypt("enc:v1:only-one-part")).toThrow("Invalid encrypted value format");

    // Tamper the authTag (5th segment of the versioned form). GCM auth fails.
    const parts = encrypt("secret").split(":");
    parts[4] = "0".repeat(parts[4].length);
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  // NEW-B backward compatibility: values written before the key-version prefix
  // shipped (legacy `enc:iv:ciphertext:authTag`, 4 segments, no `v1:`) MUST stay
  // readable. This is the test that proves the upgrade does not lock out every
  // existing secret. Revert-RED: removing the legacy branch flips this red.
  it("decrypts legacy unversioned enc: values (NEW-B backward compat)", async () => {
    const { encrypt, decrypt } = await loadEncryption();

    // Synthesize a legacy value: encrypt under the current key, then strip the
    // `v1:` version segment so the value looks like a pre-NEW-B write.
    const versioned = encrypt("legacy-secret");
    const legacy = "enc:" + versioned.slice("enc:v1:".length);

    expect(legacy.split(":")).toHaveLength(4);
    expect(legacy.startsWith("enc:v1:")).toBe(false);
    expect(decrypt(legacy)).toBe("legacy-secret");
  });

  // NEW-B rotation: with NODE_ENCRYPTION_KEY_PREVIOUS set, a value encrypted
  // under the OLD key remains readable after the current key changes. This is
  // zero-downtime rotation — the whole point of the keyring.
  it("reads values encrypted under a previous key after rotation (NEW-B keyring)", async () => {
    const keyA = "1".repeat(64);
    const keyB = "2".repeat(64);

    // Encrypt under keyA (the soon-to-be-old key).
    const encA = await loadEncryption(keyA);
    const oldSecret = encA.encrypt("rotated-value");
    expect(oldSecret.startsWith("enc:v1:")).toBe(true);

    // Rotate: current = keyB, previous = keyA. The old ciphertext must still
    // decrypt via the keyring, and new writes must use keyB.
    const encB = await loadEncryption(keyB, "test", keyA);
    expect(encB.decrypt(oldSecret)).toBe("rotated-value");

    const newSecret = encB.encrypt("fresh-value");
    expect(encB.decrypt(newSecret)).toBe("fresh-value");

    // Without the previous key configured, the old ciphertext is unreadable.
    const encBare = await loadEncryption(keyB);
    expect(() => encBare.decrypt(oldSecret)).toThrow();
  });

  it("fully redacts non-empty secrets and returns null for absent values", async () => {
    const { redactSecret } = await loadEncryption();

    expect(redactSecret("secret")).toBe("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022");
    expect(redactSecret("")).toBeNull();
    expect(redactSecret(null)).toBeNull();
    expect(redactSecret(undefined)).toBeNull();
  });
});
