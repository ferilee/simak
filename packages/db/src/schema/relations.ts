import { relations } from "drizzle-orm";
import { users } from "./users";
import { classes, classMembers } from "./classes";
import { modules, moduleBlocks } from "./modules";
import { worksheets, worksheetItems } from "./worksheets";
import { worksheetAttempts, worksheetAnswers } from "./worksheet-attempts";
import { assignments, assignmentClasses } from "./assignments";
import { submissions, submissionAnswers } from "./submissions";
import { activityLogs, exitTickets } from "./activity";

export const usersRelations = relations(users, ({ many }) => ({
  taughtClasses: many(classes),
  classMemberships: many(classMembers),
  modules: many(modules),
  submissions: many(submissions),
  worksheetAttempts: many(worksheetAttempts),
  activityLogs: many(activityLogs),
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
  answers: many(worksheetAnswers),
}));

export const worksheetAnswersRelations = relations(worksheetAnswers, ({ one }) => ({
  attempt: one(worksheetAttempts, { fields: [worksheetAnswers.attemptId], references: [worksheetAttempts.id] }),
  item: one(worksheetItems, { fields: [worksheetAnswers.worksheetItemId], references: [worksheetItems.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  teacher: one(users, { fields: [assignments.teacherId], references: [users.id] }),
  module: one(modules, { fields: [assignments.moduleId], references: [modules.id] }),
  worksheet: one(worksheets, { fields: [assignments.worksheetId], references: [worksheets.id] }),
  classLinks: many(assignmentClasses),
  submissions: many(submissions),
  exitTickets: many(exitTickets),
}));

export const assignmentClassesRelations = relations(assignmentClasses, ({ one }) => ({
  assignment: one(assignments, { fields: [assignmentClasses.assignmentId], references: [assignments.id] }),
  class: one(classes, { fields: [assignmentClasses.classId], references: [classes.id] }),
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
