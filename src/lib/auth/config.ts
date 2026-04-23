import type { NextAuthConfig, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import crypto from "crypto";
import { verifyPassword, verifyAndRehashPassword } from "@/lib/security/password-hash";
import { logger } from "@/lib/logger";
import {
  getSessionMaxAgeSeconds,
  clearAuthToken,
  getTokenAuthenticatedAtSeconds,
  isTokenInvalidated,
} from "@/lib/auth/session-security";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  clearRateLimitMulti,
  consumeRateLimitAttemptMulti,
  getRateLimitKey,
  getUsernameRateLimitKey,
} from "@/lib/security/rate-limit";
import {
  getAuthSessionCookieName,
  getValidatedAuthSecret,
  shouldTrustAuthHost,
  validateAuthUrl,
} from "@/lib/security/env";
import { shouldUseSecureAuthCookie } from "@/lib/auth/secure-cookie";
import { getTokenUserId } from "@/lib/api/auth";
import {
  getLoginEventContextFromUser,
  recordLoginEvent,
  recordLoginEventWithContext,
  type LoginEventContextCarrier,
  type LoginEventRequestSummary,
  sanitizeLoginEventContext,
} from "@/lib/auth/login-events";
import { extractClientIp } from "@/lib/security/ip";
import { authorizeRecruitingToken } from "@/lib/auth/recruiting-token";
import type { AuthUserRecord, AuthUserInput } from "@/lib/auth/types";
import { AUTH_PREFERENCE_FIELDS } from "@/lib/auth/types";

type AuthenticatedLoginUser = Omit<AuthUserRecord, "mustChangePassword"> & {
  mustChangePassword: boolean;
} & LoginEventContextCarrier;

// Pre-computed Argon2id hash of a random string, used for timing-safe
// comparison when the requested user does not exist (prevents user-enumeration
// via response-time differences).
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Y2xhdWRlZHVtbXloYXNo$KQH6bMKH3t2fGK8qMJzrOGmG5bNRVZ0bQfO7aDVz0Zk";

/** Core (non-preference) auth fields returned by every auth query. */
const AUTH_CORE_FIELDS = [
  "id",
  "username",
  "email",
  "name",
  "className",
  "role",
  "isActive",
  "mustChangePassword",
  "tokenInvalidatedAt",
] as const;

/** All columns to select when querying a user for auth purposes. */
export const AUTH_USER_COLUMNS: Record<string, true> = Object.fromEntries(
  [...AUTH_CORE_FIELDS, ...AUTH_PREFERENCE_FIELDS].map((f) => [f, true as const]),
);

/**
 * Map an AuthUserRecord to a plain object with all auth-relevant fields
 * and their canonical defaults. Used by createSuccessfulLoginResponse,
 * syncTokenWithUser, and the jwt callback to avoid maintaining three
 * separate field lists. Add new preference fields to AUTH_PREFERENCE_FIELDS
 * and HERE — the DB query columns and clearAuthToken are derived automatically.
 */
export function mapUserToAuthFields(user: AuthUserInput) {
  return {
    id: user.id ?? "",
    username: user.username ?? "",
    email: user.email ?? null,
    name: user.name ?? "",
    className: user.className ?? null,
    role: user.role ?? "",
    mustChangePassword: user.mustChangePassword ?? false,
    preferredLanguage: user.preferredLanguage ?? null,
    preferredTheme: user.preferredTheme ?? null,
    // shareAcceptedSolutions defaults to true (opt-out) for the educational
    // use case: students are expected to share solutions for collaborative
    // learning unless they explicitly opt out.
    shareAcceptedSolutions: user.shareAcceptedSolutions ?? true,
    acceptedSolutionsAnonymous: user.acceptedSolutionsAnonymous ?? false,
    editorTheme: user.editorTheme ?? null,
    editorFontSize: user.editorFontSize ?? null,
    editorFontFamily: user.editorFontFamily ?? null,
    lectureMode: user.lectureMode ?? null,
    lectureFontScale: user.lectureFontScale ?? null,
    lectureColorScheme: user.lectureColorScheme ?? null,
  };
}

export function createSuccessfulLoginResponse(
  user: AuthUserInput,
  loginEventContext: LoginEventRequestSummary
): AuthenticatedLoginUser {
  return {
    ...mapUserToAuthFields(user),
    loginEventContext,
  };
}

