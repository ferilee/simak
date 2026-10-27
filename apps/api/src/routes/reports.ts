import { Hono } from "hono";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";

// Rekap bukti = agregasi activity_logs + worksheet_attempts + exit_tickets.
// Format laporan: JSON (default), CSV yang dapat dibuka di Excel, atau PDF.
export const reportRoutes = new Hono();
reportRoutes.use("*", requireRole("guru"));

const { activityLogs, assignmentClasses, assignments, classes, classMembers, exitTickets, ruasScores, users, worksheetAttempts } = schema;
type TargetStudent = { id: number; name: string; username: string; nis: string | null; classId: number; className: string };
type ReportRow = {
  student_id: number; name: string; username: string; class_name: string; hadir: boolean; opened_at: Date | null;
  started_lkpd_at: Date | null; submission_status: "belum" | "draf" | "terkumpul" | "dinilai"; submitted_at: Date | null;
  total_score: number | null; exit_ticket_submitted: boolean; exit_ticket_submitted_at: Date | null; ruas_opened_at: Date | null;
  ruas_score: number | null; ruas_match_status: "cocok" | "tidak_ditemukan" | "duplikat" | null;
};
type SessionReportData = {
  assignment: { id: number; title: string; opens_at: Date; due_at: Date };
  summary: { total_students: number; hadir: number; submitted: number; exit_ticket: number; ruas_scored: number; ruas_unmatched: number };
  students: ReportRow[];
  ruas_unmatched: { identifier: string; student_name: string | null; score: number; match_status: string; note: string | null }[];
};

async function ownedAssignment(userId: number, assignmentId: number) {
  const [assignment] = await db.select().from(assignments).where(and(eq(assignments.id, assignmentId), eq(assignments.teacherId, userId))).limit(1);
  return assignment;
}

async function getTargetStudents(assignmentId: number) {
  const targetStudents = await db
    .select({ id: users.id, name: users.name, username: users.username, nis: users.nis, classId: classes.id, className: classes.name })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .innerJoin(users, eq(users.id, classMembers.studentId))
    .where(and(eq(assignmentClasses.assignmentId, assignmentId), eq(classes.isArchived, false)));
  return [...new Map(targetStudents.map((student) => [student.id, student])).values()];
}

