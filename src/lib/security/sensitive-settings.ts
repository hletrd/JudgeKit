import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyAndRehashPassword } from "@/lib/security/password-hash";

/**
 * Settings keys that affect security posture. Mutating ANY of these requires
 * password reconfirmation so a stolen session cookie cannot silently weaken
 * the platform (disable hCaptcha, raise rate limits, open public signup,
 * widen allowedHosts, re-enable AI assistant / standalone compiler during
 * restricted/exam mode, raise upload DoS ceilings, etc.).
 *
 * This list is the SINGLE source of truth shared by BOTH settings writers —
 * the REST route (`src/app/api/v1/admin/settings/route.ts`) and the server
 * action (`src/lib/actions/system-settings.ts`) — so the gate cannot drift
 * between the two paths. See ARCH-1 / C4-3.
 */
export const SENSITIVE_SETTINGS_KEYS = [
  // Auth / signup posture
  "platformMode",
  "allowedHosts",
  "publicSignupEnabled",
  "emailVerificationRequired",
  // hCaptcha / SMTP secrets
  "signupHcaptchaEnabled",
  "hcaptchaSiteKey",
  "hcaptchaSecret",
  "smtpPass",
  // Community voting (posture-adjacent)
  "communityUpvoteEnabled",
  "communityDownvoteEnabled",
  // Exam-integrity toggles (C4-3) — flipping these re-enables AI assistant /
  // standalone compiler during restricted/exam mode, defeating the trust
  // boundary the reconfirm gate exists to protect.
  "aiAssistantEnabled",
  "allowAiAssistantInRestrictedModes",
  "allowStandaloneCompilerInRestrictedModes",
  // Upload DoS ceilings (C4-3) — widening these raises the storage-exhaustion
  // ceiling without reconfirm.
  "uploadMaxImageSizeBytes",
  "uploadMaxFileSizeBytes",
  "uploadMaxImageDimension",
  "uploadMaxZipDecompressedSizeBytes",
  // Rate-limit / queue ceilings + session lifetime
  "loginRateLimitMaxAttempts",
  "loginRateLimitWindowMs",
  "loginRateLimitBlockMs",
  "apiRateLimitMax",
  "apiRateLimitWindowMs",
  "submissionRateLimitMaxPerMinute",
  "submissionMaxPending",
  "sessionMaxAgeSeconds",
] as const;

/** Whether the given input object carries any sensitive settings key. */
export function touchesSensitiveSettingsKey(input: object): boolean {
  return SENSITIVE_SETTINGS_KEYS.some(
    (key) => (input as Record<string, unknown>)[key] !== undefined,
  );
}

export type SettingsReconfirmOutcome =
  | { ok: true }
  | { ok: false; status: 401; error: "passwordReconfirmRequired" }
  | { ok: false; status: 403; error: "authenticationFailed" }
  | { ok: false; status: 403; error: "invalidPassword" };

/**
 * Shared password-reconfirm gate. Returns `{ ok: true }` when no sensitive key
 * is present OR the supplied `currentPassword` verifies against the actor's
 * stored hash (and rehashes on success). Otherwise returns a typed error that
 * the caller maps to its own response shape:
 *  - REST route → `NextResponse.json({ error }, { status })`
 *  - server action → `{ success: false, error }`
 *
 * Mirrors the restore/backup/migrate `verifyAndRehashPassword` gate. The gate
 * runs BEFORE any settings mutation, so a throw or denial leaves no partial
 * state. See ARCH-1 / C3-AGG-7.
 */
export async function requireSettingsReconfirm(
  input: object,
  user: { id: string },
): Promise<SettingsReconfirmOutcome> {
  if (!touchesSensitiveSettingsKey(input)) {
    return { ok: true };
  }

  const currentPassword = (input as { currentPassword?: string }).currentPassword;
  if (!currentPassword) {
    return { ok: false, status: 401, error: "passwordReconfirmRequired" };
  }

  const [dbUser] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!dbUser?.passwordHash) {
    return { ok: false, status: 403, error: "authenticationFailed" };
  }

  const { valid } = await verifyAndRehashPassword(currentPassword, user.id, dbUser.passwordHash);
  if (!valid) {
    return { ok: false, status: 403, error: "invalidPassword" };
  }

  return { ok: true };
}

/**
 * Map a reconfirm outcome to a NextResponse for the REST route. Returns `null`
 * when the gate passed (the route continues).
 */
export function settingsReconfirmToResponse(
  outcome: SettingsReconfirmOutcome,
): NextResponse | null {
  if (outcome.ok) return null;
  return NextResponse.json({ error: outcome.error }, { status: outcome.status });
}
