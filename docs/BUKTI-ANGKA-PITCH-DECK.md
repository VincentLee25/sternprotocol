# Bukti Angka Pitch Deck STERN v1.1

Dokumen ini memetakan setiap angka di `STERN_PITCH_DECK_V1.1_LOGO__LAMPIRAN.pdf`
ke sumbernya, supaya presenter tahu mana yang bisa dipertahankan di depan juri,
mana yang harus dilabeli asumsi, dan mana yang harus dicek atau dihapus dulu.

Status yang dipakai:

| Status | Arti |
| --- | --- |
| **SUMBER EKSTERNAL** | Ada sitasi di slide. Bisa dipertahankan, tapi buka sumbernya sekali sebelum tampil. |
| **DATA SENDIRI** | Survei tim. Bukti = file kuesioner + tabulasi. Pegang filenya. |
| **BISA DICEK DI REPO** | Turunan dari kode/test di repositori ini. |
| **MODEL INTERNAL** | Asumsi tim. Lampiran deck sendiri menulis "model aku, tanpa sumber". Wajib disebut sebagai asumsi. |
| **HARUS DICEK / HAPUS** | Salah, tidak cocok dengan kode, atau sisa template. |

---

## 1. Angka masalah (problem slides)

| Angka | Sumber tertulis di deck | Status | Cara menjawab kalau ditanya |
| --- | --- | --- | --- |
| 36 dokumen, 240 salinan per transaksi ekspor-impor | ICC & WTO, *Standards Toolkit for Cross-border Paperless Trade* (2022) | SUMBER EKSTERNAL | Angka ini memang dipakai luas oleh ICC/WTO. Sebut "menurut ICC dan WTO 2022". Simpan PDF-nya di HP. |
| 65–80% dokumen L/C ditolak pada presentasi pertama | ICC Banking Commission, *Technical Advisory Briefing No. 3* (2022) | SUMBER EKSTERNAL | Angka yang sering dikutip ICC adalah "sekitar 65–80% dokumen mengandung discrepancy pada presentasi pertama". Pakai kata "discrepancy", bukan "ditolak final". |
| 30–45 hari siklus penyelesaian | Hidayah et al. (2026) | SUMBER EKSTERNAL, cek | Tahun 2026 berarti publikasi sangat baru. Pastikan judul jurnal dan halamannya ada di tangan. Kalau tidak yakin, ganti kalimatnya jadi "hasil survei kami" (lihat bagian 2). |
| 106 jam kepatuhan dokumen | ASEAN Access (2023) | SUMBER EKSTERNAL | Ini angka *Trading Across Borders* World Bank untuk Indonesia (documentary compliance impor). Sebut asal aslinya: World Bank Doing Business, dikutip ASEAN Access. |
| 3 hari kerja proses PIB | Bea Cukai Juanda | SUMBER EKSTERNAL | Sebut "janji layanan Bea Cukai". Kalau ditanya, ini SLA, bukan rata-rata aktual. |
| Trade finance gap US$2,5 T | ADB (2025) | SUMBER EKSTERNAL | ADB *Trade Finance Gaps, Growth, and Jobs Survey* 2025 memang menyebut US$2,5 T global. Tekankan: global, bukan Indonesia. |
| "Indonesia ranks 122nd out of 122 countries in the 2025 International Trade Barrier Index" (slide 30) | Tidak ada sitasi | **HARUS DICEK / HAPUS** | Peringkat terakhir dari 122 hampir pasti salah kutip. Cari laporan Tholos Foundation *International Trade Barrier Index 2025* dan cek posisi Indonesia. Kalau tidak ketemu dalam 10 menit, hapus slide ini. Satu angka salah yang ketahuan juri merusak semua angka lain. |
| Biaya L/C 0,5–1,5% | Tidak ada sitasi | MODEL INTERNAL | Lampiran deck sendiri menulis "belum aku sitasi". Jawab: "kisaran umum biaya penerbitan L/C bank di Indonesia dari pengalaman praktisi yang kami wawancara". Jangan sebut sebagai statistik. |

## 2. Survei tim (n = 25)

Semua angka di bawah ini dari kuesioner tim sendiri: 25 responden, 22 di antaranya praktisi, 4 sektor.
Bukti terbaik adalah **file Google Form + spreadsheet tabulasi**. Bawa tangkapan layarnya.

