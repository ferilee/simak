// Seed DATA CONTOH untuk pengembangan lokal — bukan data asli.
// Jalankan sekali setelah migrasi: npm run db:seed
// Hapus/ganti sebelum dipakai di production.
import { db } from "./index";
import {
  users,
  classes,
  classMembers,
  modules,
  moduleBlocks,
  worksheets,
  worksheetItems,
} from "./schema/index";

async function main() {
  const [guru] = await db
    .insert(users)
    .values({
      ruasUserId: "contoh-guru-001",
      username: "guru.contoh",
      name: "Guru Contoh",
      role: "guru",
      isActive: true,
    })
    .$returningId();

  const muridSeed = [
    { ruasUserId: "contoh-murid-001", username: "murid.contoh1", name: "Murid Contoh Satu", nis: "1001" },
    { ruasUserId: "contoh-murid-002", username: "murid.contoh2", name: "Murid Contoh Dua", nis: "1002" },
  ];
  const muridIds: number[] = [];
  for (const m of muridSeed) {
    const [row] = await db
      .insert(users)
      .values({ ...m, role: "murid", isActive: true })
      .$returningId();
    if (row) muridIds.push(row.id);
  }

  const [kelas] = await db
    .insert(classes)
    .values({
      teacherId: guru!.id,
      name: "XI DPIB",
      subject: "Matematika",
      academicYear: "2026/2027",
      joinCode: "DPIB26",
    })
    .$returningId();

  for (const studentId of muridIds) {
    await db.insert(classMembers).values({ classId: kelas!.id, studentId });
  }

  const [modul] = await db
    .insert(modules)
    .values({
      teacherId: guru!.id,
      title: "Matematika Keuangan",
      subject: "Matematika",
      description: "Bunga tunggal, bunga majemuk, dan anuitas — dari paket daring 26–29 Oktober 2026.",
      status: "draf",
    })
    .$returningId();

  await db.insert(moduleBlocks).values([
    { moduleId: modul!.id, sortOrder: 1, type: "sub_bab", contentJson: { type: "sub_bab", title: "Bunga Tunggal" } },
    {
      moduleId: modul!.id,
      sortOrder: 2,
      type: "teks",
      contentJson: {
        type: "teks",
        html: "<p>Bunga tunggal dihitung hanya dari modal awal: <strong>B = M × i × t</strong>, sehingga modal akhir <strong>M<sub>t</sub> = M(1 + i·t)</strong>.</p>",
      },
    },
    { moduleId: modul!.id, sortOrder: 3, type: "sub_bab", contentJson: { type: "sub_bab", title: "Bunga Majemuk" } },
    {
      moduleId: modul!.id,
      sortOrder: 4,
      type: "teks",
      contentJson: {
        type: "teks",
        html: "<p>Pada bunga majemuk, bunga ikut berbunga: <strong>M<sub>n</sub> = M(1 + i)<sup>n</sup></strong>.</p>",
      },
    },
    { moduleId: modul!.id, sortOrder: 5, type: "sub_bab", contentJson: { type: "sub_bab", title: "Anuitas" } },
    {
      moduleId: modul!.id,
      sortOrder: 6,
      type: "teks",
      contentJson: {
        type: "teks",
        html: "<p>Anuitas adalah pembayaran berkala yang sama besar: <strong>A = M × i(1+i)<sup>n</sup> / ((1+i)<sup>n</sup> − 1)</strong>.</p>",
      },
    },
  ]);

  const [lkpd] = await db
    .insert(worksheets)
    .values({
      moduleId: modul!.id,
      teacherId: guru!.id,
      title: "LKPD Matematika Keuangan",
      instructions: "Kerjakan berurutan. Draf tersimpan otomatis; kumpulkan sebelum batas waktu.",
      status: "draf",
    })
    .$returningId();

  await db.insert(worksheetItems).values([
    {
      worksheetId: lkpd!.id,
      sortOrder: 1,
      itemType: "isian_singkat",
      prompt: "Modal Rp2.000.000 ditabung dengan bunga tunggal 6% per tahun. Berapa besar bunga setelah 3 tahun? (tulis angka saja, tanpa titik ribuan)",
      optionsJson: { itemType: "isian_singkat", tolerance: 0 },
      answerKey: "360000",
      explanation: "B = 2.000.000 × 6% × 3 = Rp360.000.",
      points: 10,
    },
    {
      worksheetId: lkpd!.id,
      sortOrder: 2,
      itemType: "pilihan_ganda",
      prompt: "Mengapa bunga majemuk tumbuh lebih cepat daripada bunga tunggal?",
      optionsJson: {
        itemType: "pilihan_ganda",
        options: [
          "Karena suku bunganya selalu lebih besar",
          "Karena bunga yang diperoleh ikut menghasilkan bunga pada periode berikutnya",
          "Karena modal awalnya digandakan",
          "Karena tidak ada biaya administrasi",
        ],
      },
      answerKey: "Karena bunga yang diperoleh ikut menghasilkan bunga pada periode berikutnya",
      explanation: "Pada bunga majemuk, dasar perhitungan setiap periode adalah modal + bunga yang sudah terkumpul.",
      points: 10,
    },
    {
      worksheetId: lkpd!.id,
      sortOrder: 3,
      itemType: "uraian",
      prompt: "Ceritakan satu contoh pemakaian anuitas di sekitar tempat tinggalmu (misalnya cicilan motor) dan jelaskan mengapa pembayarannya dibuat sama setiap bulan.",
      optionsJson: { itemType: "uraian" },
      points: 20,
    },
    {
      worksheetId: lkpd!.id,
      sortOrder: 4,
      itemType: "tautan_ruas",
      prompt: "Lanjutkan ke kuis asesmen di RUAS.",
      optionsJson: { itemType: "tautan_ruas", url: "https://ruas.smkpasirian-lmj.sch.id", label: "Buka Kuis di RUAS" },
      points: 0,
    },
  ]);

  console.log("Seed selesai: 1 guru, 2 murid, 1 kelas (XI DPIB, kode DPIB26), 1 modul, 1 LKPD contoh.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
