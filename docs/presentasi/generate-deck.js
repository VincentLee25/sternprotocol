const pptxgen = require("pptxgenjs");

const NAVY = "0F2942";
const NAVY_SOFT = "1B3E5C";
const TEAL = "1C7293";
const TEAL_LIGHT = "2E93B5";
const AMBER = "E8A33D";
const WHITE = "FFFFFF";
const INK = "16232E";
const INK_DIM = "5A6B78";
const RULE = "D9E1E7";
const TINT = "F1F5F8";
const RED = "B5462F";
const GREEN = "2F7D5F";

const H = "Cambria";
const B = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
pres.author = "STERN Protocol";
pres.title = "STERN Protocol — Prototipe";

const W = 13.3;

// ---------- helpers ----------

function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: NAVY };
  return s;
}

function lightSlide() {
  const s = pres.addSlide();
  s.background = { color: WHITE };
  return s;
}

// Slide title. Whitespace below it, never an accent rule.
function title(s, text, opts = {}) {
  s.addText(text, {
    x: 0.7, y: opts.y ?? 0.5, w: W - 1.4, h: 0.75,
    fontFace: H, fontSize: opts.size ?? 34, bold: true,
    color: opts.color ?? INK, align: "left", margin: 0, isTextBox: true
  });
}

function kicker(s, text, color = TEAL) {
  s.addText(text.toUpperCase(), {
    x: 0.7, y: 0.28, w: W - 1.4, h: 0.28,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 2,
    color, margin: 0, isTextBox: true
  });
}

// The deck's one repeated motif: a filled circle carrying a number or glyph.
function circle(s, { x, y, d = 0.62, fill, text, textColor = WHITE, size = 16 }) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill } });
  s.addText(String(text), {
    x, y, w: d, h: d, fontFace: H, fontSize: size, bold: true,
    color: textColor, align: "center", valign: "middle", margin: 0, isTextBox: true
  });
}

function card(s, { x, y, w, h, fill = TINT, line }) {
  const opts = { x, y, w, h, fill: { color: fill }, rectRadius: 0.08 };
  if (line) opts.line = { color: line, width: 1 };
  s.addShape(pres.ShapeType.roundRect, opts);
}

function body(s, text, o) {
  s.addText(text, {
    fontFace: B, fontSize: o.size ?? 14, color: o.color ?? INK_DIM,
    lineSpacing: o.lineSpacing ?? 20, margin: 0, isTextBox: true, valign: "top", ...o
  });
}

function heading(s, text, o) {
  s.addText(text, {
    fontFace: H, fontSize: o.size ?? 17, bold: true, color: o.color ?? INK,
    margin: 0, isTextBox: true, valign: "top", ...o
  });
}

function stat(s, { x, y, w, value, label, valueColor = AMBER, labelColor = "9FB4C4" }) {
  s.addText(value, {
    x, y, w, h: 0.85, fontFace: H, fontSize: 46, bold: true,
    color: valueColor, align: "left", margin: 0, isTextBox: true
  });
  s.addText(label, {
    x, y: y + 0.85, w, h: 0.7, fontFace: B, fontSize: 12,
    color: labelColor, align: "left", margin: 0, isTextBox: true, lineSpacing: 16
  });
}

// =====================================================================
// 1 — Judul
// =====================================================================
{
  const s = darkSlide();
  s.addText("STERN Protocol", {
    x: 0.9, y: 2.0, w: 9.5, h: 1.2, fontFace: H, fontSize: 54, bold: true,
    color: WHITE, margin: 0, isTextBox: true
  });
  s.addText("Escrow pintar untuk penyelesaian pembayaran ekspor–impor", {
    x: 0.9, y: 3.25, w: 9.2, h: 0.6, fontFace: B, fontSize: 20,
    color: "A8C4D6", margin: 0, isTextBox: true
  });
  s.addText("Dana dilepas oleh bukti, bukan oleh janji.", {
    x: 0.9, y: 3.95, w: 9.2, h: 0.5, fontFace: H, fontSize: 17, italic: true,
    color: AMBER, margin: 0, isTextBox: true
  });

  const pills = ["Inspeksi", "Pengapalan", "Tiba & Bea Cukai"];
  pills.forEach((p, i) => {
    const x = 0.9 + i * 2.6;
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 5.4, w: 2.35, h: 0.55, fill: { color: NAVY_SOFT }, rectRadius: 0.27
    });
    s.addText(p, {
      x, y: 5.4, w: 2.35, h: 0.55, fontFace: B, fontSize: 12, bold: true,
      color: "CFE2EE", align: "center", valign: "middle", margin: 0, isTextBox: true
    });
  });

  s.addText("Prototipe  ·  Polygon Amoy Testnet  ·  2026", {
    x: 0.9, y: 6.35, w: 8, h: 0.4, fontFace: B, fontSize: 12,
    color: "6E8CA3", margin: 0, isTextBox: true
  });
  s.addNotes(
    "Pembuka. Sebut satu kalimat saja lalu diam sebentar: 'Dana dilepas oleh bukti, bukan oleh janji.'\n" +
    "Jangan mulai dengan teknologi. Offtaker tidak membeli blockchain, dia membeli kepastian.\n" +
    "Katakan sejak awal bahwa ini prototipe di jaringan uji — kejujuran ini yang membuat sisa presentasi dipercaya."
  );
}

