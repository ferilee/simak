// Penentuan tab beranda murid dari parameter URL (perbaikan
// navigasi murid, calon v1.0.77): bilah bawah dan menu samping
// menautkan Materi/Penugasan sebagai /murid?tab=materi dan
// /murid?tab=penugasan, jadi tab yang tampil HARUS fungsi murni
// dari string pencarian URL saat ini — bukan state yang hanya
// dibaca sekali saat halaman dipasang. Nilai yang diakui hanya
// "materi" dan "penugasan"; parameter hilang, kosong, atau nilai
// lain apa pun (termasuk "nilai"/"jurnal" yang merupakan rute
// sungguhan tersendiri) berarti tab bawaan "dashboard".
//
// Fungsi ini murni agar pemetaannya terkunci uji; halaman beranda
// menyinkronkan state tab-nya dari hasil fungsi ini setiap kali
// parameter URL berubah.

export type MuridHomeTab = "dashboard" | "materi" | "penugasan";

/** Tab beranda murid untuk string pencarian URL (dengan atau tanpa "?"). */
export function muridTabFromSearch(search: string): MuridHomeTab {
  const requested = new URLSearchParams(search).get("tab");
  if (requested === "materi" || requested === "penugasan") return requested;
  return "dashboard";
}
