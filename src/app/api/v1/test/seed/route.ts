/**
 * Test seed endpoint — ONLY available when PLAYWRIGHT_AUTH_TOKEN is set.
 *
 * This endpoint lets E2E tests create and clean up test data through the
 * HTTP API instead of touching the database directly.  It is completely
 * inert in production because it returns 404 when the env var is absent.
 *
 * Security model:
 *   - Hard-gated by PLAYWRIGHT_AUTH_TOKEN env var (missing → 404).
 *   - Requires a matching Bearer token in the Authorization header.
 *   - Token comparison is timing-safe (no timing oracle on the token value).
 *   - All created rows use a "e2e-" prefix convention so cleanup is scoped.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/security/password-hash";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, problems } from "@/lib/db/schema";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { logger } from "@/lib/logger";
import { safeTokenCompare } from "@/lib/security/timing";
import { extractClientIp } from "@/lib/security/ip";
import { csrfForbidden } from "@/lib/api/auth";

// ─── Auth helpers ────────────────────────────────────────────────────────────

function getPlaywrightToken(): string | undefined {
  const token = process.env.PLAYWRIGHT_AUTH_TOKEN;
  return token && token.trim().length > 0 ? token.trim() : undefined;
}

function isTestEnvironment(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return Boolean(getPlaywrightToken());
}

function isLocalhostRequest(req: NextRequest): boolean {
  // Use extractClientIp so hop validation against TRUSTED_PROXY_HOPS applies.
  // Raw X-Forwarded-For would be spoofable by any external caller.
  const ip = extractClientIp(req.headers);
  return ip === "127.0.0.1" || ip === "::1";
}

function isAuthorized(req: NextRequest): boolean {
  const expected = getPlaywrightToken();
  if (!expected) return false;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  return safeTokenCompare(provided, expected);
}

// ─── Request body schemas ────────────────────────────────────────────────────

const createUserSchema = z.object({
  action: z.literal("create_user"),
  data: z.object({
    /** Must start with "e2e-" to be eligible for cleanup. */
    username: z.string().min(1).startsWith("e2e-"),
    name: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    role: z.enum(["student", "instructor"]).optional(),
  }),
});

const createProblemSchema = z.object({
  action: z.literal("create_problem"),
  data: z.object({
    /** Must start with "[E2E]" to be eligible for cleanup. */
    title: z.string().min(1).startsWith("[E2E]"),
    description: z.string().optional(),
    visibility: z.enum(["public", "private"]).optional(),
    authorId: z.string().optional(),
    timeLimitMs: z.number().int().positive().optional(),
    memoryLimitMb: z.number().int().positive().optional(),
  }),
});

const cleanupSchema = z.object({
  action: z.literal("cleanup"),
  data: z
    .object({
      /** Limit cleanup to a specific username prefix (must start with "e2e-"). */
      usernamePrefix: z.string().startsWith("e2e-").optional(),
      /** Limit cleanup to a specific problem title prefix (must start with "[E2E]"). */
      titlePrefix: z.string().startsWith("[E2E]").optional(),
    })
    .optional(),
});

const seedBodySchema = z.discriminatedUnion("action", [
  createUserSchema,
  createProblemSchema,
  cleanupSchema,
]);

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Hard gate: behave as if the route doesn't exist in non-test environments.
  if (!isTestEnvironment()) {
    return apiError("notFound", 404);
  }

  // Restrict to localhost only — this endpoint creates/deletes users and data.
  if (!isLocalhostRequest(req)) {
    return apiError("forbidden", 403);
  }

  if (!isAuthorized(req)) {
    return apiError("unauthorized", 401);
  }

  const csrfError = csrfForbidden(req);
  if (csrfError) return csrfError;

  const contentType = req.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return apiError("unsupportedMediaType", 415);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    logger.warn({ err }, "[seed] failed to parse request body as JSON");
    return apiError("invalidJson", 400);
  }

  const parsed = seedBodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "validationError";
    return apiError(message, 400);
  }

  const body = parsed.data;

  try {
    switch (body.action) {
      case "create_user": {
        const { username, name, password, role } = body.data;

        // Low bcrypt rounds (4) for speed — acceptable in test environments only.
        const passwordHash = await hashPassword(password ?? "TestPass123!");

        const [created] = await db
          .insert(users)
          .values({
            username,
            name: name ?? username,
            role: role ?? "student",
            passwordHash,
            isActive: true,
            mustChangePassword: false,
          })
          .returning({ id: users.id, username: users.username });

        logger.info({ username }, "[test/seed] Created test user");
        return apiSuccess({ id: created.id, username: created.username });
      }

      case "create_problem": {
        const { title, description, visibility, authorId, timeLimitMs, memoryLimitMb } =
          body.data;

        const [created] = await db
          .insert(problems)
          .values({
            title,
            description: description ?? "",
            visibility: visibility ?? "private",
            authorId: authorId ?? null,
            timeLimitMs: timeLimitMs ?? 2000,
            memoryLimitMb: memoryLimitMb ?? 256,
          })
          .returning({ id: problems.id, title: problems.title });

        logger.info({ title }, "[test/seed] Created test problem");
        return apiSuccess({ id: created.id, title: created.title });
      }

      case "cleanup": {
        const { usernamePrefix, titlePrefix } = body.data ?? {};

        // Escape LIKE metacharacters to prevent wildcard injection.
        const escapeLike = (s: string) => s.replace(/[%_\\]/g, "\\$&");

        // Delete users whose username starts with the given prefix (default "e2e-").
        // Cascade rules in the schema will remove their sessions, submissions, etc.
        const effectiveUserPrefix = usernamePrefix ?? "e2e-";
        const escapedUserPrefix = escapeLike(effectiveUserPrefix);
        const deletedUsers = await db
          .delete(users)
          .where(sql`${users.username} LIKE ${escapedUserPrefix + '%'} ESCAPE '\\'`)
          .returning({ id: users.id });

        // Delete problems whose title starts with the given prefix (default "[E2E]").
        const effectiveTitlePrefix = titlePrefix ?? "[E2E]";
        const escapedTitlePrefix = escapeLike(effectiveTitlePrefix);
        const deletedProblems = await db
          .delete(problems)
          .where(sql`${problems.title} LIKE ${escapedTitlePrefix + '%'} ESCAPE '\\'`)
          .returning({ id: problems.id });

        logger.info(
          {
            deletedUsers: deletedUsers.length,
            deletedProblems: deletedProblems.length,
          },
          "[test/seed] Cleanup complete"
        );

        return apiSuccess({
          deletedUsers: deletedUsers.length,
          deletedProblems: deletedProblems.length,
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/test/seed error");
    return apiError("internalServerError", 500);
  }
}
