import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMAK — Sumber Informasi, Materi, dan Aktivitas Kelas",
  description: "Materi dan LKPD interaktif pendamping RUAS (Ruang Asesmen).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