| Angka | Pertanyaan survei | Status |
| --- | --- | --- |
| 76% pernah mengalami keterlambatan pembayaran | 19 dari 25 | DATA SENDIRI |
| 32% sering mengalami | 8 dari 25 | DATA SENDIRI |
| 48% penyebab: dokumen belum lengkap | 12 dari 25 | DATA SENDIRI |
| 44% / 44% (dua penyebab lain) | 11 dari 25 masing-masing | DATA SENDIRI |
| 80% pembayaran tertunda | 20 dari 25 | DATA SENDIRI |
| 56% terganggu arus kas | 14 dari 25 | DATA SENDIRI |
| 92% / 88% menilai bermanfaat | 23 dan 22 dari 25 | DATA SENDIRI |
| Kekhawatiran 52% / 36% / 36% / 32% | 13 / 9 / 9 / 8 dari 25 | DATA SENDIRI |

Cara menjawab: "Ini survei awal kami ke 25 pelaku ekspor-impor, 22 di antaranya praktisi aktif.
Sampelnya kecil, jadi kami pakai sebagai sinyal arah, bukan statistik populasi."
Menyebut keterbatasan sendiri lebih aman daripada dibongkar juri.

## 3. Ukuran pasar

| Angka | Sumber tertulis | Status | Catatan |
| --- | --- | --- | --- |
| TAM US$3,53 T | ASEAN Key Figures 2024 | SUMBER EKSTERNAL | Total perdagangan barang ASEAN. Lampiran menulis "Aku buka dokumennya langsung". Pegang halamannya. |
| SAM US$524,8 M | BPS 2025 | **HARUS DICEK** | Lampiran deck jujur menulis: "angka ini aku ambil dari materi master deck, bukan dari rilis BPS, tolong cek". Total ekspor + impor Indonesia 2024 versi BPS sekitar US$264,7 M ekspor + US$233,7 M impor = kurang lebih US$498 M. Angka 524,8 mungkin tahun atau definisi lain. Cek rilis BPS "Ekspor Impor" sebelum tampil. |
| SOM US$2,5 M | Tidak ada | MODEL INTERNAL | Model tim. |
| Funnel US$635 M / US$94 M per tahun | Tidak ada | MODEL INTERNAL | Turunan dari SAM x porsi 15% x asumsi lain. |
| Take rate 0,12%, porsi 15% | Tidak ada | MODEL INTERNAL | Asumsi tim. |
| Proyeksi 20 / 90 / 260 / 595 / 1.080 pengguna | Tidak ada | MODEL INTERNAL | Asumsi tim. |

Cara menjawab untuk semua MODEL INTERNAL: "TAM dari ASEAN Key Figures, SAM dari BPS.
SOM dan proyeksi adalah model kami sendiri dengan asumsi take rate 0,12% dan penetrasi 15%.
Kami senang kalau juri menantang asumsinya." Jangan pernah menyebut SOM sebagai data.

## 4. Model bisnis dan keuangan

Semua angka berikut adalah MODEL INTERNAL. Lampiran deck sendiri menulis "ini model aku, wajib dilabeli assumption".

| Angka | Status |
| --- | --- |
| Fee 0,12% per transaksi, minimum US$45, maksimum US$1.200 | MODEL INTERNAL |
| SaaS US$300 / US$900 / US$2.500 per bulan | MODEL INTERNAL |
| API US$15.000 setup + US$1.500 per bulan | MODEL INTERNAL |
| Komposisi pendapatan 52% / 33% / 15% | MODEL INTERNAL |
| Unit economics: 40 pengiriman, US$250 K, US$10 M, US$12 K, US$7,2 K | MODEL INTERNAL |
| Pendapatan 5 tahun: 35 / 226 / 634 / 1.396 / 2.500 (ribu US$) | MODEL INTERNAL |
| EBITDA positif 2029, defisit kumulatif US$477 K | MODEL INTERNAL |
| Ask US$650 K untuk 24 bulan | MODEL INTERNAL |

Bukti yang harus ada: **spreadsheet model** dengan asumsi di sheet terpisah. Kalau juri minta, buka sheetnya.

## 5. Angka teknis (slide 10)

Ini bagian yang bisa saya cek langsung terhadap kode di repositori.

