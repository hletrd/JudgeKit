import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateSubmissionId } from "@/lib/submissions/id";
import type { AssignmentVisibility, ExamMode, PlatformMode, ScoringModel } from "@/types";

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    username: text("username").unique().notNull(),
    email: text("email").unique(),
    name: text("name").notNull(),
    className: text("class_name"),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("student"),
    isActive: boolean("is_active").default(true),
    mustChangePassword: boolean("must_change_password").default(false),
    tokenInvalidatedAt: timestamp("token_invalidated_at", { withTimezone: true }),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    preferredLanguage: text("preferred_language"),
    preferredTheme: text("preferred_theme"),
    editorTheme: text("editor_theme"),
    editorFontSize: text("editor_font_size"),
    editorFontFamily: text("editor_font_family"),
    lectureMode: text("lecture_mode"),
    lectureFontScale: text("lecture_font_scale"),
    lectureColorScheme: text("lecture_color_scheme"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("users_created_at_idx").on(table.createdAt),
    // Case-insensitive index for username lookups (isUsernameTaken uses lower())
    index("users_lower_username_idx").on(sql`lower(${table.username})`),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const accounts = pgTable("accounts", {
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

export const loginEvents = pgTable(
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("login_events_outcome_idx").on(table.outcome),
    index("login_events_user_idx").on(table.userId),
    index("login_events_created_at_idx").on(table.createdAt),
  ]
);

export const auditEvents = pgTable(
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
    createdAt: timestamp("created_at", { withTimezone: true })
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

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    encryptedKey: text("encrypted_key"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("admin"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    index("api_keys_key_prefix_idx").on(table.keyPrefix),
  ]
);

export const groups = pgTable(
  "groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    description: text("description"),
    instructorId: text("instructor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    isArchived: boolean("is_archived").default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("groups_instructor_id_idx").on(table.instructorId),
  ]
);

export const enrollments = pgTable(
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
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("enrollments_user_group_idx").on(table.userId, table.groupId),
    index("enrollments_user_idx").on(table.userId),
    index("enrollments_group_idx").on(table.groupId),
  ]
);

export const groupInstructors = pgTable(
  "group_instructors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "co_instructor" | "ta"
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("group_instructors_group_user_idx").on(table.groupId, table.userId),
    index("group_instructors_user_idx").on(table.userId),
    index("group_instructors_group_idx").on(table.groupId),
  ]
);

export const problems = pgTable(
  "problems",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    sequenceNumber: integer("sequence_number"),
    title: text("title").notNull(),
    description: text("description"),
    timeLimitMs: integer("time_limit_ms").default(2000),
    memoryLimitMb: integer("memory_limit_mb").default(256),
    problemType: text("problem_type").notNull().default("auto"),
    visibility: text("visibility").default("private"),
    showCompileOutput: boolean("show_compile_output").notNull().default(true),
    showDetailedResults: boolean("show_detailed_results").notNull().default(true),
    showRuntimeErrors: boolean("show_runtime_errors").notNull().default(true),
    allowAiAssistant: boolean("allow_ai_assistant").notNull().default(true),
    comparisonMode: text("comparison_mode").notNull().default("exact"),
    floatAbsoluteError: doublePrecision("float_absolute_error"),
    floatRelativeError: doublePrecision("float_relative_error"),
    difficulty: doublePrecision("difficulty"),
    defaultLanguage: text("default_language"),
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("problems_created_at_idx").on(table.createdAt),
  ]
);

export const testCases = pgTable(
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
    isVisible: boolean("is_visible").default(false),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [index("test_cases_problem_idx").on(table.problemId)]
);

