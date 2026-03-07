import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  username: text("username").unique().notNull(),
  email: text("email"),
  name: text("name").notNull(),
  className: text("class_name"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("student"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).default(false),
  emailVerified: integer("email_verified", { mode: "timestamp" }),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
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
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
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
    enrolledAt: integer("enrolled_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(Date.now())
    ),
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
  authorId: text("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
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

export const problemGroupAccess = sqliteTable("problem_group_access", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
});

export const assignments = sqliteTable("assignments", {
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
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
});

export const assignmentProblems = sqliteTable("assignment_problems", {
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
});

export const submissions = sqliteTable(
  "submissions",
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
    assignmentId: text("assignment_id").references(() => assignments.id, {
      onDelete: "set null",
    }),
    language: text("language").notNull(),
    sourceCode: text("source_code").notNull(),
    status: text("status").default("pending"),
    compileOutput: text("compile_output"),
    executionTimeMs: integer("execution_time_ms"),
    memoryUsedKb: integer("memory_used_kb"),
    score: real("score"),
    judgedAt: integer("judged_at", { mode: "timestamp" }),
    submittedAt: integer("submitted_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(Date.now())
    ),
  },
  (table) => [
    index("submissions_user_problem_idx").on(table.userId, table.problemId),
    index("submissions_status_idx").on(table.status),
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
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
});

export const systemSettings = sqliteTable("system_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "global"),
  siteTitle: text("site_title"),
  siteDescription: text("site_description"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(Date.now())
  ),
});

export const submissionResults = sqliteTable("submission_results", {
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
});
