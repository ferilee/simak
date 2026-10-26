"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";

type ClassSummary = {
  id: number;
  name: string;
  subject: string;
  academic_year: string;
};

type ModuleSummary = {
  id: number;
  title: string;
  subject: string;
  description: string | null;
  status: "terbit";
  updated_at: string;
};

type TodayResponse = {
  ok: true;
  data: { classes: ClassSummary[]; modules: ModuleSummary[] };
};

type MeResponse = {
  ok: true;
  user: { name: string; username: string };
};

export default function MuridPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [data, setData] = useState<TodayResponse["data"]>({ classes: [], modules: [] });
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  async function load() {
    try {
      const [me, today] = await Promise.all([
        apiRequest<MeResponse>("/auth/me"),
        apiRequest<TodayResponse>("/murid/today"),
      ]);
      setUser(me.user);
      setData(today.data);
    } catch (error) {
      if (error instanceof Error && error.message === "Belum masuk.") {
        router.replace("/login");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Data belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoining(true);
    setMessage("");
    try {
      await apiRequest("/classes/join", {
        method: "POST",
        body: JSON.stringify({ joinCode }),
      });
      setJoinCode("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kelas belum dapat diikuti.");
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <main style={styles.container}><p>Memuat ruang murid...</p></main>;

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>SIMAK · MURID</p>
          <h1 style={styles.title}>Halo, {user?.name ?? "Murid"}</h1>
          <p style={styles.muted}>Materi dan aktivitas belajar Anda berada di satu tempat.</p>
        </div>
        <form onSubmit={joinClass} style={styles.joinForm}>
          <label htmlFor="join-code">Gabung kelas</label>
          <div style={styles.joinRow}>
            <input
              id="join-code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Kode kelas"
              maxLength={12}
              required
              style={styles.input}
            />
            <button type="submit" disabled={joining} style={styles.button}>
              {joining ? "..." : "Gabung"}
            </button>
          </div>
        </form>
      </header>

      {message ? <p role="alert" style={styles.error}>{message}</p> : null}

      <section>
        <h2 style={styles.sectionTitle}>Kelas saya</h2>
        {data.classes.length === 0 ? (
          <p style={styles.empty}>Belum ada kelas. Masukkan kode kelas dari guru untuk bergabung.</p>
        ) : (
          <div style={styles.grid}>
            {data.classes.map((kelas) => (
              <article key={kelas.id} style={styles.card}>
                <strong>{kelas.name}</strong>
                <span>{kelas.subject} · {kelas.academic_year}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={styles.sectionTitle}>Materi terbit</h2>
        {data.modules.length === 0 ? (
          <p style={styles.empty}>Belum ada materi terbit untuk kelas Anda.</p>
        ) : (
          <div style={styles.list}>
            {data.modules.map((module) => (
              <Link key={module.id} href={`/murid/modules/${module.id}`} style={styles.moduleCard}>
                <span style={styles.moduleSubject}>{module.subject}</span>
                <strong>{module.title}</strong>
                <span style={styles.muted}>{module.description ?? "Materi pembelajaran SIMAK."}</span>
                <span style={styles.readLink}>Baca materi →</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  container: { maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" },
  header: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", marginBottom: 32 },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 8px" },
  title: { fontSize: 32, margin: 0 },
  muted: { color: "#667085", lineHeight: 1.5 },
  joinForm: { minWidth: 260, display: "grid", gap: 8 },
  joinRow: { display: "flex", gap: 8 },
  input: { border: "1px solid #d0d5dd", borderRadius: 8, padding: "10px 12px", minWidth: 0 },
  button: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "10px 14px", fontWeight: 700 },
  error: { background: "#fef3f2", color: "#b42318", borderRadius: 8, padding: 12 },
  sectionTitle: { fontSize: 20, margin: "32px 0 12px" },
  empty: { color: "#667085", background: "#f8f9fc", borderRadius: 10, padding: 16 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  card: { display: "grid", gap: 6, border: "1px solid #eaecf0", borderRadius: 10, padding: 16 },
  list: { display: "grid", gap: 12 },
  moduleCard: { display: "grid", gap: 6, border: "1px solid #d0d5dd", borderRadius: 10, padding: 18, textDecoration: "none", color: "inherit" },
  moduleSubject: { color: "#175cd3", fontSize: 13, fontWeight: 700 },
  readLink: { color: "#175cd3", fontWeight: 700, marginTop: 4 },
};
