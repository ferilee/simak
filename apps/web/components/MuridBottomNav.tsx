import Link from "next/link";

export type MuridTab = "dashboard" | "materi" | "penugasan" | "nilai" | "jurnal";

type MuridBottomNavProps = {
  active: MuridTab;
  hasNewGrades?: boolean;
};

const items: { key: MuridTab; label: string; href: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", href: "/murid", icon: "⌂" },
  { key: "materi", label: "Materi", href: "/murid?tab=materi", icon: "▤" },
  { key: "penugasan", label: "Penugasan", href: "/murid?tab=penugasan", icon: "✓" },
  { key: "nilai", label: "Nilai saya", href: "/murid/nilai", icon: "★" },
  { key: "jurnal", label: "Jurnal belajar", href: "/murid/jurnal", icon: "✎" },
];

export function MuridBottomNav({ active, hasNewGrades = false }: MuridBottomNavProps) {
  return (
    <nav className="murid-bottom-nav" aria-label="Navigasi ruang murid">
      <div className="murid-bottom-nav-inner">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`murid-bottom-nav-item${active === item.key ? " is-active" : ""}`}
            aria-current={active === item.key ? "page" : undefined}
          >
            <span className="murid-bottom-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            {item.key === "nilai" && hasNewGrades ? <span className="murid-bottom-nav-dot" aria-label="Ada nilai baru" /> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
