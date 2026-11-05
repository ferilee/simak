import { redirect } from "next/navigation";

// Perpustakaan Bersama kini tinggal di dalam cangkang ruang guru — panel
// di bilah kanan (components/LibraryPanel), bukan halaman sendiri. Rute
// lama ini hanya mengalihkan agar penanda/riwayat lama tetap sampai ke
// tempat yang sama: cangkang membaca ?tampilan=perpustakaan sekali pada
// muatan pertama lalu membuka tampilan perpustakaannya.
export default function PerpustakaanPage() {
  redirect("/guru?tampilan=perpustakaan");
}