// =====================================================================
// 2 — Masalah
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Masalah");
  title(s, "Dua pilihan, dan keduanya menyakitkan");

  const cols = [
    {
      x: 0.7, name: "Letter of Credit", tone: RED,
      lead: "Aman, tetapi mahal dan lambat.",
      points: [
        "Biaya bank di kedua sisi",
        "Tumpukan dokumen kertas",
        "Pembayaran tertahan berminggu-minggu",
        "Berat untuk eksportir kecil dan menengah"
      ]
    },
    {
      x: 6.9, name: "Open Account", tone: AMBER,
      lead: "Cepat dan murah, tetapi bertaruh.",
      points: [
        "Barang dikirim sebelum dibayar",
        "Risiko gagal bayar ditanggung eksportir",
        "Sengketa selesai lewat pengadilan",
        "Hanya jalan bila sudah saling kenal"
      ]
    }
  ];

  cols.forEach((c) => {
    card(s, { x: c.x, y: 1.55, w: 5.7, h: 3.85, fill: TINT });
    heading(s, c.name, { x: c.x + 0.45, y: 1.85, w: 4.9, h: 0.4, size: 21, color: NAVY });
    body(s, c.lead, { x: c.x + 0.45, y: 2.33, w: 4.9, h: 0.4, size: 13, color: c.tone, bold: true });
    s.addText(c.points.map((p, i) => ({
      text: p, options: { bullet: true, breakLine: i !== c.points.length - 1 }
    })), {
      x: c.x + 0.45, y: 2.95, w: 4.9, h: 2.2, fontFace: B, fontSize: 14,
      color: INK_DIM, paraSpaceAfter: 11, margin: 0, isTextBox: true
    });
  });

  card(s, { x: 0.7, y: 5.7, w: 11.9, h: 1.05, fill: NAVY });
  s.addText("Di antara keduanya tidak ada apa-apa. Itulah ruang yang diisi STERN.", {
    x: 1.15, y: 5.7, w: 11, h: 1.05, fontFace: H, fontSize: 18, italic: true,
    color: WHITE, valign: "middle", margin: 0, isTextBox: true
  });

  s.addNotes(
    "Bingkai masalahnya dari sisi offtaker, bukan dari sisi teknologi.\n" +
    "Tanya ke ruangan: 'Berapa lama uang Bapak/Ibu tertahan di L/C terakhir?' — biarkan mereka menjawab.\n" +
    "Poin kuncinya: keamanan dan kecepatan hari ini adalah pilihan yang saling meniadakan."
  );
}

// =====================================================================
// 3 — Solusi, satu kalimat
// =====================================================================
{
  const s = darkSlide();
  kicker(s, "Gagasan", AMBER);
  s.addText("Uang pembeli dikunci oleh kontrak, bukan oleh bank.", {
    x: 0.7, y: 1.5, w: 11.9, h: 1.8, fontFace: H, fontSize: 40, bold: true,
    color: WHITE, lineSpacing: 48, margin: 0, isTextBox: true
  });
  s.addText(
    "Kunci itu hanya terbuka ketika tiga lembaga yang berbeda — masing-masing menyatakan fakta yang berbeda — " +
    "sudah menaruh buktinya di atas rantai. Tidak ada satu pihak pun, termasuk kami, yang bisa membuka lebih cepat.",
    {
      x: 0.7, y: 3.55, w: 11.4, h: 1.5, fontFace: B, fontSize: 18,
      color: "A8C4D6", lineSpacing: 28, margin: 0, isTextBox: true
    }
  );

  const marks = [
    { t: "Eksportir", d: "tahu dananya sudah ada sebelum mengapalkan" },
    { t: "Offtaker", d: "tahu dananya tidak lepas sebelum barang tiba" },
    { t: "Keduanya", d: "melihat bukti yang sama, pada waktu yang sama" }
  ];
  marks.forEach((m, i) => {
    const x = 0.7 + i * 4.0;
    circle(s, { x, y: 5.5, d: 0.5, fill: AMBER, text: "✓", textColor: NAVY, size: 14 });
    heading(s, m.t, { x: x + 0.68, y: 5.52, w: 3.1, h: 0.3, size: 15, color: WHITE });
    body(s, m.d, { x: x + 0.68, y: 5.86, w: 3.1, h: 0.8, size: 12, color: "7E9DB3", lineSpacing: 15 });
  });

  s.addNotes(
    "Ini slide yang harus diingat orang kalau mereka lupa semua slide lain.\n" +
    "Tekankan 'termasuk kami'. Offtaker akan langsung berpikir: kalau bukan bank yang pegang, siapa? " +
    "Jawabannya: kontrak, dan tidak ada seorang pun yang memegang kuncinya."
  );
}

