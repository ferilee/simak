import { relations } from "drizzle-orm";
import { users } from "./users";
import { classes, classMembers } from "./classes";
import { modules, moduleBlocks } from "./modules";
import { worksheets, worksheetItems } from "./worksheets";
import { worksheetAttempts, worksheetAnswers, groupContributionRatings, worksheetAttemptMemberScores } from "./worksheet-attempts";
import { assignments, assignmentClasses } from "./assignments";
import { assignmentGroups, assignmentGroupMembers } from "./groups";
import { submissions, submissionAnswers } from "./submissions";
import { activityLogs, exitTickets } from "./activity";
import { xpLedger } from "./xp";
import { integrityEvents } from "./integrity";
import { ruasScores } from "./ruas-scores";

export const usersRelations = relations(users, ({ many }) => ({
  taughtClasses: many(classes),
  classMemberships: many(classMembers),
  modules: many(modules),
  submissions: many(submissions),
  worksheetAttempts: many(worksheetAttempts),
  activityLogs: many(activityLogs),
  xpLedger: many(xpLedger),
  integrityEvents: many(integrityEvents),
  ruasScores: many(ruasScores),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  teacher: one(users, { fields: [classes.teacherId], references: [users.id] }),
  members: many(classMembers),
  assignmentLinks: many(assignmentClasses),
}));

export const classMembersRelations = relations(classMembers, ({ one }) => ({
  class: one(classes, { fields: [classMembers.classId], references: [classes.id] }),
  student: one(users, { fields: [classMembers.studentId], references: [users.id] }),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  teacher: one(users, { fields: [modules.teacherId], references: [users.id] }),
  blocks: many(moduleBlocks),
  worksheets: many(worksheets),
}));

export const moduleBlocksRelations = relations(moduleBlocks, ({ one }) => ({
  module: one(modules, { fields: [moduleBlocks.moduleId], references: [modules.id] }),
}));

export const worksheetsRelations = relations(worksheets, ({ one, many }) => ({
  module: one(modules, { fields: [worksheets.moduleId], references: [modules.id] }),
  teacher: one(users, { fields: [worksheets.teacherId], references: [users.id] }),
  items: many(worksheetItems),
  attempts: many(worksheetAttempts),
}));

export const worksheetItemsRelations = relations(worksheetItems, ({ one, many }) => ({
  worksheet: one(worksheets, { fields: [worksheetItems.worksheetId], references: [worksheets.id] }),
  answers: many(worksheetAnswers),
}));

export const worksheetAttemptsRelations = relations(worksheetAttempts, ({ one, many }) => ({
  worksheet: one(worksheets, { fields: [worksheetAttempts.worksheetId], references: [worksheets.id] }),
  student: one(users, { fields: [worksheetAttempts.studentId], references: [users.id] }),
  group: one(assignmentGroups, { fields: [worksheetAttempts.groupId], references: [assignmentGroups.id] }),
  answers: many(worksheetAnswers),
  contributionRatings: many(groupContributionRatings),
  memberScores: many(worksheetAttemptMemberScores),
}));

export const groupContributionRatingsRelations = relations(groupContributionRatings, ({ one }) => ({
  attempt: one(worksheetAttempts, { fields: [groupContributionRatings.attemptId], references: [worksheetAttempts.id] }),
  rater: one(users, { fields: [groupContributionRatings.raterStudentId], references: [users.id] }),
  ratee: one(users, { fields: [groupContributionRatings.rateeStudentId], references: [users.id] }),
}));

export const worksheetAttemptMemberScoresRelations = relations(worksheetAttemptMemberScores, ({ one }) => ({
  attempt: one(worksheetAttempts, { fields: [worksheetAttemptMemberScores.attemptId], references: [worksheetAttempts.id] }),
  student: one(users, { fields: [worksheetAttemptMemberScores.studentId], references: [users.id] }),
}));

export const worksheetAnswersRelations = relations(worksheetAnswers, ({ one }) => ({
  attempt: one(worksheetAttempts, { fields: [worksheetAnswers.attemptId], references: [worksheetAttempts.id] }),
  item: one(worksheetItems, { fields: [worksheetAnswers.worksheetItemId], references: [worksheetItems.id] }),
  lastEditor: one(users, { fields: [worksheetAnswers.lastEditedBy], references: [users.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  teacher: one(users, { fields: [assignments.teacherId], references: [users.id] }),
  module: one(modules, { fields: [assignments.moduleId], references: [modules.id] }),
  worksheet: one(worksheets, { fields: [assignments.worksheetId], references: [worksheets.id] }),
  classLinks: many(assignmentClasses),
  groups: many(assignmentGroups),
  submissions: many(submissions),
  exitTickets: many(exitTickets),
  integrityEvents: many(integrityEvents),
  ruasScores: many(ruasScores),
}));

export const assignmentClassesRelations = relations(assignmentClasses, ({ one }) => ({
  assignment: one(assignments, { fields: [assignmentClasses.assignmentId], references: [assignments.id] }),
  class: one(classes, { fields: [assignmentClasses.classId], references: [classes.id] }),
}));

export const assignmentGroupsRelations = relations(assignmentGroups, ({ one, many }) => ({
  assignment: one(assignments, { fields: [assignmentGroups.assignmentId], references: [assignments.id] }),
  class: one(classes, { fields: [assignmentGroups.classId], references: [classes.id] }),
  members: many(assignmentGroupMembers),
  attempts: many(worksheetAttempts),
}));

export const assignmentGroupMembersRelations = relations(assignmentGroupMembers, ({ one }) => ({
  group: one(assignmentGroups, { fields: [assignmentGroupMembers.groupId], references: [assignmentGroups.id] }),
  assignment: one(assignments, { fields: [assignmentGroupMembers.assignmentId], references: [assignments.id] }),
  student: one(users, { fields: [assignmentGroupMembers.studentId], references: [users.id] }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  assignment: one(assignments, { fields: [submissions.assignmentId], references: [assignments.id] }),
  student: one(users, { fields: [submissions.studentId], references: [users.id] }),
  answers: many(submissionAnswers),
}));

export const submissionAnswersRelations = relations(submissionAnswers, ({ one }) => ({
  submission: one(submissions, { fields: [submissionAnswers.submissionId], references: [submissions.id] }),
  item: one(worksheetItems, { fields: [submissionAnswers.worksheetItemId], references: [worksheetItems.id] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  student: one(users, { fields: [activityLogs.studentId], references: [users.id] }),
  assignment: one(assignments, { fields: [activityLogs.assignmentId], references: [assignments.id] }),
}));

export const exitTicketsRelations = relations(exitTickets, ({ one }) => ({
  assignment: one(assignments, { fields: [exitTickets.assignmentId], references: [assignments.id] }),
  student: one(users, { fields: [exitTickets.studentId], references: [users.id] }),
}));

export const xpLedgerRelations = relations(xpLedger, ({ one }) => ({
  student: one(users, { fields: [xpLedger.studentId], references: [users.id] }),
}));

export const integrityEventsRelations = relations(integrityEvents, ({ one }) => ({
  assignment: one(assignments, { fields: [integrityEvents.assignmentId], references: [assignments.id] }),
  student: one(users, { fields: [integrityEvents.studentId], references: [users.id] }),
}));

export const ruasScoresRelations = relations(ruasScores, ({ one }) => ({
  assignment: one(assignments, { fields: [ruasScores.assignmentId], references: [assignments.id] }),
  teacher: one(users, { fields: [ruasScores.teacherId], references: [users.id] }),
  student: one(users, { fields: [ruasScores.studentId], references: [users.id] }),
}));
