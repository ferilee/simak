// Daftar CP & ATP (Tahap 1) — data referensi kurikulum BACA-SAJA untuk
// ruang kerja guru (routes/kurikulum.ts, panel "CP & ATP" di web).
//
// Mengapa data ini tinggal di kode, bukan di basis data: isinya adalah
// dokumen kurikulum yang nyaris tidak berubah (CP ditetapkan pemerintah;
// ATP disusun satuan pendidikan dan disetujui sekali), jadi memperlakukan
// perubahannya seperti perubahan kode — ditinjau, teruji, terbit bersama
// rilis — lebih aman daripada tabel yang bisa diubah tanpa jejak. Tahap 1
// memang hanya menampilkan; penautan modul/LKPD ke ATP adalah tahap
// berikutnya dan tidak bergantung pada keputusan ini.
//
// Provenans (setiap rumusan dapat ditelusur ke sumbernya):
// - Rumusan CP Matematika Fase E & F dan CP KKA Fase E: Keputusan Kepala
//   BSKAP Kemendikdasmen No. 046/H/KR/2025 (salinan PDF milik guru).
// - ATP Matematika Kelas X & XI: dokumen "ATP Matematika Kelas X" dan
//   "ATP Matematika Kelas XI" milik SMKN Pasirian (PDF), termasuk
//   pembagian semester dan alokasi JP-nya. Nomor ATP di dokumen itu
//   mengulang per semester (ATP 1.1 semester genap ≠ ATP 1.1 semester
//   ganjil), karena itu semester adalah bagian dari identitas satu set.
// - ATP KKA Kelas X: dokumen "ATP KKA Kelas X" yang diturunkan dari CP
//   BSKAP 046/2025 dan DISETUJUI guru pada 3 Nov 2026 sebagai acuan
//   pembuatan materi (6 CP, 6 TP, 44 ATP, 96 JP). Penanda [CP tercapai]
//   pada dokumen itu menjadi bendera `capstone` di sini.
//
// Satu set = satu mapel × satu kelas × satu semester. Setiap kelompok
// (TP pada KKA, "Materi" pada dokumen ATP Matematika) menunjuk tepat satu
// CP lewat cpCode; CP yang tidak dirujuk kelompok mana pun tidak ikut
// dimuat dalam set itu.

export type CurriculumAtp = {
  /** Nomor ATP persis seperti di dokumen sumber, mis. "1.1". */
  code: string;
  /** Rumusan lengkap "Peserta didik dapat …". */
  text: string;
  /** Alokasi jam pelajaran menurut dokumen sumber. */
  jp: number;
  /** ATP penutup rangkaian yang menandai CP tercapai (dokumen KKA). */
  capstone?: boolean;
};

export type CurriculumCp = {
  /** Kode CP persis seperti di dokumen sumber, mis. "5.1" atau "1.1". */
  code: string;
  /** Nama elemen CP, mis. "Bilangan". */
  element: string;
  /** Rumusan CP (kutipan BSKAP 046/2025 / dokumen ATP yang disetujui). */
  text: string;
};

export type CurriculumGroup = {
  /** Label kelompok: "TP 1" (KKA) atau "Materi 1" (Matematika). */
  code: string;
  /** Judul kelompok, mis. "Berpikir Komputasional" / "Eksponen". */
  title: string;
  /** Kolom "Materi" dokumen sumber; sama dengan title bila tidak dibedakan. */
  material: string;
  /** Kode CP yang menaungi kelompok ini (ada di cps set yang sama). */
  cpCode: string;
  atps: CurriculumAtp[];
};

export type CurriculumSet = {
  subject: string;
  grade: string;
  phase: string;
  semester: "Ganjil" | "Genap";
  /** Catatan sumber yang ditampilkan di kaki halaman CP & ATP. */
  source: string;
  cps: CurriculumCp[];
  groups: CurriculumGroup[];
};

export type CurriculumSummary = {
  subject: string;
  grade: string;
  phase: string;
  semester: "Ganjil" | "Genap";
  groupCount: number;
  atpCount: number;
  totalJp: number;
};

export function curriculumSetTotals(set: CurriculumSet): { atpCount: number; totalJp: number } {
  let atpCount = 0;
  let totalJp = 0;
  for (const group of set.groups) {
    atpCount += group.atps.length;
    for (const atp of group.atps) totalJp += atp.jp;
  }
  return { atpCount, totalJp };
}

