/**
 * Default capability sets for the 4 built-in roles.
 *
 * These mirror the existing hardcoded permissions so the shim layer
 * produces identical behavior.
 */

import { ALL_CAPABILITIES, type BuiltinRoleName, type Capability } from "./types";

const STUDENT_CAPABILITIES: readonly Capability[] = [
  "content.submit_solutions",
  "content.view_own_submissions",
];

const ASSISTANT_CAPABILITIES: readonly Capability[] = [
  ...STUDENT_CAPABILITIES,
  // Submissions (view only)
  "submissions.view_all",
  "submissions.view_source",
  // Assignments (view only)
  "assignments.view_status",
  // Users (view only)
  "users.view",
  // Problems (view only)
  "problems.view_all",
  // Anti-Cheat (view only)
  "anti_cheat.view_events",
  // Files
  "files.upload",
];

const INSTRUCTOR_CAPABILITIES: readonly Capability[] = [
  ...STUDENT_CAPABILITIES,
  // Problems
  "problems.create",
  "problems.edit",
  "problems.delete",
  "problems.view_all",
  "problems.manage_visibility",
  // Groups
  "groups.create",
  "groups.edit",
  "groups.manage_members",
  // Assignments
  "assignments.create",
  "assignments.edit",
  "assignments.delete",
  "assignments.view_status",
  // Submissions
  "submissions.view_all",
  "submissions.view_source",
  "submissions.rejudge",
  "submissions.comment",
  // Problem Sets
  "problem_sets.create",
  "problem_sets.edit",
  "problem_sets.delete",
  "problem_sets.assign_groups",
  // Contests
  "contests.create",
  "contests.manage_access_codes",
  "contests.view_analytics",
  "contests.view_leaderboard_full",
  "contests.export",
  // Community
  "community.moderate",
  // Recruiting
  "recruiting.manage_invitations",
  // Anti-Cheat
  "anti_cheat.view_events",
  "anti_cheat.run_similarity",
  // Users (limited)
  "users.view",
  // Files
  "files.upload",
];

const ADMIN_CAPABILITIES: readonly Capability[] = [
  ...INSTRUCTOR_CAPABILITIES,
  // Users (full)
  "users.create",
  "users.edit",
  "users.delete",
  // Groups (full)
  "groups.delete",
  "groups.view_all",
  // Files
  "files.upload",
  "files.manage",
  // System
  "system.settings",
  "system.backup",
  "system.audit_logs",
  "system.login_logs",
  "system.plugins",
  "system.chat_logs",
];

/** super_admin always has ALL capabilities (hardcoded safety) */
const SUPER_ADMIN_CAPABILITIES: readonly Capability[] = [...ALL_CAPABILITIES];

export const DEFAULT_ROLE_CAPABILITIES: Record<BuiltinRoleName, readonly Capability[]> = {
  student: STUDENT_CAPABILITIES,
  assistant: ASSISTANT_CAPABILITIES,
  instructor: INSTRUCTOR_CAPABILITIES,
  admin: ADMIN_CAPABILITIES,
  super_admin: SUPER_ADMIN_CAPABILITIES,
};

export const DEFAULT_ROLE_LEVELS: Record<BuiltinRoleName, number> = {
  student: 0,
  assistant: 1,
  instructor: 2,
  admin: 3,
  super_admin: 4,
};

export const DEFAULT_ROLE_DISPLAY_NAMES: Record<BuiltinRoleName, string> = {
  student: "Student",
  assistant: "Assistant",
  instructor: "Instructor",
  admin: "Admin",
  super_admin: "Super Admin",
};
