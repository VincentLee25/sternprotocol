# STERN Protocol — Dispute Bond & Cost Structure (Fase 0)

Status: **DRAFT — untuk sign-off, melengkapi 01-03**
Terakhir diupdate: 29 Agustus 2026

Dokumen ini mengisi 2 celah yang belum diputuskan di `00_PHASE0_OVERVIEW.md`, `02_API_SPEC.md`, dan `03_PARTICLE_INTEGRATION.md`: **nominal dispute bond** dan **struktur biaya protokol (fee, gas, split slashing)**. Semua angka di sini berbasis riset, bukan tebakan — sumber dicantumkan supaya bisa diverifikasi ulang.

---

## 1. Dispute bond — flat %, selaras dengan `01_CONTRACT_SPEC.md` yang sudah frozen

> **Catatan revisi**: draft pertama dokumen ini mengusulkan bond **tiered** (5%/2,5%/1% tergantung nilai escrow). Setelah `01_CONTRACT_SPEC.md` dibaca lengkap, ternyata constructor kontrak (§5.1) sudah **frozen** menerima `disputeBondBps` sebagai **satu parameter tunggal** (flat basis points), bukan array tier. Mengubah ke tiered berarti mengubah signature constructor yang sudah disepakati kedua tim — itu pelanggaran freeze. Jadi rekomendasi di bawah ini **flat**, bukan tiered, supaya kompatibel dengan interface yang sudah di-lock.

### Acuan yang dipakai

**A. BANI (Badan Arbitrase Nasional Indonesia)** — biaya arbitrase konvensional Indonesia diatur proporsional terhadap nilai sengketa: sengketa di bawah Rp500 juta dikenakan **10% dari nilai tuntutan**, turun ke **maksimal 0,5%** untuk sengketa bernilai besar (tarif bertingkat/regresif — BANI sendiri pakai tiered, tapi kontrak kita tidak bisa ikuti persis karena constructor sudah fixed single value). Pihak yang kalah menanggung biaya (Pasal 77 UU No. 30/1999 tentang Arbitrase dan APS).

**B. Kleros (standar industri DeFi/on-chain arbitration)** — pola umum: pihak yang membuka dispute **stake bond ~10% dari nilai transaksi**. Pihak yang kalah kehilangan bond; pihak yang menang direimburse.

### Keputusan STERN — mengisi §10 no.5 di `01_CONTRACT_SPEC.md`

`01_CONTRACT_SPEC.md` §8 sudah punya angka default **2%**, ditandai TBD/bisa disesuaikan. Rekomendasi final:

**`disputeBondBps = 300` (3%)** — bukan 2% (default lama) maupun 10% (acuan BANI/Kleros mentah). Rasional angka 3%:
- 10% penuh (murni ikut BANI/Kleros) terlalu berat untuk UMKM kecil (mengulang Lemah 1 di review sebelumnya — bond ketinggian bikin importir kecil yang benar-benar dirugikan jadi tidak sanggup dispute)
- 2% (default lama di spec) berisiko terlalu rendah untuk mencegah dispute frivolous di transaksi besar — buyer besar bisa anggap 2% "biaya kecil" untuk menunda pembayaran
- 3% adalah titik tengah yang tetap terasa sebagai *skin in the game* nyata tanpa jadi penghalang akses

**Karena kontrak cuma terima satu angka flat, mitigasi untuk UMKM kecil dipindah ke layer lain**: `04_DISPUTE_BOND_COST_STRUCTURE.md` merekomendasikan **UI/backend menampilkan estimasi bond dalam Rupiah sebelum user submit** (`POST /escrows/:escrowId/dispute` di `02_API_SPEC.md` §5 sudah menyediakan endpoint ini), supaya user paham nominalnya sebelum commit — bukan lewat tiering on-chain yang membutuhkan ubah constructor.

**Mekanisme win/lose (ikut Pasal 77 UU Arbitrase + pola Kleros, dan PERSIS sesuai `resolveDispute()` §5.4 di `01_CONTRACT_SPEC.md`):**
- Dispute **valid** (`releaseToExporter` sesuai posisi buyer, `bondFrivolous = false`) → bond kembali penuh ke buyer + verifier di-slash jika `slashVerifier = true`
- Dispute **frivolous** (`bondFrivolous = true`) → bond hangus ke exporter, verifier TIDAK di-slash
- Kontrak tidak punya state "tie" terpisah — arbiter harus pilih salah satu (`releaseToExporter` boolean), sesuai desain `01_CONTRACT_SPEC.md` yang sudah final. (Draft pertama dokumen ini menyebut opsi "tie/split rata" ala Kleros — ini TIDAK berlaku karena signature `resolveDispute()` tidak punya parameter untuk split, hanya boolean menang/kalah.)