async function loadSessionReportData(userId: number, assignmentId: number): Promise<SessionReportData | null> {
  const assignment = await ownedAssignment(userId, assignmentId);
  if (!assignment) return null;
  const students = await getTargetStudents(assignmentId);
  const studentIds = students.map((student) => student.id);
  const [activities, attempts, tickets, importedRuas] = await Promise.all([
    studentIds.length ? db.select({ studentId: activityLogs.studentId, event: activityLogs.event, createdAt: activityLogs.createdAt }).from(activityLogs).where(and(eq(activityLogs.assignmentId, assignmentId), inArray(activityLogs.studentId, studentIds))) : Promise.resolve([]),
    assignment.worksheetId !== null && studentIds.length ? db.select({ studentId: worksheetAttempts.studentId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore }).from(worksheetAttempts).where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), inArray(worksheetAttempts.studentId, studentIds))) : Promise.resolve([]),
    studentIds.length ? db.select({ studentId: exitTickets.studentId, submittedAt: exitTickets.createdAt }).from(exitTickets).where(and(eq(exitTickets.assignmentId, assignmentId), inArray(exitTickets.studentId, studentIds))) : Promise.resolve([]),
    db.select({ studentId: ruasScores.studentId, identifier: ruasScores.identifier, studentName: ruasScores.studentName, score: ruasScores.score, matchStatus: ruasScores.matchStatus, note: ruasScores.note }).from(ruasScores).where(eq(ruasScores.assignmentId, assignmentId)),
  ]);

  const activitiesByStudent = new Map<number, typeof activities>();
  for (const activity of activities) activitiesByStudent.set(activity.studentId, [...(activitiesByStudent.get(activity.studentId) ?? []), activity]);
  const attemptsByStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt]));
  const ticketsByStudent = new Map(tickets.map((ticket) => [ticket.studentId, ticket]));
  const ruasByStudent = new Map<number, (typeof importedRuas)[number]>();
  for (const score of importedRuas) if (score.studentId !== null && score.matchStatus === "cocok") ruasByStudent.set(score.studentId, score);

  const rows: ReportRow[] = students.map((student) => {
    const studentActivities = activitiesByStudent.get(student.id) ?? [];
    const firstEvent = (event: (typeof activityLogs.event.enumValues)[number]) => studentActivities.filter((activity) => activity.event === event).map((activity) => activity.createdAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const openedAt = firstEvent("buka_materi");
    const attempt = attemptsByStudent.get(student.id);
    const ticket = ticketsByStudent.get(student.id);
    const ruas = ruasByStudent.get(student.id);
    const submitted = Boolean(attempt && attempt.status !== "draf") || Boolean(ticket);
    return {
      student_id: student.id, name: student.name, username: student.username, class_name: student.className,
      hadir: Boolean(openedAt && submitted), opened_at: openedAt, started_lkpd_at: firstEvent("mulai_lkpd"),
      submission_status: attempt?.status ?? "belum", submitted_at: attempt?.submittedAt ?? null,
      total_score: attempt?.totalScore === null || attempt?.totalScore === undefined ? null : Number(attempt.totalScore),
      exit_ticket_submitted: Boolean(ticket), exit_ticket_submitted_at: ticket?.submittedAt ?? null,
      ruas_opened_at: firstEvent("buka_kuis_ruas"), ruas_score: ruas ? Number(ruas.score) : null, ruas_match_status: ruas?.matchStatus ?? null,
    };
  });
  return {
    assignment: { id: assignment.id, title: assignment.title, opens_at: assignment.opensAt, due_at: assignment.dueAt },
    summary: {
      total_students: rows.length, hadir: rows.filter((row) => row.hadir).length, submitted: rows.filter((row) => row.submission_status !== "belum").length,
      exit_ticket: rows.filter((row) => row.exit_ticket_submitted).length, ruas_scored: rows.filter((row) => row.ruas_score !== null).length,
      ruas_unmatched: importedRuas.filter((row) => row.matchStatus !== "cocok").length,
    },
    students: rows,
    ruas_unmatched: importedRuas.filter((row) => row.matchStatus !== "cocok").map((row) => ({ identifier: row.identifier, student_name: row.studentName, score: Number(row.score), match_status: row.matchStatus, note: row.note })),
  };
}

reportRoutes.get("/session", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.query("assignmentId"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "assignmentId wajib berupa ID positif." }, 400);
  const data = await loadSessionReportData(user.userId, assignmentId);
  if (!data) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  return respondSessionReport(c, data, c.req.query("format"), `simak-rekap-${assignmentId}`);
});

reportRoutes.get("/range", async (c) => {
  const user = c.get("user")!;
  const from = c.req.query("from");
  const to = c.req.query("to");
  const range = parseWibRange(from, to);
  if (!range) return c.json({ ok: false, message: "from dan to wajib berformat YYYY-MM-DD, dengan rentang maksimal 366 hari." }, 400);
  const rangeAssignments = await db.select({ id: assignments.id }).from(assignments).where(and(eq(assignments.teacherId, user.userId), inArray(assignments.status, ["terbit", "ditutup"]), gte(assignments.opensAt, range.from), lt(assignments.opensAt, range.toExclusive)));
  const reports = (await Promise.all(rangeAssignments.map((row) => loadSessionReportData(user.userId, row.id)))).filter((report): report is SessionReportData => report !== null);
  const data = {
    from, to,
    summary: {
      assignments: reports.length, students: reports.reduce((total, report) => total + report.summary.total_students, 0), hadir: reports.reduce((total, report) => total + report.summary.hadir, 0),
      submitted: reports.reduce((total, report) => total + report.summary.submitted, 0), exit_ticket: reports.reduce((total, report) => total + report.summary.exit_ticket, 0),
      ruas_scored: reports.reduce((total, report) => total + report.summary.ruas_scored, 0), ruas_unmatched: reports.reduce((total, report) => total + report.summary.ruas_unmatched, 0),
    },
    assignments: reports,
  };
  if (c.req.query("format") === "csv") return respondRangeCsv(c, data);
  if (c.req.query("format") === "pdf") return respondRangePdf(c, data);
  return c.json({ ok: true, data });
});

