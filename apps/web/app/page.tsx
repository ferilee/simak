import Link from "next/link";

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="site-header container">
        <Link className="brand" href="/" aria-label="SIMAK beranda">
          <span className="brand-mark" aria-hidden="true">S</span>
          SIMAK
        </Link>
        <Link className="button button-secondary" href="/login">Masuk</Link>
      </header>

      <section className="hero container" aria-labelledby="hero-title">
        <div>
          <p className="eyebrow">Sumber Informasi, Materi, dan Aktivitas Kelas</p>
          <h1 id="hero-title">Belajar lebih terarah, mengajar lebih mudah.</h1>
          <p className="hero-lead">
            SIMAK membantu guru menerbitkan materi dan LKPD interaktif, sementara murid
            belajar, berlatih, dan mengumpulkan tugas dalam satu ruang.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/login">Mulai dengan SIMAK</Link>
            <a className="button button-secondary" href="#ruang">Lihat ruang belajar</a>
          </div>
        </div>

        <aside className="hero-panel" aria-label="Cara kerja SIMAK">
          <h2>Belajar terhubung dengan RUAS</h2>
          <p>RUAS menilai, SIMAK mengajar. Keduanya saling melengkapi.</p>
          <ul className="hero-panel-list">
            <li>Materi dan aktivitas tersusun dalam satu tempat.</li>
            <li>Guru dapat memantau progres dan memberi nilai.</li>
            <li>Murid memiliki langkah belajar yang jelas.</li>
          </ul>
        </aside>
      </section>

      <section className="role-section container" id="ruang" aria-labelledby="role-title">
        <div className="section-heading">
          <p className="eyebrow">Pilih ruang Anda</p>
          <h2>Mulai dari peran yang sesuai</h2>
          <p>Masuk menggunakan username dan password RUAS yang sudah Anda miliki.</p>
        </div>
        <div className="role-grid">
          <Link className="role-card" href="/guru">
            <h3>Ruang Guru</h3>
            <p>Buat materi, susun LKPD, terbitkan penugasan, dan lihat rekap belajar.</p>
            <span>Buka ruang guru →</span>
          </Link>
          <Link className="role-card" href="/murid">
            <h3>Ruang Murid</h3>
            <p>Gabung kelas, baca materi, kerjakan LKPD, dan lihat penugasan Anda.</p>
            <span>Buka ruang murid →</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
