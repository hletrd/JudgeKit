import {
  mysqlTable,
  text,
  varchar,
  int,
  boolean,
  timestamp,
  json,
  double,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { nanoid } from "nanoid";
import { generateSubmissionId } from "@/lib/submissions/id";
import type { AssignmentVisibility, ExamMode, PlatformMode, ScoringModel } from "@/types";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  username: varchar("username", { length: 255 }).unique().notNull(),
  email: varchar("email", { length: 255 }).unique(),
  name: text("name").notNull(),
  className: varchar("class_name", { length: 255 }),
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 255 })
    .notNull()
    .default("student")
    .references(() => roles.name, { onDelete: "restrict" }),
  isActive: boolean("is_active").default(true),
  mustChangePassword: boolean("must_change_password").default(false),
  tokenInvalidatedAt: timestamp("token_invalidated_at"),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  preferredLanguage: varchar("preferred_language", { length: 255 }),
  preferredTheme: varchar("preferred_theme", { length: 255 }),
  shareAcceptedSolutions: boolean("share_accepted_solutions").notNull().default(true),
  acceptedSolutionsAnonymous: boolean("accepted_solutions_anonymous").notNull().default(false),
  editorTheme: varchar("editor_theme", { length: 255 }),
  editorFontSize: varchar("editor_font_size", { length: 255 }),
  editorFontFamily: varchar("editor_font_family", { length: 255 }),
  lectureMode: varchar("lecture_mode", { length: 255 }),
  lectureFontScale: varchar("lecture_font_scale", { length: 255 }),
  lectureColorScheme: varchar("lecture_color_scheme", { length: 255 }),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const sessions = mysqlTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
});

export const accounts = mysqlTable("accounts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 255 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: int("expires_at"),
  token_type: varchar("token_type", { length: 255 }),
  scope: varchar("scope", { length: 255 }),
  id_token: text("id_token"),
  session_state: varchar("session_state", { length: 255 }),
});

export const loginEvents = mysqlTable(
  "login_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    outcome: varchar("outcome", { length: 255 }).notNull(),
    attemptedIdentifier: varchar("attempted_identifier", { length: 255 }),
    userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: text("user_agent"),
    requestMethod: varchar("request_method", { length: 255 }),
    requestPath: varchar("request_path", { length: 255 }),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("login_events_outcome_idx").on(table.outcome),
    index("login_events_user_idx").on(table.userId),
    index("login_events_created_at_idx").on(table.createdAt),
  ]
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    actorId: varchar("actor_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    actorRole: varchar("actor_role", { length: 255 }),
    action: varchar("action", { length: 255 }).notNull(),
    resourceType: varchar("resource_type", { length: 255 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    resourceLabel: varchar("resource_label", { length: 255 }),
    summary: text("summary").notNull(),
    details: text("details"),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: text("user_agent"),
    requestMethod: varchar("request_method", { length: 255 }),
    requestPath: varchar("request_path", { length: 255 }),
    createdAt: timestamp("created_at")
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

export const apiKeys = mysqlTable(
  "api_keys",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: varchar("name", { length: 255 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 255 }).notNull(),
    encryptedKey: varchar("encrypted_key", { length: 512 }),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 255 }).notNull().default("admin"),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    index("api_keys_key_prefix_idx").on(table.keyPrefix),
  ]
);

export const groups = mysqlTable("groups", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  instructorId: varchar("instructor_id", { length: 36 }).references(() => users.id, {
    onDelete: "set null",
  }),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const enrollments = mysqlTable(
  "enrollments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("enrollments_user_group_idx").on(table.userId, table.groupId),
    index("enrollments_user_idx").on(table.userId),
    index("enrollments_group_idx").on(table.groupId),
  ]
);

export const groupInstructors = mysqlTable(
  "group_instructors",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 255 }).notNull(),
    assignedAt: timestamp("assigned_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("group_instructors_group_user_idx").on(table.groupId, table.userId),
    index("group_instructors_user_idx").on(table.userId),
    index("group_instructors_group_idx").on(table.groupId),
  ]
);