// =====================================================================
// 4 — Tiga milestone
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Cara kerja");
  title(s, "Tiga pintu, satu per satu");

  const steps = [
    {
      n: "1", name: "Inspeksi", role: "Auditor Mutu",
      d: "Barang diperiksa dan berat kontainer dicocokkan sebelum masuk pelabuhan.",
      src: "VGM · Laporan inspeksi"
    },
    {
      n: "2", name: "Pengapalan", role: "Logistik",
      d: "Kapal benar-benar berangkat, terbaca dari sinyal navigasi kapal.",
      src: "AIS · e-B/L di IPFS"
    },
    {
      n: "3", name: "Tiba & Bea Cukai", role: "Kepabeanan",
      d: "Barang tiba dan memperoleh persetujuan kepabeanan di negara tujuan.",
      src: "CEISA"
    }
  ];

  steps.forEach((st, i) => {
    const x = 0.7 + i * 4.1;
    card(s, { x, y: 1.6, w: 3.8, h: 3.55, fill: TINT });
    circle(s, { x: x + 0.4, y: 1.95, d: 0.64, fill: TEAL, text: st.n, size: 18 });
    heading(s, st.name, { x: x + 0.4, y: 2.8, w: 3.0, h: 0.4, size: 19, color: NAVY });
    s.addText(st.role, {
      x: x + 0.4, y: 3.24, w: 3.0, h: 0.28, fontFace: B, fontSize: 11, bold: true,
      charSpacing: 1, color: TEAL, margin: 0, isTextBox: true
    });
    body(s, st.d, { x: x + 0.4, y: 3.62, w: 3.0, h: 1.0, size: 13 });
    s.addText(st.src, {
      x: x + 0.4, y: 4.68, w: 3.0, h: 0.3, fontFace: B, fontSize: 11,
      color: "8A9BA8", italic: true, margin: 0, isTextBox: true
    });
  });

  card(s, { x: 0.7, y: 5.5, w: 11.9, h: 1.25, fill: WHITE, line: RULE });
  heading(s, "Kunci desainnya", { x: 1.1, y: 5.72, w: 3.0, h: 0.35, size: 15, color: NAVY });
  body(s,
    "Satu lembaga tidak bisa melepas dana sendirian. Untuk memalsukan pembayaran, tiga lembaga " +
    "yang tidak saling berhubungan harus berbohong tentang tiga hal yang berbeda, pada saat yang sama.",
    { x: 4.3, y: 5.7, w: 7.9, h: 0.9, size: 13, lineSpacing: 18 }
  );

  s.addNotes(
    "Jelaskan dengan bahasa barang, bukan bahasa kode: diperiksa, dikapalkan, tiba.\n" +
    "Kalimat penutup slide ini adalah jawaban untuk pertanyaan 'bagaimana kalau oracle-nya bohong?' — " +
    "sampaikan sebelum ditanya."
  );
}

// =====================================================================
// 5 — Mesin status
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Alur status");
  title(s, "Kontrak hanya mengenal jalur ini");

  const main = [
    { t: "Dibuat", sub: "dana terkunci" },
    { t: "Diperiksa", sub: "milestone 1" },
    { t: "Dikapalkan", sub: "milestone 2" },
    { t: "Tiba", sub: "milestone 3" },
    { t: "Timelock", sub: "24 jam" },
    { t: "Selesai", sub: "dana ke eksportir" }
  ];

  const bw = 1.83, gap = 0.19;
  main.forEach((m, i) => {
    const x = 0.7 + i * (bw + gap);
    const last = i === main.length - 1;
    card(s, { x, y: 1.9, w: bw, h: 1.15, fill: last ? GREEN : NAVY });
    s.addText(m.t, {
      x, y: 2.05, w: bw, h: 0.4, fontFace: H, fontSize: 14, bold: true,
      color: WHITE, align: "center", margin: 0, isTextBox: true
    });
    s.addText(m.sub, {
      x, y: 2.45, w: bw, h: 0.35, fontFace: B, fontSize: 10,
      color: last ? "CDE8DC" : "92AEC2", align: "center", margin: 0, isTextBox: true
    });
    if (!last) {
      s.addShape(pres.ShapeType.rect, {
        x: x + bw, y: 2.44, w: gap, h: 0.05, fill: { color: "B8C6D0" }
      });
    }
  });

  const branches = [
    {
      x: 0.7, name: "Disengketakan", tone: AMBER,
      d: "Pihak mana pun boleh menyanggah dalam 6 jam sejak sebuah bukti masuk, dengan menaruh jaminan 3% dari nilai kontrak. Arbiter memutus, dan dana mengikuti putusan itu."
    },
    {
      x: 6.9, name: "Dikembalikan", tone: RED,
      d: "Bila tenggat global lewat tanpa penyelesaian, importir menarik kembali dananya sendiri. Tidak perlu izin siapa pun — kontrak yang mengembalikannya."
    }
  ];
  branches.forEach((br) => {
    card(s, { x: br.x, y: 3.65, w: 5.7, h: 2.35, fill: TINT });
    circle(s, { x: br.x + 0.4, y: 3.95, d: 0.5, fill: br.tone, text: "!", textColor: WHITE, size: 15 });
    heading(s, br.name, { x: br.x + 1.05, y: 4.02, w: 4.2, h: 0.4, size: 18, color: NAVY });
    body(s, br.d, { x: br.x + 0.4, y: 4.68, w: 4.95, h: 1.2, size: 13, lineSpacing: 19 });
  });

  s.addText("Jalur lain tidak ada. Tidak ada tombol darurat, tidak ada pengecualian administratif.", {
    x: 0.7, y: 6.25, w: 11.9, h: 0.45, fontFace: H, fontSize: 15, italic: true,
    color: NAVY, margin: 0, isTextBox: true
  });

  s.addNotes(
    "Kalau ada satu slide yang membuat offtaker tenang, ini slide itu.\n" +
    "Timelock 24 jam adalah rem terakhir: setelah semua bukti masuk pun, masih ada satu hari penuh untuk menahan.\n" +
    "Bila ditanya 'kalau ternyata ada kesalahan setelah selesai?' — jawab jujur: setelah Selesai, dana sudah pindah. " +
    "Justru itu sebabnya ada jendela sanggah dan timelock di depannya."
  );
}

