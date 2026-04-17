/**
 * Capability-based permission system types.
 *
 * Each capability represents a single, granular permission.
 * Roles are collections of capabilities.
 */

export const ALL_CAPABILITIES = [
  // User Management
  "users.view",
  "users.create",
  "users.edit",
  "users.delete",
  "users.manage_roles",

  // Problems
  "problems.create",
  "problems.edit",
  "problems.delete",
  "problems.view_all",
  "problems.manage_visibility",

  // Groups
  "groups.create",
  "groups.edit",
  "groups.delete",
  "groups.view_all",
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

  // System
  "system.settings",
  "system.backup",
  "system.audit_logs",
  "system.login_logs",
  "system.plugins",
  "system.chat_logs",

  // Files
  "files.upload",
  "files.manage",

  // Content (default student capabilities)
  "content.submit_solutions",
  "content.view_own_submissions",
] as const;

export type Capability = (typeof ALL_CAPABILITIES)[number];

export const CAPABILITY_GROUPS = {
  users: {
    labelKey: "capabilities.groups.users",
    capabilities: [
      "users.view",
      "users.create",
      "users.edit",
      "users.delete",
      "users.manage_roles",
    ],
  },
  problems: {
    labelKey: "capabilities.groups.problems",
    capabilities: [
      "problems.create",
      "problems.edit",
      "problems.delete",
      "problems.view_all",
      "problems.manage_visibility",
    ],
  },
  groups: {
    labelKey: "capabilities.groups.groups",
    capabilities: [
      "groups.create",
      "groups.edit",
      "groups.delete",
      "groups.view_all",
      "groups.manage_members",
    ],
  },
  assignments: {
    labelKey: "capabilities.groups.assignments",
    capabilities: [
      "assignments.create",
      "assignments.edit",
      "assignments.delete",
      "assignments.view_status",
    ],
  },
  submissions: {
    labelKey: "capabilities.groups.submissions",
    capabilities: [
      "submissions.view_all",
      "submissions.view_source",
      "submissions.rejudge",
      "submissions.comment",
    ],
  },
  problem_sets: {
    labelKey: "capabilities.groups.problemSets",
    capabilities: [
      "problem_sets.create",
      "problem_sets.edit",
      "problem_sets.delete",
      "problem_sets.assign_groups",
    ],
  },
  contests: {
    labelKey: "capabilities.groups.contests",
    capabilities: [
      "contests.create",
      "contests.manage_access_codes",
      "contests.view_analytics",
      "contests.view_leaderboard_full",
      "contests.export",
    ],
  },
  community: {
    labelKey: "capabilities.groups.community",
    capabilities: ["community.moderate"],
  },
  recruiting: {
    labelKey: "capabilities.groups.recruiting",
    capabilities: ["recruiting.manage_invitations"],
  },
  anti_cheat: {
    labelKey: "capabilities.groups.antiCheat",
    capabilities: ["anti_cheat.view_events", "anti_cheat.run_similarity"],
  },
  system: {
    labelKey: "capabilities.groups.system",
    capabilities: [
      "system.settings",
      "system.backup",
      "system.audit_logs",
      "system.login_logs",
      "system.plugins",
      "system.chat_logs",
    ],
  },
  files: {
    labelKey: "capabilities.groups.files",
    capabilities: ["files.upload", "files.manage"],
  },
  content: {
    labelKey: "capabilities.groups.content",
    capabilities: ["content.submit_solutions", "content.view_own_submissions"],
  },
} as const satisfies Record<
  string,
  { labelKey: string; capabilities: readonly Capability[] }
>;

export type CapabilityGroup = keyof typeof CAPABILITY_GROUPS;

/** Database role row shape */
export interface RoleRecord {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isBuiltin: boolean;
  level: number;
  capabilities: Capability[];
  createdAt: Date;
  updatedAt: Date;
}

/** The 5 built-in role names */
export type BuiltinRoleName = "super_admin" | "admin" | "instructor" | "assistant" | "student";

export const BUILTIN_ROLE_NAMES: readonly BuiltinRoleName[] = [
  "student",
  "assistant",
  "instructor",
  "admin",
  "super_admin",
];

export function isBuiltinRole(name: string): name is BuiltinRoleName {
  return BUILTIN_ROLE_NAMES.includes(name as BuiltinRoleName);
}

export function isCapability(value: string): value is Capability {
  return (ALL_CAPABILITIES as readonly string[]).includes(value);
}