export const problems = mysqlTable("problems", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  sequenceNumber: int("sequence_number"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  timeLimitMs: int("time_limit_ms").default(2000),
  memoryLimitMb: int("memory_limit_mb").default(256),
  problemType: varchar("problem_type", { length: 32 }).notNull().default("auto"),
  visibility: varchar("visibility", { length: 255 }).default("private"),
  showCompileOutput: boolean("show_compile_output").notNull().default(true),
  showDetailedResults: boolean("show_detailed_results").notNull().default(true),
  showRuntimeErrors: boolean("show_runtime_errors").notNull().default(true),
  allowAiAssistant: boolean("allow_ai_assistant").notNull().default(true),
  comparisonMode: varchar("comparison_mode", { length: 255 }).notNull().default("exact"),
  floatAbsoluteError: double("float_absolute_error"),
  floatRelativeError: double("float_relative_error"),
  difficulty: double("difficulty"),
  defaultLanguage: varchar("default_language", { length: 255 }),
  authorId: varchar("author_id", { length: 36 }).references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  // NOTE: $defaultFn only fires on INSERT. Use withUpdatedAt() from @/lib/db/helpers for every UPDATE.
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const testCases = mysqlTable(
  "test_cases",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    expectedOutput: text("expected_output").notNull(),
    isVisible: boolean("is_visible").default(false),
    sortOrder: int("sort_order").default(0),
  },
  (table) => [index("test_cases_problem_idx").on(table.problemId)]
);

export const problemGroupAccess = mysqlTable(
  "problem_group_access",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("pga_problem_idx").on(table.problemId),
    index("pga_group_idx").on(table.groupId),
    uniqueIndex("pga_problem_group_idx").on(table.problemId, table.groupId),
  ]
);

export const assignments = mysqlTable(
  "assignments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at"),
    deadline: timestamp("deadline"),
    lateDeadline: timestamp("late_deadline"),
    latePenalty: double("late_penalty").default(0),
    examMode: varchar("exam_mode", { length: 255 }).$type<ExamMode>().notNull().default("none"),
    visibility: varchar("visibility", { length: 255 }).$type<AssignmentVisibility>().notNull().default("private"),
    examDurationMinutes: int("exam_duration_minutes"),
    scoringModel: varchar("scoring_model", { length: 255 }).$type<ScoringModel>().notNull().default("ioi"),
    accessCode: varchar("access_code", { length: 255 }),
    freezeLeaderboardAt: timestamp("freeze_leaderboard_at"),
    enableAntiCheat: boolean("enable_anti_cheat").notNull().default(false),
    anonymousLeaderboard: boolean("anonymous_leaderboard").default(false),
    showResultsToCandidate: boolean("show_results_to_candidate").notNull().default(false),
    hideScoresFromCandidates: boolean("hide_scores_from_candidates").notNull().default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("assignments_group_idx").on(table.groupId),
    uniqueIndex("assignments_access_code_unique").on(table.accessCode),
  ]
);

export const examSessions = mysqlTable(
  "exam_sessions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull(),
    personalDeadline: timestamp("personal_deadline").notNull(),
    ipAddress: varchar("ip_address", { length: 255 }),
  },
  (table) => [
    uniqueIndex("exam_sessions_assignment_user_idx").on(table.assignmentId, table.userId),
    index("exam_sessions_assignment_idx").on(table.assignmentId),
    index("exam_sessions_user_idx").on(table.userId),
  ]
);

export const assignmentProblems = mysqlTable(
  "assignment_problems",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    points: int("points").default(100),
    sortOrder: int("sort_order").default(0),
  },
  (table) => [
    index("ap_assignment_idx").on(table.assignmentId),
    index("ap_problem_idx").on(table.problemId),
    uniqueIndex("ap_assignment_problem_idx").on(table.assignmentId, table.problemId),
  ]
);

export const judgeWorkers = mysqlTable(
  "judge_workers",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    hostname: varchar("hostname", { length: 255 }).notNull(),
    alias: varchar("alias", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 255 }),
    secretToken: text("secret_token"),
    secretTokenHash: varchar("secret_token_hash", { length: 64 }),
    concurrency: int("concurrency").notNull().default(1),
    activeTasks: int("active_tasks").notNull().default(0),
    version: varchar("version", { length: 255 }),
    cpuModel: varchar("cpu_model", { length: 255 }),
    architecture: varchar("architecture", { length: 64 }),
    labels: json("labels").$type<string[]>().default([]),
    status: varchar("status", { length: 255 }).notNull().default("online"),
    registeredAt: timestamp("registered_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    lastHeartbeatAt: timestamp("last_heartbeat_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    deregisteredAt: timestamp("deregistered_at"),
  },
  (table) => [
    index("judge_workers_status_idx").on(table.status),
    index("judge_workers_last_heartbeat_idx").on(table.lastHeartbeatAt),
  ]
);