// =====================================================================
// 6 — Siapa yang memverifikasi
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Tata kelola");
  title(s, "Tiga peran terpisah, bukan satu wasit");

  const rows = [
    { n: "A", c: TEAL, t: "Auditor Mutu", r: "ROLE_QUALITY_AUDITOR", d: "Menyatakan barangnya benar: mutu lolos, berat kontainer cocok, dokumen asli." },
    { n: "L", c: TEAL_LIGHT, t: "Logistik", r: "ROLE_LOGISTICS", d: "Menyatakan barangnya berangkat: kapal terdeteksi keluar pelabuhan muat." },
    { n: "C", c: NAVY_SOFT, t: "Kepabeanan", r: "ROLE_CUSTOMS", d: "Menyatakan barangnya masuk: bea cukai negara tujuan memberi persetujuan." }
  ];

  rows.forEach((r, i) => {
    const y = 1.65 + i * 1.28;
    circle(s, { x: 0.75, y: y + 0.16, d: 0.72, fill: r.c, text: r.n, size: 20 });
    heading(s, r.t, { x: 1.75, y: y + 0.12, w: 3.2, h: 0.4, size: 19, color: NAVY });
    s.addText(r.r, {
      x: 1.75, y: y + 0.56, w: 3.4, h: 0.3, fontFace: "Courier New", fontSize: 10,
      color: "8A9BA8", margin: 0, isTextBox: true
    });
    body(s, r.d, { x: 5.4, y: y + 0.16, w: 7.2, h: 0.85, size: 14, lineSpacing: 20 });
    if (i < rows.length - 1) {
      s.addShape(pres.ShapeType.rect, { x: 1.75, y: y + 1.06, w: 10.85, h: 0.01, fill: { color: RULE } });
    }
  });

  card(s, { x: 0.7, y: 5.6, w: 11.9, h: 1.15, fill: NAVY });
  body(s,
    "Ini bukan multi-faktor. Ini pemisahan wewenang: tiga lembaga menyatakan tiga fakta berbeda, " +
    "dan tidak ada satu pun yang bisa menyatakan fakta milik yang lain.",
    { x: 1.15, y: 5.83, w: 11, h: 0.75, size: 14, color: "BBD3E2", lineSpacing: 19 }
  );

  s.addNotes(
    "Istilah yang tepat: separation of duties, bukan MFA. Jangan tertukar — kalau juri atau offtaker " +
    "punya latar perbankan, mereka langsung tahu bedanya dan itu menambah kredibilitas.\n" +
    "Di kontrak, peran ini benar-benar dipisah lewat AccessControl OpenZeppelin; alamat logistik " +
    "secara teknis tidak bisa mengirim bukti kepabeanan."
  );
}

// =====================================================================
// 7 — Sumber data
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Bukti");
  title(s, "Data yang dibaca sebelum dana bergerak");

  const sources = [
    { t: "VGM", d: "Verified Gross Mass — berat kontainer terverifikasi di gerbang pelabuhan.", who: "Auditor Mutu" },
    { t: "Laporan Inspeksi", d: "Hasil pemeriksaan mutu komoditas oleh surveyor independen.", who: "Auditor Mutu" },
    { t: "AIS", d: "Sinyal navigasi kapal — status keberangkatan dari pelabuhan muat.", who: "Logistik" },
    { t: "CEISA", d: "Sistem kepabeanan Indonesia — status persetujuan bea cukai.", who: "Kepabeanan" },
    { t: "IPFS", d: "Sidik jari dokumen e-B/L; isinya tidak pernah naik ke rantai.", who: "Auditor Mutu" }
  ];

  sources.forEach((src, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.7 + col * 4.1, y = 1.6 + row * 2.05;
    card(s, { x, y, w: 3.8, h: 1.8, fill: WHITE, line: RULE });
    heading(s, src.t, { x: x + 0.35, y: y + 0.25, w: 3.1, h: 0.35, size: 17, color: NAVY });
    s.addText(src.who, {
      x: x + 0.35, y: y + 0.63, w: 3.1, h: 0.26, fontFace: B, fontSize: 10, bold: true,
      charSpacing: 1, color: TEAL, margin: 0, isTextBox: true
    });
    body(s, src.d, { x: x + 0.35, y: y + 0.95, w: 3.1, h: 0.75, size: 12, lineSpacing: 16 });
  });

  card(s, { x: 4.8, y: 3.65, w: 7.8, h: 1.8, fill: TINT });
  heading(s, "Yang perlu Anda tahu tentang status prototipe ini",
    { x: 5.15, y: 3.9, w: 7.1, h: 0.35, size: 15, color: NAVY });
  body(s,
    "Kelima sumber di atas hari ini masih simulasi yang dapat dikendalikan, supaya kami bisa " +
    "memperagakan kasus gagal — bukan hanya kasus mulus. Bentuk panggilannya sudah sama " +
    "dengan sambungan sungguhan.",
    { x: 5.15, y: 4.32, w: 7.1, h: 0.95, size: 12.5, lineSpacing: 17 }
  );

  s.addText(
    "Isi dokumen tidak pernah disimpan di rantai — hanya sidik jarinya. Rahasia dagang tetap rahasia.",
    { x: 0.7, y: 5.85, w: 11.9, h: 0.5, fontFace: H, fontSize: 15, italic: true, color: NAVY, margin: 0, isTextBox: true }
  );

  s.addNotes(
    "Sampaikan sendiri bahwa sumber data masih simulasi, sebelum ditanya. " +
    "Prototipe yang jujur tentang batasnya jauh lebih dipercaya daripada yang mengaku sudah tersambung ke Bea Cukai.\n" +
    "Kalimat terakhir menjawab kekhawatiran nomor satu offtaker soal blockchain: 'apakah harga dan pembeli saya jadi publik?' Tidak."
  );
}

