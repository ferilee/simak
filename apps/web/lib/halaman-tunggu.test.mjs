// Tests for "Halaman Tunggu — Penugasan belum dibuka" (v1.0.37): the
// student assignment-detail page recognizes the API's enriched 403
// (403 + data { title, subject_name, opens_at, closes_at }) and renders
// a themed waiting page — title, subject, id-ID + WIB schedule lines, a
// per-second countdown that auto-refetches at zero (30-second recheck
// when the server still says not-yet-open), a manual "Cek lagi", and a
// primary way back home — with NO toast and no blank page.
// Run with bun from apps/web:  bun lib/halaman-tunggu.test.mjs
//
// Pure helpers are tested behaviorally; the page and api.ts wiring is
// locked statically against the sources, per repo convention.
import { readFileSync } from "node:fs";
import { countdownParts, countdownUnits, formatSchedule, parseNotYetOpen } from "./halaman-tunggu.ts";

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

const T = new Date("2026-11-05T10:55:00.000Z").getTime();

// ---------------------------------------------------------------------------
console.log("Case 1: countdownParts — batas-batas sisa waktu");
{
  const multi = countdownParts(T, T - ((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000));
  check("lebih dari sehari → 2 hari 3 jam 4 menit 5 detik", !multi.passed && multi.days === 2 && multi.hours === 3 && multi.minutes === 4 && multi.seconds === 5, JSON.stringify(multi));
  const subHour = countdownParts(T, T - (12 * 60 + 30) * 1000);
  check("di bawah satu jam → 0 hari 0 jam 12 menit 30 detik", !subHour.passed && subHour.days === 0 && subHour.hours === 0 && subHour.minutes === 12 && subHour.seconds === 30, JSON.stringify(subHour));
  const oneSecond = countdownParts(T, T - 1000);
  check("satu detik tersisa → belum lewat, 1 detik", !oneSecond.passed && oneSecond.seconds === 1 && oneSecond.minutes === 0, JSON.stringify(oneSecond));
  const halfSecond = countdownParts(T, T - 500);
  check("setengah detik tersisa → ditampilkan 1 detik (tidak pernah 0 saat menunggu)", !halfSecond.passed && halfSecond.seconds === 1, JSON.stringify(halfSecond));
  const zero = countdownParts(T, T);
  check("tepat nol → passed, semua unit 0", zero.passed && zero.days === 0 && zero.hours === 0 && zero.minutes === 0 && zero.seconds === 0, JSON.stringify(zero));
  const past = countdownParts(T, T + 60_000);
  check("sudah lewat → passed, semua unit 0", past.passed && past.days === 0 && past.hours === 0 && past.minutes === 0 && past.seconds === 0, JSON.stringify(past));
  const exactDay = countdownParts(T, T - 86400 * 1000);
  check("tepat sehari → 1 hari 0 jam 0 menit 0 detik", !exactDay.passed && exactDay.days === 1 && exactDay.hours === 0 && exactDay.minutes === 0 && exactDay.seconds === 0, JSON.stringify(exactDay));
}

// ---------------------------------------------------------------------------
console.log("Case 2: countdownUnits — unit nol di depan disembunyikan");
{
  const labels = (parts) => countdownUnits(parts).map((unit) => `${unit.value} ${unit.label}`);
  check("multi-hari → keempat unit tampil", JSON.stringify(labels(countdownParts(T, T - ((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000)))) === JSON.stringify(["2 Hari", "3 Jam", "4 Menit", "5 Detik"]));
  check("hari ini → tanpa '0 Hari', mulai dari Jam", JSON.stringify(labels(countdownParts(T, T - (3 * 3600 + 4 * 60 + 5) * 1000))) === JSON.stringify(["3 Jam", "4 Menit", "5 Detik"]));
  check("di bawah satu jam → mulai dari Menit", JSON.stringify(labels(countdownParts(T, T - (12 * 60 + 30) * 1000))) === JSON.stringify(["12 Menit", "30 Detik"]));
  check("di bawah satu menit → hanya Detik", JSON.stringify(labels(countdownParts(T, T - 45 * 1000))) === JSON.stringify(["45 Detik"]));
  check("nol di tengah tetap tampil (1 hari 0 jam 0 menit 30 detik)", JSON.stringify(labels(countdownParts(T, T - (86400 + 30) * 1000))) === JSON.stringify(["1 Hari", "0 Jam", "0 Menit", "30 Detik"]));
  check("passed → daftar kosong", JSON.stringify(countdownUnits(countdownParts(T, T))) === "[]");
}

// ---------------------------------------------------------------------------
console.log("Case 3: parseNotYetOpen — hanya bentuk 403 berdata jadwal");
{
  const good = { title: "BK 1.1", subject_name: "KKA", opens_at: "2026-11-05T03:55:00.000Z", closes_at: "2026-11-05T10:55:00.000Z" };
  const parsed = parseNotYetOpen(403, good);
  check("403 + data sahih → info lengkap", parsed !== null && parsed.title === "BK 1.1" && parsed.subject_name === "KKA" && parsed.opens_at === good.opens_at && parsed.closes_at === good.closes_at);
  check("subject_name null diterima", parseNotYetOpen(403, { ...good, subject_name: null })?.subject_name === null);
  check("subject_name hilang → null", parseNotYetOpen(403, { title: "X", opens_at: good.opens_at, closes_at: good.closes_at })?.subject_name === null);
  check("404 (bukan sasaran) → null", parseNotYetOpen(404, null) === null);
  check("404 dengan data pun → null", parseNotYetOpen(404, good) === null);
  check("403 tanpa data → null", parseNotYetOpen(403, null) === null);
  check("403 data tanpa opens_at → null", parseNotYetOpen(403, { title: "X", closes_at: good.closes_at }) === null);
  check("403 opens_at bukan tanggal → null", parseNotYetOpen(403, { ...good, opens_at: "besok" }) === null);
  check("403 title kosong → null", parseNotYetOpen(403, { ...good, title: "" }) === null);
  check("500 → null", parseNotYetOpen(500, good) === null);
}

// ---------------------------------------------------------------------------
console.log("Case 4: formatSchedule — pola id-ID + pukul HH.mm");
{
  const line = formatSchedule("2026-11-05T03:55:00.000Z");
  const local = new Date("2026-11-05T03:55:00.000Z");
  const hh = String(local.getHours()).padStart(2, "0");
  const mm = String(local.getMinutes()).padStart(2, "0");
  check("memuat nama hari bahasa Indonesia", /(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)/.test(line), line);
  check("memuat tanggal + bulan panjang + tahun", line.includes("5 November 2026"), line);
  check("memuat 'pukul HH.mm' waktu setempat", line.includes(`pukul ${hh}.${mm}`), line);
  check("tanpa pemisah ':' pada jam", !line.includes(`${hh}:${mm}`), line);
}

// ---------------------------------------------------------------------------
console.log("Case 5: pengawatan api.ts — ApiError membawa status + data, pesan utuh");
{
  const api = read("./api.ts");
  check("ApiError diekspor sebagai turunan Error", api.includes("export class ApiError extends Error"));
  check("ApiError menyimpan status dan data", api.includes("status: number") && api.includes("data: unknown") && api.includes("this.status = status") && api.includes("this.data = data"));
  check("lemparan memakai pesan server yang sama", api.includes('throw new ApiError(body.message ?? "Permintaan tidak dapat diproses.", response.status, body.data ?? null);'));
}

// ---------------------------------------------------------------------------
console.log("Case 6: pengawatan halaman detail — cabang tunggu, hitung mundur, tanpa toast");
{
  const page = read("../app/murid/assignments/[id]/page.tsx");
  check("halaman mengenali bentuk belum-dibuka lewat ApiError + parseNotYetOpen", page.includes("error instanceof ApiError ? parseNotYetOpen(error.status, error.data) : null"));
  check("keadaan tunggu disimpan terpisah dari data", page.includes("const [waiting, setWaiting] = useState<NotYetOpenInfo | null>(null);"));
  check("cabang tunggu dirender sebelum cabang galat lama", page.indexOf("if (waiting && !data)") !== -1 && page.indexOf("if (waiting && !data)") < page.indexOf("if (message && !data)"));
  check("toast dimatikan pada keadaan tunggu (pesan dikosongkan)", page.includes('setWaiting(notYetOpen);\n        setMessage("");'));
  check("judul halaman tunggu = judul penugasan", page.includes("<h1 style={styles.waitingTitle}>{waiting.title}</h1>"));
  check("pernyataan persis 'Penugasan belum dibuka'", page.includes(">Penugasan belum dibuka<"));
  check("baris jadwal Dibuka … WIB", page.includes("Dibuka <strong>{formatSchedule(waiting.opens_at)} WIB</strong>"));
  check("baris jadwal Batas pengumpulan … WIB", page.includes("Batas pengumpulan <strong>{formatSchedule(waiting.closes_at)} WIB</strong>"));
  check("detak hitung mundur tiap 1000 ms", page.includes("window.setInterval(() => setNowMs(Date.now()), 1000)"));
  check("interval dibersihkan saat keadaan tunggu berakhir", page.includes("return () => window.clearInterval(timer);"));
  check("pemeriksaan ulang otomatis saat nol dengan jeda 30_000", page.includes("nowMs - lastAutoCheckRef.current < 30_000"));
  check("pemeriksaan otomatis memanggil pemuat yang sama", page.includes("void loadRef.current();"));
  check("tombol manual 'Cek lagi' terpasang", page.includes("onClick={checkAgain}") && page.includes(">Cek lagi</button>"));
  check("aksi utama 'Kembali ke beranda' menuju /murid", page.includes('<Link href="/murid" style={styles.waitingPrimaryLink}>Kembali ke beranda</Link>'));
  check("tautan kembali atas konsisten '← Ruang murid'", page.includes('<Link href="/murid" style={styles.back}>← Ruang murid</Link>'));
  check("hitung mundur dihitung dari helper murni", page.includes("countdownParts(new Date(waiting.opens_at).getTime(), nowMs)") && page.includes("countdownUnits(parts)"));
  check("keadaan lewat-waktu menampilkan pemberitahuan membuka", page.includes("Waktunya tiba — sedang membuka penugasan…"));
}

// ---------------------------------------------------------------------------
console.log("Case 7: ilustrasi SVG sebaris — tanpa aset eksternal");
{
  const page = read("../app/murid/assignments/[id]/page.tsx");
  const start = page.indexOf("function WaitingIllustration()");
  const end = page.indexOf("}", page.indexOf("</svg>", start));
  const illustration = page.slice(start, end);
  check("komponen ilustrasi ditemukan", start !== -1 && illustration.includes("<svg"));
  check("ilustrasi adalah <svg> sebaris dengan viewBox", illustration.includes('viewBox="0 0 220 170"'));
  check("motif kalender (kepala ungu) + jam (lingkaran teal) hadir", illustration.includes('fill="#8b5cf6"') && illustration.includes('stroke="#0e9384"'));
  check("tidak ada <img> / src eksternal pada ilustrasi", !illustration.includes("<img") && !illustration.includes("src="));
  check("ilustrasi dirender di cabang tunggu", page.includes("<WaitingIllustration />"));
}

// ---------------------------------------------------------------------------
console.log("Case 8: responsif — disiplin seluler v1.0.25 pada halaman tunggu");
{
  const page = read("../app/murid/assignments/[id]/page.tsx");
  check("cabang tunggu memakai wadah khusus waitingContainer", page.includes("<main style={styles.waitingContainer}>"));
  check("wadah tunggu: maxWidth 720 + overflowX clip (anti geser menyamping)", page.includes('waitingContainer: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px", overflowX: "clip" as const }'));
  check("kartu tunggu minWidth 0 (anak grid tidak memaksa lebar)", page.includes('textAlign: "center" as const, minWidth: 0 }'));
  const anywhereCount = (page.match(/overflowWrap: "anywhere" as const/g) ?? []).length;
  check("teks panjang (judul/mapel/pernyataan/isi/baris jadwal) memakai overflowWrap anywhere", anywhereCount >= 6, `${anywhereCount} temuan`);
  check("ilustrasi cair: lebar tetap dibatasi 62vw", page.includes('waitingIllustration: { width: 200, maxWidth: "62vw", height: "auto" }'));
  check("baris hitung mundur SEBARIS: lebar penuh (width 100%) + nowrap + minWidth 0 + maxWidth 100%", page.includes('countdownRow: { display: "flex", gap: 8, marginTop: 12, width: "100%", flexWrap: "nowrap" as const, justifyContent: "center" as const, minWidth: 0, maxWidth: "100%" }'));
  check("baris hitung mundur tidak lagi membungkus (flexWrap wrap pada marginTop 12 hilang)", !page.includes('marginTop: 12, flexWrap: "wrap"'));
  check("chip berbagi lebar baris sama rata + menyusut sampai nol (flex 1 1 0, maxWidth 76, minWidth 0)", page.includes('flex: "1 1 0", maxWidth: 76, minWidth: 0'));
  check("chip tidak lagi berlebar tetap 68", !page.includes("width: 68"));
  check("jadwal minWidth 0 agar teksnya bisa membungkus", page.includes("waitingSchedule: { display: \"grid\", gap: 4, marginTop: 8, color: \"#475467\", fontSize: 15, minWidth: 0 }"));
  check("kedua tombol setinggi sentuh minimal 44px", (page.match(/minHeight: 44/g) ?? []).length >= 2);
  check("baris aksi membungkus pada layar sempit", page.includes('waitingActions: { display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" as const, justifyContent: "center" as const, maxWidth: "100%" }'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
