import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";

// Rekap bukti = agregasi submissions + activity_logs + exit_tickets (Tahap 4).
// Format: JSON (default), CSV yang dapat dibuka di Excel, atau PDF.
export const reportRoutes = new Hono();

reportRoutes.use("*", requireRole("guru"));

const { activityLogs, assignmentClasses, assignments, classes, classMembers, exitTickets, users, worksheetAttempts } = schema;

reportRoutes.get("/session", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.query("assignmentId"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return c.json({ ok: false, message: "assignmentId wajib berupa ID positif." }, 400);
  }

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.teacherId, user.userId)))
    .limit(1);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);

  const targetStudents = await db
    .select({ id: users.id, name: users.name, username: users.username, classId: classes.id, className: classes.name })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .innerJoin(users, eq(users.id, classMembers.studentId))
    .where(and(eq(assignmentClasses.assignmentId, assignmentId), eq(classes.isArchived, false)));
  const students = [...new Map(targetStudents.map((student) => [student.id, student])).values()];
  const studentIds = students.map((student) => student.id);

  const [activities, attempts, tickets] = await Promise.all([
    studentIds.length
      ? db
          .select({ studentId: activityLogs.studentId, event: activityLogs.event, createdAt: activityLogs.createdAt })
          .from(activityLogs)
          .where(and(eq(activityLogs.assignmentId, assignmentId), inArray(activityLogs.studentId, studentIds)))
      : Promise.resolve([]),
    assignment.worksheetId !== null && studentIds.length
      ? db
          .select({ studentId: worksheetAttempts.studentId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore })
          .from(worksheetAttempts)
          .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), inArray(worksheetAttempts.studentId, studentIds)))
      : Promise.resolve([]),
    studentIds.length
      ? db
          .select({ studentId: exitTickets.studentId, submittedAt: exitTickets.createdAt })
          .from(exitTickets)
          .where(and(eq(exitTickets.assignmentId, assignmentId), inArray(exitTickets.studentId, studentIds)))
      : Promise.resolve([]),
  ]);

  const activitiesByStudent = new Map<number, typeof activities>();
  for (const activity of activities) {
    const current = activitiesByStudent.get(activity.studentId) ?? [];
    current.push(activity);
    activitiesByStudent.set(activity.studentId, current);
  }
  const attemptsByStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt]));
  const ticketsByStudent = new Map(tickets.map((ticket) => [ticket.studentId, ticket]));

  const rows = students.map((student) => {
    const studentActivities = activitiesByStudent.get(student.id) ?? [];
    const openedAt = studentActivities
      .filter((activity) => activity.event === "buka_materi")
      .map((activity) => activity.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const startedAt = studentActivities
      .filter((activity) => activity.event === "mulai_lkpd")
      .map((activity) => activity.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const ruasOpenedAt = studentActivities
      .filter((activity) => activity.event === "buka_kuis_ruas")
      .map((activity) => activity.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const attempt = attemptsByStudent.get(student.id);
    const ticket = ticketsByStudent.get(student.id);
    const submitted = Boolean(attempt && attempt.status !== "draf") || Boolean(ticket);

    return {
      student_id: student.id,
      name: student.name,
      username: student.username,
      class_name: student.className,
      hadir: Boolean(openedAt && submitted),
      opened_at: openedAt,
      started_lkpd_at: startedAt,
      submission_status: attempt?.status ?? "belum",
      submitted_at: attempt?.submittedAt ?? null,
      total_score: attempt?.totalScore === null || attempt?.totalScore === undefined ? null : Number(attempt.totalScore),
      exit_ticket_submitted: Boolean(ticket),
      exit_ticket_submitted_at: ticket?.submittedAt ?? null,
      ruas_opened_at: ruasOpenedAt,
    };
  });

  const data = {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      opens_at: assignment.opensAt,
      due_at: assignment.dueAt,
    },
    summary: {
      total_students: rows.length,
      hadir: rows.filter((row) => row.hadir).length,
      submitted: rows.filter((row) => row.submission_status !== "belum").length,
      exit_ticket: rows.filter((row) => row.exit_ticket_submitted).length,
    },
    students: rows,
  };

  if (c.req.query("format") === "csv") {
    const csvRows = [
      ["Nama", "Username", "Kelas", "Presensi", "Status LKPD", "Waktu kumpul", "Nilai LKPD", "Exit ticket", "Waktu exit ticket", "Kuis RUAS", "Waktu buka RUAS"],
      ...rows.map((row) => [
        row.name,
        row.username,
        row.class_name,
        row.hadir ? "Hadir" : "Belum hadir",
        row.submission_status,
        csvDate(row.submitted_at),
        row.total_score === null ? "" : String(row.total_score),
        row.exit_ticket_submitted ? "Sudah" : "Belum",
        csvDate(row.exit_ticket_submitted_at),
        row.ruas_opened_at ? "Dibuka" : "Belum",
        csvDate(row.ruas_opened_at),
      ]),
    ];
    const csv = `\uFEFF${csvRows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename=\"simak-rekap-${assignment.id}.csv\"`);
    return c.body(csv);
  }

  if (c.req.query("format") === "pdf") {
    const pdf = createSessionPdf(data);
    c.header("Content-Type", "application/pdf");
    c.header("Content-Disposition", `attachment; filename=\"simak-rekap-${assignment.id}.pdf\"`);
    return c.body(pdf);
  }

  return c.json({
    ok: true,
    data,
  });
});
reportRoutes.get("/range", (c) => c.json({ ok: false, message: "Tahap 4." }, 501));

