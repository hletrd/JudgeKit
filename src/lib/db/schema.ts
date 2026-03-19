import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { generateSubmissionId } from "@/lib/submissions/id";
import type { ExamMode, ScoringModel } from "@/types";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  username: text("username").unique().notNull(),
  email: text("email").unique(),
  name: text("name").notNull(),
  className: text("class_name"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("student"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).default(false),
  tokenInvalidatedAt: integer("token_invalidated_at", { mode: "timestamp" }),
  emailVerified: integer("email_verified", { mode: "timestamp" }),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const loginEvents = sqliteTable(
  "login_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    outcome: text("outcome").notNull(),
    attemptedIdentifier: text("attempted_identifier"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestMethod: text("request_method"),
    requestPath: text("request_path"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("login_events_outcome_idx").on(table.outcome),
    index("login_events_user_idx").on(table.userId),
    index("login_events_created_at_idx").on(table.createdAt),
  ]
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    resourceLabel: text("resource_label"),
    summary: text("summary").notNull(),
    details: text("details"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestMethod: text("request_method"),
    requestPath: text("request_path"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorId),
    index("audit_events_action_idx").on(table.action),
    index("audit_events_resource_type_idx").on(table.resourceType),
    index("audit_events_created_at_idx").on(table.createdAt),
  ]
);

export const groups = sqliteTable("groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  description: text("description"),
  instructorId: text("instructor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  isArchived: integer("is_archived", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const enrollments = sqliteTable(
  "enrollments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    enrolledAt: integer("enrolled_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("enrollments_user_group_idx").on(table.userId, table.groupId),
    index("enrollments_user_idx").on(table.userId),
    index("enrollments_group_idx").on(table.groupId),
  ]
);

export const problems = sqliteTable("problems", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text("title").notNull(),
  description: text("description"),
  timeLimitMs: integer("time_limit_ms").default(2000),
  memoryLimitMb: integer("memory_limit_mb").default(256),
  visibility: text("visibility").default("private"),
  showCompileOutput: integer("show_compile_output", { mode: "boolean" }).notNull().default(true),
  showDetailedResults: integer("show_detailed_results", { mode: "boolean" }).notNull().default(true),
  showRuntimeErrors: integer("show_runtime_errors", { mode: "boolean" }).notNull().default(true),
  allowAiAssistant: integer("allow_ai_assistant", { mode: "boolean" }).notNull().default(true),
  comparisonMode: text("comparison_mode").notNull().default("exact"),
  floatAbsoluteError: real("float_absolute_error"),
  floatRelativeError: real("float_relative_error"),
  authorId: text("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const testCases = sqliteTable(
  "test_cases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    expectedOutput: text("expected_output").notNull(),
    isVisible: integer("is_visible", { mode: "boolean" }).default(false),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [index("test_cases_problem_idx").on(table.problemId)]
);

export const problemGroupAccess = sqliteTable(
  "problem_group_access",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("pga_problem_idx").on(table.problemId),
    index("pga_group_idx").on(table.groupId),
    uniqueIndex("pga_problem_group_idx").on(table.problemId, table.groupId),
  ]
);

export const assignments = sqliteTable(
  "assignments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: integer("starts_at", { mode: "timestamp" }),
    deadline: integer("deadline", { mode: "timestamp" }),
    lateDeadline: integer("late_deadline", { mode: "timestamp" }),
    latePenalty: real("late_penalty").default(0),
    examMode: text("exam_mode").$type<ExamMode>().notNull().default("none"),
    examDurationMinutes: integer("exam_duration_minutes"),
    scoringModel: text("scoring_model").$type<ScoringModel>().notNull().default("ioi"),
    accessCode: text("access_code"),
    freezeLeaderboardAt: integer("freeze_leaderboard_at", { mode: "timestamp" }),
    enableAntiCheat: integer("enable_anti_cheat", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("assignments_group_idx").on(table.groupId),
    index("assignments_access_code_idx").on(table.accessCode),
  ]
);

export const examSessions = sqliteTable(
  "exam_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    personalDeadline: integer("personal_deadline", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
  },
  (table) => [
    uniqueIndex("exam_sessions_assignment_user_idx").on(table.assignmentId, table.userId),
    index("exam_sessions_assignment_idx").on(table.assignmentId),
    index("exam_sessions_user_idx").on(table.userId),
  ]
);

export const assignmentProblems = sqliteTable(
  "assignment_problems",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    points: integer("points").default(100),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [
    index("ap_assignment_idx").on(table.assignmentId),
    index("ap_problem_idx").on(table.problemId),
    uniqueIndex("ap_assignment_problem_idx").on(table.assignmentId, table.problemId),
  ]
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateSubmissionId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id").references(() => assignments.id, {
      onDelete: "set null",
    }),
    language: text("language").notNull(),
    sourceCode: text("source_code").notNull(),
    status: text("status").default("pending"),
    judgeClaimToken: text("judge_claim_token"),
    judgeClaimedAt: integer("judge_claimed_at", { mode: "timestamp" }),
    compileOutput: text("compile_output"),
    executionTimeMs: integer("execution_time_ms"),
    memoryUsedKb: integer("memory_used_kb"),
    score: real("score"),
    judgedAt: integer("judged_at", { mode: "timestamp" }),
    ipAddress: text("ip_address"),
    submittedAt: integer("submitted_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("submissions_user_problem_idx").on(table.userId, table.problemId),
    index("submissions_assignment_user_problem_idx").on(table.assignmentId, table.userId, table.problemId),
    index("submissions_status_idx").on(table.status),
    index("submissions_user_idx").on(table.userId),
    index("submissions_problem_idx").on(table.problemId),
    index("submissions_assignment_idx").on(table.assignmentId),
  ]
);