export function listCurriculumSummaries(sets: readonly CurriculumSet[] = CURRICULUM_SETS): CurriculumSummary[] {
  return sets.map((set) => ({
    subject: set.subject,
    grade: set.grade,
    phase: set.phase,
    semester: set.semester,
    groupCount: set.groups.length,
    ...curriculumSetTotals(set),
  }));
}

export function findCurriculumSet(
  subject: string,
  grade: string,
  semester: string,
  sets: readonly CurriculumSet[] = CURRICULUM_SETS,
): CurriculumSet | null {
  const wantedSubject = subject.trim();
  const wantedGrade = grade.trim();
  const wantedSemester = semester.trim();
  return (
    sets.find(
      (set) => set.subject === wantedSubject && set.grade === wantedGrade && set.semester === wantedSemester,
    ) ?? null
  );
}

export function findCurriculumCp(set: CurriculumSet, code: string): CurriculumCp | null {
  return set.cps.find((cp) => cp.code === code) ?? null;
}

export type TopicGroupList = {
  subject: string;
  groups: string[];
};

/**
 * Daftar kelompok materi (judul TP/Materi) per mapel untuk dropdown
 * "Kelompok materi" pada formulir modul: unik, dalam urutan tampil
 * kurikulum (kelas X ganjil → genap, lalu XI), lintas kelas & semester —
 * modul hanya menyimpan mapel, bukan kelas/semester, jadi guru memilih
 * kelompok dari gabungan mapelnya.
 */
export function listTopicGroups(sets: readonly CurriculumSet[] = CURRICULUM_SETS): TopicGroupList[] {
  const bySubject = new Map<string, string[]>();
  for (const set of sets) {
    const list = bySubject.get(set.subject) ?? [];
    for (const group of set.groups) {
      if (!list.includes(group.title)) list.push(group.title);
    }
    bySubject.set(set.subject, list);
  }
  return [...bySubject.entries()].map(([subject, groups]) => ({ subject, groups }));
}

/**
 * Kunci pencocokan mapel bebas (kolom subject modul adalah teks bebas):
 * bentuk huruf kecil dari teks penuh, dari isi kurung, dan dari teks
 * sebelum kurung — sehingga "Koding dan Kecerdasan Artifisial (KKA)",
 * "KKA", dan "kka" semuanya berujung ke kunci yang sama.
 */
export function subjectMatchKeys(raw: string): string[] {
  const full = raw.trim().toLowerCase();
  const keys = new Set<string>([full]);
  const open = full.indexOf("(");
  const close = full.lastIndexOf(")");
  if (open >= 0 && close > open) {
    keys.add(full.slice(open + 1, close).trim());
    keys.add(full.slice(0, open).trim());
  }
  return [...keys].filter((key) => key.length > 0);
}

/** Kelompok materi untuk satu mapel bebas; [] bila mapelnya tak dikenal. */
export function topicGroupsForSubject(
  rawSubject: string,
  sets: readonly CurriculumSet[] = CURRICULUM_SETS,
): string[] {
  const rawKeys = subjectMatchKeys(rawSubject);
  const match = listTopicGroups(sets).find((entry) =>
    subjectMatchKeys(entry.subject).some((key) => rawKeys.includes(key)),
  );
  return match ? match.groups : [];
}

const SUMBER_MATEMATIKA =
  "ATP: dokumen ATP Matematika SMKN Pasirian · CP: Keputusan Kepala BSKAP Kemendikdasmen No. 046/H/KR/2025";
const SUMBER_KKA =
  "ATP diturunkan dari CP BSKAP 046/H/KR/2025 dan disetujui 3 Nov 2026 sebagai acuan materi KKA Kelas X · CP: BSKAP 046/H/KR/2025";