// =====================================================================
// 8 — Pengaman
// =====================================================================
{
  const s = darkSlide();
  kicker(s, "Pengaman", AMBER);
  title(s, "Angka-angka yang menjaga uang Anda", { color: WHITE });

  const stats = [
    { v: "6 jam", l: "Jendela sanggah setelah\nsetiap bukti masuk" },
    { v: "24 jam", l: "Timelock terakhir sebelum\ndana benar-benar pindah" },
    { v: "3%", l: "Jaminan yang harus ditaruh\nuntuk membuka sengketa" },
    { v: "50%", l: "Bagian jaminan verifikator\nyang dipotong bila terbukti salah" }
  ];
  stats.forEach((st, i) => {
    stat(s, { x: 0.7 + i * 3.1, y: 1.85, w: 2.8, value: st.v, label: st.l });
  });

  card(s, { x: 0.7, y: 4.3, w: 11.9, h: 1.5, fill: NAVY_SOFT });
  heading(s, "Kalau verifikator berbohong, dia yang membayar",
    { x: 1.15, y: 4.58, w: 11, h: 0.4, size: 18, color: WHITE });
  body(s,
    "Setiap verifikator wajib menaruh jaminan sebelum boleh mengirim bukti. Bila arbiter memutuskan buktinya salah, " +
    "jaminan itu dipotong: 70% mengalir ke pihak yang dirugikan, 30% ke kas protokol. Tiga kali salah, perannya dicabut permanen.",
    { x: 1.15, y: 5.02, w: 11, h: 0.7, size: 13.5, color: "A8C4D6", lineSpacing: 19 }
  );

  s.addText("Kejujuran di sini bukan imbauan. Ia punya harga, dan harganya ditagih otomatis.", {
    x: 0.7, y: 6.1, w: 11.9, h: 0.5, fontFace: H, fontSize: 16, italic: true,
    color: AMBER, margin: 0, isTextBox: true
  });

  s.addNotes(
    "Slide ini menjawab pertanyaan paling tajam: 'kenapa saya percaya oracle-nya?'\n" +
    "Jawaban: Anda tidak perlu percaya. Verifikator menaruh uangnya sendiri, dan uang itu hilang kalau dia bohong.\n" +
    "Angka 6 jam / 24 jam bisa disetel per kontrak saat penerapan — sebutkan itu kalau ada yang bilang terlalu lama atau terlalu singkat."
  );
}

// =====================================================================
// 9 — Untuk offtaker
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Untuk Anda sebagai pembeli");
  title(s, "Apa yang berubah di sisi Anda");

  const items = [
    {
      n: "1", t: "Uang Anda tidak pernah lepas lebih awal",
      d: "Dana masuk ke kontrak, bukan ke rekening eksportir. Sampai bukti ketiga masuk dan timelock lewat, uang itu masih milik Anda dan bisa ditarik kembali bila tenggat terlewat."
    },
    {
      n: "2", t: "Anda melihat kemajuan tanpa menelepon siapa pun",
      d: "Status kontainer, keberangkatan kapal, dan kepabeanan tampil sebagai bukti bertanda waktu — sumber yang sama untuk Anda dan untuk eksportir, sehingga tidak ada lagi dua versi cerita."
    },
    {
      n: "3", t: "Eksportir Anda mau bekerja dengan syarat lebih baik",
      d: "Karena dana terlihat sudah terkunci sejak hari pertama, eksportir tidak lagi menuntut pembayaran di muka. Itu memperbaiki harga dan tempo yang bisa Anda negosiasikan."
    }
  ];

  items.forEach((it, i) => {
    const y = 1.65 + i * 1.6;
    circle(s, { x: 0.75, y: y + 0.18, d: 0.7, fill: NAVY, text: it.n, size: 20 });
    heading(s, it.t, { x: 1.75, y: y + 0.1, w: 10.8, h: 0.4, size: 18, color: NAVY });
    body(s, it.d, { x: 1.75, y: y + 0.58, w: 10.8, h: 0.85, size: 13.5, lineSpacing: 19 });
  });

  card(s, { x: 0.7, y: 6.3, w: 11.9, h: 0.65, fill: TINT });
  body(s, "Yang Anda serahkan sebagai gantinya: kesediaan mengunci dana lebih awal, dan menerima keputusan bukti apa adanya.",
    { x: 1.15, y: 6.48, w: 11, h: 0.35, size: 13, color: NAVY, italic: true });

  s.addNotes(
    "Slide ini yang paling penting buat offtaker. Jangan lewati cepat.\n" +
    "Poin 3 adalah argumen komersial, bukan teknis — itu yang membuat orang keuangan ikut tertarik.\n" +
    "Kotak terakhir sengaja menyebut biayanya. Presentasi yang hanya menyebut untung terdengar seperti jualan; " +
    "yang menyebut ongkosnya terdengar seperti tawaran serius."
  );
}

// =====================================================================
// 10 — Arsitektur
// =====================================================================
{
  const s = darkSlide();
  kicker(s, "Arsitektur", AMBER);
  title(s, "Empat lapis, satu arah aliran", { color: WHITE });

  const layers = [
    { t: "Antarmuka pengguna", tech: "React 18 · Vite 5 · Tailwind CSS", d: "Yang dilihat importir, eksportir, dan arbiter di peramban.", c: TEAL_LIGHT },
    { t: "Dompet tanpa repot", tech: "Particle Network · Pimlico · ERC-4337", d: "Masuk pakai akun Google; dompet dibuat otomatis, biaya gas ditalangi.", c: TEAL },
    { t: "Gerbang oracle", tech: "Node.js · Express · ethers.js v6", d: "Membaca sumber data, memutuskan lolos atau tidak, menandatangani bukti.", c: NAVY_SOFT },
    { t: "Kontrak pintar", tech: "Solidity 0.8.20 · OpenZeppelin · Polygon", d: "Memegang dana dan menegakkan aturan. Ini satu-satunya sumber kebenaran.", c: "0B1E2F" }
  ];

  layers.forEach((l, i) => {
    const y = 1.55 + i * 1.24;
    card(s, { x: 0.7, y, w: 11.9, h: 1.1, fill: l.c });
    heading(s, l.t, { x: 1.15, y: y + 0.16, w: 3.9, h: 0.35, size: 17, color: WHITE });
    s.addText(l.tech, {
      x: 1.15, y: y + 0.58, w: 4.4, h: 0.3, fontFace: "Courier New", fontSize: 10.5,
      color: "9FC4DA", margin: 0, isTextBox: true
    });
    body(s, l.d, { x: 5.9, y: y + 0.3, w: 6.3, h: 0.6, size: 13, color: "C6DCEA", lineSpacing: 18 });
  });

  s.addText("Setiap lapis hanya boleh meminta ke lapis di bawahnya. Kontrak tidak pernah memanggil ke atas.", {
    x: 0.7, y: 6.6, w: 11.9, h: 0.4, fontFace: B, fontSize: 12,
    color: "6E8CA3", margin: 0, isTextBox: true
  });

  s.addNotes(
    "Buat offtaker, ringkas jadi satu kalimat: 'Tampilan boleh diganti, gerbang boleh diganti, tapi aturan uangnya ada di lapis paling bawah dan itu tidak bisa diubah diam-diam.'\n" +
    "Lapis kedua adalah jawaban untuk 'apakah saya harus paham kripto?' — tidak, cukup akun Google, dan biaya gas tidak dibayar pengguna."
  );
}