export const languageConfigs = sqliteTable("language_configs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  language: text("language").unique().notNull(),
  displayName: text("display_name").notNull(),
  standard: text("standard"),
  extension: text("extension").notNull(),
  dockerImage: text("docker_image").notNull(),
  compiler: text("compiler"),
  compileCommand: text("compile_command"),
  runCommand: text("run_command").notNull(),
  dockerfile: text("dockerfile"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const systemSettings = sqliteTable("system_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "global"),
  siteTitle: text("site_title"),
  siteDescription: text("site_description"),
  timeZone: text("time_zone"),
  aiAssistantEnabled: integer("ai_assistant_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    key: text("key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: integer("window_started_at").notNull(),
    blockedUntil: integer("blocked_until"),
    consecutiveBlocks: integer("consecutive_blocks").default(0),
    lastAttempt: integer("last_attempt").notNull(),
    createdAt: integer("created_at").$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("rate_limits_key_idx").on(table.key),
  ]
);

export const submissionComments = sqliteTable(
  "submission_comments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("sc_submission_idx").on(table.submissionId),
    index("sc_author_idx").on(table.authorId),
  ]
);

export const scoreOverrides = sqliteTable(
  "score_overrides",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    overrideScore: real("override_score").notNull(),
    reason: text("reason"),
    createdBy: text("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("score_overrides_assignment_problem_user_idx").on(
      table.assignmentId,
      table.problemId,
      table.userId
    ),
    index("score_overrides_assignment_idx").on(table.assignmentId),
  ]
);

export const problemSets = sqliteTable("problem_sets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const problemSetProblems = sqliteTable(
  "problem_set_problems",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemSetId: text("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [
    index("psp_problem_set_idx").on(table.problemSetId),
    index("psp_problem_idx").on(table.problemId),
    uniqueIndex("psp_problem_set_problem_idx").on(table.problemSetId, table.problemId),
  ]
);

export const problemSetGroupAccess = sqliteTable(
  "problem_set_group_access",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemSetId: text("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    assignedAt: integer("assigned_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("psga_problem_set_idx").on(table.problemSetId),
    index("psga_group_idx").on(table.groupId),
    uniqueIndex("psga_problem_set_group_idx").on(table.problemSetId, table.groupId),
  ]
);

export const submissionResults = sqliteTable(
  "submission_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    testCaseId: text("test_case_id")
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    actualOutput: text("actual_output"),
    executionTimeMs: integer("execution_time_ms"),
    memoryUsedKb: integer("memory_used_kb"),
  },
  (table) => [
    index("sr_submission_idx").on(table.submissionId),
    index("sr_test_case_idx").on(table.testCaseId),
  ]
);

export const plugins = sqliteTable("plugins", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  config: text("config", { mode: "json" }),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant" | "system"
  content: text("content").notNull(),
  problemId: text("problem_id"),
  model: text("model"),
  provider: text("provider"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const contestAccessTokens = sqliteTable(
  "contest_access_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: integer("redeemed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    ipAddress: text("ip_address"),
  },
  (table) => [
    uniqueIndex("cat_assignment_user_idx").on(table.assignmentId, table.userId),
  ]
);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text("name").unique().notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
    level: integer("level").notNull().default(0),
    capabilities: text("capabilities", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("roles_name_idx").on(table.name),
    index("roles_level_idx").on(table.level),
  ]
);

export const antiCheatEvents = sqliteTable(
  "anti_cheat_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    details: text("details"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("ace_assignment_user_idx").on(table.assignmentId, table.userId),
    index("ace_assignment_type_idx").on(table.assignmentId, table.eventType),
    index("ace_assignment_created_idx").on(table.assignmentId, table.createdAt),
  ]
);
