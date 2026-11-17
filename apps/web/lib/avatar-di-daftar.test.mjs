// Tests for student avatar badges in name lists (calon v1.0.75): the
// equipped avatar shows next to student names in group member lists
// (student side) and teacher student lists. Run with bun from apps/web:
//   bun lib/avatar-di-daftar.test.mjs
//
// Locked here:
//  - nameInitials (lib/lencana-nama.ts) is pure: first letters of the
//    first two words uppercased, one word → one letter, extra words
//    ignored, blank name → "?" so the fallback circle is never empty.
//  - components/StudentNameBadge.tsx is the ONE shared badge: emoji
//    circle when an avatar is equipped, initials circle otherwise.
//  - globals.css defines the badge shell (small calm circle, neutral
//    initials tone).
//  - The badge is used at every in-scope list: murid assignment group
//    card + worksheet group card / presence lines / contribution
//    teammates; guru submissions list (individual + group members),
//    Rekap table, exit-ticket per-student cards, attempt detail
//    (member line + contribution cards), class member picker +
//    selected chips; Jurnal guru panel (student list + detail header).
import { readFileSync } from "node:fs";
import { nameInitials } from "./lencana-nama.ts";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// --- nameInitials murni ----------------------------------------------------------
check("dua kata → dua huruf pertama", nameInitials("Beni Firmansyah") === "BF");
check("satu kata → satu huruf", nameInitials("Agus") === "A");
check("tiga kata → hanya dua kata pertama", nameInitials("Siti Nur Haliza") === "SN");
check("huruf kecil → diperbesar", nameInitials("zainal abidin") === "ZA");
check("spasi berlebih diabaikan", nameInitials("  dewi   lestari  ") === "DL");
check("nama kosong → '?'", nameInitials("") === "?");
check("nama hanya spasi → '?'", nameInitials("   ") === "?");

// --- Komponen bersama --------------------------------------------------------------
const badge = read("../components/StudentNameBadge.tsx");
check("komponen StudentNameBadge memakai nameInitials sebagai pengganti tanpa avatar",
  badge.includes('import { nameInitials, type StudentAvatarFields } from "../lib/lencana-nama";') &&
    badge.includes("nameInitials(name)"));
check("komponen merender emoji bila avatar terpasang, kelas is-initials bila tidak",
  badge.includes("hasAvatar ? avatar_emoji : nameInitials(name)") &&
    badge.includes('" is-initials"'));

const css = read("../app/globals.css");
check("globals.css mendefinisikan lencana (lingkaran 24px + nada inisial netral)",
  css.includes(".student-name-badge {") &&
    css.includes(".student-name-badge-circle {") &&
    css.includes(".student-name-badge-circle.is-initials {") &&
    css.includes("width: 24px;"));

// --- Pemakaian: sisi murid -----------------------------------------------------------
const muridAssignment = read("../app/murid/assignments/[id]/page.tsx");
check("kartu kelompok penugasan murid: chip anggota memakai lencana",
  muridAssignment.includes("<StudentNameBadge name={member.name} avatar_slug={member.avatar_slug} avatar_emoji={member.avatar_emoji} />") &&
    muridAssignment.includes('import { StudentNameBadge } from "../../../../components/StudentNameBadge";'));

const muridWorksheet = read("../app/murid/worksheets/[id]/page.tsx");
check("halaman LKPD murid: chip anggota kelompok memakai lencana",
  muridWorksheet.includes("<StudentNameBadge name={member.name} avatar_slug={member.avatar_slug} avatar_emoji={member.avatar_emoji} />"));
check("halaman LKPD murid: baris kehadiran 'Aktif sekarang' memakai lencana per entri",
  muridWorksheet.includes("Aktif sekarang:") &&
    muridWorksheet.includes("<StudentNameBadge name={entry.name} avatar_slug={entry.avatar_slug} avatar_emoji={entry.avatar_emoji} />"));
