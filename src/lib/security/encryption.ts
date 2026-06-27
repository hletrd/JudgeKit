/**
 * AES-256-GCM symmetric encryption for sensitive column values.
 *
 * Ciphertext invariant: every encrypted value produced by `encrypt()` starts
 * with the versioned literal `enc:v1:` followed by `hex(iv):hex(ciphertext):
 * hex(authTag)` (NEW-B key-version prefix). Values written before NEW-B lack
 * the version segment and look like `enc:hex(iv):hex(ciphertext):hex(authTag)`;
 * `decrypt()` treats any unversioned `enc:` value as v1 (current key) so every
 * existing secret stays readable across the upgrade. Anything missing the
 * `enc:` prefix entirely is treated as legacy plaintext.
 *
 * Key rotation (NEW-B): the current key is `NODE_ENCRYPTION_KEY`. The optional
 * comma-separated `NODE_ENCRYPTION_KEY_PREVIOUS` env var holds prior keys;
 * `decrypt()` tries the current key first, then each previous key, returning
 * the first plaintext whose GCM auth tag verifies. New writes always use the
 * current key. This enables zero-downtime rotation: deploy with PREVIOUS set to
 * the old key + a new NODE_ENCRYPTION_KEY → old ciphertexts stay readable while
 * new writes migrate to the new key.
 *
 * Plaintext-fallback risk profile (C7-AGG-7):
 *   - `decrypt()` accepts an `allowPlaintextFallback` option that defaults to
 *     `false` in all environments. When the flag is explicitly set to `true`
 *     and the input lacks the `enc:` prefix, the value is returned as-is and a
 *     warn-level log line is emitted in production noting "possible data
 *     tampering or incomplete migration".
 *   - The fallback exists for migration compatibility (columns historically
 *     stored plaintext that may not yet have been re-encrypted). It is a known
 *     attack surface: an attacker who can write plaintext to an encrypted
 *     column bypasses the authenticity guarantee of the GCM tag.
 *   - The plugin-path counterpart (`decryptPluginSecret`) defaults to `false`
 *     as of C4-4/AGG-10; this main path has always defaulted to `false`.
 *
 * Throws if `NODE_ENCRYPTION_KEY` is not set, regardless of `NODE_ENV`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit tag

// Versioned ciphertext format (NEW-B). New writes emit
// `enc:v1:iv:ciphertext:authTag`. Legacy unversioned `enc:` values are treated
// as v1 by the decrypt path so existing secrets stay readable.
const ENCRYPTION_VERSION = "v1";
const VERSIONED_PREFIX = `enc:${ENCRYPTION_VERSION}:`;

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
 * Previous encryption keys for zero-downtime rotation (NEW-B). Populated from
 * the optional `NODE_ENCRYPTION_KEY_PREVIOUS` env var — a comma-separated list
 * of 64-char hex strings. Empty/unset → no previous keys, identical to
 * pre-rotation behaviour. Cached for the process lifetime (env vars do not
 * change at runtime; tests use vi.resetModules() to clear the cache).
 */
let _cachedPreviousKeys: Buffer[] | undefined;

function getPreviousKeys(): Buffer[] {
  if (_cachedPreviousKeys) return _cachedPreviousKeys;

  const keys: Buffer[] = [];
  const raw = process.env.NODE_ENCRYPTION_KEY_PREVIOUS?.trim();
  if (raw) {
    for (const hex of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      const buf = Buffer.from(hex, "hex");
      // Silently skip malformed entries; a wrong-length key would never
      // authenticate a GCM ciphertext anyway, so including it is harmless but
      // wasteful. The current key (32 bytes) is always tried first.
      if (buf.length === 32) {
        keys.push(buf);
      }
    }
  }
  _cachedPreviousKeys = keys;
  return keys;
}

/** Full keyring: current key first, then previous keys for rotation. */
function getKeyring(): Buffer[] {
  return [getKey(), ...getPreviousKeys()];
}

/**
 * Try every key in the keyring until GCM authentication succeeds. Returns the
 * decrypted plaintext on the first key whose auth tag verifies; throws the last
 * auth error if no key validates (tampered ciphertext, or all keys rotated out).
 */
function decryptWithKeyring(iv: Buffer, ciphertext: Buffer, authTag: Buffer): string {
  const keys = getKeyring();
  let lastErr: unknown;
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        "utf8"
      );
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Failed to decrypt value with any available key");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns the versioned form `enc:v1:iv:ciphertext:authTag` (hex-encoded).
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

  return `${VERSIONED_PREFIX}${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

/**
 * Decrypt a value encrypted by `encrypt()`.
 *
 * Accepts both the versioned form (`enc:v1:iv:ciphertext:authTag`, current
 * writes) and the legacy unversioned form (`enc:iv:ciphertext:authTag`, values
 * written before NEW-B). Unversioned values are treated as v1 and fed to the
 * same keyring, so existing secrets remain readable across the upgrade.
 *
 * If the value does not start with `enc:`, the behavior depends on the
 * `allowPlaintextFallback` option:
 *   - When `true` (must be passed explicitly), the value is returned as-is.
 *     This is the legacy behavior for data that was stored before encryption
 *     was enabled.
 *   - When `false` (the default), an error is thrown. This prevents silent
 *     encryption bypass if an attacker manages to write plaintext to a column
 *     that should contain encrypted data.
 *
 * Callers that read from columns with mixed encrypted/plaintext data during
 * migration should pass `{ allowPlaintextFallback: true }` explicitly.
 *
 * Throws if NODE_ENCRYPTION_KEY is not set.
 */
export function decrypt(encoded: string, options?: { allowPlaintextFallback?: boolean }): string {
  const allowPlaintext = options?.allowPlaintextFallback ?? false;

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

  let ivHex: string;
  let ciphertextHex: string;
  let authTagHex: string;

  if (encoded.startsWith(VERSIONED_PREFIX)) {
    // Versioned format: enc:v1:iv:ciphertext:authTag (5 segments).
    const parts = encoded.split(":");
    if (parts.length !== 5) {
      throw new Error("Invalid encrypted value format");
    }
    ivHex = parts[2];
    ciphertextHex = parts[3];
    authTagHex = parts[4];
  } else {
    // Legacy unversioned format: enc:iv:ciphertext:authTag (4 segments).
    // Treat as v1 — every pre-NEW-B enc:-prefixed secret stays readable.
    const parts = encoded.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted value format");
    }
    ivHex = parts[1];
    ciphertextHex = parts[2];
    authTagHex = parts[3];
  }

  return decryptWithKeyring(
    Buffer.from(ivHex, "hex"),
    Buffer.from(ciphertextHex, "hex"),
    Buffer.from(authTagHex, "hex")
  );
}

/**
 * Redact a secret value for display in API responses.
 * All values are fully redacted — never expose any characters of secrets
 * regardless of encryption status, as partial disclosure reduces brute-force
 * search space.
 */
export function redactSecret(value: string | null | undefined): string | null {
  if (!value || value.length === 0) return null;
  return "••••••••";
}
