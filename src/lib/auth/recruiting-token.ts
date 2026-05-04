import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redeemRecruitingToken } from "@/lib/assignments/recruiting-invitations";
import { extractClientIp } from "@/lib/security/ip";
import { logger } from "@/lib/logger";
import { createSuccessfulLoginResponse, AUTH_USER_COLUMNS } from "@/lib/auth/config";
import { hashToken } from "@/lib/security/token-hash";

export async function authorizeRecruitingToken(
  token: string,
  accountPassword: string | undefined,
  request: Request
): Promise<Awaited<ReturnType<typeof createSuccessfulLoginResponse>> | null> {
  const ipAddress = extractClientIp(request.headers);
  const result = await redeemRecruitingToken(token, ipAddress ?? undefined, accountPassword);

  if (!result.ok) {
    logger.warn({ error: result.error, hasPassword: !!accountPassword }, "[recruit] redeemRecruitingToken failed");
    return null;
  }

  // Use AUTH_USER_COLUMNS to restrict the query to only the columns needed
  // by createSuccessfulLoginResponse / mapUserToAuthFields. This avoids
  // fetching passwordHash and other sensitive columns unnecessarily.
  const user = await db.query.users.findFirst({
    where: eq(users.id, result.userId),
    columns: AUTH_USER_COLUMNS,
  });

  if (!user || !user.isActive) return null;

  // 8-hex-char fingerprint (32 bits) is sufficient for audit-log correlation
  // but NOT for security comparisons.
  const tokenFingerprint = hashToken(token).slice(0, 8);

  return createSuccessfulLoginResponse(user, {
    attemptedIdentifier: `recruit:${tokenFingerprint}`,
    ipAddress,
    userAgent: request.headers.get("user-agent")?.trim() || null,
    requestMethod: request.method?.trim().toUpperCase() || null,
    requestPath: (() => {
      try {
        return new URL(request.url).pathname;
      } catch (err) {
        logger.debug({ err, url: request.url }, "[recruit-token] failed to parse request URL");
        return null;
      }
    })(),
  });
}
