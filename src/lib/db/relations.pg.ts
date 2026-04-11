import { relations } from "drizzle-orm";
import {
  users,
  sessions,
  accounts,
  loginEvents,
  auditEvents,
  groups,
  enrollments,
  problems,
  testCases,
  problemGroupAccess,
  assignments,
  assignmentProblems,
  submissions,
  submissionComments,
  submissionResults,
  scoreOverrides,
  problemSets,
  problemSetProblems,
  problemSetGroupAccess,
  chatMessages,
  examSessions,
  contestAccessTokens,
  antiCheatEvents,
  roles,
  judgeWorkers,
  files,
  groupInstructors,
  recruitingInvitations,
  codeSnapshots,
  tags,
  problemTags,
  apiKeys,
} from "./schema.pg";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  loginEvents: many(loginEvents),
  auditEvents: many(auditEvents),
  enrollments: many(enrollments),
  groupInstructorAssignments: many(groupInstructors),
  instructedGroups: many(groups),
  authoredProblems: many(problems),
  submissions: many(submissions),
  submissionComments: many(submissionComments),
  createdProblemSets: many(problemSets),
  chatMessages: many(chatMessages),
  examSessions: many(examSessions),
  contestAccessTokens: many(contestAccessTokens),
  antiCheatEvents: many(antiCheatEvents),
  uploadedFiles: many(files),
  createdTags: many(tags),
  createdApiKeys: many(apiKeys),
  createdRecruitingInvitations: many(recruitingInvitations),
  codeSnapshots: many(codeSnapshots),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const loginEventsRelations = relations(loginEvents, ({ one }) => ({
  user: one(users, {
    fields: [loginEvents.userId],
    references: [users.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, {
    fields: [auditEvents.actorId],
    references: [users.id],
  }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  instructor: one(users, {
    fields: [groups.instructorId],
    references: [users.id],
  }),
  enrollments: many(enrollments),
  groupInstructors: many(groupInstructors),
  assignments: many(assignments),
  problemAccess: many(problemGroupAccess),
  problemSetAccess: many(problemSetGroupAccess),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, {
    fields: [enrollments.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [enrollments.groupId],
    references: [groups.id],
  }),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  author: one(users, {
    fields: [problems.authorId],
    references: [users.id],
  }),
  testCases: many(testCases),
  files: many(files),
  groupAccess: many(problemGroupAccess),
  assignmentProblems: many(assignmentProblems),
  submissions: many(submissions),
  problemSetProblems: many(problemSetProblems),
  problemTags: many(problemTags),
  codeSnapshots: many(codeSnapshots),
}));

export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  problem: one(problems, {
    fields: [testCases.problemId],
    references: [problems.id],
  }),
  submissionResults: many(submissionResults),
}));

export const problemGroupAccessRelations = relations(
  problemGroupAccess,
  ({ one }) => ({
    problem: one(problems, {
      fields: [problemGroupAccess.problemId],
      references: [problems.id],
    }),
    group: one(groups, {
      fields: [problemGroupAccess.groupId],
      references: [groups.id],
    }),
  })
);

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  group: one(groups, {
    fields: [assignments.groupId],
    references: [groups.id],
  }),
  assignmentProblems: many(assignmentProblems),
  submissions: many(submissions),
  scoreOverrides: many(scoreOverrides),
  examSessions: many(examSessions),
  contestAccessTokens: many(contestAccessTokens),
  antiCheatEvents: many(antiCheatEvents),
  recruitingInvitations: many(recruitingInvitations),
  codeSnapshots: many(codeSnapshots),
}));

export const assignmentProblemsRelations = relations(
  assignmentProblems,
  ({ one }) => ({
    assignment: one(assignments, {
      fields: [assignmentProblems.assignmentId],
      references: [assignments.id],
    }),
    problem: one(problems, {
      fields: [assignmentProblems.problemId],
      references: [problems.id],
    }),
  })
);

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  user: one(users, {
    fields: [submissions.userId],
    references: [users.id],
  }),
  problem: one(problems, {
    fields: [submissions.problemId],
    references: [problems.id],
  }),
  assignment: one(assignments, {
    fields: [submissions.assignmentId],
    references: [assignments.id],
  }),
  judgeWorker: one(judgeWorkers, {
    fields: [submissions.judgeWorkerId],
    references: [judgeWorkers.id],
  }),
  results: many(submissionResults),
  comments: many(submissionComments),
}));

export const submissionCommentsRelations = relations(
  submissionComments,
  ({ one }) => ({
    submission: one(submissions, {
      fields: [submissionComments.submissionId],
      references: [submissions.id],
    }),
    author: one(users, {
      fields: [submissionComments.authorId],
      references: [users.id],
    }),
  })
);

