import { nameInitials, type StudentAvatarFields } from "../lib/lencana-nama";

// Lencana nama murid bersama untuk SEMUA daftar nama (anggota
// kelompok di sisi murid, daftar murid di sisi guru): lingkaran kecil
// berisi emoji avatar terpasang murid di samping namanya. Avatar
// adalah emoji katalog (bukan foto pribadi) sehingga aman tampil ke
// teman sekelompok dan guru. Murid TANPA avatar terpasang tampil
// sebagai lingkaran inisial nama bergaya netral — daftar tetap rapi
// dan tidak ada baris yang terlihat kurang. Ukurannya sengaja kecil
// dan tenang agar daftar guru yang padat tidak berisik; gayanya di
// globals.css (.student-name-badge*).
export function StudentNameBadge({
  name,
  avatar_slug,
  avatar_emoji,
}: { name: string } & StudentAvatarFields) {
  const hasAvatar = Boolean(avatar_emoji);
  return (
    <span className="student-name-badge">
      <span
        className={`student-name-badge-circle${hasAvatar ? "" : " is-initials"}`}
        aria-hidden="true"
        title={hasAvatar && avatar_slug ? `Avatar ${avatar_slug}` : undefined}
      >
        {hasAvatar ? avatar_emoji : nameInitials(name)}
      </span>
      <span className="student-name-badge-name">{name}</span>
    </span>
  );
}