export const problemGroupAccess = pgTable(
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

export const assignments = pgTable(
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
    startsAt: timestamp("starts_at", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }),
    lateDeadline: timestamp("late_deadline", { withTimezone: true }),
    latePenalty: doublePrecision("late_penalty").default(0),
    examMode: text("exam_mode").$type<ExamMode>().notNull().default("none"),
    visibility: text("visibility").$type<AssignmentVisibility>().notNull().default("private"),
    examDurationMinutes: integer("exam_duration_minutes"),
    scoringModel: text("scoring_model").$type<ScoringModel>().notNull().default("ioi"),
    accessCode: text("access_code"),
    freezeLeaderboardAt: timestamp("freeze_leaderboard_at", { withTimezone: true }),
    enableAntiCheat: boolean("enable_anti_cheat").notNull().default(false),
    anonymousLeaderboard: boolean("anonymous_leaderboard").default(false),
    showResultsToCandidate: boolean("show_results_to_candidate").notNull().default(false),
    hideScoresFromCandidates: boolean("hide_scores_from_candidates").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("assignments_group_idx").on(table.groupId),
    uniqueIndex("assignments_access_code_unique").on(table.accessCode),
  ]
);

export const examSessions = pgTable(
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
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    personalDeadline: timestamp("personal_deadline", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
  },
  (table) => [
    uniqueIndex("exam_sessions_assignment_user_idx").on(table.assignmentId, table.userId),
    index("exam_sessions_assignment_idx").on(table.assignmentId),
    index("exam_sessions_user_idx").on(table.userId),
  ]
);

export const assignmentProblems = pgTable(
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

export const judgeWorkers = pgTable(
  "judge_workers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    hostname: text("hostname").notNull(),
    alias: text("alias"),
    ipAddress: text("ip_address"),
    secretToken: text("secret_token"),
    concurrency: integer("concurrency").notNull().default(1),
    activeTasks: integer("active_tasks").notNull().default(0),
    version: text("version"),
    cpuModel: text("cpu_model"),
    architecture: text("architecture"),
    labels: jsonb("labels").$type<string[]>().default([]),
    status: text("status").notNull().default("online"),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    deregisteredAt: timestamp("deregistered_at", { withTimezone: true }),
  },
  (table) => [
    index("judge_workers_status_idx").on(table.status),
    index("judge_workers_last_heartbeat_idx").on(table.lastHeartbeatAt),
  ]
);

export const submissions = pgTable(
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
    judgeClaimedAt: timestamp("judge_claimed_at", { withTimezone: true }),
    judgeWorkerId: text("judge_worker_id"),
    compileOutput: text("compile_output"),
    executionTimeMs: integer("execution_time_ms"),
    memoryUsedKb: integer("memory_used_kb"),
    failedTestCaseIndex: integer("failed_test_case_index"),
    runtimeErrorType: text("runtime_error_type"),
    score: doublePrecision("score"),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
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
    index("submissions_judge_worker_idx").on(table.judgeWorkerId),
    index("submissions_submitted_at_idx").on(table.submittedAt),
    index("submissions_leaderboard_idx").on(table.assignmentId, table.userId, table.submittedAt),
  ]
);

