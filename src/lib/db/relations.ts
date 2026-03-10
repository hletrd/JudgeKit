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
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  loginEvents: many(loginEvents),
  auditEvents: many(auditEvents),
  enrollments: many(enrollments),
  instructedGroups: many(groups),
  authoredProblems: many(problems),
  submissions: many(submissions),
  submissionComments: many(submissionComments),
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
  assignments: many(assignments),
  problemAccess: many(problemGroupAccess),
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
  groupAccess: many(problemGroupAccess),
  assignmentProblems: many(assignmentProblems),
  submissions: many(submissions),
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
    }),
    creator: one(users, {
      fields: [scoreOverrides.createdBy],
      references: [users.id],
    }),
  })
);
