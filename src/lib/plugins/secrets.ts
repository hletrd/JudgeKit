import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getPluginDefinition } from "./registry";
import { logger } from "@/lib/logger";
import { deriveEncryptionKey, legacyEncryptionKey } from "@/lib/security/derive-key";

const ENCRYPTION_VERSION = "enc:v1";
const SECRET_KEY_SUFFIX = "Configured";
const PLUGIN_DOMAIN = "plugin-config";

export function isEncryptedPluginSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${ENCRYPTION_VERSION}:`);
}

/**
 * Validate that a value is a well-formed encrypted plugin secret.
 *
 * Unlike `isEncryptedPluginSecret()` which only checks the `enc:v1:` prefix,
 * this function also verifies the full `enc:v1:iv:tag:ciphertext` structure
 * — all three base64url components must be present and non-empty.
 *
 * Use this for storage gating (e.g. `preparePluginConfigForStorage`) to
 * prevent malformed `enc:v1:` values from bypassing encryption. The
 * prefix-only `isEncryptedPluginSecret()` is kept for the decryption path
 * where malformed values should still reach the decrypt function so the
 * error is properly handled.
 */
export function isValidEncryptedPluginSecret(value: string): boolean {
  if (!isEncryptedPluginSecret(value)) return false;
  const parts = value.split(":");
  // Expected format: enc:v1:iv:tag:ciphertext — exactly 5 parts
  if (parts.length !== 5) return false;
  // All three payload components must be non-empty
  return parts[2].length > 0 && parts[3].length > 0 && parts[4].length > 0;
}

export function encryptPluginSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(PLUGIN_DOMAIN), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Read a plugin secret value, decrypting only when it's a legacy
 * `enc:v1:iv:tag:ciphertext` ciphertext.
 *
 * @policy plaintext — Per operator decision (cycle 8), plugin secrets are
 *   stored as plaintext at rest. This function therefore acts as a *reader*
 *   that pass-through plaintext values unchanged and only decrypts legacy
 *   `enc:v1:` rows for backward compatibility. The name `decryptPluginSecret`
 *   is preserved to avoid churn but does NOT imply current writes are
 *   encrypted; see `preparePluginConfigForStorage` for the storage-side
 *   policy enforcement.
 *
 * @param value the persisted secret string (plaintext or `enc:v1:…`)
 * @param options.allowPlaintextFallback when false, throws on non-`enc:v1:`
 *   inputs. Defaults to `true` (matches the plaintext-storage policy).
 */
export function decryptPluginSecret(
  value: string,
  options?: { allowPlaintextFallback?: boolean }
) {
  const allowPlaintext = options?.allowPlaintextFallback ?? true;

  if (!isEncryptedPluginSecret(value)) {
    if (!allowPlaintext) {
      throw new Error(
        "decryptPluginSecret() called on non-encrypted value. " +
          "If this is expected during migration, pass { allowPlaintextFallback: true }. " +
          "Otherwise, investigate possible data tampering or incomplete migration."
      );
    }
    return value;
  }

  const [, , ivRaw, tagRaw, ciphertextRaw] = value.split(":");
  if (!ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Malformed encrypted plugin secret");
  }

  // Try HKDF-derived key first, then legacy key for backward compatibility
  for (const key of [deriveEncryptionKey(PLUGIN_DOMAIN), legacyEncryptionKey()]) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivRaw, "base64url")
      );
      decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextRaw, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      continue;
    }
  }
  throw new Error("Failed to decrypt plugin secret with any available key");
}

function getSecretConfigKeys(pluginId: string) {
  return getPluginDefinition(pluginId)?.secretConfigKeys ?? [];
}

export function redactPluginConfigForRead(
  pluginId: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  const redacted = { ...config };

  for (const key of getSecretConfigKeys(pluginId)) {
    const rawValue = redacted[key];
    const configured = typeof rawValue === "string" ? rawValue.length > 0 : Boolean(rawValue);
    redacted[key] = "";
    redacted[`${key}${SECRET_KEY_SUFFIX}`] = configured;
  }

  return redacted;
}

export function decryptPluginConfigForUse(
  pluginId: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  const decrypted = { ...config };

  for (const key of getSecretConfigKeys(pluginId)) {
    const rawValue = decrypted[key];
    if (typeof rawValue !== "string" || rawValue.length === 0) {
      decrypted[key] = "";
      continue;
    }

    try {
      decrypted[key] = decryptPluginSecret(rawValue);
    } catch (error) {
      logger.error({ err: error, pluginId, key }, "Failed to decrypt plugin secret");
      decrypted[key] = "";
    }
  }

  return decrypted;
}

/**
 * Prepare a plugin config payload for persistence.
 *
 * @policy plaintext — Per operator decision (cycle 8), plugin secret values
 *   are stored verbatim. This function preserves the value as typed by the
 *   operator (no encryption applied to new writes). Legacy `enc:v1:`
 *   ciphertexts that arrive on existing rows are also preserved verbatim,
 *   but only after a defense-in-depth shape check — malformed `enc:v1:`
 *   values would otherwise become un-decryptable on the read path.
 *
 * Empty-string inputs mean "keep existing value if it's a real secret,
 * otherwise clear" so the redacted-on-read UI ("•••") can round-trip safely.
 */
export function preparePluginConfigForStorage(
  pluginId: string,
  incomingConfig: Record<string, unknown>,
  existingConfig: Record<string, unknown> | null
): Record<string, unknown> {
  const prepared = { ...incomingConfig };

  for (const key of getSecretConfigKeys(pluginId)) {
    const incomingValue = prepared[key];
    const existingValue = existingConfig?.[key];

    if (typeof incomingValue !== "string") {
      if (typeof existingValue === "string") {
        prepared[key] = existingValue;
      }
      continue;
    }

    if (incomingValue.length === 0) {
      // Empty string means "keep existing value if it's a real secret, otherwise clear"
      if (typeof existingValue === "string" && existingValue.length > 0) {
        prepared[key] = existingValue;
      } else {
        prepared[key] = null;
      }
      continue;
    }

    // Defense-in-depth: if the operator (or a migration tool) submits an
    // `enc:v1:`-prefixed value, the structure must be well-formed so the
    // read path can later decrypt it. A malformed `enc:v1:` token would
    // round-trip into the DB as plaintext-but-prefixed, where the read path
    // would attempt decryption and fail. Reject up front with a clear error.
    if (isEncryptedPluginSecret(incomingValue) && !isValidEncryptedPluginSecret(incomingValue)) {
      throw new Error(
        `Malformed encrypted plugin secret for ${pluginId}.${key}: ` +
          "value starts with `enc:v1:` but does not match the expected " +
          "`enc:v1:iv:tag:ciphertext` shape. Refusing to persist."
      );
    }

    // Plaintext storage policy: keep both plaintext and well-formed legacy
    // `enc:v1:` values verbatim. New writes go in as-typed by the operator.
    prepared[key] = incomingValue;
  }

  return prepared;
}

export function redactPluginConfigForAudit(
  pluginId: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  const redacted = { ...config };

  for (const key of getSecretConfigKeys(pluginId)) {
    if (Object.hasOwn(redacted, key)) {
      redacted[key] = "[REDACTED]";
    }
  }

  return redacted;
}