function syncTokenWithUser(
  token: JWT,
  user: AuthUserInput,
  authenticatedAtSeconds = getTokenAuthenticatedAtSeconds(token) ?? Math.trunc(Date.now() / 1000)
) {
  const fields = mapUserToAuthFields(user);
  // Spread all auth fields onto the token in one step so new preference
  // fields are automatically included without a separate manual assignment.
  Object.assign(token, fields);
  token.sub = fields.id;
  token.authenticatedAt = authenticatedAtSeconds;

  return token;
}

/**
 * Map JWT token fields to the NextAuth session.user object.
 * Core fields are assigned explicitly; preference fields are assigned
 * directly to the typed session.user (no cast needed since next-auth.d.ts
 * declares all preference fields on Session["user"]).
 */
function mapTokenToSession(token: JWT, session: Session) {
  // Core fields — each has a specific default pattern
  session.user.id = token.id ?? "";
  session.user.role = token.role ?? "";
  session.user.username = token.username ?? "";
  session.user.name = token.name ?? session.user.name ?? "";
  session.user.className = token.className ?? null;
  session.user.mustChangePassword = token.mustChangePassword ?? false;

  if (typeof token.email === "string") {
    session.user.email = token.email;
  }

  // Preference fields — assigned directly to the typed session.user.
  // When adding a new preference field: add it to AUTH_PREFERENCE_FIELDS,
  // AuthUserRecord, next-auth.d.ts (Session["user"] and JWT), AND here.
  session.user.preferredLanguage = token.preferredLanguage ?? null;
  session.user.preferredTheme = token.preferredTheme ?? null;
  // shareAcceptedSolutions defaults to true (opt-out model)
  session.user.shareAcceptedSolutions = token.shareAcceptedSolutions ?? true;
  session.user.acceptedSolutionsAnonymous = token.acceptedSolutionsAnonymous ?? false;
  session.user.editorTheme = token.editorTheme ?? null;
  session.user.editorFontSize = token.editorFontSize ?? null;
  session.user.editorFontFamily = token.editorFontFamily ?? null;
  session.user.lectureMode = token.lectureMode ?? null;
  session.user.lectureFontScale = token.lectureFontScale ?? null;
  session.user.lectureColorScheme = token.lectureColorScheme ?? null;
}

validateAuthUrl();
const secureSessionCookie = shouldUseSecureAuthCookie();

