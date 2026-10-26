import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <h1>SIMAK</h1>
      <p>
        <strong>Sumber Informasi, Materi, dan Aktivitas Kelas</strong> — tempat guru
        menerbitkan materi dan LKPD interaktif, dan murid belajar serta berlatih.
        Asesmen tetap di <strong>RUAS</strong>: RUAS menilai, SIMAK mengajar.
      </p>
      <p>Masuk dengan username dan password RUAS yang sudah Anda miliki.</p>
      <nav style={{ display: "flex", gap: 12 }}>
        <Link href="/login">Masuk</Link>
        <Link href="/guru">Ruang Guru</Link>
        <Link href="/murid">Ruang Murid</Link>
      </nav>
    </main>
  );
}
