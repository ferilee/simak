// Penentu tampilan kartu sambutan guru di ruang kerja guru (Langkah 1).
// Murni keputusan dari penanda server + kelengkapan data guru:
//
//  - "sembunyi": guru sudah menutup kartu (welcome_dismissed_at terisi)
//    — penanda selalu menang atas keadaan apa pun.
//  - "ringkas":  panduan awal lengkap (punya kelas aktif, punya materi,
//    punya penugasan terbit) tetapi belum ditutup — tampil satu baris
//    "Panduan awal selesai ✓" yang bisa dibuka lagi atau ditutup.
//  - "penuh":   selain itu — kartu lengkap dengan tiga jalan mulai dan
//    checklist panduan awal.
//
// Berbeda dari sambutan murid: guru lama yang datanya sudah lengkap
// tidak pernah diganggu kartu penuh, hanya baris ringkas sekali jalan.

export type WelcomeView = "sembunyi" | "ringkas" | "penuh";

export type WelcomeSignals = {
  dismissedAt: Date | string | null | undefined;
  hasClass: boolean;
  hasModule: boolean;
  hasAssignment: boolean;
};

export function welcomeView(signals: WelcomeSignals): WelcomeView {
  if (signals.dismissedAt !== null && signals.dismissedAt !== undefined) return "sembunyi";
  if (signals.hasClass && signals.hasModule && signals.hasAssignment) return "ringkas";
  return "penuh";
}

export type WelcomeChecklistItem = {
  key: "kelas" | "materi" | "tugas";
  label: string;
  done: boolean;
  // Indeks langkah wizard guru yang dituju bila butir diklik
  // (0 = Bangun materi, 2 = Atur kelas, 3 = Terbitkan tugas).
  step: number;
};

export function welcomeChecklist(signals: WelcomeSignals): WelcomeChecklistItem[] {
  return [
    { key: "kelas", label: "Punya kelas tujuan", done: signals.hasClass, step: 2 },
    { key: "materi", label: "Punya materi", done: signals.hasModule, step: 0 },
    { key: "tugas", label: "Menerbitkan tugas pertama", done: signals.hasAssignment, step: 3 },
  ];
}

export function welcomeChecklistComplete(signals: WelcomeSignals): boolean {
  return welcomeChecklist(signals).every((item) => item.done);
}
