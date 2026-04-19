import { createHash } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redeemRecruitingToken } from "@/lib/assignments/recruiting-invitations";
import { extractClientIp } from "@/lib/security/ip";
import { logger } from "@/lib/logger";
import type { LoginEventRequestSummary } from "@/lib/auth/login-events";
import { mapUserToAuthFields, createSuccessfulLoginResponse } from "@/lib/auth/config";

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

  const user = await db.query.users.findFirst({
    where: eq(users.id, result.userId),
  });

  if (!user || !user.isActive) return null;

  const tokenFingerprint = createHash("sha256").update(token).digest("hex").slice(0, 8);

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