function csvDate(value: Date | null) {
  return value?.toISOString() ?? "";
}

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function createSessionPdf(data: {
  assignment: { id: number; title: string; due_at: Date };
  summary: { total_students: number; hadir: number; submitted: number; exit_ticket: number };
  students: {
    name: string;
    username: string;
    class_name: string;
    hadir: boolean;
    submission_status: string;
    total_score: number | null;
    exit_ticket_submitted: boolean;
    ruas_opened_at: Date | null;
  }[];
}) {
  const columns = [
    { title: "No.", width: 28, chars: 4 },
    { title: "Murid", width: 150, chars: 24 },
    { title: "Kelas", width: 95, chars: 15 },
    { title: "Presensi", width: 65, chars: 9 },
    { title: "LKPD", width: 55, chars: 8 },
    { title: "Nilai", width: 45, chars: 6 },
    { title: "Exit", width: 45, chars: 6 },
    { title: "RUAS", width: 40, chars: 6 },
  ];
  const tableRows = data.students.map((student, index) => [
    String(index + 1),
    `${student.name} (${student.username})`,
    student.class_name,
    student.hadir ? "Hadir" : "Belum hadir",
    student.submission_status,
    student.total_score === null ? "-" : String(student.total_score),
    student.exit_ticket_submitted ? "Sudah" : "Belum",
    student.ruas_opened_at ? "Dibuka" : "Belum",
  ]);
  const maxTableHeight = 661;
  const pageRows: string[][][] = [];
  let currentPage: string[][] = [];
  let currentHeight = 0;
  for (const row of tableRows) {
    const height = pdfRowHeight(row, columns);
    if (currentPage.length > 0 && currentHeight + height > maxTableHeight) {
      pageRows.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }
    currentPage.push(row);
    currentHeight += height;
  }
  if (currentPage.length > 0 || pageRows.length === 0) pageRows.push(currentPage);

  const objects: (string | null)[] = [null, "<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const pageRefs: string[] = [];
  for (const [pageIndex, rows] of pageRows.entries()) {
    const content = createPdfPage(data, rows, columns, pageIndex + 1, pageRows.length);
    const pageObject = objects.length;
    const contentObject = pageObject + 1;
    pageRefs.push(`${pageObject} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRows.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function createPdfPage(
  data: { assignment: { title: string; due_at: Date }; summary: { total_students: number; hadir: number; submitted: number; exit_ticket: number } },
  rows: string[][],
  columns: { title: string; width: number; chars: number }[],
  pageNumber: number,
  pageCount: number,
) {
  const left = 36;
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  let content = "";
  content += pdfText(`SIMAK - Rekap Sesi: ${data.assignment.title}`, left, 805, 15);
  content += pdfText(`Batas pengumpulan: ${pdfDate(data.assignment.due_at)}`, left, 783, 9);
  content += pdfText(`Murid: ${data.summary.total_students} | Hadir: ${data.summary.hadir} | Kumpul LKPD: ${data.summary.submitted} | Exit ticket: ${data.summary.exit_ticket}`, left, 768, 9);
  if (pageCount > 1) content += pdfText(`Halaman ${pageNumber} dari ${pageCount}`, 470, 805, 8);

  let y = 735;
  content += pdfRect(left, y - 24, tableWidth, 24, true);
  let x = left;
  for (const column of columns) {
    content += pdfText(column.title, x + 4, y - 16, 8);
    x += column.width;
  }
  y -= 24;

  for (const row of rows) {
    const height = pdfRowHeight(row, columns);
    content += pdfRect(left, y - height, tableWidth, height);
    x = left;
    row.forEach((value, index) => {
      const column = columns[index]!;
      const wrapped = wrapPdfText(value, column.chars);
      wrapped.forEach((line, lineIndex) => {
        content += pdfText(line, x + 4, y - 14 - lineIndex * 10, 7.5);
      });
      x += column.width;
    });
    x = left;
    for (const column of columns.slice(0, -1)) {
      x += column.width;
      content += `${x} ${y - height} m ${x} ${y} l S\n`;
    }
    y -= height;
  }
  return content;
}

function pdfRowHeight(row: string[], columns: { chars: number }[]) {
  const lineCount = Math.max(...row.map((value, index) => wrapPdfText(value, columns[index]!.chars).length));
  return Math.max(24, lineCount * 10 + 10);
}

function wrapPdfText(value: string, maxChars: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
      current = "";
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function pdfRect(x: number, y: number, width: number, height: number, fill = false) {
  return fill
    ? `0.93 0.95 0.98 rg ${x} ${y} ${width} ${height} re f 0 0 0 rg ${x} ${y} ${width} ${height} re S\n`
    : `${x} ${y} ${width} ${height} re S\n`;
}

function pdfDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(value)
    : "-";
}

function pdfText(value: string, x: number, y: number, size: number) {
  const safe = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  return `BT /F1 ${size} Tf ${x} ${y} Td (${safe}) Tj ET\n`;
}
