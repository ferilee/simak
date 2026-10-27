"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toast } from "../../components/Toast";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json().catch(() => ({})) as {
        user?: { role?: "guru" | "murid" };
        message?: string;
      };

      if (!response.ok || !body.user?.role) {
        setMessage(body.message ?? "Login gagal. Periksa username dan password.");
        return;
      }

      router.replace(body.user.role === "guru" ? "/guru" : "/murid");
    } catch {
      setMessage("Tidak dapat menghubungi SIMAK.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell login-shell">
      <div className="login-orb login-orb-top" aria-hidden="true" />
      <div className="login-orb login-orb-right" aria-hidden="true" />
      <div className="login-orb login-orb-bottom" aria-hidden="true" />

      <header className="site-header login-header container">
        <Link className="brand" href="/login" aria-label="SIMAK login">
          <span className="brand-mark" aria-hidden="true">S</span>
          SIMAK
        </Link>
        <span className="login-header-note">RUANG BELAJAR</span>
      </header>

      <div className="auth-layout login-layout container">
        <section className="auth-card login-card" aria-labelledby="login-title">
          <div className="login-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              <path d="M10 25 32 12l22 13-22 13-22-13Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
              <path d="M18 30v12c8 7 20 7 28 0V30M54 25v13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="54" cy="42" r="3" fill="currentColor" />
            </svg>
          </div>
          <p className="eyebrow">Akses pembelajaran</p>
          <h1 id="login-title">Selamat Datang Kembali</h1>
          <p className="login-kicker">Masuk untuk melanjutkan</p>
          <p className="auth-card-intro">Gunakan username dan password RUAS yang sudah Anda miliki.</p>

          <form className="auth-form" onSubmit={submit}>
            <label className="field login-field" htmlFor="username">
              <span>Username</span>
              <span className="login-input-wrap">
                <svg className="login-input-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>
                <input id="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username RUAS" />
              </span>
            </label>
            <label className="field login-field" htmlFor="password">
              <span>Password</span>
              <span className="login-input-wrap">
                <svg className="login-input-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password RUAS" />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} title={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                  {showPassword ? "◉" : "◌"}
                </button>
              </span>
            </label>
            <button className="button login-submit" type="submit" disabled={loading}>
              <span>{loading ? "Memverifikasi..." : "Masuk"}</span>
              <span className="login-submit-icon" aria-hidden="true">→</span>
            </button>
          </form>
          <div className="login-helper">
            <strong>Masuk dengan akun RUAS</strong>
            <span>SIMAK menggunakan akun yang sama untuk guru dan murid.</span>
          </div>
          <p className="login-footer">RUAS menilai · SIMAK mengajar</p>
        </section>
      </div>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}
    </main>
  );
}