reportRoutes.post("/ruas-import", async (c) => {
  const user = c.get("user")!;
  let input: { assignmentId?: number; rows?: { identifier?: string; score?: number | string; studentName?: string }[] };
  try { input = await c.req.json(); } catch { return c.json({ ok: false, message: "Isi impor harus berupa JSON yang valid." }, 400); }
  const assignmentId = Number(input.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0 || !Array.isArray(input.rows) || input.rows.length === 0) return c.json({ ok: false, message: "assignmentId dan minimal satu baris nilai wajib diisi." }, 400);
  if (input.rows.length > 1000) return c.json({ ok: false, message: "Impor dibatasi maksimal 1.000 baris." }, 400);
  if (!(await ownedAssignment(user.userId, assignmentId))) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  const students = await getTargetStudents(assignmentId);
  const byIdentifier = new Map<string, TargetStudent>();
  for (const student of students) { if (student.nis) byIdentifier.set(student.nis.trim().toLowerCase(), student); byIdentifier.set(student.username.trim().toLowerCase(), student); }
  const seen = new Set<string>();
  const rows = input.rows.map((row) => {
    const identifier = String(row.identifier ?? "").trim(); const key = identifier.toLowerCase();
    const score = typeof row.score === "string" ? Number(row.score.replace(",", ".")) : Number(row.score);
    const duplicate = !identifier || seen.has(key); seen.add(key); const student = duplicate ? undefined : byIdentifier.get(key);
    const matchStatus: "cocok" | "tidak_ditemukan" | "duplikat" = duplicate ? "duplikat" : student ? "cocok" : "tidak_ditemukan";
    return { assignmentId, teacherId: user.userId, studentId: student?.id ?? null, identifier: identifier || "(kosong)", studentName: String(row.studentName ?? "").trim() || null, score: score.toFixed(2), matchStatus, note: !Number.isFinite(score) || score < 0 || score > 100 ? "Nilai harus berada pada rentang 0-100." : student ? null : duplicate ? "Identifier muncul lebih dari sekali." : "Identifier tidak ditemukan di kelas tujuan." };
  });
  const invalid = rows.find((row) => !Number.isFinite(Number(row.score)) || Number(row.score) < 0 || Number(row.score) > 100);
  if (invalid) return c.json({ ok: false, message: `Nilai untuk identifier ${invalid.identifier} harus berupa angka 0-100.` }, 400);
  await db.transaction(async (tx) => { await tx.delete(ruasScores).where(eq(ruasScores.assignmentId, assignmentId)); await tx.insert(ruasScores).values(rows); });
  return c.json({ ok: true, data: { assignment_id: assignmentId, total: rows.length, cocok: rows.filter((row) => row.matchStatus === "cocok").length, tidak_ditemukan: rows.filter((row) => row.matchStatus === "tidak_ditemukan").length, duplikat: rows.filter((row) => row.matchStatus === "duplikat").length, unmatched: rows.filter((row) => row.matchStatus !== "cocok").map((row) => ({ identifier: row.identifier, student_name: row.studentName, score: Number(row.score), match_status: row.matchStatus, note: row.note })) } });
});