| Klaim di deck | Kenyataan di repo | Status |
| --- | --- | --- |
| "9/9 skenario uji lulus" | `test/SternEscrow.test.js` berisi **11** kasus uji (`it(...)`), bukan 9. | **HARUS DIPERBAIKI** menjadi "11/11". Bukti: jalankan `npx hardhat test` dan screenshot hasilnya. |
| Tabel gas menyebut fungsi `submitTradeEvidence` dan `verifyEvidence` | Fungsi itu **tidak ada** di `contracts/SternEscrow.sol`. Fungsi sebenarnya: `createEscrow`, `submitMilestoneProof`, `initiateTimelock`, `releasePayment`, `claimRefund`, `raiseDispute`, `resolveDispute`, `postVerifierBond`. | **HARUS DIPERBAIKI**. Nama fungsi salah berarti angka gasnya (278.421 / 152.306 / 61.784 / 64.912 / 138.502 / 150.821 / total ~846.746) kemungkinan besar bukan hasil ukur kontrak ini. |
| Bond verifier, slash 50%, split 70/30, bond dispute, jendela tantangan, timelock | Cocok dengan konstanta kontrak: `MIN_VERIFIER_BOND = 10.000,00 IDRT`, `SLASH_AGGRIEVED_BPS = 7000`, `SLASH_TREASURY_BPS = 3000`, `MAX_SLASH_STRIKES = 3`. | BISA DICEK DI REPO |
| "Dispute path: 2% buyer bond" di halaman New Escrow frontend | Kontrak dideploy dengan `disputeBondBps` yang bisa berbeda dari 2%. Samakan teks frontend dengan nilai deploy. | Cek kecil |

### Cara mendapatkan angka gas yang benar (jalankan di laptop, bukan di Railway)

Sandbox saya tidak bisa mengunduh compiler Solidity, jadi ini harus dijalankan di mesin kalian.

```bash
npm install --save-dev hardhat-gas-reporter
```

Tambahkan di `hardhat.config.js`:

```js
require("hardhat-gas-reporter");
module.exports = {
  // ...konfigurasi yang sudah ada
  gasReporter: { enabled: true, currency: "USD" }
};
```

Lalu:

```bash
npx hardhat test
```

Tabel yang muncul di akhir berisi gas min / max / avg per fungsi. Screenshot tabel itu adalah bukti.
Alternatif tanpa install apa pun: buka setiap transaksi demo di
`https://amoy.polygonscan.com/address/<alamat kontrak>` dan baca kolom *Gas Used* per transaksi.

Ganti tabel gas di slide 10 dengan nama fungsi asli dan angka hasil ukur.

## 6. Sisa template yang harus dihapus sebelum submit

| Halaman | Isi | Tindakan |
| --- | --- | --- |
| 18 | Teks "gacor sir" | Hapus. |
| 17, 21 (lampiran) | Catatan draft orang pertama ("aku", "tolong cek") | Hapus atau pindahkan ke dokumen internal. Jangan sampai tampil. |
| 23–29 | Sisa template Canva: "Larana Company", "Presentation By: Murad Naser", "60%", "58%", "80K" | Hapus semua. Angka 60/58/80K tidak ada hubungannya dengan STERN. |
| 30 | Klaim "122 dari 122" | Verifikasi atau hapus (lihat bagian 1). |

## 7. Kalimat aman untuk juri

Kalau ditanya "angka ini dari mana":

> "Angka masalah kami ambil dari ICC-WTO 2022, ICC Banking Commission 2022, dan ADB 2025, referensinya ada di slide.
> Angka kebutuhan pengguna dari survei awal kami ke 25 pelaku, jadi masih sinyal, belum statistik.
> Ukuran pasar TAM dan SAM dari ASEAN Key Figures dan BPS.
> SOM, proyeksi, dan angka keuangan adalah model kami sendiri dengan asumsi yang kami tulis terbuka,
> dan kami siap kalau asumsinya ditantang."

Kalimat ini membedakan tiga jenis angka dengan jujur. Juri hackathon jauh lebih menghargai
"ini asumsi kami" daripada angka yang terlihat pasti tapi tidak bisa ditelusuri.

## 8. Checklist sebelum tampil

- [ ] Buka dan simpan PDF/halaman untuk: ICC-WTO 2022, ICC TAB No. 3, ADB 2025, ASEAN Key Figures 2024, rilis BPS, ASEAN Access 2023.
- [ ] Cek atau hapus klaim "122 dari 122".
- [ ] Cek angka SAM US$524,8 M terhadap rilis BPS.
- [ ] Ganti "9/9" menjadi "11/11" dan screenshot hasil `npx hardhat test`.
- [ ] Ukur ulang gas dengan nama fungsi asli, ganti tabel slide 10.
- [ ] Hapus halaman 23–29, teks "gacor sir", dan catatan draft di lampiran.
- [ ] Bawa spreadsheet survei dan spreadsheet model keuangan.
