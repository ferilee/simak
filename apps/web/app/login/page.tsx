"use client";

import { FormEvent, useState } from "react";
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
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 20px" }}>
      <h1>Masuk ke SIMAK</h1>
      <p>Gunakan username dan password RUAS yang sudah Anda miliki.</p>

      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label>
          Username
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={{ display: "block", width: "100%", marginTop: 6, padding: 10 }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ display: "block", width: "100%", marginTop: 6, padding: 10 }}
          />
        </label>
        {message ? <p role="alert" style={{ color: "#b42318" }}>{message}</p> : null}
        <button type="submit" disabled={loading} style={{ padding: 12 }}>
          {loading ? "Memverifikasi..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}