// =====================================================================
// 11 — Bahasa pemrograman
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Catatan teknis");
  title(s, "Sistem ini ditulis dengan bahasa apa");

  s.addChart(
    pres.charts.BAR,
    [{
      name: "Baris kode",
      // A horizontal bar chart draws the first category at the BOTTOM, so the
      // list is reversed here to read top-down as Solidity → gerbang → antarmuka → uji.
      labels: ["JavaScript\n(uji kontrak)", "JavaScript + JSX\n(antarmuka)", "JavaScript\n(gerbang oracle)", "Solidity\n(kontrak)"],
      values: [291, 7662, 2280, 790]
    }],
    {
      x: 0.7, y: 1.6, w: 6.6, h: 4.2,
      barDir: "bar",
      showTitle: true, title: "Ukuran tiap bagian (baris kode)",
      titleFontFace: H, titleFontSize: 13, titleColor: NAVY,
      showValue: true, dataLabelPosition: "outEnd",
      dataLabelFontFace: B, dataLabelFontSize: 11, dataLabelColor: INK,
      chartColors: [TEAL],
      catAxisLabelColor: INK_DIM, catAxisLabelFontFace: B, catAxisLabelFontSize: 10,
      valAxisLabelColor: INK_DIM, valAxisLabelFontFace: B, valAxisLabelFontSize: 10,
      valGridLine: { color: "EAEFF3", size: 1 },
      catGridLine: { style: "none" },
      showLegend: false,
      barGapWidthPct: 55
    }
  );

  const notes = [
    { t: "Solidity", d: "Bahasa kontrak pintar Ethereum. Dipakai hanya untuk aturan uang: siapa boleh apa, kapan dana boleh pindah." },
    { t: "JavaScript", d: "Satu bahasa untuk gerbang oracle dan antarmuka. Satu tim bisa mengerjakan keduanya tanpa berganti bahasa." },
    { t: "Kenapa bukan yang lain", d: "Solidity karena tidak ada pilihan lain di rantai EVM. JavaScript karena pustaka Web3 yang matang ada di sana." }
  ];
  notes.forEach((n, i) => {
    const y = 1.75 + i * 1.5;
    card(s, { x: 7.6, y, w: 5.0, h: 1.32, fill: TINT });
    heading(s, n.t, { x: 7.95, y: y + 0.16, w: 4.3, h: 0.32, size: 15, color: NAVY });
    body(s, n.d, { x: 7.95, y: y + 0.54, w: 4.3, h: 0.7, size: 11.5, lineSpacing: 15 });
  });

  s.addText("Total ± 11.000 baris kode buatan sendiri, di luar pustaka pihak ketiga.", {
    x: 0.7, y: 6.35, w: 11.9, h: 0.4, fontFace: B, fontSize: 12,
    color: INK_DIM, margin: 0, isTextBox: true
  });

  s.addNotes(
    "Kalau ditanya 'pakai bahasa apa', jawaban pendeknya: Solidity untuk kontrak, JavaScript untuk sisanya.\n" +
    "Angka baris kode ini dihitung dari repositori, bukan kira-kira. Kalau ditanya, katakan begitu.\n" +
    "Antarmuka paling besar karena di situlah semua keadaan gagal harus ditampilkan dengan benar — itu bukan pemborosan, itu memang pekerjaannya."
  );
}

// =====================================================================
// 12 — Alasan pilihan teknologi
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Catatan teknis");
  title(s, "Kenapa dipilih yang ini");

  const rows = [
    { t: "Polygon Amoy", d: "Jaringan uji yang setara EVM. Biaya transaksi kecil dan waktu blok dua detik — penting karena satu kontrak dagang menghasilkan banyak transaksi.", c: TEAL },
    { t: "OpenZeppelin", d: "Pustaka kontrak yang sudah diaudit luas. AccessControl, Pausable, dan ReentrancyGuard dipakai apa adanya — bagian paling rawan tidak ditulis sendiri.", c: TEAL_LIGHT },
    { t: "ERC-4337 (account abstraction)", d: "Membuat pengguna bisa masuk dengan akun Google tanpa pernah menyentuh frasa pemulihan, dan biaya gas ditalangi pihak lain.", c: NAVY_SOFT },
    { t: "Token IDRT (demo)", d: "Rupiah digital berstandar ERC-20 dengan dua angka desimal, sehingga nilai kontrak dicatat dalam rupiah dan sen, bukan dalam mata uang kripto.", c: NAVY }
  ];

  rows.forEach((r, i) => {
    const y = 1.55 + i * 1.2;
    circle(s, { x: 0.7, y: y + 0.05, d: 0.56, fill: r.c, text: String(i + 1), size: 15 });
    heading(s, r.t, { x: 1.5, y: y + 0.02, w: 4.3, h: 0.5, size: 16, color: NAVY });
    body(s, r.d, { x: 5.9, y: y + 0.02, w: 6.7, h: 0.95, size: 13, lineSpacing: 18 });
    if (i < rows.length - 1) {
      s.addShape(pres.ShapeType.rect, { x: 1.5, y: y + 1.06, w: 11.1, h: 0.01, fill: { color: RULE } });
    }
  });

  card(s, { x: 0.7, y: 6.4, w: 11.9, h: 0.65, fill: NAVY });
  body(s, "Semua yang di atas berjalan di jaringan uji. Nilai yang berpindah adalah token demo, bukan rupiah sungguhan.",
    { x: 1.15, y: 6.58, w: 11, h: 0.35, size: 13, color: "BBD3E2" });

  s.addNotes(
    "Untuk audiens non-teknis, cukup baris pertama tiap kotak.\n" +
    "Baris OpenZeppelin penting kalau ada yang bertanya soal keamanan: bagian tersulit tidak kami tulis sendiri, " +
    "kami pakai pustaka yang sudah diaudit banyak pihak.\n" +
    "Kotak paling bawah harus dibacakan. Jangan biarkan ada yang pulang mengira ini sudah memindahkan rupiah sungguhan."
  );
}

