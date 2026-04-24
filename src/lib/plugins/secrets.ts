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

export function decryptPluginSecret(value: string) {
  if (!isEncryptedPluginSecret(value)) {
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

    if (isValidEncryptedPluginSecret(incomingValue)) {
      // Already encrypted with valid structure (e.g. round-tripped from a
      // previous save) — keep as-is. Use isValidEncryptedPluginSecret()
      // (not the prefix-only isEncryptedPluginSecret) to prevent malformed
      // `enc:v1:` values from bypassing encryption (CR11-1, CR12-1).
      prepared[key] = incomingValue;
    } else {
      const encrypted = encryptPluginSecret(incomingValue);
      prepared[key] = encrypted ?? incomingValue;
    }
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