export const submissionResultsRelations = relations(
  submissionResults,
  ({ one }) => ({
    submission: one(submissions, {
      fields: [submissionResults.submissionId],
      references: [submissions.id],
    }),
    testCase: one(testCases, {
      fields: [submissionResults.testCaseId],
      references: [testCases.id],
    }),
  })
);

export const scoreOverridesRelations = relations(
  scoreOverrides,
  ({ one }) => ({
    assignment: one(assignments, {
      fields: [scoreOverrides.assignmentId],
      references: [assignments.id],
    }),
    problem: one(problems, {
      fields: [scoreOverrides.problemId],
      references: [problems.id],
    }),
    user: one(users, {
      fields: [scoreOverrides.userId],
      references: [users.id],
      relationName: "scoreOverride_user",
    }),
    creator: one(users, {
      fields: [scoreOverrides.createdBy],
      references: [users.id],
      relationName: "scoreOverride_creator",
    }),
  })
);

export const problemSetsRelations = relations(problemSets, ({ one, many }) => ({
  creator: one(users, {
    fields: [problemSets.createdBy],
    references: [users.id],
  }),
  problems: many(problemSetProblems),
  groupAccess: many(problemSetGroupAccess),
}));

export const problemSetProblemsRelations = relations(
  problemSetProblems,
  ({ one }) => ({
    problemSet: one(problemSets, {
      fields: [problemSetProblems.problemSetId],
      references: [problemSets.id],
    }),
    problem: one(problems, {
      fields: [problemSetProblems.problemId],
      references: [problems.id],
    }),
  })
);

export const problemSetGroupAccessRelations = relations(
  problemSetGroupAccess,
  ({ one }) => ({
    problemSet: one(problemSets, {
      fields: [problemSetGroupAccess.problemSetId],
      references: [problemSets.id],
    }),
    group: one(groups, {
      fields: [problemSetGroupAccess.groupId],
      references: [groups.id],
    }),
  })
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
}));

export const examSessionsRelations = relations(examSessions, ({ one }) => ({
  assignment: one(assignments, {
    fields: [examSessions.assignmentId],
    references: [assignments.id],
  }),
  user: one(users, {
    fields: [examSessions.userId],
    references: [users.id],
  }),
}));

export const contestAccessTokensRelations = relations(
  contestAccessTokens,
  ({ one }) => ({
    assignment: one(assignments, {
      fields: [contestAccessTokens.assignmentId],
      references: [assignments.id],
    }),
    user: one(users, {
      fields: [contestAccessTokens.userId],
      references: [users.id],
    }),
  })
);

export const rolesRelations = relations(roles, () => ({}));

export const groupInstructorsRelations = relations(groupInstructors, ({ one }) => ({
  group: one(groups, {
    fields: [groupInstructors.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupInstructors.userId],
    references: [users.id],
  }),
}));

export const recruitingInvitationsRelations = relations(recruitingInvitations, ({ one }) => ({
  assignment: one(assignments, {
    fields: [recruitingInvitations.assignmentId],
    references: [assignments.id],
  }),
  user: one(users, {
    fields: [recruitingInvitations.userId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [recruitingInvitations.createdBy],
    references: [users.id],
    relationName: "recruitingInvitation_creator",
  }),
}));

export const codeSnapshotsRelations = relations(codeSnapshots, ({ one }) => ({
  user: one(users, {
    fields: [codeSnapshots.userId],
    references: [users.id],
  }),
  problem: one(problems, {
    fields: [codeSnapshots.problemId],
    references: [problems.id],
  }),
  assignment: one(assignments, {
    fields: [codeSnapshots.assignmentId],
    references: [assignments.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  creator: one(users, {
    fields: [tags.createdBy],
    references: [users.id],
  }),
  problemTags: many(problemTags),
}));

export const problemTagsRelations = relations(problemTags, ({ one }) => ({
  problem: one(problems, {
    fields: [problemTags.problemId],
    references: [problems.id],
  }),
  tag: one(tags, {
    fields: [problemTags.tagId],
    references: [tags.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  creator: one(users, {
    fields: [apiKeys.createdById],
    references: [users.id],
  }),
}));

export const judgeWorkersRelations = relations(judgeWorkers, ({ many }) => ({
  submissions: many(submissions),
}));

export const antiCheatEventsRelations = relations(
  antiCheatEvents,
  ({ one }) => ({
    assignment: one(assignments, {
      fields: [antiCheatEvents.assignmentId],
      references: [assignments.id],
    }),
    user: one(users, {
      fields: [antiCheatEvents.userId],
      references: [users.id],
    }),
  })
);

export const filesRelations = relations(files, ({ one }) => ({
  problem: one(problems, {
    fields: [files.problemId],
    references: [problems.id],
  }),
  uploader: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
}));