export const submissions = mysqlTable(
  "submissions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateSubmissionId()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    assignmentId: varchar("assignment_id", { length: 36 }).references(() => assignments.id, {
      onDelete: "set null",
    }),
    language: varchar("language", { length: 255 }).notNull(),
    sourceCode: text("source_code").notNull(),
    status: varchar("status", { length: 255 }).default("pending"),
    judgeClaimToken: varchar("judge_claim_token", { length: 255 }),
    judgeClaimedAt: timestamp("judge_claimed_at"),
    judgeWorkerId: varchar("judge_worker_id", { length: 36 }),
    compileOutput: text("compile_output"),
    executionTimeMs: int("execution_time_ms"),
    memoryUsedKb: int("memory_used_kb"),
    failedTestCaseIndex: int("failed_test_case_index"),
    runtimeErrorType: text("runtime_error_type"),
    score: double("score"),
    judgedAt: timestamp("judged_at"),
    ipAddress: varchar("ip_address", { length: 255 }),
    submittedAt: timestamp("submitted_at")
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
  ]
);

export const languageConfigs = mysqlTable("language_configs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  language: varchar("language", { length: 255 }).unique().notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  standard: varchar("standard", { length: 255 }),
  extension: varchar("extension", { length: 255 }).notNull(),
  dockerImage: varchar("docker_image", { length: 255 }).notNull(),
  compiler: varchar("compiler", { length: 255 }),
  compileCommand: text("compile_command"),
  runCommand: text("run_command").notNull(),
  dockerfile: text("dockerfile"),
  isEnabled: boolean("is_enabled").default(true),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const systemSettings = mysqlTable("system_settings", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => "global"),
  siteTitle: varchar("site_title", { length: 255 }),
  siteDescription: text("site_description"),
  siteIconUrl: varchar("site_icon_url", { length: 2048 }),
  timeZone: varchar("time_zone", { length: 255 }),
  defaultLanguage: varchar("default_language", { length: 255 }),
  platformMode: varchar("platform_mode", { length: 255 }).$type<PlatformMode>().notNull().default("homework"),
  aiAssistantEnabled: boolean("ai_assistant_enabled").notNull().default(true),
  publicSignupEnabled: boolean("public_signup_enabled").notNull().default(false),
  signupHcaptchaEnabled: boolean("signup_hcaptcha_enabled").notNull().default(false),
  hcaptchaSiteKey: varchar("hcaptcha_site_key", { length: 255 }),
  hcaptchaSecret: varchar("hcaptcha_secret", { length: 255 }),
  // Rate Limiting (Login)
  loginRateLimitMaxAttempts: int("login_rate_limit_max_attempts"),
  loginRateLimitWindowMs: int("login_rate_limit_window_ms"),
  loginRateLimitBlockMs: int("login_rate_limit_block_ms"),
  // Rate Limiting (API)
  apiRateLimitMax: int("api_rate_limit_max"),
  apiRateLimitWindowMs: int("api_rate_limit_window_ms"),
  // Rate Limiting (Submissions)
  submissionRateLimitMaxPerMinute: int("submission_rate_limit_max_per_minute"),
  submissionMaxPending: int("submission_max_pending"),
  submissionGlobalQueueLimit: int("submission_global_queue_limit"),
  // Judge Defaults
  defaultTimeLimitMs: int("default_time_limit_ms"),
  defaultMemoryLimitMb: int("default_memory_limit_mb"),
  maxSourceCodeSizeBytes: int("max_source_code_size_bytes"),
  staleClaimTimeoutMs: int("stale_claim_timeout_ms"),
  // Session & Auth
  sessionMaxAgeSeconds: int("session_max_age_seconds"),
  minPasswordLength: int("min_password_length"),
  // Pagination
  defaultPageSize: int("default_page_size"),
  // Real-time / SSE
  maxSseConnectionsPerUser: int("max_sse_connections_per_user"),
  ssePollIntervalMs: int("sse_poll_interval_ms"),
  sseTimeoutMs: int("sse_timeout_ms"),
  // Compiler
  compilerTimeLimitMs: int("compiler_time_limit_ms"),
  // File Uploads
  uploadMaxImageSizeBytes: int("upload_max_image_size_bytes"),
  uploadMaxFileSizeBytes: int("upload_max_file_size_bytes"),
  uploadMaxImageDimension: int("upload_max_image_dimension"),
  // Default UI Locale (fallback when no cookie/accept-language match)
  defaultLocale: varchar("default_locale", { length: 255 }),
  // Allowed Hosts (JSON array of domain strings)
  allowedHosts: text("allowed_hosts"),
  // Home Page Content (locale-keyed JSON overrides for jumbotron + section cards)
  homePageContent: json("home_page_content").$type<Record<string, {
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
  footerContent: json("footer_content").$type<Record<string, {
    copyrightText?: string;
    links?: { label: string; url: string }[];
  }>>(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const rateLimits = mysqlTable(
  "rate_limits",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    key: varchar("key", { length: 255 }).notNull(),
    attempts: int("attempts").notNull().default(0),
    windowStartedAt: bigint("window_started_at", { mode: "number" }).notNull(),
    blockedUntil: bigint("blocked_until", { mode: "number" }),
    consecutiveBlocks: int("consecutive_blocks").default(0),
    lastAttempt: bigint("last_attempt", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("rate_limits_key_idx").on(table.key),
  ]
);

export const submissionComments = mysqlTable(
  "submission_comments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    submissionId: varchar("submission_id", { length: 36 })
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    authorId: varchar("author_id", { length: 36 })
      .references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    lineNumber: int("line_number"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("sc_submission_idx").on(table.submissionId),
    index("sc_author_idx").on(table.authorId),
  ]
);

export const scoreOverrides = mysqlTable(
  "score_overrides",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    overrideScore: double("override_score").notNull(),
    reason: text("reason"),
    createdBy: varchar("created_by", { length: 36 })
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
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

export const contestAnnouncements = mysqlTable(
  "contest_announcements",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdBy: varchar("created_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("contest_announcements_assignment_idx").on(table.assignmentId),
    index("contest_announcements_pinned_idx").on(table.assignmentId, table.isPinned, table.createdAt),
  ]
);

export const contestClarifications = mysqlTable(
  "contest_clarifications",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    problemId: varchar("problem_id", { length: 36 }).references(() => problems.id, {
      onDelete: "set null",
    }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    answerType: varchar("answer_type", { length: 32 }),
    answeredBy: varchar("answered_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    answeredAt: timestamp("answered_at"),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("contest_clarifications_assignment_idx").on(table.assignmentId, table.createdAt),
    index("contest_clarifications_problem_idx").on(table.problemId),
    index("contest_clarifications_user_idx").on(table.userId),
  ]
);

export const problemSets = mysqlTable("problem_sets", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const problemSetProblems = mysqlTable(
  "problem_set_problems",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemSetId: varchar("problem_set_id", { length: 36 })
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    sortOrder: int("sort_order").default(0),
  },
  (table) => [
    index("psp_problem_set_idx").on(table.problemSetId),
    index("psp_problem_idx").on(table.problemId),
    uniqueIndex("psp_problem_set_problem_idx").on(table.problemSetId, table.problemId),
  ]
);

export const problemSetGroupAccess = mysqlTable(
  "problem_set_group_access",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemSetId: varchar("problem_set_id", { length: 36 })
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("psga_problem_set_idx").on(table.problemSetId),
    index("psga_group_idx").on(table.groupId),
    uniqueIndex("psga_problem_set_group_idx").on(table.problemSetId, table.groupId),
  ]
);

export const submissionResults = mysqlTable(
  "submission_results",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    submissionId: varchar("submission_id", { length: 36 })
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    testCaseId: varchar("test_case_id", { length: 36 })
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 255 }).notNull(),
    actualOutput: text("actual_output"),
    executionTimeMs: int("execution_time_ms"),
    memoryUsedKb: int("memory_used_kb"),
  },
  (table) => [
    index("sr_submission_idx").on(table.submissionId),
    index("sr_test_case_idx").on(table.testCaseId),
  ]
);

export const plugins = mysqlTable("plugins", {
  id: varchar("id", { length: 255 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  config: json("config"),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const chatMessages = mysqlTable("chat_messages", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(), // "user" | "assistant" | "system"
  content: text("content").notNull(),
  completionStatus: varchar("completion_status", { length: 32 }),
  problemId: varchar("problem_id", { length: 36 }),
  model: varchar("model", { length: 255 }),
  provider: varchar("provider", { length: 255 }),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now())),
});

export const discussionThreads = mysqlTable(
  "discussion_threads",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    scopeType: varchar("scope_type", { length: 32 }).notNull(),
    problemId: varchar("problem_id", { length: 36 }).references(() => problems.id, { onDelete: "cascade" }),
    authorId: varchar("author_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    lockedAt: timestamp("locked_at"),
    pinnedAt: timestamp("pinned_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("dt_scope_idx").on(table.scopeType),
    index("dt_problem_idx").on(table.problemId),
    index("dt_updated_at_idx").on(table.updatedAt),
  ]
);

export const discussionPosts = mysqlTable(
  "discussion_posts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    threadId: varchar("thread_id", { length: 36 })
      .notNull()
      .references(() => discussionThreads.id, { onDelete: "cascade" }),
    authorId: varchar("author_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("dp_thread_idx").on(table.threadId),
    index("dp_author_idx").on(table.authorId),
    index("dp_created_at_idx").on(table.createdAt),
  ]
);

export const communityVotes = mysqlTable(
  "community_votes",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    targetId: varchar("target_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    voteType: varchar("vote_type", { length: 16 }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("cv_target_idx").on(table.targetType, table.targetId),
    uniqueIndex("cv_target_user_idx").on(table.targetType, table.targetId, table.userId),
  ]
);

export const recruitingInvitations = mysqlTable(
  "recruiting_invitations",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }),
    candidateName: text("candidate_name").notNull(),
    candidateEmail: varchar("candidate_email", { length: 255 }),
    metadata: json("metadata").$type<Record<string, string>>().default({}),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    userId: varchar("user_id", { length: 36 })
      .references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at"),
    redeemedAt: timestamp("redeemed_at"),
    ipAddress: varchar("ip_address", { length: 255 }),
    createdBy: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("ri_token_idx").on(table.token),
    uniqueIndex("ri_token_hash_idx").on(table.tokenHash),
    index("ri_assignment_idx").on(table.assignmentId),
    index("ri_status_idx").on(table.status),
    index("ri_user_idx").on(table.userId),
    index("ri_created_at_idx").on(table.createdAt),
  ]
);