export const languageConfigs = pgTable("language_configs", {
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
  isEnabled: boolean("is_enabled").default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const systemSettings = pgTable("system_settings", {
  id: text("id")
    .primaryKey()
    .default("global"),
  siteTitle: text("site_title"),
  siteDescription: text("site_description"),
  siteIconUrl: text("site_icon_url"),
  timeZone: text("time_zone"),
  platformMode: text("platform_mode").$type<PlatformMode>().notNull().default("homework"),
  aiAssistantEnabled: boolean("ai_assistant_enabled").notNull().default(true),
  publicSignupEnabled: boolean("public_signup_enabled").notNull().default(false),
  signupHcaptchaEnabled: boolean("signup_hcaptcha_enabled").notNull().default(false),
  hcaptchaSiteKey: text("hcaptcha_site_key"),
  hcaptchaSecret: text("hcaptcha_secret"),
  // Rate Limiting (Login)
  loginRateLimitMaxAttempts: integer("login_rate_limit_max_attempts"),
  loginRateLimitWindowMs: integer("login_rate_limit_window_ms"),
  loginRateLimitBlockMs: integer("login_rate_limit_block_ms"),
  // Rate Limiting (API)
  apiRateLimitMax: integer("api_rate_limit_max"),
  apiRateLimitWindowMs: integer("api_rate_limit_window_ms"),
  // Rate Limiting (Submissions)
  submissionRateLimitMaxPerMinute: integer("submission_rate_limit_max_per_minute"),
  submissionMaxPending: integer("submission_max_pending"),
  submissionGlobalQueueLimit: integer("submission_global_queue_limit"),
  // Judge Defaults
  defaultTimeLimitMs: integer("default_time_limit_ms"),
  defaultMemoryLimitMb: integer("default_memory_limit_mb"),
  maxSourceCodeSizeBytes: integer("max_source_code_size_bytes"),
  staleClaimTimeoutMs: integer("stale_claim_timeout_ms"),
  // Session & Auth
  sessionMaxAgeSeconds: integer("session_max_age_seconds"),
  minPasswordLength: integer("min_password_length"),
  // Pagination
  defaultPageSize: integer("default_page_size"),
  // Real-time / SSE
  maxSseConnectionsPerUser: integer("max_sse_connections_per_user"),
  ssePollIntervalMs: integer("sse_poll_interval_ms"),
  sseTimeoutMs: integer("sse_timeout_ms"),
  // Compiler
  compilerTimeLimitMs: integer("compiler_time_limit_ms"),
  // File Uploads
  uploadMaxImageSizeBytes: integer("upload_max_image_size_bytes"),
  uploadMaxFileSizeBytes: integer("upload_max_file_size_bytes"),
  uploadMaxImageDimension: integer("upload_max_image_dimension"),
  // Default Language
  defaultLanguage: text("default_language"),
  // Default UI Locale (fallback when no cookie/accept-language match)
  defaultLocale: text("default_locale"),
  // Allowed Hosts (JSON array of domain strings)
  allowedHosts: text("allowed_hosts"),
  // Home Page Content (locale-keyed JSON overrides for jumbotron + section cards)
  homePageContent: jsonb("home_page_content").$type<Record<string, {
    eyebrow?: string;
    title?: string;
    description?: string;
    cards?: {
      practice?: { title?: string; description?: string };
      playground?: { title?: string; description?: string };
      contests?: { title?: string; description?: string };
      community?: { title?: string; description?: string };
    };
  }>>(),
  // Footer Content (locale-keyed JSON overrides for copyright text and custom links)
  footerContent: jsonb("footer_content").$type<Record<string, {
    copyrightText?: string;
    links?: { label: string; url: string }[];
  }>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    key: text("key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: bigint("window_started_at", { mode: "number" }).notNull(),
    blockedUntil: bigint("blocked_until", { mode: "number" }),
    consecutiveBlocks: integer("consecutive_blocks").default(0),
    lastAttempt: bigint("last_attempt", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("rate_limits_key_idx").on(table.key),
    index("rate_limits_last_attempt_idx").on(table.lastAttempt),
  ]
);

export const submissionComments = pgTable(
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
    lineNumber: integer("line_number"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("sc_submission_idx").on(table.submissionId),
    index("sc_author_idx").on(table.authorId),
  ]
);

export const scoreOverrides = pgTable(
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
    overrideScore: doublePrecision("override_score").notNull(),
    reason: text("reason"),
    createdBy: text("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
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

export const contestAnnouncements = pgTable(
  "contest_announcements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("contest_announcements_assignment_idx").on(table.assignmentId),
    index("contest_announcements_pinned_idx").on(table.assignmentId, table.isPinned, table.createdAt),
  ]
);

export const contestClarifications = pgTable(
  "contest_clarifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    problemId: text("problem_id").references(() => problems.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    answerType: text("answer_type"),
    answeredBy: text("answered_by").references(() => users.id, { onDelete: "set null" }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("contest_clarifications_assignment_idx").on(table.assignmentId, table.createdAt),
    index("contest_clarifications_problem_idx").on(table.problemId),
    index("contest_clarifications_user_idx").on(table.userId),
  ]
);

export const problemSets = pgTable("problem_sets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const problemSetProblems = pgTable(
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

export const problemSetGroupAccess = pgTable(
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
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("psga_problem_set_idx").on(table.problemSetId),
    index("psga_group_idx").on(table.groupId),
    uniqueIndex("psga_problem_set_group_idx").on(table.problemSetId, table.groupId),
  ]
);

export const submissionResults = pgTable(
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

export const plugins = pgTable("plugins", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant" | "system"
  content: text("content").notNull(),
  /** Tracks whether the assistant response completed fully or was interrupted. */
  completionStatus: text("completion_status"), // "complete" | "partial" | "error" — null for user messages
  problemId: text("problem_id"),
  model: text("model"),
  provider: text("provider"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const discussionThreads = pgTable(
  "discussion_threads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    scopeType: text("scope_type").notNull(),
    problemId: text("problem_id").references(() => problems.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("dt_scope_idx").on(table.scopeType),
    index("dt_problem_idx").on(table.problemId),
    index("dt_updated_at_idx").on(table.updatedAt),
  ]
);

export const discussionPosts = pgTable(
  "discussion_posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    threadId: text("thread_id")
      .notNull()
      .references(() => discussionThreads.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("dp_thread_idx").on(table.threadId),
    index("dp_author_idx").on(table.authorId),
    index("dp_created_at_idx").on(table.createdAt),
  ]
);

export const communityVotes = pgTable(
  "community_votes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    voteType: text("vote_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("cv_target_idx").on(table.targetType, table.targetId),
    uniqueIndex("cv_target_user_idx").on(table.targetType, table.targetId, table.userId),
  ]
);

export const recruitingInvitations = pgTable(
  "recruiting_invitations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    candidateName: text("candidate_name").notNull(),
    candidateEmail: text("candidate_email"),
    metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
    status: text("status").notNull().default("pending"),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    createdBy: text("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("ri_token_idx").on(table.token),
    index("ri_assignment_idx").on(table.assignmentId),
    index("ri_status_idx").on(table.status),
    index("ri_user_idx").on(table.userId),
    index("ri_created_at_idx").on(table.createdAt),
  ]
);

export const codeSnapshots = pgTable(
  "code_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id")
      .references(() => assignments.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    sourceCode: text("source_code").notNull(),
    charCount: integer("char_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("cs_user_problem_idx").on(table.userId, table.problemId, table.assignmentId),
    index("cs_created_at_idx").on(table.createdAt),
  ]
);

export const contestAccessTokens = pgTable(
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
    redeemedAt: timestamp("redeemed_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    ipAddress: text("ip_address"),
  },
  (table) => [
    uniqueIndex("cat_assignment_user_idx").on(table.assignmentId, table.userId),
  ]
);

export const roles = pgTable(
  "roles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text("name").unique().notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    level: integer("level").notNull().default(0),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("roles_name_idx").on(table.name),
    index("roles_level_idx").on(table.level),
  ]
);

export const tags = pgTable(
  "tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text("name").unique().notNull(),
    color: text("color"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  }
);

export const problemTags = pgTable(
  "problem_tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("pt_problem_idx").on(table.problemId),
    index("pt_tag_idx").on(table.tagId),
    uniqueIndex("pt_problem_tag_idx").on(table.problemId, table.tagId),
  ]
);

export const antiCheatEvents = pgTable(
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("ace_assignment_user_idx").on(table.assignmentId, table.userId),
    index("ace_assignment_type_idx").on(table.assignmentId, table.eventType),
    index("ace_assignment_created_idx").on(table.assignmentId, table.createdAt),
  ]
);

export const files = pgTable(
  "files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    originalName: text("original_name").notNull(),
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category").notNull().default("attachment"),
    width: integer("width"),
    height: integer("height"),
    problemId: text("problem_id")
      .references(() => problems.id, { onDelete: "set null" }),
    uploadedBy: text("uploaded_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("files_problem_id_idx").on(table.problemId),
    index("files_uploaded_by_idx").on(table.uploadedBy),
    index("files_category_idx").on(table.category),
    index("files_created_at_idx").on(table.createdAt),
  ]
);
