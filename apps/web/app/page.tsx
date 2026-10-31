"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../lib/api";

type MeResponse = {
  ok: true;
  user: { display_name?: string; name?: string; username: string; role: "guru" | "murid" };
};

const SKIP_KEY = "simak.langsungLogin";

const QUOTES = [
  "Tidak harus langsung bisa. Yang penting berani mulai dan tidak berhenti di tengah jalan.",
  "Paham itu bukan soal cepat, tapi soal mau mengulang sampai jelas.",
  "Satu materi selesai hari ini lebih berharga daripada sepuluh rencana untuk besok.",
  "Salah menjawab itu bagian dari belajar. Yang rugi hanya yang tidak mencoba.",
  "Konsisten sedikit-sedikit mengalahkan semangat besar yang hanya datang sekali.",
  "Bertanya bukan tanda tidak bisa — itu tanda sedang benar-benar belajar.",
];

const STEPS = [
  {
    title: "Baca materi",
    description: "Mulai dari materinya dulu. Baca dengan tenang sampai gambaran besarnya jelas di kepala.",
  },
  {
    title: "Kerjakan LKPD",
    description: "Latih pemahamanmu lewat aktivitas interaktif, dikerjakan langkah demi langkah.",
  },
  {
    title: "Kuis di RUAS",
    description: "Uji seberapa jauh pemahamanmu lewat kuis singkat yang terhubung ke RUAS.",
  },
  {
    title: "Exit ticket 3-2-1",
    description: "Tutup sesi dengan 3 hal yang dipahami, 2 contoh penerapan, dan 1 hal yang masih membingungkan.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [quoteIndex, setQuoteIndex] = useState(0);

  // Pengunjung yang sesinya masih aktif tidak perlu melihat landing:
  // periksa bendera lewati dulu, lalu sesi lewat endpoint yang sama
  // seperti halaman guru/murid (/auth/me) dan arahkan sesuai peran.
  useEffect(() => {
    let cancelled = false;

    try {
      if (window.localStorage.getItem(SKIP_KEY) === "1") {
        router.replace("/login");
        return;
      }
    } catch {
      // localStorage tidak tersedia; lanjut ke pemeriksaan sesi.
    }

    void (async () => {
      try {
        const me = await apiRequest<MeResponse>("/auth/me");
        if (!cancelled && me.user?.role) {
          router.replace(me.user.role === "guru" ? "/guru" : "/murid");
        }
      } catch {
        // Belum masuk — tetap di landing.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Kutipan berganti otomatis; dimatikan bila pengguna meminta gerak minimum.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % QUOTES.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  function skipLandingForever() {
    try {
      window.localStorage.setItem(SKIP_KEY, "1");
    } catch {
      // Gagal menyimpan tidak menghalangi navigasi ke /login.
    }
  }

  return (
    <main className="landing-shell">
      <div className="landing-blob landing-blob-a" aria-hidden="true" />
      <div className="landing-blob landing-blob-b" aria-hidden="true" />

      <div className="landing-inner container">
        <header className="landing-brand-row landing-rise" style={{ animationDelay: "0ms" }}>
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">S</span>
            SIMAK
          </span>
          <span className="landing-tagline">RUAS menilai · SIMAK mengajar</span>
        </header>

        <section className="landing-hero">
          <h1 className="landing-title landing-rise" style={{ animationDelay: "80ms" }}>
            Belajar pelan-pelan, paham beneran.
          </h1>
          <p className="landing-subtitle landing-rise" style={{ animationDelay: "160ms" }}>
            SIMAK adalah ruang belajarmu: baca materi, kerjakan LKPD interaktif, uji pemahaman lewat kuis RUAS, dan
            tutup dengan exit ticket — semua dalam satu alur yang jelas.
          </p>
          <div className="landing-cta-row landing-rise" style={{ animationDelay: "240ms" }}>
            <a className="landing-cta" href="/login">
              Masuk SIMAK →
            </a>
            <a className="landing-skip" href="/login" onClick={skipLandingForever}>
              Langsung ke halaman masuk lain kali
            </a>
          </div>
        </section>

        <figure className="landing-quote landing-rise" style={{ animationDelay: "320ms" }}>
          <span className="landing-quote-label">Kata semangat untukmu</span>
          <blockquote key={quoteIndex} className="landing-quote-text">
            {QUOTES[quoteIndex]}
          </blockquote>
        </figure>

        <section className="landing-steps" aria-labelledby="landing-steps-title">
          <h2 id="landing-steps-title" className="landing-steps-title landing-rise" style={{ animationDelay: "400ms" }}>
            Alur belajarmu di SIMAK
          </h2>
          <ol className="landing-steps-grid">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="landing-step-card landing-rise"
                style={{ animationDelay: `${480 + index * 90}ms` }}
              >
                <span className="landing-step-number" aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="landing-footer">
          SIMAK — Sumber Informasi, Materi, dan Aktivitas Kelas · SMKN Pasirian
        </footer>
      </div>
    </main>
  );
}