check("halaman LKPD murid: chip presensi per soal memakai lencana per entri",
  muridWorksheet.includes("sedang mengerjakan soal ini") &&
    (muridWorksheet.match(/StudentNameBadge name=\{entry\.name\}/g) ?? []).length === 2);
check("halaman LKPD murid: daftar nilai kontribusi memakai lencana",
  muridWorksheet.includes("<StudentNameBadge name={teammate.name} avatar_slug={teammate.avatar_slug} avatar_emoji={teammate.avatar_emoji} />"));
check("tipe murid membawa field avatar (kelompok, presensi, teammates)",
  muridWorksheet.includes("avatar_slug: string | null; avatar_emoji: string | null };") &&
    muridWorksheet.includes("current_item_id: number | null; avatar_slug: string | null; avatar_emoji: string | null"));

// --- Pemakaian: sisi guru --------------------------------------------------------------
const guru = read("../app/guru/page.tsx");
check("guru mengimpor lencana bersama",
  guru.includes('import { StudentNameBadge } from "../../components/StudentNameBadge";'));
check("daftar pengumpulan: attempt individu memakai lencana pemilik",
  guru.includes("<StudentNameBadge name={attempt.student_name} avatar_slug={attempt.avatar_slug} avatar_emoji={attempt.avatar_emoji} />"));
check("daftar pengumpulan: anggota attempt kelompok memakai lencana dari field members",
  guru.includes("<StudentNameBadge name={member.name} avatar_slug={member.avatar_slug} avatar_emoji={member.avatar_emoji} />") &&
    guru.includes("attempt.members && attempt.members.length > 0"));
check("tabel Rekap: sel murid memakai lencana",
  guru.includes("<StudentNameBadge name={student.name} avatar_slug={student.avatar_slug} avatar_emoji={student.avatar_emoji} />"));
check("kartu exit ticket per murid memakai lencana",
  guru.includes("avatar_emoji={student.avatar_emoji}") &&
    guru.includes("dikirim {formatDate(student.exit_ticket.submitted_at)}"));
check("rincian attempt: baris anggota + kartu kontribusi memakai lencana",
  guru.includes("Anggota: {attemptDetail.attempt.members.map((member, index) => (") &&
    (guru.match(/StudentNameBadge name=\{member\.name\}/g) ?? []).length >= 3);
check("pemilih anggota kelas + chip terpilih memakai lencana",
  guru.includes("avatar_slug: member.avatar_slug, avatar_emoji: member.avatar_emoji") &&
    guru.includes("<StudentNameBadge name={info.name} avatar_slug={info.avatar_slug} avatar_emoji={info.avatar_emoji} />"));
check("tipe guru membawa field avatar (kelas, pengumpulan, pemantauan, rekap)",
  guru.includes("type ClassMemberSummary = { id: number; name: string; username: string; avatar_slug: string | null; avatar_emoji: string | null };") &&
    guru.includes("members?: { name: string; avatar_slug: string | null; avatar_emoji: string | null }[];") &&
    guru.includes("avatar_slug: string | null;\n  avatar_emoji: string | null;\n  status: \"belum\" | \"draf\" | \"terkumpul\" | \"dinilai\";"));

const jurnalPanel = read("../components/JurnalGuruPanel.tsx");
check("panel jurnal guru: daftar murid memakai lencana",
  jurnalPanel.includes("<StudentNameBadge name={student.name} avatar_slug={student.avatar_slug} avatar_emoji={student.avatar_emoji} />"));
check("panel jurnal guru: kepala detail murid memakai lencana",
  jurnalPanel.includes("Jurnal <StudentNameBadge name={selected.name} avatar_slug={selected.avatar_slug} avatar_emoji={selected.avatar_emoji} />"));
const jurnalLib = read("./jurnal.ts");
check("tipe jurnal web membawa field avatar (ringkasan + kepala detail)",
  jurnalLib.includes("avatar_slug: string | null;") &&
    jurnalLib.includes("student: { id: number; name: string; username: string; avatar_slug: string | null; avatar_emoji: string | null };"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