function respondSessionReport(c: any, data: SessionReportData, format: string | undefined, filename: string) {
  if (format === "csv") return respondSessionCsv(c, data, filename);
  if (format === "pdf") { const pdf = createSessionPdf(data); c.header("Content-Type", "application/pdf"); c.header("Content-Disposition", `attachment; filename=\"${filename}.pdf\"`); return c.body(pdf); }
  return c.json({ ok: true, data });
}
function respondSessionCsv(c: any, data: SessionReportData, filename: string) {
  const csvRows = [["Nama", "Username", "Kelas", "Presensi", "Status LKPD", "Waktu kumpul", "Nilai LKPD", "Exit ticket", "Waktu exit ticket", "Kuis RUAS", "Waktu buka RUAS", "Nilai RUAS"], ...data.students.map((row) => [row.name, row.username, row.class_name, row.hadir ? "Hadir" : "Belum hadir", row.submission_status, csvDate(row.submitted_at), row.total_score === null ? "" : String(row.total_score), row.exit_ticket_submitted ? "Sudah" : "Belum", csvDate(row.exit_ticket_submitted_at), row.ruas_opened_at ? "Dibuka" : "Belum", csvDate(row.ruas_opened_at), row.ruas_score === null ? "" : String(row.ruas_score)])];
  const csv = `\uFEFF${csvRows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`; c.header("Content-Type", "text/csv; charset=utf-8"); c.header("Content-Disposition", `attachment; filename=\"${filename}.csv\"`); return c.body(csv);
}
function respondRangeCsv(c: any, data: { from: string | undefined; to: string | undefined; assignments: SessionReportData[] }) {
  const csvRows = [["Penugasan", "Dibuka", "Batas", "Nama", "Username", "Kelas", "Presensi", "Status LKPD", "Nilai LKPD", "Exit ticket", "Nilai RUAS"], ...data.assignments.flatMap((report) => report.students.map((row) => [report.assignment.title, csvDate(report.assignment.opens_at), csvDate(report.assignment.due_at), row.name, row.username, row.class_name, row.hadir ? "Hadir" : "Belum hadir", row.submission_status, row.total_score === null ? "" : String(row.total_score), row.exit_ticket_submitted ? "Sudah" : "Belum", row.ruas_score === null ? "" : String(row.ruas_score)]))];
  const csv = `\uFEFF${csvRows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`; c.header("Content-Type", "text/csv; charset=utf-8"); c.header("Content-Disposition", `attachment; filename=\"simak-rekap-${data.from}-${data.to}.csv\"`); return c.body(csv);
}
function respondRangePdf(c: any, data: { from: string | undefined; to: string | undefined; summary: { assignments: number; students: number; hadir: number; submitted: number; exit_ticket: number; ruas_scored: number }; assignments: SessionReportData[] }) { const pdf = createRangePdf(data); c.header("Content-Type", "application/pdf"); c.header("Content-Disposition", `attachment; filename=\"simak-rekap-${data.from}-${data.to}.pdf\"`); return c.body(pdf); }

function parseWibRange(from: string | undefined, to: string | undefined) {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const start = new Date(`${from}T00:00:00.000+07:00`); const end = new Date(`${to}T00:00:00.000+07:00`); const toExclusive = new Date(end.getTime() + 86400000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || toExclusive.getTime() - start.getTime() > 366 * 86400000) return null;
  return { from: start, toExclusive };
}
function csvDate(value: Date | null) { return value?.toISOString() ?? ""; }
function csvEscape(value: string) { return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }

function createSessionPdf(data: SessionReportData) {
  const columns = [{ title: "No.", width: 28, chars: 4 }, { title: "Murid", width: 150, chars: 24 }, { title: "Kelas", width: 95, chars: 15 }, { title: "Presensi", width: 65, chars: 9 }, { title: "LKPD", width: 55, chars: 8 }, { title: "Nilai", width: 45, chars: 6 }, { title: "Exit", width: 45, chars: 6 }, { title: "RUAS", width: 40, chars: 6 }];
  const rows = data.students.map((student, index) => [String(index + 1), `${student.name} (${student.username})`, student.class_name, student.hadir ? "Hadir" : "Belum hadir", student.submission_status, student.total_score === null ? "-" : String(student.total_score), student.exit_ticket_submitted ? "Sudah" : "Belum", student.ruas_score === null ? "-" : String(student.ruas_score)]);
  return createTabularPdf(`SIMAK - Rekap Sesi: ${data.assignment.title}`, `Batas: ${pdfDate(data.assignment.due_at)} | Murid: ${data.summary.total_students} | Hadir: ${data.summary.hadir} | Kumpul: ${data.summary.submitted} | Exit: ${data.summary.exit_ticket}`, columns, rows);
}
function createRangePdf(data: { from: string | undefined; to: string | undefined; summary: { assignments: number; students: number; hadir: number; submitted: number; exit_ticket: number; ruas_scored: number }; assignments: SessionReportData[] }) {
  const columns = [{ title: "No.", width: 28, chars: 4 }, { title: "Penugasan", width: 190, chars: 30 }, { title: "Dibuka", width: 90, chars: 14 }, { title: "Murid", width: 48, chars: 7 }, { title: "Hadir", width: 48, chars: 7 }, { title: "Kumpul", width: 52, chars: 8 }, { title: "Exit", width: 48, chars: 7 }, { title: "RUAS", width: 48, chars: 7 }];
  const rows = data.assignments.map((report, index) => [String(index + 1), report.assignment.title, pdfDate(report.assignment.opens_at), String(report.summary.total_students), String(report.summary.hadir), String(report.summary.submitted), String(report.summary.exit_ticket), String(report.summary.ruas_scored)]);
  return createTabularPdf(`SIMAK - Rekap Rentang ${data.from} s.d. ${data.to}`, `Penugasan: ${data.summary.assignments} | Murid: ${data.summary.students} | Hadir: ${data.summary.hadir} | Kumpul: ${data.summary.submitted} | Exit: ${data.summary.exit_ticket} | RUAS: ${data.summary.ruas_scored}`, columns, rows);
}
function createTabularPdf(title: string, subtitle: string, columns: { title: string; width: number; chars: number }[], tableRows: string[][]) {
  const pageRows: string[][][] = []; let currentPage: string[][] = []; let currentHeight = 0;
  for (const row of tableRows) { const height = pdfRowHeight(row, columns); if (currentPage.length > 0 && currentHeight + height > 661) { pageRows.push(currentPage); currentPage = []; currentHeight = 0; } currentPage.push(row); currentHeight += height; }
  if (currentPage.length > 0 || pageRows.length === 0) pageRows.push(currentPage);
  const objects: (string | null)[] = [null, "<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]; const pageRefs: string[] = [];
  for (const [index, rows] of pageRows.entries()) { const content = createPdfTablePage(title, subtitle, rows, columns, index + 1, pageRows.length); const pageObject = objects.length; const contentObject = pageObject + 1; pageRefs.push(`${pageObject} 0 R`); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`); objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`); }
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRows.length} >>`; let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) { offsets[index] = pdf.length; pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`; }
  const xrefOffset = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`; for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`; return `${pdf}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
}
function createPdfTablePage(title: string, subtitle: string, rows: string[][], columns: { title: string; width: number; chars: number }[], pageNumber: number, pageCount: number) {
  const left = 36; const tableWidth = columns.reduce((total, column) => total + column.width, 0); let content = pdfText(title, left, 805, 15) + pdfText(subtitle, left, 783, 8); if (pageCount > 1) content += pdfText(`Halaman ${pageNumber} dari ${pageCount}`, 470, 805, 8);
  let y = 735; content += pdfRect(left, y - 24, tableWidth, 24, true); let x = left; for (const column of columns) { content += pdfText(column.title, x + 4, y - 16, 8); x += column.width; } y -= 24;
  for (const row of rows) { const height = pdfRowHeight(row, columns); content += pdfRect(left, y - height, tableWidth, height); x = left; row.forEach((value, index) => { const column = columns[index]!; wrapPdfText(value, column.chars).forEach((line, lineIndex) => { content += pdfText(line, x + 4, y - 14 - lineIndex * 10, 7.5); }); x += column.width; }); x = left; for (const column of columns.slice(0, -1)) { x += column.width; content += `${x} ${y - height} m ${x} ${y} l S\n`; } y -= height; }
  return content;
}
function pdfRowHeight(row: string[], columns: { chars: number }[]) { return Math.max(24, Math.max(...row.map((value, index) => wrapPdfText(value, columns[index]!.chars).length)) * 10 + 10); }
function wrapPdfText(value: string, maxChars: number) { const words = value.split(/\s+/).filter(Boolean); const lines: string[] = []; let current = ""; for (const word of words) { if (word.length > maxChars) { if (current) lines.push(current); for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars)); current = ""; continue; } const next = current ? `${current} ${word}` : word; if (next.length > maxChars) { lines.push(current); current = word; } else current = next; } if (current) lines.push(current); return lines.length > 0 ? lines : [""]; }
function pdfRect(x: number, y: number, width: number, height: number, fill = false) { return fill ? `0.93 0.95 0.98 rg ${x} ${y} ${width} ${height} re f 0 0 0 rg ${x} ${y} ${width} ${height} re S\n` : `${x} ${y} ${width} ${height} re S\n`; }
function pdfDate(value: Date | null) { return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(value) : "-"; }
function pdfText(value: string, x: number, y: number, size: number) { const safe = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"); return `BT /F1 ${size} Tf ${x} ${y} Td (${safe}) Tj ET\n`; }
