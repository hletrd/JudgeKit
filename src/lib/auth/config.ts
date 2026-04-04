import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import crypto from "crypto";
import { verifyPassword, hashPassword } from "@/lib/security/password-hash";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  clearAuthToken,
  getTokenAuthenticatedAtSeconds,
  isTokenInvalidated,
} from "@/lib/auth/session-security";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { UserRole } from "@/types";
import {
  clearRateLimitMulti,
  getRateLimitKey,
  getUsernameRateLimitKey,
  isAnyKeyRateLimited,
  recordRateLimitFailureMulti,
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

type AuthUserRecord = {
  id: string;
  username: string;
  email: string | null;
  name: string;
  className: string | null;
  role: string;
  mustChangePassword: boolean | null;
  preferredLanguage?: string | null;
  preferredTheme?: string | null;
  editorTheme?: string | null;
  editorFontSize?: string | null;
  editorFontFamily?: string | null;
  lectureMode?: string | null;
  lectureFontScale?: string | null;
  lectureColorScheme?: string | null;
};

type AuthenticatedLoginUser = Omit<AuthUserRecord, "mustChangePassword"> & {
  mustChangePassword: boolean;
} & LoginEventContextCarrier;

// Pre-computed Argon2id hash of a random string, used for timing-safe
// comparison when the requested user does not exist (prevents user-enumeration
// via response-time differences).
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Y2xhdWRlZHVtbXloYXNo$KQH6bMKH3t2fGK8qMJzrOGmG5bNRVZ0bQfO7aDVz0Zk";

function createSuccessfulLoginResponse(
  user: AuthUserRecord,
  loginEventContext: LoginEventRequestSummary
): AuthenticatedLoginUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    className: user.className,
    role: user.role,
    mustChangePassword: user.mustChangePassword ?? false,
    loginEventContext,
  };
}