const CP_MATEMATIKA_FASE_E: CurriculumCp[] = [
  {
    code: "5.1",
    element: "Bilangan",
    text: "Menggeneralisasi sifat-sifat bilangan berpangkat (termasuk bilangan pangkat pecahan), dan menggunakannya untuk menyelesaikan masalah.",
  },
  {
    code: "5.2",
    element: "Aljabar dan Fungsi",
    text: "Menyelesaikan masalah yang berkaitan dengan sistem pertidaksamaan linear dua variabel; menyelesaikan masalah yang berkaitan dengan persamaan dan fungsi kuadrat (termasuk akar imajiner), serta persamaan eksponensial (berbasis bilangan pokok sama) dan fungsi eksponensial.",
  },
  {
    code: "5.3",
    element: "Geometri",
    text: "Mengaplikasikan perbandingan trigonometri (sinus, cosinus, tangen) dari sudut lancip.",
  },
  {
    code: "5.4",
    element: "Analisis Data dan Peluang",
    text: "Merepresentasikan dan menginterpretasi data dengan cara menentukan jangkauan kuartil dan interkuartil; membuat dan menginterpretasi diagram box plot dan menggunakannya untuk membandingkan himpunan data; menentukan dan menggunakan box plot, histogram dan dot plot sesuai dengan natur (karakteristik) data dan kebutuhan; menggunakan diagram pencar untuk menyelidiki dan menjelaskan hubungan antara dua variabel numerik/kuantitatif (termasuk salah satunya variabel bebas berupa waktu); serta mengevaluasi laporan statistika di media berdasarkan tampilan, statistika dan representasi data, termasuk yang disajikan dalam bentuk matriks.",
  },
];

const CP_MATEMATIKA_FASE_F: CurriculumCp[] = [
  {
    code: "6.1",
    element: "Bilangan",
    text: "Menjelaskan barisan dan deret (aritmetika dan geometri), menerapkannya pada beragam masalah terutama masalah bunga tunggal dan majemuk, memodelkan pinjaman dan investasi dengan bunga majemuk dan anuitas, serta menyelidiki (secara numerik atau grafis) pengaruh masing-masing parameter (suku bunga, periode pembayaran) dalam model tersebut.",
  },
  {
    code: "6.2",
    element: "Aljabar dan Fungsi",
    text: "Menentukan fungsi invers, komposisi fungsi, dan transformasi fungsi untuk memodelkan situasi dunia nyata menggunakan fungsi yang sesuai (linear, kuadrat, eksponensial).",
  },
  {
    code: "6.4",
    element: "Analisis Data dan Peluang",
    text: "Melakukan proses penyelidikan statistika untuk mengidentifikasi dan menjelaskan asosiasi antara dua variabel kategorikal (kualitatif) dan antara dua variabel numerikal (kuantitatif); memperkirakan model linear terbaik (best fit linear) pada data numerikal (kuantitatif); membedakan hubungan asosiasi dan sebab-akibat; menjelaskan peluang dan menentukan frekuensi harapan dari kejadian majemuk; menyelidiki konsep dari kejadian saling bebas dan saling lepas, dan menentukan peluangnya; serta memahami konsep peluang bersyarat dan kejadian yang saling bebas menggunakan konsep permutasi dan kombinasi.",
  },
];

const CP_KKA_FASE_E: CurriculumCp[] = [
  {
    code: "1.1",
    element: "Berpikir Komputasional",
    text: "Menerapkan berpikir komputasional untuk memecahkan permasalahan pada objek sesuai bidang keahlian.",
  },
  {
    code: "1.2",
    element: "Literasi Digital",
    text: "Menerapkan produksi dan diseminasi konten digital dalam bentuk sajian multimedia sesuai dengan bidang keahlian.",
  },
  {
    code: "1.3",
    element: "Algoritma Pemrograman",
    text: "Membandingkan beberapa algoritma dan menerapkan algoritma pemrograman untuk menghasilkan aplikasi.",
  },
  {
    code: "1.4",
    element: "Analisis Data",
    text: "Memahami konsep dasar basis data dan menerapkan pengolahan data pada basis data.",
  },
  {
    code: "1.5",
    element: "Literasi dan Etika Kecerdasan Artifisial",
    text: "Memahami prinsip kerja teknologi kecerdasan artifisial secara tepat guna dan bertanggung jawab pada bidang keahlian dengan memperhatikan aspek etika, keamanan data dan dampak sosial penggunaannya.",
  },
  {
    code: "1.6",
    element: "Pemanfaatan dan Pengembangan Kecerdasan Artifisial",
    text: "Menerapkan prompt engineering pada KA generatif sebagai evaluasi dari pemahaman rencana proyek, desain dan pengembangan produk berupa barang/jasa.",
  },
];

function atp(code: string, text: string, jp: number, capstone = false): CurriculumAtp {
  return capstone ? { code, text, jp, capstone: true } : { code, text, jp };
}

/** Ambil hanya CP yang dirujuk kelompok-kelompok satu set dari daftar CP satu fase. */
function onlyCps(all: CurriculumCp[], ...codes: string[]): CurriculumCp[] {
  return all.filter((cp) => codes.includes(cp.code));
}