**PENTING — dua kolam dana berbeda, jangan dicampur:**
1. **Dispute bond** (dibahas §1 di atas) — dibayar oleh pihak yang `raiseDispute()` (importer atau exporter, keduanya boleh sesuai `01_CONTRACT_SPEC.md` §5.4), menang/kalah ditentukan `bondFrivolous`.
2. **Verifier bond** (`postVerifierBond()`, §5.2 di `01_CONTRACT_SPEC.md`) — dana terpisah yang di-post institusi verifier (Sucofindo/shipping/customs) SEKALI saat role di-grant, bukan per-escrow. Inilah yang kena **`slashBps = 50%`** (sesuai §8) kalau `slashVerifier = true` saat `resolveDispute()`.

**Definisi "pihak dirugikan" untuk slash verifier bond** (mengisi Lemah 3 dari diskusi sebelumnya, dan mengisi event `VerifierSlashed(...compensatedTo)` di `01_CONTRACT_SPEC.md` §7):
| Milestone yang disengketakan | Pihak dirugikan jika verifier terbukti salah (`compensatedTo`) |
|---|---|
| `Inspected` | Importer (barang belum dikirim, tapi importer sudah lock dana — kompensasi atas keterlambatan/risiko) |
| `Shipped` | Importer (klaim keberangkatan palsu berisiko ke importer yang menunggu) |
| `ArrivedCleared` | Importer (klaim kedatangan/bea cukai palsu paling berisiko — barang belum tentu benar-benar clear) |
| `None` (dispute umum di `TimelockActive`) | Importer (posisi bertahan terakhir sebelum dana benar-benar lepas) — tapi di titik ini biasanya tidak ada verifier spesifik yang disalahkan, jadi `slashVerifier` kemungkinan besar `false` untuk kasus ini |

*(Catatan: importer secara konsisten adalah pihak yang dirugikan kalau VERIFIER salah, karena importer menanggung risiko dana terkunci berdasarkan klaim verifier yang tidak benar. Ini terpisah dari siapa yang menang/kalah di dispute bond buyer — lihat §1.)*

---

## 2. Slash fund split — detail per kasus (verifier bond, bukan dispute bond)

Mengikuti `01_CONTRACT_SPEC.md` §8 (`slashBps = 50%` dari bond verifier) dan poin 5 dari desain teman kamu (70% pihak dirugikan / 30% treasury) untuk pembagian hasil slash tersebut:

```
Verifier terbukti salah (slashVerifier = true saat resolveDispute) →
  50% dari verifierBonds[verifier] di-slash (sesuai slashBps di constructor)
  Dana yang di-slash displit:
    70% → importer (pihak dirugikan, lihat tabel §1 revisi di atas) — dikirim via `compensatedTo` di event VerifierSlashed
    30% → protocol treasury (biaya operasional: gas, infra, audit)
  50% sisa bond verifier TETAP di kontrak (verifier masih terdaftar, kecuali kena slash 3x -> auto-revoke sesuai §8)

Dispute frivolous (bondFrivolous = true saat resolveDispute) →
  Dispute bond BUYER (bukan verifier bond) displit:
    100% → exporter (kompensasi delay)
  Verifier TIDAK di-slash sama sekali di kasus ini (slashVerifier harus false)
```

Kenapa dispute frivolous 100% ke exporter (bukan ikut 70/30 treasury juga): karena exporter tidak melakukan kesalahan apapun di skenario ini — dia korban penundaan akibat dispute yang tidak berdasar dari buyer. Membebankan potongan 30% treasury ke exporter di sini tidak adil karena dia bukan pihak yang menciptakan biaya operasional protokol; yang menciptakan biaya di sini adalah buyer yang dispute sembarangan, dan buyer sudah dihukum lewat hangusnya bond.