function syncTokenWithUser(
  token: JWT,
  user: AuthUserRecord,
  authenticatedAtSeconds = getTokenAuthenticatedAtSeconds(token) ?? Math.trunc(Date.now() / 1000)
) {
  token.sub = user.id;
  token.id = user.id;
  token.role = user.role;
  token.username = user.username;
  token.email = user.email;
  token.name = user.name;
  token.className = user.className;
  token.mustChangePassword = user.mustChangePassword ?? false;
  token.preferredLanguage = user.preferredLanguage ?? null;
  token.preferredTheme = user.preferredTheme ?? null;
  token.editorTheme = user.editorTheme ?? null;
  token.editorFontSize = user.editorFontSize ?? null;
  token.editorFontFamily = user.editorFontFamily ?? null;
  token.lectureMode = user.lectureMode ?? null;
  token.lectureFontScale = user.lectureFontScale ?? null;
  token.lectureColorScheme = user.lectureColorScheme ?? null;
  token.authenticatedAt = authenticatedAtSeconds;

  return token;
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
      },
      async authorize(credentials, request) {
        const ipRateLimitKey = getRateLimitKey("login", request.headers);
        const attemptedIdentifier = typeof credentials?.username === "string" ? credentials.username : null;
        const usernameRateLimitKey = attemptedIdentifier
          ? getUsernameRateLimitKey("login", attemptedIdentifier)
          : null;

        const rateLimitKeys = [ipRateLimitKey, ...(usernameRateLimitKey ? [usernameRateLimitKey] : [])];

        if (isAnyKeyRateLimited(...rateLimitKeys)) {
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
            where: eq(users.email, identifier),
          });
        }

        if (!user || !user.passwordHash || !user.isActive) {
          await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
          recordRateLimitFailureMulti(...rateLimitKeys);
          recordLoginEvent({
            outcome: "invalid_credentials",
            attemptedIdentifier: identifier,
            userId: user?.id ?? null,
            request,
          });
          return null;
        }

        const { valid: isValid, needsRehash } = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          recordRateLimitFailureMulti(...rateLimitKeys);
          recordLoginEvent({
            outcome: "invalid_credentials",
            attemptedIdentifier: identifier,
            userId: user.id,
            request,
          });
          return null;
        }

        // Transparent rehash: migrate legacy bcrypt hashes to Argon2id on
        // successful login.  Fire-and-forget so it never blocks the login flow.
        if (needsRehash) {
          hashPassword(password)
            .then((newHash) =>
              db
                .update(users)
                .set({ passwordHash: newHash })
                .where(eq(users.id, user.id))
            )
            .catch(() => {});
        }

        clearRateLimitMulti(...rateLimitKeys);

        return createSuccessfulLoginResponse(
          {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            className: user.className,
            role: user.role,
            mustChangePassword: user.mustChangePassword ?? false,
            preferredLanguage: user.preferredLanguage,
            preferredTheme: user.preferredTheme,
            editorTheme: user.editorTheme,
            editorFontSize: user.editorFontSize,
            editorFontFamily: user.editorFontFamily,
            lectureMode: user.lectureMode,
            lectureFontScale: user.lectureFontScale,
            lectureColorScheme: user.lectureColorScheme,
          },
          {
            attemptedIdentifier: identifier,
            ipAddress: extractClientIp(request.headers),
            userAgent: request.headers.get("user-agent")?.trim() || null,
            requestMethod: request.method?.trim().toUpperCase() || null,
            requestPath: (() => {
              try {
                return new URL(request.url).pathname;
              } catch {
                return null;
              }
            })(),
          }
        );
      },
    }),
  ],
  trustHost: shouldTrustAuthHost(),
  session: { strategy: "jwt", maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
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

        const updatedToken = syncTokenWithUser(token, {
          id: user.id ?? token.sub ?? "",
          username: user.username,
          email: user.email ?? null,
          name: user.name ?? "",
          className: user.className ?? null,
          role: user.role,
          mustChangePassword: user.mustChangePassword ?? false,
          preferredLanguage: user.preferredLanguage ?? null,
          preferredTheme: user.preferredTheme ?? null,
          editorTheme: user.editorTheme ?? null,
          editorFontSize: user.editorFontSize ?? null,
          editorFontFamily: user.editorFontFamily ?? null,
          lectureMode: user.lectureMode ?? null,
          lectureFontScale: user.lectureFontScale ?? null,
          lectureColorScheme: user.lectureColorScheme ?? null,
        }, authenticatedAtSeconds);

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
        columns: {
          id: true,
          username: true,
          email: true,
          name: true,
          className: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          tokenInvalidatedAt: true,
          preferredLanguage: true,
          preferredTheme: true,
          editorTheme: true,
          editorFontSize: true,
          editorFontFamily: true,
          lectureMode: true,
          lectureFontScale: true,
          lectureColorScheme: true,
        },
      });

      if (
        !freshUser ||
        !freshUser.isActive ||
        isTokenInvalidated(getTokenAuthenticatedAtSeconds(token), freshUser.tokenInvalidatedAt)
      ) {
        return clearAuthToken(token);
      }

      return syncTokenWithUser(token, {
        id: freshUser.id,
        username: freshUser.username,
        email: freshUser.email,
        name: freshUser.name,
        className: freshUser.className,
        role: freshUser.role,
        mustChangePassword: freshUser.mustChangePassword ?? false,
        preferredLanguage: freshUser.preferredLanguage,
        preferredTheme: freshUser.preferredTheme,
        editorTheme: freshUser.editorTheme,
        editorFontSize: freshUser.editorFontSize,
        editorFontFamily: freshUser.editorFontFamily,
        lectureMode: freshUser.lectureMode,
        lectureFontScale: freshUser.lectureFontScale,
        lectureColorScheme: freshUser.lectureColorScheme,
      });
    },
    async session({ session, token }) {
      const userId = getTokenUserId(token);

      if (userId && token.role) {
        session.user.id = userId;
        session.user.role = token.role;
        session.user.username = token.username ?? "";
        session.user.name = token.name ?? session.user.name ?? "";
        session.user.className = token.className ?? null;
        session.user.mustChangePassword = token.mustChangePassword ?? false;
        session.user.preferredLanguage = token.preferredLanguage ?? null;
        session.user.preferredTheme = token.preferredTheme ?? null;
        session.user.editorTheme = token.editorTheme ?? null;
        session.user.editorFontSize = token.editorFontSize ?? null;
        session.user.editorFontFamily = token.editorFontFamily ?? null;
        session.user.lectureMode = token.lectureMode ?? null;
        session.user.lectureFontScale = token.lectureFontScale ?? null;
        session.user.lectureColorScheme = token.lectureColorScheme ?? null;

        if (typeof token.email === "string") {
          session.user.email = token.email;
        }
      }
      return session;
    },
  },
};
