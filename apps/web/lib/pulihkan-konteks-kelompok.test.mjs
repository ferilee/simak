// Uji statis pemulihan konteks kelompok (sisi klien): halaman LKPD murid
// mengadopsi id penugasan hasil pemulihan server dari respons attempt
// pertama bila URL tidak membawa ?assignmentId=, sehingga presensi/polling
// Live Kelompok dan semua jalur berkesan konteks memakai id itu dalam sesi
// yang sama. Jalankan:
//   bun apps/web/lib/pulihkan-konteks-kelompok.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass += 1;
    console.log(`  PASS ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}`);
  }
}

const page = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");

console.log("Kasus A: konteks efektif adalah state yang berawal dari URL");
check("parameter URL dibaca sekali sebagai nilai awal", page.includes('const urlAssignmentId = searchParams.get("assignmentId");'));
check(
  "assignmentId adalah state berawal dari URL",
  page.includes("const [assignmentId, setAssignmentId] = useState<string | null>(urlAssignmentId);"),
);
check(
  "tipe respons attempt membawa assignment_id hasil resolusi",
  page.includes("assignment_id?: number | null;"),
);

console.log("Kasus B: adopsi dari respons attempt pertama");
check(
  "adopsi hanya bila URL tidak membawa parameter",
  page.includes("if (!urlAssignmentId && attempt.data.assignment_id) {"),
);
check(
  "adopsi memasang id dari respons sebagai konteks efektif",
  page.includes("setAssignmentId(String(attempt.data.assignment_id));"),
);
check(
  "adopsi terjadi pada jalur muat awal (sebelum cabang ungrouped)",
  page.indexOf("setAssignmentId(String(attempt.data.assignment_id));") < page.indexOf("if (attempt.data.ungrouped) {"),
);

console.log("Kasus C: rantai live memakai konteks efektif yang sama");
check(
  "gerbang liveActive tetap memakai assignmentId efektif + groupInfo",
  page.includes('const liveActive = Boolean(groupInfo) && Boolean(assignmentId) && status === "draf" && Boolean(data);'),
);
check("heartbeat mengirim assignmentId efektif", page.includes("body: JSON.stringify({ assignmentId: Number(assignmentId), currentItemId: displayedItemIdRef.current })"));
check("polling live memakai assignmentId efektif", page.includes("/live?assignmentId=${assignmentId}`"));
check("simpan jawaban memakai konteks efektif", page.includes("/answers${assignmentId ? `?assignmentId=${assignmentId}` : \"\"}"));

console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
