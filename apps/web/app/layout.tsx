import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegistrar } from "./PwaRegistrar";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const siteTitle = "SIMAK — Sumber Informasi, Materi, dan Aktivitas Kelas";
const siteDescription = "Ruang belajar dan pengelolaan aktivitas kelas yang terhubung dengan RUAS.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | SIMAK",
  },
  description: siteDescription,
  applicationName: "SIMAK",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: siteUrl,
    siteName: "SIMAK",
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SIMAK — ruang belajar terhubung dengan RUAS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#175cd3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body><PwaRegistrar />{children}</body>
    </html>
  );
}
