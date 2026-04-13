import { createHash } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redeemRecruitingToken } from "@/lib/assignments/recruiting-invitations";
import { extractClientIp } from "@/lib/security/ip";
import type { LoginEventRequestSummary } from "@/lib/auth/login-events";

type AuthUserRecord = {
  id: string;
  username: string;
  email: string | null;
  name: string;
  className: string | null;
  role: string;
  mustChangePassword: boolean;
  preferredLanguage?: string | null;
  preferredTheme?: string | null;
  editorTheme?: string | null;
  editorFontSize?: string | null;
  editorFontFamily?: string | null;
  lectureMode?: string | null;
  lectureFontScale?: string | null;
  lectureColorScheme?: string | null;
};

type AuthenticatedLoginUser = AuthUserRecord & {
  loginEventContext: LoginEventRequestSummary;
};

export async function authorizeRecruitingToken(
  token: string,
  accountPassword: string | undefined,
  request: Request
): Promise<AuthenticatedLoginUser | null> {
  const ipAddress = extractClientIp(request.headers);
  const result = await redeemRecruitingToken(token, ipAddress ?? undefined, accountPassword);

  if (!result.ok) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, result.userId),
  });

  if (!user || !user.isActive) return null;

  const tokenFingerprint = createHash("sha256").update(token).digest("hex").slice(0, 8);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    className: user.className,
    role: user.role,
    mustChangePassword: false,
    preferredLanguage: user.preferredLanguage,
    preferredTheme: user.preferredTheme,
    editorTheme: user.editorTheme,
    editorFontSize: user.editorFontSize,
    editorFontFamily: user.editorFontFamily,
    lectureMode: user.lectureMode,
    lectureFontScale: user.lectureFontScale,
    lectureColorScheme: user.lectureColorScheme,
    loginEventContext: {
      attemptedIdentifier: `recruit:${tokenFingerprint}`,
      ipAddress,
      userAgent: request.headers.get("user-agent")?.trim() || null,
      requestMethod: request.method?.trim().toUpperCase() || null,
      requestPath: (() => {
        try {
          return new URL(request.url).pathname;
        } catch {
          return null;
        }
      })(),
    },
  };
}
