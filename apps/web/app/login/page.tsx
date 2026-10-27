"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="site-shell">
      <header className="site-header container">
        <Link className="brand" href="/" aria-label="SIMAK beranda">
          <span className="brand-mark" aria-hidden="true">S</span>
          SIMAK
        </Link>
      </header>

      <div className="auth-layout container">
        <section className="auth-card" aria-labelledby="login-title">
          <Link className="back-link" href="/">← Kembali ke beranda</Link>
          <p className="eyebrow">Akses pembelajaran</p>
          <h1 id="login-title">Masuk ke SIMAK</h1>
          <p className="auth-card-intro">Gunakan username dan password RUAS yang sudah Anda miliki.</p>

          <form className="auth-form" onSubmit={submit}>
            <label className="field" htmlFor="username">
              Username
              <input
                id="username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Masukkan username RUAS"
              />
            </label>
            <label className="field" htmlFor="password">
              Password
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Masukkan password RUAS"
              />
            </label>
            {message ? <p className="form-alert" role="alert" aria-live="polite">{message}</p> : null}
            <button className="button" type="submit" disabled={loading}>
              {loading ? "Memverifikasi..." : "Masuk"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

