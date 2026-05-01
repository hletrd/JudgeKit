/**
 * AES-256-GCM symmetric encryption for sensitive column values.
 *
 * Ciphertext invariant: every encrypted value produced by `encrypt()` starts
 * with the literal `enc:` prefix followed by hex(IV || authTag || ciphertext).
 * Anything missing the `enc:` prefix is treated as legacy plaintext.
 *
 * Plaintext-fallback risk profile (C7-AGG-7, deferred):
 *   - `decrypt()` accepts an `allowPlaintextFallback` option that defaults to
 *     `false` in production and `true` in non-production. When the flag is on
 *     and the input lacks the `enc:` prefix, the value is returned as-is and a
 *     warn-level log line is emitted in production noting "possible data
 *     tampering or incomplete migration".
 *   - The fallback exists for migration compatibility (columns historically
 *     stored plaintext that may not yet have been re-encrypted). It is a known
 *     attack surface: an attacker who can write plaintext to an encrypted
 *     column bypasses the authenticity guarantee of the GCM tag.
 *   - Hard removal of the fallback is DEFERRED until: a production tampering
 *     incident is detected (warn-log review), or a dedicated audit cycle
 *     confirms all encrypted columns contain only `enc:`-prefixed values. Do
 *     NOT silently drop the fallback; preserve the warn-log audit trail.
 *
 * Throws if `NODE_ENCRYPTION_KEY` is not set, regardless of `NODE_ENV`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit tag

/**
 * Get the 32-byte encryption key from the NODE_ENCRYPTION_KEY env var.
 * Throws if the key is not set, regardless of NODE_ENV.
 * Generate a key for development: openssl rand -hex 32
 * Then add it to .env.local: NODE_ENCRYPTION_KEY=<generated-key>
 *
 * The key is parsed once and cached for the lifetime of the process since
 * env vars do not change at runtime.
 */
let _cachedKey: Buffer | undefined;

function getKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const hex = process.env.NODE_ENCRYPTION_KEY?.trim();
  if (!hex) {
    throw new Error(
      "NODE_ENCRYPTION_KEY must be set. Generate: openssl rand -hex 32"
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "NODE_ENCRYPTION_KEY must be a 32-byte (64-char) hex string. Generate: openssl rand -hex 32"
    );
  }
  _cachedKey = buf;
  return _cachedKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `enc:iv:ciphertext:authTag` as a hex-encoded string.
 * Throws if NODE_ENCRYPTION_KEY is not set.
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
 *
 * If the value does not start with `enc:`, the behavior depends on the
 * `allowPlaintextFallback` option:
 *   - When `true` (the default in non-production environments), the value
 *     is returned as-is. This is the legacy behavior for data that was
 *     stored before encryption was enabled.
 *   - When `false` (the default in production), an error is thrown. This
 *     prevents silent encryption bypass if an attacker manages to write
 *     plaintext to a column that should contain encrypted data.
 *
 * Callers that read from columns with mixed encrypted/plaintext data during
 * migration should pass `{ allowPlaintextFallback: true }` explicitly.
 *
 * Throws if NODE_ENCRYPTION_KEY is not set.
 */
export function decrypt(encoded: string, options?: { allowPlaintextFallback?: boolean }): string {
  const allowPlaintext = options?.allowPlaintextFallback ??
    (process.env.NODE_ENV !== "production");

  if (!encoded.startsWith("enc:")) {
    if (!allowPlaintext) {
      throw new Error(
        "decrypt() called on non-encrypted value. " +
        "If this is expected during migration, pass { allowPlaintextFallback: true }. " +
        "Otherwise, investigate possible data tampering or incomplete migration."
      );
    }
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        { prefix: encoded.slice(0, 10) },
        "[encryption] decrypt() called on non-encrypted value — possible data tampering or incomplete migration"
      );
    }
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