export const authConfig: NextAuthConfig = {
  secret: getValidatedAuthSecret(),
  useSecureCookies: secureSessionCookie,
  cookies: {
    sessionToken: {
      name: getAuthSessionCookieName(),
      options: {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: secureSessionCookie,
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username or Email", type: "text" },
        password: { label: "Password", type: "password" },
        recruitToken: { label: "Recruiting Token", type: "text" },
        recruitAccountPassword: { label: "Recruiting Account Password", type: "password" },
      },
      async authorize(credentials, request) {
        // Recruiting token auth — bypass password flow
        if (typeof credentials?.recruitToken === "string" && credentials.recruitToken.length > 0) {
          const recruitIpKey = getRateLimitKey("login", request.headers);
          if (await consumeRateLimitAttemptMulti(recruitIpKey)) {
            recordLoginEvent({
              outcome: "rate_limited",
              attemptedIdentifier: "recruitToken",
              request,
            });
            return null;
          }

          const result = await authorizeRecruitingToken(
            credentials.recruitToken,
            typeof credentials?.recruitAccountPassword === "string" && credentials.recruitAccountPassword.length > 0
              ? credentials.recruitAccountPassword
              : undefined,
            request
          );

          if (!result) {
            recordLoginEvent({
              outcome: "invalid_credentials",
              attemptedIdentifier: "recruitToken",
              request,
            });
            return null;
          }

          await clearRateLimitMulti(recruitIpKey);
          return result;
        }

        const ipRateLimitKey = getRateLimitKey("login", request.headers);
        const attemptedIdentifier = typeof credentials?.username === "string" ? credentials.username : null;
        const usernameRateLimitKey = attemptedIdentifier
          ? getUsernameRateLimitKey("login", attemptedIdentifier)
          : null;

        const rateLimitKeys = [ipRateLimitKey, ...(usernameRateLimitKey ? [usernameRateLimitKey] : [])];

        if (await consumeRateLimitAttemptMulti(...rateLimitKeys)) {
          recordLoginEvent({
            outcome: "rate_limited",
            attemptedIdentifier,
            request,
          });
          return null;
        }

        if (typeof credentials?.username !== "string" || typeof credentials?.password !== "string") {
          return null;
        }

        const identifier = credentials.username;
        const password = credentials.password;

        let user = await db.query.users.findFirst({
          where: sql`lower(${users.username}) = lower(${identifier})`,
        });

        if (!user) {
          user = await db.query.users.findFirst({
            where: sql`lower(${users.email}) = lower(${identifier})`,
          });
        }

        if (!user || !user.passwordHash || !user.isActive) {
          await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
          recordLoginEvent({
            outcome: "invalid_credentials",
            attemptedIdentifier: identifier,
            userId: user?.id ?? null,
            request,
          });
          return null;
        }

        const { valid: isValid } = await verifyAndRehashPassword(password, user.id, user.passwordHash);
        if (!isValid) {
          recordLoginEvent({
            outcome: "invalid_credentials",
            attemptedIdentifier: identifier,
            userId: user.id,
            request,
          });
          return null;
        }

        await clearRateLimitMulti(...rateLimitKeys);

        return createSuccessfulLoginResponse(
          user,
          {
            attemptedIdentifier: identifier,
            ipAddress: extractClientIp(request.headers),
            userAgent: request.headers.get("user-agent")?.trim() || null,
            requestMethod: request.method?.trim().toUpperCase() || null,
            requestPath: (() => {
              try {
                return new URL(request.url).pathname;
              } catch (err) {
                logger.debug({ err, url: request.url }, "[auth] failed to parse request URL for login event");
                return null;
              }
            })(),
          }
        );
      },
    }),
  ],
  trustHost: shouldTrustAuthHost(),
  session: { strategy: "jwt", maxAge: getSessionMaxAgeSeconds() },
  pages: {
    signIn: "/login",
  },
  events: {
    async signIn({ account, user }) {
      if (account?.provider !== "credentials") {
        return;
      }

      const loginEventContext = getLoginEventContextFromUser(user);

      if (!loginEventContext) {
        return;
      }

      recordLoginEventWithContext({
        outcome: "success",
        userId: user.id ?? null,
        context: loginEventContext,
      });
    },
  },
  callbacks: {
    async signIn({ account, credentials, user }) {
      if (account?.provider !== "credentials") {
        return true;
      }

      const carriedLoginEventContext = getLoginEventContextFromUser(user);
      const loginEventContext =
        carriedLoginEventContext ??
        sanitizeLoginEventContext({
          attemptedIdentifier: typeof credentials?.username === "string" ? credentials.username : null,
        });

      if (!user.id || !carriedLoginEventContext) {
        recordLoginEventWithContext({
          outcome: "policy_denied",
          userId: user.id ?? null,
          context: loginEventContext,
        });

        return false;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const authenticatedAtSeconds = Math.trunc(Date.now() / 1000);

        const updatedToken = syncTokenWithUser(
          token,
          user as unknown as AuthUserInput,
          authenticatedAtSeconds,
        );

        const loginContext = getLoginEventContextFromUser(user);
        const ua = loginContext?.userAgent ?? "";
        updatedToken.uaHash = crypto
          .createHash("sha256")
          .update(ua)
          .digest("hex")
          .slice(0, 16);

        return updatedToken;
      }

      const userId = getTokenUserId(token);

      if (!userId) {
        return clearAuthToken(token);
      }

      const freshUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: AUTH_USER_COLUMNS,
      });

      if (
        !freshUser ||
        !freshUser.isActive ||
        isTokenInvalidated(getTokenAuthenticatedAtSeconds(token), freshUser.tokenInvalidatedAt)
      ) {
        return clearAuthToken(token);
      }

      return syncTokenWithUser(token, freshUser);
    },
    async session({ session, token }) {
      const userId = getTokenUserId(token);

      if (userId && token.role) {
        mapTokenToSession(token, session);
      }
      return session;
    },
  },
};