// =====================================================================
// 13 — Alur demo
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Peragaan");
  title(s, "Yang akan Anda lihat sebentar lagi");

  const steps = [
    { n: "1", t: "Masuk dengan akun Google", d: "Dompet terbentuk sendiri. Tidak ada frasa pemulihan yang harus dicatat." },
    { n: "2", t: "Buat kontrak dan kunci dana", d: "Isi komoditas, nilai, dan tenggat. Dana berpindah ke kontrak di depan mata Anda." },
    { n: "3", t: "Jalankan verifikasi tiga milestone", d: "Gerbang membaca sumber data, lalu mengirim bukti ke rantai satu per satu." },
    { n: "4", t: "Peragakan satu kasus gagal", d: "Satu sumber sengaja dibuat tidak cocok. Perhatikan: kontrak menolak, bukan meloloskan." },
    { n: "5", t: "Buka sengketa dan putuskan", d: "Jaminan ditaruh, arbiter memutus, jaminan verifikator yang salah dipotong." },
    { n: "6", t: "Lewati timelock dan lepas dana", d: "Setelah 24 jam, siapa pun boleh memicu pelepasan. Kontrak yang membayar, bukan kami." }
  ];

  steps.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.7 + col * 6.15, y = 1.65 + row * 1.6;
    circle(s, { x, y: y + 0.1, d: 0.58, fill: i === 3 ? AMBER : TEAL, text: st.n, size: 16 });
    heading(s, st.t, { x: x + 0.78, y: y + 0.05, w: 5.1, h: 0.4, size: 15.5, color: NAVY });
    body(s, st.d, { x: x + 0.78, y: y + 0.48, w: 5.1, h: 0.85, size: 12.5, lineSpacing: 17 });
  });

  card(s, { x: 0.7, y: 6.45, w: 11.9, h: 0.7, fill: TINT });
  body(s, "Langkah 4 sengaja ada. Prototipe yang hanya bisa memperagakan kasus mulus belum membuktikan apa pun.",
    { x: 1.15, y: 6.62, w: 11, h: 0.4, size: 13, color: NAVY, italic: true });

  s.addNotes(
    "Latih urutan ini sampai hafal, lalu jalankan pelan-pelan. Demo yang terburu-buru terlihat seperti menyembunyikan sesuatu.\n" +
    "Langkah 4 adalah puncak presentasi, bukan langkah 6. Beri jeda di situ dan biarkan orang membaca layar penolakannya.\n" +
    "Siapkan jawaban kalau demo gagal: 'ini jaringan uji, blok kadang lambat' — lalu tunjukkan tangkapan layar cadangan. Siapkan cadangannya sebelum naik panggung."
  );
}

// =====================================================================
// 14 — Status jujur
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Status");
  title(s, "Yang sudah jalan, dan yang belum");

  const done = [
    "Kontrak escrow lengkap dengan tiga milestone",
    "Jendela sanggah, timelock, dan pengembalian dana",
    "Sengketa, putusan arbiter, dan pemotongan jaminan",
    "Masuk pakai akun Google, gas ditalangi",
    "Akun perusahaan dengan peran dan MFA",
    "Perpanjangan tenggat atas persetujuan dua pihak"
  ];
  const notYet = [
    "Sambungan sungguhan ke CEISA, AIS, dan VGM",
    "Rupiah sungguhan — sekarang masih token demo",
    "Audit keamanan pihak ketiga atas kontrak",
    "Penerapan di jaringan utama",
    "Panel arbiter untuk memutus sengketa lewat antarmuka",
    "Uji beban dengan banyak kontrak berjalan bersamaan"
  ];

  const cols = [
    { x: 0.7, head: "Sudah berjalan", items: done, tone: GREEN, mark: "✓" },
    { x: 6.9, head: "Belum ada", items: notYet, tone: AMBER, mark: "—" }
  ];

  cols.forEach((c) => {
    card(s, { x: c.x, y: 1.6, w: 5.7, h: 4.5, fill: TINT });
    circle(s, { x: c.x + 0.42, y: 1.9, d: 0.5, fill: c.tone, text: c.mark, textColor: WHITE, size: 14 });
    heading(s, c.head, { x: c.x + 1.05, y: 1.97, w: 4.2, h: 0.4, size: 19, color: NAVY });
    c.items.forEach((it, i) => {
      body(s, it, { x: c.x + 0.42, y: 2.72 + i * 0.55, w: 4.95, h: 0.5, size: 12.5, lineSpacing: 16 });
    });
  });

  s.addText("Kolom kanan bukan kelemahan yang disembunyikan. Itu peta jalan yang kami buka sendiri.", {
    x: 0.7, y: 6.35, w: 11.9, h: 0.5, fontFace: H, fontSize: 15, italic: true,
    color: NAVY, margin: 0, isTextBox: true
  });

  s.addNotes(
    "Slide ini yang paling menentukan apakah Anda dipercaya. Bacakan kolom kanan tanpa berkelit.\n" +
    "Kalau ada yang menanyakan hal di kolom kanan, jawaban terbaiknya adalah menunjuk slide ini: 'benar, itu memang belum ada, " +
    "dan kami sudah menulisnya di sini sebelum Bapak/Ibu bertanya.'\n" +
    "Jangan pernah mengaku sudah tersambung ke Bea Cukai. Satu klaim palsu meruntuhkan semua yang lain."
  );
}

