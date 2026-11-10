// Helper murni untuk panel "CP & ATP" (daftar kurikulum baca-saja,
// Tahap 1). Datanya datang dari API (lib/kurikulum di sisi api adalah
// sumber tunggalnya); berkas ini hanya membentuk pilihan pemilih
// (mapel → kelas → semester) dan urutan tampil pohon CP → kelompok →
// ATP, agar logika tampilnya teruji tanpa merender halaman.

export type KurikulumAtp = {
  code: string;
  text: string;
  jp: number;
  capstone?: boolean;
};

export type KurikulumCp = {
  code: string;
  element: string;
  text: string;
};

export type KurikulumGroup = {
  code: string;
  title: string;
  material: string;
  cpCode: string;
  atps: KurikulumAtp[];
};

export type KurikulumSet = {
  subject: string;
  grade: string;
  phase: string;
  semester: "Ganjil" | "Genap";
  source: string;
  cps: KurikulumCp[];
  groups: KurikulumGroup[];
};

export type KurikulumSummary = {
  subject: string;
  grade: string;
  phase: string;
  semester: "Ganjil" | "Genap";
  groupCount: number;
  atpCount: number;
  totalJp: number;
};

export type KurikulumSelection = {
  subject: string;
  grade: string;
  semester: "Ganjil" | "Genap";
};

export function subjectsOf(summaries: readonly KurikulumSummary[]): string[] {
  return [...new Set(summaries.map((s) => s.subject))];
}

export function gradesOf(summaries: readonly KurikulumSummary[], subject: string): string[] {
  return [...new Set(summaries.filter((s) => s.subject === subject).map((s) => s.grade))];
}

export function semestersOf(
  summaries: readonly KurikulumSummary[],
  subject: string,
  grade: string,
): Array<"Ganjil" | "Genap"> {
  return summaries.filter((s) => s.subject === subject && s.grade === grade).map((s) => s.semester);
}

/**
 * Perbaiki pilihan agar selalu menunjuk set yang benar-benar ada:
 * sesudah guru mengganti mapel, kelas/semester lama bisa jadi tidak
 * tersedia untuk mapel itu — jatuhkan ke pilihan pertama yang tersedia
 * pada tingkat itu. Mengembalikan null hanya bila ringkasannya kosong.
 */
export function clampSelection(
  summaries: readonly KurikulumSummary[],
  current: KurikulumSelection | null,
): KurikulumSelection | null {
  if (summaries.length === 0) return null;
  const first = summaries[0]!;
  const subject = current && subjectsOf(summaries).includes(current.subject) ? current.subject : first.subject;
  const grades = gradesOf(summaries, subject);
  const grade = current && current.subject === subject && grades.includes(current.grade) ? current.grade : grades[0]!;
  const semesters = semestersOf(summaries, subject, grade);
  const semester =
    current && current.subject === subject && current.grade === grade && semesters.includes(current.semester)
      ? current.semester
      : semesters[0]!;
  return { subject, grade, semester };
}

export type KurikulumSection = {
  group: KurikulumGroup;
  /** CP yang menaungi kelompok ini; null bila kodenya tak ditemukan. */
  cp: KurikulumCp | null;
  /** Tampilkan panji CP di atas kelompok ini (CP berganti dari kelompok sebelumnya). */
  showCp: boolean;
  atpCount: number;
  totalJp: number;
};

export function planSections(set: KurikulumSet): KurikulumSection[] {
  const sections: KurikulumSection[] = [];
  let previousCpCode: string | null = null;
  for (const group of set.groups) {
    sections.push({
      group,
      cp: set.cps.find((cp) => cp.code === group.cpCode) ?? null,
      showCp: group.cpCode !== previousCpCode,
      atpCount: group.atps.length,
      totalJp: group.atps.reduce((sum, atp) => sum + atp.jp, 0),
    });
    previousCpCode = group.cpCode;
  }
  return sections;
}