export const codeSnapshots = mysqlTable(
  "code_snapshots",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    assignmentId: varchar("assignment_id", { length: 36 })
      .references(() => assignments.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 50 }).notNull(),
    sourceCode: text("source_code").notNull(),
    charCount: int("char_count").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("cs_user_problem_idx").on(table.userId, table.problemId, table.assignmentId),
    index("cs_created_at_idx").on(table.createdAt),
  ]
);

export const contestAccessTokens = mysqlTable(
  "contest_access_tokens",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    ipAddress: varchar("ip_address", { length: 255 }),
  },
  (table) => [
    uniqueIndex("cat_assignment_user_idx").on(table.assignmentId, table.userId),
  ]
);

export const roles = mysqlTable(
  "roles",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: varchar("name", { length: 255 }).unique().notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    level: int("level").notNull().default(0),
    capabilities: json("capabilities").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("roles_name_idx").on(table.name),
    index("roles_level_idx").on(table.level),
  ]
);

export const tags = mysqlTable(
  "tags",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: varchar("name", { length: 255 }).notNull(),
    color: varchar("color", { length: 255 }),
    createdBy: varchar("created_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    uniqueIndex("tags_name_idx").on(table.name),
  ]
);

export const problemTags = mysqlTable(
  "problem_tags",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    problemId: varchar("problem_id", { length: 36 })
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    tagId: varchar("tag_id", { length: 36 })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("pt_problem_idx").on(table.problemId),
    index("pt_tag_idx").on(table.tagId),
    uniqueIndex("pt_problem_tag_idx").on(table.problemId, table.tagId),
  ]
);

export const antiCheatEvents = mysqlTable(
  "anti_cheat_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    assignmentId: varchar("assignment_id", { length: 36 })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    details: text("details"),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date(Date.now())),
  },
  (table) => [
    index("ace_assignment_user_idx").on(table.assignmentId, table.userId),
    index("ace_assignment_type_idx").on(table.assignmentId, table.eventType),
    index("ace_assignment_created_idx").on(table.assignmentId, table.createdAt),
  ]
);

export const files = mysqlTable(
  "files",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    originalName: varchar("original_name", { length: 500 }).notNull(),
    storedName: varchar("stored_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    category: varchar("category", { length: 50 }).notNull().default("attachment"),
    width: int("width"),
    height: int("height"),
    problemId: varchar("problem_id", { length: 36 })
      .references(() => problems.id, { onDelete: "set null" }),
    uploadedBy: varchar("uploaded_by", { length: 36 })
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
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