// =====================================================================
// 15 — Peta jalan
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Ke depan");
  title(s, "Tiga langkah berikutnya");

  const phases = [
    { n: "1", t: "Sambungan data nyata", d: "Mengganti sumber simulasi dengan sambungan resmi: CEISA untuk kepabeanan, penyedia AIS untuk pelayaran, surveyor untuk VGM dan inspeksi.", when: "Berikutnya" },
    { n: "2", t: "Uji coba terbatas", d: "Satu koridor komoditas, beberapa pengapalan sungguhan bernilai kecil, didampingi audit keamanan atas kontrak.", when: "Sesudah itu" },
    { n: "3", t: "Rupiah teregulasi", d: "Mengganti token demo dengan rupiah digital yang diakui, sehingga penyelesaian terjadi dalam mata uang yang sah.", when: "Bergantung regulasi" }
  ];

  phases.forEach((p, i) => {
    const x = 0.7 + i * 4.1;
    card(s, { x, y: 1.65, w: 3.8, h: 3.9, fill: i === 0 ? NAVY : TINT });
    circle(s, { x: x + 0.4, y: 2.0, d: 0.62, fill: i === 0 ? AMBER : TEAL, text: p.n, textColor: i === 0 ? NAVY : WHITE, size: 18 });
    s.addText(p.when, {
      x: x + 0.4, y: 2.82, w: 3.0, h: 0.28, fontFace: B, fontSize: 10, bold: true,
      charSpacing: 1, color: i === 0 ? AMBER : TEAL, margin: 0, isTextBox: true
    });
    heading(s, p.t, { x: x + 0.4, y: 3.15, w: 3.0, h: 0.75, size: 17, color: i === 0 ? WHITE : NAVY });
    body(s, p.d, { x: x + 0.4, y: 4.0, w: 3.0, h: 1.35, size: 12.5, color: i === 0 ? "A8C4D6" : INK_DIM, lineSpacing: 17 });
  });

  card(s, { x: 0.7, y: 5.85, w: 11.9, h: 1.0, fill: WHITE, line: RULE });
  heading(s, "Yang kami minta hari ini", { x: 1.15, y: 6.05, w: 3.5, h: 0.35, size: 15, color: NAVY });
  body(s, "Bukan komitmen pembelian. Satu jam waktu Anda untuk menunjukkan di mana alur ini tidak cocok dengan cara kerja Anda yang sebenarnya.",
    { x: 4.9, y: 6.08, w: 7.4, h: 0.6, size: 13, lineSpacing: 18 });

  s.addNotes(
    "Akhiri dengan permintaan yang kecil dan masuk akal. Meminta komitmen pembelian di depan prototipe akan ditolak, " +
    "dan penolakan itu menutup pintu.\n" +
    "Meminta koreksi justru membuat offtaker merasa dilibatkan — dan jawaban mereka adalah bahan paling berharga yang bisa Anda bawa pulang."
  );
}

// =====================================================================
// 16 — Penutup
// =====================================================================
{
  const s = darkSlide();
  s.addText("Dana dilepas oleh bukti,\nbukan oleh janji.", {
    x: 0.9, y: 2.1, w: 10.5, h: 2.0, fontFace: H, fontSize: 42, bold: true,
    color: WHITE, lineSpacing: 54, margin: 0, isTextBox: true
  });
  s.addText("STERN Protocol", {
    x: 0.9, y: 4.45, w: 8, h: 0.5, fontFace: B, fontSize: 18, bold: true,
    charSpacing: 2, color: AMBER, margin: 0, isTextBox: true
  });
  s.addText("Terima kasih. Sekarang giliran pertanyaan Anda — terutama yang sulit.", {
    x: 0.9, y: 5.15, w: 10, h: 0.5, fontFace: B, fontSize: 16,
    color: "A8C4D6", margin: 0, isTextBox: true
  });
  s.addNotes(
    "Jangan menutup dengan 'ada pertanyaan?' lalu diam. Pancing pertanyaan sulitnya sendiri.\n" +
    "Tiga pertanyaan yang paling mungkin datang, siapkan jawabannya:\n" +
    "1. 'Kalau internet atau gerbang oracle mati?' — dana tetap terkunci, dan tenggat global tetap mengembalikan dana ke importir.\n" +
    "2. 'Siapa yang menanggung kalau kontraknya ada bug?' — jujur: belum diaudit pihak ketiga, itu ada di kolom kanan slide status.\n" +
    "3. 'Apa bedanya dengan escrow bank biasa?' — bank bisa menahan atas pertimbangannya sendiri; kontrak tidak bisa, dan aturannya bisa Anda baca sendiri."
  );
}

pres.writeFile({ fileName: process.argv[2] || "STERN-Protocol-Prototipe.pptx" })
  .then((f) => console.log("Wrote", f));