export const CURRICULUM_SETS: CurriculumSet[] = [
  {
    subject: "Matematika",
    grade: "Kelas X",
    phase: "Fase E",
    semester: "Ganjil",
    source: SUMBER_MATEMATIKA,
    cps: onlyCps(CP_MATEMATIKA_FASE_E, "5.1", "5.2"),
    groups: [
      {
        code: "Materi 1",
        title: "Eksponen",
        material: "Eksponen",
        cpCode: "5.1",
        atps: [
          atp("1.1", "Peserta didik dapat memaknai pangkat pecahan sebagai bentuk akar.", 2),
          atp("1.2", "Peserta didik dapat menggunakan sifat eksponen dengan pangkat rasional.", 2),
          atp("1.3", "Peserta didik dapat menyederhanakan bentuk eksponen menggunakan sifat-sifatnya.", 2),
          atp("1.4", "Peserta didik dapat menyelesaikan persamaan eksponen sederhana.", 2),
          atp("1.5", "Peserta didik dapat memodelkan pertumbuhan sederhana dengan bentuk eksponensial.", 2),
          atp("1.6", "Peserta didik dapat menyelesaikan masalah yang melibatkan pangkat pecahan.", 2),
        ],
      },
      {
        code: "Materi 2",
        title: "Sistem Pertidaksamaan Linear Dua Variabel",
        material: "Sistem Pertidaksamaan Linear Dua Variabel",
        cpCode: "5.2",
        atps: [
          atp("2.1", "Peserta didik dapat mengenali bentuk pertidaksamaan linear dua variabel.", 2),
          atp("2.2", "Peserta didik dapat menentukan daerah penyelesaian pertidaksamaan linear dua variabel.", 2),
          atp("2.3", "Peserta didik dapat menentukan daerah penyelesaian sistem pertidaksamaan linear dua variabel.", 2),
          atp("2.4", "Peserta didik dapat menggunakan titik uji untuk menentukan daerah penyelesaian.", 2),
          atp("2.5", "Peserta didik dapat memodelkan batasan suatu masalah menjadi pertidaksamaan dua variabel.", 2),
          atp("2.6", "Peserta didik dapat menentukan titik pojok daerah penyelesaian.", 2),
          atp("2.7", "Peserta didik dapat menyelesaikan masalah nyata menggunakan sistem pertidaksamaan linear dua variabel.", 2),
        ],
      },
      {
        code: "Materi 3",
        title: "Fungsi Kuadrat",
        material: "Fungsi Kuadrat",
        cpCode: "5.2",
        atps: [
          atp("3.1", "Peserta didik dapat mengenali bentuk umum fungsi kuadrat.", 2),
          atp("3.2", "Peserta didik dapat menggambar dan membaca grafik parabola.", 2),
          atp("3.3", "Peserta didik dapat menentukan akar persamaan kuadrat.", 2),
          atp("3.4", "Peserta didik dapat menyelesaikan persamaan kuadrat dengan pemfaktoran.", 2),
          atp("3.5", "Peserta didik dapat menyelesaikan persamaan kuadrat dengan melengkapkan kuadrat sempurna.", 2),
          atp("3.6", "Peserta didik dapat menyelesaikan persamaan kuadrat menggunakan rumus kuadrat.", 2),
          atp("3.7", "Peserta didik dapat menentukan jenis akar persamaan kuadrat berdasarkan diskriminan.", 2),
          atp("3.8", "Peserta didik dapat mengenali persamaan kuadrat yang tidak memiliki akar real.", 2),
          atp("3.9", "Peserta didik dapat memodelkan masalah nyata dengan fungsi kuadrat.", 2),
        ],
      },
      {
        code: "Materi 4",
        title: "Fungsi Eksponen",
        material: "Fungsi Eksponen",
        cpCode: "5.2",
        atps: [
          atp("4.1", "Peserta didik dapat mengenali bentuk fungsi eksponensial.", 2),
          atp("4.2", "Peserta didik dapat menggambar dan membaca grafik fungsi eksponensial.", 2),
          atp("4.3", "Peserta didik dapat menganalisis pengaruh parameter pada fungsi eksponensial.", 2),
          atp("4.4", "Peserta didik dapat menyelesaikan persamaan eksponensial dengan basis yang sama.", 2),
          atp("4.5", "Peserta didik dapat memodelkan pertumbuhan eksponensial.", 2),
          atp("4.6", "Peserta didik dapat memodelkan peluruhan eksponensial.", 2),
          atp("4.7", "Peserta didik dapat menyelesaikan masalah nyata menggunakan fungsi eksponensial.", 2),
        ],
      },
    ],
  },
  {
    subject: "Matematika",
    grade: "Kelas X",
    phase: "Fase E",
    semester: "Genap",
    source: SUMBER_MATEMATIKA,
    cps: onlyCps(CP_MATEMATIKA_FASE_E, "5.3", "5.4"),
    groups: [
      {
        code: "Materi 1",
        title: "Perbandingan Trigonometri",
        material: "Perbandingan Trigonometri",
        cpCode: "5.3",
        atps: [
          atp("1.1", "Peserta didik dapat menentukan nilai perbandingan sinus, cosinus, dan tangen pada segitiga siku-siku.", 2),
          atp("1.2", "Peserta didik dapat menentukan panjang sisi segitiga siku-siku menggunakan perbandingan trigonometri.", 2),
          atp("1.3", "Peserta didik dapat menentukan besar sudut segitiga siku-siku menggunakan perbandingan trigonometri.", 2),
          atp("1.4", "Peserta didik dapat menentukan nilai perbandingan trigonometri sudut istimewa.", 2),
          atp("1.5", "Peserta didik dapat menggunakan sudut elevasi dan depresi untuk menyelesaikan masalah.", 2),
          atp("1.6", "Peserta didik dapat menyelesaikan masalah tinggi dan jarak menggunakan perbandingan trigonometri.", 2),
          atp("1.7", "Peserta didik dapat memilih perbandingan trigonometri yang tepat untuk suatu masalah.", 2),
        ],
      },
      {
        code: "Materi 2",
        title: "Penyebaran Data",
        material: "Penyebaran Data",
        cpCode: "5.4",
        atps: [
          atp("2.1", "Peserta didik dapat menentukan kuartil suatu data tunggal.", 2),
          atp("2.2", "Peserta didik dapat menentukan jangkauan interkuartil sebagai ukuran penyebaran data.", 2),
          atp("2.3", "Peserta didik dapat menyajikan dan membaca data dalam bentuk box plot.", 2),
          atp("2.4", "Peserta didik dapat menyajikan dan membaca data dalam bentuk histogram.", 2),
          atp("2.5", "Peserta didik dapat menyajikan dan membaca data dalam bentuk dot plot.", 2),
          atp("2.6", "Peserta didik dapat memilih representasi data yang tepat untuk suatu tujuan.", 2),
          atp("2.7", "Peserta didik dapat membandingkan sebaran dua kelompok data.", 2),
        ],
      },
      {
        code: "Materi 3",
        title: "Analisis Data",
        material: "Analisis Data",
        cpCode: "5.4",
        atps: [
          atp("3.1", "Peserta didik dapat menyajikan dan membaca data dua variabel dalam diagram pencar.", 2),
          atp("3.2", "Peserta didik dapat menentukan arah dan kekuatan asosiasi dua variabel dari diagram pencar.", 2),
          atp("3.3", "Peserta didik dapat membedakan variabel bebas dan variabel terikat.", 2),
          atp("3.4", "Peserta didik dapat membaca dan menafsirkan tren data terhadap waktu.", 2),
          atp("3.5", "Peserta didik dapat mengevaluasi tampilan data pada media yang berpotensi menyesatkan.", 2),
          atp("3.6", "Peserta didik dapat mengevaluasi kewajaran klaim statistik yang beredar di media.", 2),
          atp("3.7", "Peserta didik dapat menyajikan dan membaca data dalam bentuk matriks.", 2),
        ],
      },
    ],
  },
  {
    subject: "Matematika",
    grade: "Kelas XI",
    phase: "Fase F",
    semester: "Ganjil",
    source: SUMBER_MATEMATIKA,
    cps: onlyCps(CP_MATEMATIKA_FASE_F, "6.1", "6.2"),
    groups: [
      {
        code: "Materi 1",
        title: "Barisan dan Deret",
        material: "Barisan dan Deret",
        cpCode: "6.1",
        atps: [
          atp("1.1", "Peserta didik dapat menentukan suku dan pola barisan aritmetika.", 3),
          atp("1.2", "Peserta didik dapat menghitung jumlah suku suatu deret aritmetika.", 3),
          atp("1.3", "Peserta didik dapat menentukan suku dan pola barisan geometri.", 3),
          atp("1.4", "Peserta didik dapat menghitung jumlah suku suatu deret geometri.", 3),
        ],
      },
      {
        code: "Materi 2",
        title: "Matematika Keuangan",
        material: "Matematika Keuangan",
        cpCode: "6.1",
        atps: [
          atp("2.1", "Peserta didik dapat menghitung bunga tunggal.", 3),
          atp("2.2", "Peserta didik dapat menghitung bunga majemuk.", 3),
          atp("2.3", "Peserta didik dapat menghitung nilai masa depan suatu investasi.", 3),
          atp("2.4", "Peserta didik dapat menghitung nilai sekarang suatu pinjaman.", 3),
        ],
      },
      {
        code: "Materi 3",
        title: "Fungsi Komposisi dan Fungsi Invers",
        material: "Fungsi Komposisi dan Fungsi Invers",
        cpCode: "6.2",
        atps: [
          atp("3.1", "Peserta didik dapat menentukan hasil operasi komposisi dua fungsi.", 3),
          atp("3.2", "Peserta didik dapat menentukan domain fungsi komposisi.", 3),
          atp("3.3", "Peserta didik dapat menjelaskan konsep fungsi invers.", 3),
          atp("3.4", "Peserta didik dapat menentukan syarat suatu fungsi memiliki invers.", 3),
        ],
      },
      {
        code: "Materi 4",
        title: "Transformasi Grafik Fungsi",
        material: "Transformasi Grafik Fungsi",
        cpCode: "6.2",
        atps: [
          atp("4.1", "Peserta didik dapat menentukan hasil translasi grafik suatu fungsi.", 3),
          atp("4.2", "Peserta didik dapat menentukan hasil refleksi grafik suatu fungsi.", 3),
          atp("4.3", "Peserta didik dapat menentukan hasil peregangan dan penyusutan grafik suatu fungsi.", 3),
        ],
      },
    ],
  },
  {
    subject: "Matematika",
    grade: "Kelas XI",
    phase: "Fase F",
    semester: "Genap",
    source: SUMBER_MATEMATIKA,
    cps: onlyCps(CP_MATEMATIKA_FASE_F, "6.4"),
    groups: [
      {
        code: "Materi 1",
        title: "Statistika Dua Variabel",
        material: "Statistika Dua Variabel",
        cpCode: "6.4",
        atps: [
          atp("1.1", "Peserta didik dapat menganalisis hubungan dua variabel kategorik dari tabel dua arah.", 3),
          atp("1.2", "Peserta didik dapat menganalisis hubungan dua variabel numerik dari diagram pencar.", 3),
          atp("1.3", "Peserta didik dapat menentukan dan menggunakan garis regresi linear.", 3),
          atp("1.4", "Peserta didik dapat menafsirkan gradien garis regresi dalam konteks data.", 3),
        ],
      },
      {
        code: "Materi 2",
        title: "Kaidah Pencacahan",
        material: "Kaidah Pencacahan",
        cpCode: "6.4",
        atps: [
          atp("2.1", "Peserta didik dapat menggunakan aturan penjumlahan dalam pencacahan.", 3),
          atp("2.2", "Peserta didik dapat menggunakan aturan perkalian dalam pencacahan.", 3),
          atp("2.3", "Peserta didik dapat menghitung banyak susunan menggunakan permutasi.", 3),
          atp("2.4", "Peserta didik dapat menghitung banyak pilihan menggunakan kombinasi.", 3),
        ],
      },
      {
        code: "Materi 3",
        title: "Peluang Bersyarat",
        material: "Peluang Bersyarat",
        cpCode: "6.4",
        atps: [
          atp("3.1", "Peserta didik dapat menghitung peluang bersyarat suatu kejadian.", 3),
          atp("3.2", "Peserta didik dapat menghitung peluang dari tabel dua arah.", 3),
          atp("3.3", "Peserta didik dapat menggunakan diagram pohon untuk menghitung peluang bersyarat.", 3),
          atp("3.4", "Peserta didik dapat mengenali dan menghitung peluang kejadian saling bebas.", 3),
        ],
      },
    ],
  },
  {
    subject: "KKA",
    grade: "Kelas X",
    phase: "Fase E",
    semester: "Ganjil",
    source: SUMBER_KKA,
    cps: onlyCps(CP_KKA_FASE_E, "1.1", "1.3", "1.5"),
    groups: [
      {
        code: "TP 1",
        title: "Berpikir Komputasional",
        material: "Berpikir Komputasional",
        cpCode: "1.1",
        atps: [
          atp("1.1", "Peserta didik dapat membedakan masalah sederhana dan masalah kompleks serta mengidentifikasi masalah kompleks pada objek sesuai bidang keahlian di lingkungan sekitar.", 2),
          atp("1.2", "Peserta didik dapat menerapkan dekomposisi dan analisis akar masalah (mis. metode 5 Whys) untuk mengurai masalah kompleks menjadi bagian-bagian yang lebih kecil.", 2),
          atp("1.3", "Peserta didik dapat menerapkan pengenalan pola dan abstraksi untuk menemukan keteraturan serta menyaring informasi yang relevan dari suatu masalah.", 2),
          atp("1.4", "Peserta didik dapat menyusun algoritma penyelesaian masalah dan menerapkannya dalam simulasi, termasuk memodelkan masalah sebagai graf untuk menentukan solusi optimal sederhana (mis. rute tercepat).", 2),
          atp("1.5", "Peserta didik dapat menjelaskan integrasi kecerdasan artifisial dalam berpikir komputasional melalui perception, data representation, reasoning, dan learning.", 2),
          atp("1.6", "Peserta didik dapat menerapkan berpikir komputasional secara utuh untuk memecahkan permasalahan pada objek sesuai bidang keahlian.", 4, true),
        ],
      },
      {
        code: "TP 2",
        title: "Algoritma Pemrograman",
        material: "Algoritma dan Pemrograman Lanjut",
        cpCode: "1.3",
        atps: [
          atp("2.1", "Peserta didik dapat menjelaskan konsep algoritma dan menyusun algoritma dasar untuk menyelesaikan persoalan sederhana secara logis dan berurutan.", 2),
          atp("2.2", "Peserta didik dapat merepresentasikan logika pemrograman dalam flowchart dengan simbol dan struktur yang tepat.", 2),
          atp("2.3", "Peserta didik dapat menggunakan array untuk menyimpan dan mengolah sekumpulan data sejenis.", 2),
          atp("2.4", "Peserta didik dapat menerapkan pengondisian bertingkat (nested if) dan perulangan bersarang (nested loop) dalam algoritma terstruktur.", 2),
          atp("2.5", "Peserta didik dapat membandingkan algoritma pencarian sequential search dan binary search dari cara kerja serta efisiensinya.", 2),
          atp("2.6", "Peserta didik dapat membandingkan algoritma pengurutan selection sort dan insertion sort dari cara kerja serta langkah-langkahnya.", 2),
          atp("2.7", "Peserta didik dapat menjelaskan algoritma rule-based dan decision tree serta menerapkannya untuk pengambilan keputusan sederhana.", 2),
          atp("2.8", "Peserta didik dapat menerapkan regresi linear untuk memprediksi nilai dari data dua variabel.", 2),
          atp("2.9", "Peserta didik dapat menerapkan K-Means clustering untuk mengelompokkan data dan Naive Bayes untuk mengklasifikasikan data sederhana.", 2),
          atp("2.10", "Peserta didik dapat menulis program berbasis teks dengan sintaks dasar Python (variabel, input/output, pengondisian, perulangan) menggunakan Google Colab.", 2),
          atp("2.11", "Peserta didik dapat menerapkan debugging untuk menemukan, menganalisis, dan memperbaiki kesalahan dalam kode program.", 2),
          atp("2.12", "Peserta didik dapat menerapkan algoritma pemrograman untuk menghasilkan aplikasi/program sederhana sesuai bidang keahlian.", 4, true),
        ],
      },
      {
        code: "TP 3",
        title: "Literasi dan Etika Kecerdasan Artifisial",
        material: "Literasi dan Etika KA",
        cpCode: "1.5",
        atps: [
          atp("3.1", "Peserta didik dapat menjelaskan cara kecerdasan artifisial mengenali pola citra.", 2),
          atp("3.2", "Peserta didik dapat menjelaskan cara kecerdasan artifisial mengenali pola suara dan membandingkannya dengan pengenalan pola citra.", 2),
          atp("3.3", "Peserta didik dapat mengidentifikasi profesi, keterampilan yang dibutuhkan, dan perspektif karier di bidang kecerdasan artifisial.", 2),
          atp("3.4", "Peserta didik dapat menganalisis dampak positif pemanfaatan kecerdasan artifisial pada bidang keahlian dan kehidupan sehari-hari.", 2),
          atp("3.5", "Peserta didik dapat menganalisis dampak negatif dan risiko pemanfaatan kecerdasan artifisial, termasuk bias, privasi, dan perubahan dunia kerja.", 2),
          atp("3.6", "Peserta didik dapat menerapkan prinsip etika, regulasi, keamanan data, dan tanggung jawab dalam menggunakan kecerdasan artifisial secara tepat guna pada bidang keahlian.", 2, true),
        ],
      },
    ],
  },
  {
    subject: "KKA",
    grade: "Kelas X",
    phase: "Fase E",
    semester: "Genap",
    source: SUMBER_KKA,
    cps: onlyCps(CP_KKA_FASE_E, "1.6", "1.2", "1.4"),
    groups: [
      {
        code: "TP 4",
        title: "Pemanfaatan dan Pengembangan Kecerdasan Artifisial",
        material: "Prompt Engineering & Design Thinking",
        cpCode: "1.6",
        atps: [
          atp("4.1", "Peserta didik dapat menyusun prompt yang spesifik, jelas, berkonteks, dan berperan (role prompting) dengan format jawaban yang ditentukan.", 2),
          atp("4.2", "Peserta didik dapat menerapkan variasi teknik prompt engineering (zero-shot, few-shot, dan kerangka PGTC) pada KA generatif.", 2),
          atp("4.3", "Peserta didik dapat menjelaskan cara kerja KA generatif (LLM) dalam menghasilkan konten.", 2),
          atp("4.4", "Peserta didik dapat mengevaluasi konten berbasis kecerdasan artifisial dan mengidentifikasi bias di dalamnya.", 2),
          atp("4.5", "Peserta didik dapat merancang sistem KA menggunakan tahapan design thinking (empathize, define, ideate) untuk suatu permasalahan bidang keahlian.", 2),
          atp("4.6", "Peserta didik dapat menerapkan prompt engineering pada KA generatif untuk mengembangkan dan mengevaluasi prototipe produk berupa barang/jasa sesuai rencana proyek dan desain yang dibuat.", 4, true),
        ],
      },
      {
        code: "TP 5",
        title: "Literasi Digital",
        material: "Kreativitas dan Etika Produksi Konten Media Sosial",
        cpCode: "1.2",
        atps: [
          atp("5.1", "Peserta didik dapat menerapkan konsep multimedia (teks, gambar, audio, video, animasi) dalam sajian konten digital.", 2),
          atp("5.2", "Peserta didik dapat menerapkan ketentuan hak cipta dan lisensi digital (termasuk Creative Commons) dalam menggunakan karya orang lain.", 2),
          atp("5.3", "Peserta didik dapat menerapkan etika produksi konten digital yang bertanggung jawab.", 2),
          atp("5.4", "Peserta didik dapat memproduksi konten multimedia terintegrasi sesuai bidang keahlian melalui proses pembuatan konten digital (perencanaan, produksi, penyuntingan).", 4),
          atp("5.5", "Peserta didik dapat menerapkan teknik keamanan digital dalam berbagi konten.", 2),
          atp("5.6", "Peserta didik dapat mendiseminasikan konten multimedia sesuai bidang keahlian secara efektif dan bertanggung jawab.", 2, true),
        ],
      },
      {
        code: "TP 6",
        title: "Analisis Data",
        material: "Pengelolaan Informasi Digital",
        cpCode: "1.4",
        atps: [
          atp("6.1", "Peserta didik dapat menjelaskan konsep data, informasi, dan basis data (termasuk piramida DIKW).", 2),
          atp("6.2", "Peserta didik dapat membedakan jenis-jenis basis data dan kegunaannya.", 2),
          atp("6.3", "Peserta didik dapat merancang basis data relasi yang memuat tabel, record, atribut, dan relasi antartabel.", 2),
          atp("6.4", "Peserta didik dapat menggunakan server lokal dan perangkat lunak basis data (phpMyAdmin) untuk membuat basis data dan tabel.", 2),
          atp("6.5", "Peserta didik dapat menulis perintah SQL dasar untuk membuat, menambah, menampilkan, mengubah, dan menghapus data.", 2),
          atp("6.6", "Peserta didik dapat menerapkan pengolahan data dasar (filter, sort, fungsi hitung, dan visualisasi) pada spreadsheet dan basis data.", 2),
          atp("6.7", "Peserta didik dapat menerapkan pengolahan data pada basis data untuk menyelesaikan permasalahan sesuai bidang keahlian melalui proyek (mis. katalog perpustakaan, analisis kehadiran, atau reservasi ruang).", 4, true),
        ],
      },
    ],
  },
];
