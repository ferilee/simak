// Helper murni untuk dua panel Langkah 5 ("Pantau hasil") selain
// Pengumpulan LKPD: saringan + urutan Indikasi integritas dan pencarian
// Rekap penugasan. Dipisah dari komponen React supaya bisa diuji langsung
// dengan bun (pola yang sama seperti grading-helpers.ts).

export type IntegrityAlertLike = {
  assignment_id: number;
  assignment_title: string;
  student_name: string;
  username: string;
  total_events: number;
  risk: string;
  last_event: string;
};

/** Peringkat tingkat risiko: 0 paling berat (peringatan), lalu perlu ditinjau, terakhir info. */
export function integrityRiskRank(risk: string): number {
  if (risk === "peringatan") return 0;
  if (risk === "perlu_ditinjau") return 1;
  return 2;
}

/**
 * Urutan tampil indikasi integritas: tingkat risiko terberat dulu, lalu
 * jumlah kejadian terbanyak, terakhir kejadian paling baru. Stabil dan
 * tidak mengubah array asal. (API hanya mengurutkan menurut kejadian
 * terbaru, jadi urutan tingkat ini ditegakkan di klien.)
 */
export function sortIntegrityAlerts<T extends IntegrityAlertLike>(alerts: T[]): T[] {
  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) =>
      integrityRiskRank(a.alert.risk) - integrityRiskRank(b.alert.risk)
      || b.alert.total_events - a.alert.total_events
      || new Date(b.alert.last_event).getTime() - new Date(a.alert.last_event).getTime()
      || a.index - b.index)
    .map((entry) => entry.alert);
}

export type IntegrityAssignmentOption = {
  id: number;
  title: string;
};

/** Penugasan berbeda yang benar-benar muncul pada daftar indikasi, terurut menurut judul. */
export function distinctIntegrityAssignments(alerts: IntegrityAlertLike[]): IntegrityAssignmentOption[] {
  const byId = new Map<number, string>();
  for (const alert of alerts) {
    if (!byId.has(alert.assignment_id)) byId.set(alert.assignment_id, alert.assignment_title);
  }
  return [...byId.entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title, "id"));
}

export type IntegrityFilter = {
  assignmentId: number | "semua";
  risk: string; // "semua" | "peringatan" | "perlu_ditinjau"
  query: string;
};

/**
 * Saringan indikasi integritas (semua di klien): penugasan terpilih, chip
 * risiko terpilih, dan pencarian teks pada nama atau username murid
 * (substring, abaikan huruf besar/kecil dan spasi tepi).
 */
export function filterIntegrityAlerts<T extends IntegrityAlertLike>(alerts: T[], filter: IntegrityFilter): T[] {
  const query = filter.query.trim().toLowerCase();
  return alerts.filter((alert) => {
    if (filter.assignmentId !== "semua" && alert.assignment_id !== filter.assignmentId) return false;
    if (filter.risk !== "semua" && alert.risk !== filter.risk) return false;
    if (query !== ""
      && !alert.student_name.toLowerCase().includes(query)
      && !alert.username.toLowerCase().includes(query)) return false;
    return true;
  });
}

export type AssignmentSearchLike = {
  title: string;
  classes: { name: string }[];
};

/**
 * Pencarian Rekap penugasan: cocok bila teks (substring, abaikan huruf
 * besar/kecil) ada pada judul penugasan atau nama salah satu kelasnya.
 * Pencarian kosong mengembalikan daftar apa adanya.
 */
export function filterAssignmentsByQuery<T extends AssignmentSearchLike>(assignments: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return assignments;
  return assignments.filter((assignment) =>
    assignment.title.toLowerCase().includes(needle)
    || assignment.classes.some((kelas) => kelas.name.toLowerCase().includes(needle)));
}
