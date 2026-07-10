import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { consumeUserDailyQuota } from "@/lib/security/api-rate-limit";
import { getSystemSettings } from "@/lib/system-settings";
import { resolveCapabilities, getRoleLevel } from "@/lib/capabilities/cache";
import { DEFAULT_ROLE_LEVELS } from "@/lib/capabilities/defaults";

const ALLOW_UNVERIFIED_EMAIL_ENV = (() => {
  // Hard env-level escape hatch for deployments that intentionally don't
  // run an SMTP server (e.g. air-gapped class lab). When set, it bypasses
  // the gate entirely regardless of the DB setting. Operator must opt in
  // explicitly.
  const raw = process.env.SANDBOX_ALLOW_UNVERIFIED_EMAIL ?? "";
  return raw === "1" || raw.toLowerCase() === "true";
})();

interface GateOptions {
  userId: string;
  /** Identifier used as the rate-limit key suffix. */
  endpoint: string;
  /** Maximum invocations per rolling 24h window per user. */
  maxPerDay: number;
}

/**
 * SEC H-1 / H-2 — gate Docker-spawning endpoints behind email
 * verification and a per-user daily quota.
 *
 * Returns a 4xx NextResponse if the caller fails either check, otherwise
 * null (meaning "proceed").
 *
 * - Email verified: `users.emailVerified IS NOT NULL`. The verification
 *   flow at `/api/v1/auth/verify-email` stamps this column.
 * - Daily quota: a separate 24h bucket per (userId, endpoint) in the
 *   existing `rate_limits` table.
 */
export async function gateSandboxEndpoint(options: GateOptions): Promise<NextResponse | null> {
  const { userId, endpoint, maxPerDay } = options;

  // Resolve gate state. The env flag is a hard override; otherwise the
  // admin-controlled DB setting `system_settings.emailVerificationRequired`
  // wins. Default when neither is set: enforce verification (the
  // historical default before this setting actually wired through).
  let enforceEmailGate = !ALLOW_UNVERIFIED_EMAIL_ENV;
  if (enforceEmailGate) {
    try {
      const settings = await getSystemSettings();
      if (settings?.emailVerificationRequired === false) {
        enforceEmailGate = false;
      }
    } catch {
      // DB unavailable / migration not run: stay safe and keep the gate
      // enforced. Operator can still bypass via the env var.
    }
  }

  let userRow: { emailVerified: Date | null; role: string } | undefined;

  if (enforceEmailGate) {
    const [row] = await db
      .select({
        emailVerified: users.emailVerified,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    userRow = row;

    // Staff (assistant-level and above, including custom roles at that
    // level) bypass the verified-email gate. They're created by operators,
    // not by public signup, so requiring email verification breaks normal
    // admin workflows on fresh deployments without SMTP. Recruiting
    // candidates and students must verify. getRoleLevel returns -1 for
    // unknown roles, so those stay gated (fail-safe).
    const isStaff = row
      ? (await getRoleLevel(row.role)) >= DEFAULT_ROLE_LEVELS.assistant
      : false;
    if (!isStaff && !row?.emailVerified) {
      return NextResponse.json(
        {
          error: "emailVerificationRequired",
          message:
            "Verify your email before using the sandbox. Check your inbox for the verification link.",
        },
        { status: 403 },
      );
    }
  }

  // Operators and integrators with the system.settings capability bypass the
  // daily sandbox quota so that routine maintenance and testing are not
  // throttled by the same per-user limit as candidates.
  if (userRow) {
    const caps = await resolveCapabilities(userRow.role);
    if (caps.has("system.settings")) {
      return null;
    }
  }

  const quota = await consumeUserDailyQuota(userId, endpoint, maxPerDay);
  if (quota) return quota;

  return null;
}
