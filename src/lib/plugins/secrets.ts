import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getPluginDefinition } from "./registry";
import { logger } from "@/lib/logger";
import { deriveEncryptionKey, legacyEncryptionKey } from "@/lib/security/derive-key";

/**
 * PLAINTEXT-AT-REST for chat-widget plugin provider API keys — DELIBERATE
 * product decision (owner, 2026-07-22). New writes store these secrets
 * verbatim; `encryptPluginSecret` is intentionally NOT called on the write
 * path. Rationale: the symmetric key would live on the same host as the DB, so
 * at-rest encryption is judged low value for this threat model. This is not an
 * oversight — do not re-add encrypt-on-write and do not add a config toggle.
 *
 * Response redaction is RETAINED and is a separate protection: keys are never
 * echoed to the browser (`redactPluginConfigForRead`) and are `[REDACTED]` in
 * audit logs (`redactPluginConfigForAudit`). Legacy `enc:v1:` ciphertext rows
 * are still decrypted on read for backward compatibility, which is the only
 * remaining reason `encrypt/decryptPluginSecret` exist.
 */

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
 * Read a plugin secret value.
 *
 * Plaintext-at-rest is now the intended storage state for plugin provider keys
 * (see module header), so a value WITHOUT the `enc:v1:` prefix is a clean
 * plaintext secret and is returned VERBATIM and SILENTLY when the plaintext
 * fallback is enabled — no warning is emitted, because this runs on every chat
 * request and every admin read and a warn would spam logs / cry wolf. Only a
 * genuinely malformed `enc:v1:` ciphertext is treated as an error.
 *
 * The plaintext return is OPT-IN via `{ allowPlaintextFallback: true }` (which
 * `decryptPluginConfigForUse` and the chat route pass). With the default
 * `false`, a non-`enc:v1:` value throws so a stray unguarded call is caught
 * rather than silently trusted. A value WITH the `enc:v1:` prefix is always
 * decrypted (legacy backward compatibility) regardless of the option.
 */
export function decryptPluginSecret(
  value: string,
  options?: { allowPlaintextFallback?: boolean }
) {
  const allowPlaintext = options?.allowPlaintextFallback ?? false;

  if (!isEncryptedPluginSecret(value)) {
    if (!allowPlaintext) {
      throw new Error(
        "decryptPluginSecret() called on non-encrypted value. " +
          "Plugin provider secrets are stored plaintext at rest; pass " +
          "{ allowPlaintextFallback: true } to read them."
      );
    }
    // Clean plaintext value — the intended at-rest state. Return as-is, no warn.
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

export function encryptPluginConfigSecrets(
  pluginId: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  const encrypted = { ...config };

  for (const key of getSecretConfigKeys(pluginId)) {
    const value = encrypted[key];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }

    if (isEncryptedPluginSecret(value)) {
      if (!isValidEncryptedPluginSecret(value)) {
        throw new Error(
          `Malformed encrypted plugin secret for ${pluginId}.${key}: ` +
            "value starts with `enc:v1:` but does not match the expected " +
            "`enc:v1:iv:tag:ciphertext` shape. Refusing to persist."
        );
      }
      continue;
    }

    encrypted[key] = encryptPluginSecret(value);
  }

  return encrypted;
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
      // Plaintext-at-rest: plaintext values return verbatim; legacy `enc:v1:`
      // ciphertext rows are still decrypted for backward compatibility.
      decrypted[key] = decryptPluginSecret(rawValue, { allowPlaintextFallback: true });
    } catch (error) {
      logger.error({ err: error, pluginId, key }, "Failed to decrypt plugin secret");
      decrypted[key] = "";
    }
  }

  return decrypted;
}

/**
 * Pass a plugin secret through for plaintext-at-rest storage.
 *
 * Plaintext-at-rest (see module header): secret values are persisted VERBATIM,
 * not encrypted. The only guard is defense-in-depth: a value that carries the
 * `enc:v1:` prefix but is not a well-formed ciphertext is rejected, because the
 * decrypt-on-read path attempts to decrypt any `enc:v1:` value and a malformed
 * token would corrupt the row. Clean plaintext and well-formed legacy `enc:v1:`
 * ciphertext both pass through unchanged.
 */
function passStoredSecretThrough(pluginId: string, key: string, value: string): string {
  if (isEncryptedPluginSecret(value) && !isValidEncryptedPluginSecret(value)) {
    throw new Error(
      `Malformed encrypted plugin secret for ${pluginId}.${key}: ` +
        "value starts with `enc:v1:` but does not match the expected " +
        "`enc:v1:iv:tag:ciphertext` shape. Refusing to persist."
    );
  }
  return value;
}

/**
 * Prepare a plugin config payload for persistence.
 *
 * Secrets are stored PLAINTEXT at rest (deliberate decision — see module
 * header); nothing here encrypts. Empty-string inputs mean "keep existing value
 * if it's a real secret, otherwise clear" so the redacted-on-read UI can
 * round-trip safely; the kept value is passed through verbatim, whether it is a
 * plaintext secret or a legacy `enc:v1:` ciphertext row.
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
        prepared[key] = passStoredSecretThrough(pluginId, key, existingValue);
      }
      continue;
    }

    if (incomingValue.length === 0) {
      // Empty string means "keep existing value if it's a real secret, otherwise clear"
      if (typeof existingValue === "string" && existingValue.length > 0) {
        prepared[key] = passStoredSecretThrough(pluginId, key, existingValue);
      } else {
        prepared[key] = null;
      }
      continue;
    }

    prepared[key] = passStoredSecretThrough(pluginId, key, incomingValue);
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