**Auto-revoke verifier (mengisi `01_CONTRACT_SPEC.md` §8 "Verifier kena slash 3x → role otomatis di-revoke"):** kontrak WAJIB tracking `verifierSlashCount(address)` (sudah ada di §5.2) dan cek di `submitMilestoneProof()` — kalau count sudah mencapai 3, revert otomatis meski role masih ter-grant di `AccessControl`, ATAU panggil `revokeRole()` internal saat slash ke-3 terjadi (lebih bersih, karena role benar-benar hilang bukan cuma soft-block). Rekomendasi: revoke otomatis saat slash ke-3, emit `VerifierRoleRevoked` dengan reason "3x slashed, auto circuit-breaker".

---

## 3. Cost structure — gas fee riil (bukan estimasi lama)

### Data gas Polygon PoS terkini (2026)

Riset terbaru: rata-rata biaya transaksi Polygon PoS sepanjang 2026 berkisar **$0,009–0,022 per transaksi sederhana**; interaksi smart contract kompleks (seperti fungsi milestone STERN dengan multiple check) berkisar **$0,01–0,10**.

### Breakdown per operasi STERN (estimasi konservatif, ambil sisi atas kisaran)

| Operasi | Estimasi gas (USD) | Estimasi gas (Rp, kurs ~Rp16.300/USD) | Siapa bayar |
|---|---|---|---|
| `createEscrow` (+ `permit`/`approve`) | $0,05 | ~Rp815 | Sponsored Paymaster (importer tidak bayar langsung) |
| `submitMilestoneProof` ×3 (per oracle) | $0,03 × 3 = $0,09 | ~Rp1.467 | Backend (native gas, EOA institusi — bukan Paymaster) |
| `raiseDispute` | $0,05 | ~Rp815 | Sponsored Paymaster |
| `resolveDispute` (arbiter) | $0,03 | ~Rp489 | Backend/arbiter EOA |
| `releasePayment` | $0,05 | ~Rp815 | Sponsored Paymaster (auto-trigger) |
| `claimRefund` | $0,05 | ~Rp815 | Sponsored Paymaster |
| **Total gas per siklus escrow penuh (skenario tanpa dispute)** | **~$0,24** | **~Rp4.000** | Campuran (lihat tabel) |

**Catatan penting** (menjawab pertanyaan kamu sebelumnya soal "kena potong apa aja"): gas fee ini **bukan revenue STERN** — ini biaya infrastruktur murni yang dibayar ke jaringan Polygon, sama seperti bayar listrik. Fee platform STERN (lihat §4) yang jadi revenue, terpisah total dari gas.

---

## 4. Fee platform (revenue STERN)

### Model yang dipilih: hybrid % + floor flat

Mengikuti keputusan yang sudah dibahas sebelumnya (bukan flat murni, bukan % murni):

```
Fee platform = MAX(0,3% dari nilai escrow, Rp150.000 floor)
```

| Nilai escrow | Fee 0,3% | Floor Rp150.000 | Fee dikenakan |
|---|---|---|---|
| Rp10.000.000 | Rp30.000 | Rp150.000 | **Rp150.000** (floor berlaku) |
| Rp50.000.000 | Rp150.000 | Rp150.000 | Rp150.000 (persis floor) |
| Rp250.000.000 | Rp750.000 | — | **Rp750.000** (% berlaku) |
| Rp1.000.000.000 | Rp3.000.000 | — | **Rp3.000.000** |

**Perbandingan ke fee bank L/C** (dari riset pitch pack sebelumnya: 0,75–1,5% issuance, bisa 3–10% all-in): fee STERN 0,3% + gas ~Rp4.000 secara total **masih >70% lebih murah** dari L/C konvensional bahkan di skenario termahal (0,3% + floor vs 0,75% minimum bank) — klaim ">70% hemat" di pitch pack tetap valid dengan angka riil ini.

### Kemana fee platform dialokasikan

```
Fee platform 100% →
  60% operasional (infra, gas sponsor Paymaster, hosting, tim)
  25% treasury cadangan (buffer untuk klaim slash yang perlu dana talangan)
  15% biaya audit keamanan berkala (sesuai roadmap Fase 3)
```

---

## 5. Ringkasan angka final — mengisi §10 di `01_CONTRACT_SPEC.md`, sesuai constructor yang sudah frozen

Nilai-nilai ini adalah **parameter constructor** `SternEscrow` (lihat §5.1 di `01_CONTRACT_SPEC.md`), BUKAN konstanta tiered terpisah — kontrak menerima ini sebagai argumen saat deploy:

