// Penata teks "Salin daftar kelompok" pada panel Kelompok guru (Tahap 3
// mini): susunan kelompok satu kelas diratakan menjadi teks polos yang siap
// ditempel ke obrolan (mis. grup WA kelas). Fungsi murni — diuji di
// kelompok-copy.test.mjs.
//
// Format: judul, baris kosong, satu baris per kelompok ("<nama kelompok>:
// <anggota, ...>"), lalu — hanya bila ada — baris kosong + "Belum
// berkelompok: <nama, ...>". Bagian yang kosong tidak menyisakan baris
// kosong berlebih.

export type GroupsCopyGroup = {
  name: string;
  members: string[];
};

export type GroupsCopyInput = {
  assignmentTitle: string;
  className: string;
  groups: GroupsCopyGroup[];
  ungrouped: string[];
};

export function groupsCopyText(input: GroupsCopyInput): string {
  const sections: string[] = [`Kelompok ${input.assignmentTitle} — ${input.className}`];
  if (input.groups.length > 0) {
    sections.push(input.groups.map((group) => `${group.name}: ${group.members.join(", ")}`).join("\n"));
  }
  if (input.ungrouped.length > 0) {
    sections.push(`Belum berkelompok: ${input.ungrouped.join(", ")}`);
  }
  return sections.join("\n\n");
}
