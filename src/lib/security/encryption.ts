import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit tag

/**
 * Fixed development-only encryption key. NOT secure — only used when
 * NODE_ENCRYPTION_KEY is not set in non-production environments so that
 * the encrypt/decrypt round-trip works consistently in development.
 * Data encrypted with this key must NOT be used in production.
 */
const DEV_ENCRYPTION_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex"
);

/**
 * Get the 32-byte encryption key from the NODE_ENCRYPTION_KEY env var.
 * Returns the fixed development key if the env var is not set in non-production.
 * Throws in production if the key is missing.
 */
function getKey(): Buffer {
  const hex = process.env.NODE_ENCRYPTION_KEY?.trim();
  if (!hex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NODE_ENCRYPTION_KEY must be set in production. Generate: openssl rand -hex 32"
      );
    }
    return DEV_ENCRYPTION_KEY;
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "NODE_ENCRYPTION_KEY must be a 32-byte (64-char) hex string. Generate: openssl rand -hex 32"
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `enc:iv:ciphertext:authTag` as a hex-encoded string.
 * In development without NODE_ENCRYPTION_KEY, uses a fixed dev key.
 * In production, throws if NODE_ENCRYPTION_KEY is not set.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

/**
 * Decrypt a value encrypted by `encrypt()`.
 * If the value does not start with `enc:`, it is returned as-is (plaintext fallback
 * for data that was stored before encryption was enabled).
 * In development without NODE_ENCRYPTION_KEY, uses the fixed dev key.
 * In production, throws if NODE_ENCRYPTION_KEY is not set.
 */
export function decrypt(encoded: string): string {
  if (!encoded.startsWith("enc:")) {
    return encoded;
  }

  const key = getKey();

  const parts = encoded.split(":");
  // enc:iv:ciphertext:authTag
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted value format");
  }

  const iv = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");
  const authTag = Buffer.from(parts[3], "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Redact a secret value for display in API responses.
 * All values are fully redacted — never expose any characters of secrets
 * regardless of encryption status, as partial disclosure reduces brute-force
 * search space.
 */
export function redactSecret(value: string | null | undefined): string | null {
  if (!value || value.length === 0) return null;
  return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
}