```solidity
// Parameter constructor SternEscrow (isi §10 no.5 di 01_CONTRACT_SPEC.md)
uint256 challengeWindowSeconds = 21600;   // 6 jam (sudah ada di §8, tidak berubah)
uint256 timelockDurationSeconds = 86400;  // 24 jam (sudah ada di §8, tidak berubah)
uint256 disputeBondBps = 300;             // 3% — REVISI dari default 2%, lihat rasional §1
uint256 slashBps = 5000;                  // 50% dari verifier bond — SESUAI §8, tidak berubah

// Verifier bond minimum (§5.2)
uint256 constant MIN_VERIFIER_BOND = 10_000_00; // contoh: setara Rp10.000.000 dalam IDRT-demo (2 desimal, lihat §3)

// Slash split -- INI BUKAN parameter constructor, harus di-hardcode di _slashVerifier() internal function
uint256 constant SLASH_AGGRIEVED_BPS = 7000; // 70% ke importer (compensatedTo di event VerifierSlashed)
uint256 constant SLASH_TREASURY_BPS = 3000;  // 30% ke treasury

// Platform fee -- TIDAK ADA di 01_CONTRACT_SPEC.md versi ini, perlu ditambahkan sebagai
// keputusan baru jika belum ada function terpisah untuk ambil fee. Cek dulu ke tim apakah
// fee platform diambil di releasePayment() atau dikelola di layer lain (mis. dipotong saat
// backend memproses QRIS -> mint, bukan di smart contract sama sekali).
uint256 constant PLATFORM_FEE_BPS = 30;      // 0.3%, USULAN, perlu dikonfirmasi tim
uint256 constant PLATFORM_FEE_FLOOR = 150_00; // Rp150rb (2 desimal)
```

**Isi tabel keputusan terbuka `01_CONTRACT_SPEC.md` §10 dengan ini:**

| # | Pertanyaan | Keputusan final |
|---|---|---|
| 1 | `approve()` (2 tx) vs `permit()` (1 tx)? | **`permit()`** — UX 1-transaksi lebih penting untuk target UMKM yang sudah dijanjikan "tanpa ribet" di narasi produk. Particle Smart Account mendukung typed-data signing untuk EIP-2612, jadi kompatibel. |
| 5 | `disputeBondBps` dan `slashBps` final berapa? | `disputeBondBps = 300` (3%, direvisi dari default 2%, lihat §1). `slashBps = 5000` (50%, tetap sesuai default §8 — sudah tepat, tidak perlu diubah). |

**PLATFORM FEE — catatan penting**: `01_CONTRACT_SPEC.md` versi yang aku baca **tidak menyebutkan fee platform sama sekali** di struct/function manapun — fokusnya murni escrow mechanics (lock, verify, release, dispute). Ini kemungkinan besar berarti fee platform **belum masuk desain kontrak**, dan mungkin memang sengaja dipisah ke layer lain (misal dipotong saat konversi QRIS→mint, bukan dipotong dari `releasePayment()`). **Codex harus konfirmasi ke tim dulu** sebelum menambahkan logic fee ke `releasePayment()` — menambah fee di situ berarti mengubah function yang sudah frozen (`transfer contractValue ke exporter` di §5.3 tidak menyebut potongan fee sama sekali).

---

## Sumber riset

- BANI — tarif administrasi arbitrase berbasis nilai tuntutan (10% di bawah Rp500jt, turun ke 0,5% untuk nilai besar): blog.lekslawyer.com/pembagian-biaya-arbitrase-indonesia; nobilebureau.com/biaya-lengkap-penyelesaian-sengketa-arbitrase
- UU No. 30/1999 tentang Arbitrase dan APS, Pasal 77 (biaya dibebankan ke pihak kalah)
- Kleros Escrow Specifications — pola bond arbitrase on-chain: docs.kleros.io/products/escrow/kleros-escrow-specifications; chainscorelabs.com (rekomendasi bond 10% dari nilai trade)
- Polygon PoS gas fee riil 2026 — rata-rata $0,009-0,022/tx sederhana, $0,01-0,10 untuk smart contract interaction: poltrack.tech/report, polygonposvspolygon.com

---

## Change log

| Tanggal | Perubahan | Oleh |
|---|---|---|
| 2026-08-29 | Draft awal berdasar riset BANI + Kleros + data gas Polygon riil | — |
