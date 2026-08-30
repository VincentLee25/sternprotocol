# PROMPT UNTUK CODEX — Implementasi STERN Escrow Smart Contract

## Konteks

Kamu akan MENGIMPLEMENTASIKAN `SternEscrow.sol` dan `IDRTDemo.sol` dari NOL, mengikuti **`01_CONTRACT_SPEC.md` sebagai interface freeze yang WAJIB DIIKUTI PERSIS** — nama function, event, struct, enum di sana sudah disepakati kedua tim (Blockchain + FE) dan tidak boleh diubah tanpa alasan kuat yang didiskusikan dulu.

`SternEscrow_OLD_reference.sol` disertakan HANYA sebagai referensi gaya kode lama (Solidity version, import convention, dst) — JANGAN dipakai sebagai basis arsitektur, karena desainnya (kuorum 2-of-3 generik) sudah digantikan total oleh role-based signer per milestone di `01_CONTRACT_SPEC.md`.

**Urutan baca WAJIB sebelum coding:**
1. `01_CONTRACT_SPEC.md` — INI SUMBER KEBENARAN UTAMA. Semua function signature, event, struct sudah final di sini.
2. `00_PHASE0_OVERVIEW.md` — konteks kenapa desain berubah dari versi lama
3. `04_DISPUTE_BOND_COST_STRUCTURE.md` — mengisi parameter constructor yang di `01_CONTRACT_SPEC.md` masih ditandai TBD (§10), berdasarkan riset BANI + Kleros + gas Polygon riil
4. `05_STATE_MACHINE_DIAGRAM.svg` — visual state machine (SAMA PERSIS dengan §1 di `01_CONTRACT_SPEC.md`, hanya beda representasi)
5. `02_API_SPEC.md` — endpoint backend, PASTIKAN nama function di kontrak yang kamu tulis match dengan yang API spec asumsikan
6. `03_PARTICLE_INTEGRATION.md` — konteks wallet: importer/exporter pakai Particle Smart Account, institusi verifier pakai EOA biasa

**JANGAN menebak signature apapun. `01_CONTRACT_SPEC.md` sudah sangat detail (state machine, roles, struct, semua function signature dengan requires/effects, semua event). Tugas Codex adalah MENGIMPLEMENTASIKAN spec ini, bukan mendesain ulang.**

---

## Yang harus diimplementasikan — ikuti `01_CONTRACT_SPEC.md` section per section

### §1-2: State machine + Roles
Implementasikan PERSIS `enum State` dan `enum Milestone` di §4, dengan role `ROLE_QUALITY_AUDITOR` / `ROLE_LOGISTICS` / `ROLE_CUSTOMS` dari §2 via OpenZeppelin `AccessControl`. Setiap role HANYA valid untuk milestone-nya sendiri (`ROLE_QUALITY_AUDITOR` submit untuk `Shipped` harus revert) — ini pengganti kuorum 2-of-3 generik dari desain lama, JANGAN buat voting/kuorum apapun.

### §3: IDRTDemo.sol
Implementasikan persis seperti skeleton di §3 — `decimals()` override jadi 2 (BUKAN 18 default ERC-20, ini penting supaya representasi Rupiah masuk akal), `MINTER_ROLE` terpisah dari admin governance escrow.

**Keputusan §10 no.1 (approve vs permit) — SUDAH DIPUTUSKAN, isi di `04_DISPUTE_BOND_COST_STRUCTURE.md` §5**: pakai **EIP-2612 `permit()`**, bukan flow approve 2-transaksi. Tambahkan `permit()` ke `IDRTDemo.sol` (inherit `ERC20Permit` dari OpenZeppelin). `createEscrow()` di `SternEscrow.sol` harus menerima parameter signature (`v, r, s, deadline`) untuk permit, dipanggil sebelum `transferFrom`, dalam SATU transaksi yang sama.

### §4: Struct & Enum
Implementasikan PERSIS `Escrow`, `MilestoneProof`, `DisputeRecord` seperti tertulis. Perhatikan `Escrow` punya `mapping(Milestone => MilestoneProof) proofs` di dalam struct — ini butuh getter terpisah (`getMilestoneProof`, sudah ada di §5.5) karena Solidity tidak bisa return struct yang berisi mapping langsung dari `getEscrow()`.

### §5: Semua function signature — implementasikan PERSIS, termasuk comment requires/effects sebagai basis logic
Perhatikan detail yang mudah terlewat:
- `submitMilestoneProof` (§5.3): urutan milestone harus dipaksa (`Shipped` tidak bisa disubmit sebelum `Inspected` lolos) — cek `escrow.state` di awal function.
- `releasePayment` (§5.3): **permissionless** — jangan tambahkan `require(msg.sender == ...)` apapun, siapa saja termasuk keeper bot harus bisa panggil ini setelah `timelockReleaseAt` lewat.
- `raiseDispute` (§5.4): bisa dipanggil importer ATAU exporter (bukan cuma importer) — perhatikan requires-nya mencakup keduanya.
- `resolveDispute` (§5.4): PERHATIKAN dua flag terpisah `slashVerifier` dan `bondFrivolous` — ini DUA KEPUTUSAN INDEPENDEN yang arbiter buat sekaligus, bukan satu boolean tunggal. Kombinasi yang valid secara bisnis:
  - `releaseToExporter=true, bondFrivolous=true, slashVerifier=false` → buyer dispute tidak berdasar, exporter menang, verifier tidak salah
  - `releaseToExporter=false, bondFrivolous=false, slashVerifier=true` → buyer benar, verifier terbukti salah, di-slash
  - Kombinasi lain secara teori bisa terjadi (misal verifier salah tapi keputusan akhir tetap ke exporter karena alasan lain) — JANGAN paksa korelasi otomatis antara `releaseToExporter` dan `slashVerifier`, biarkan keduanya independen sesuai signature aslinya.

### §6: Automated gate — validasi di GATEWAY (backend), bukan on-chain penuh
`01_CONTRACT_SPEC.md` §6 sudah merekomendasikan opsi **gateway-validated** untuk Fase 0/1 (bukan on-chain oracle feed penuh). Artinya: `submitMilestoneProof` MENERIMA `automatedCheckPayload` sebagai `bytes`, tapi kontrak **tidak decode dan validasi isinya sendiri** — kontrak percaya bahwa institusi verifier (yang sudah py role AccessControl, sudah post bond) hanya akan submit setelah backend gateway mereka sendiri memvalidasi data match. Ini KEPUTUSAN SADAR (trust assumption terdokumentasi), bukan kelalaian — jangan "perbaiki" dengan menambah validasi on-chain penuh tanpa didiskusikan, karena itu mengubah kompleksitas signature `automatedCheckPayload` yang sudah frozen.

**Jika kamu (Codex) menemukan bahwa validasi minimal tetap bisa dilakukan on-chain tanpa mengubah signature** (misal decode `bytes` jadi struct sederhana berisi boolean hasil match, lalu `require(matched, "...")`), itu BOLEH ditambahkan karena tidak mengubah interface — tapi TULIS sebagai catatan terpisah ke tim, jangan diam-diam mengubah trust model dari yang didokumentasikan.

### §7: Events — emit PERSIS semua event ini, dengan parameter lengkap sesuai signature
Perhatikan `VerifierSlashed` punya parameter `compensatedTo` (indexed address) — ini WAJIB diisi sesuai tabel "pihak dirugikan" di `04_DISPUTE_BOND_COST_STRUCTURE.md` §1 (importer, hampir selalu).

### §8: Aturan bisnis kunci — gunakan angka dari `04_DISPUTE_BOND_COST_STRUCTURE.md` §5 untuk yang masih TBD
- `challengeWindowSeconds = 21600` (6 jam) — sudah final, tidak berubah
- `timelockDurationSeconds = 86400` (24 jam) — sudah final, tidak berubah
- `disputeBondBps = 300` (3%) — **REVISI dari default 2%** di dokumen asli, lihat rasional lengkap di `04_...` §1 (berbasis riset BANI + Kleros)
- `slashBps = 5000` (50%) — sudah final, tidak berubah
- Verifier kena slash 3x → **auto-revoke role**, implementasikan sebagai internal call ke `revokeRole()` saat `verifierSlashCount` mencapai 3, emit `VerifierRoleRevoked`

**PENTING UNTUK KOMENTAR KODE/NATSPEC**: total waktu settlement realistis adalah hingga **3×6 jam + 24 jam = 42 jam** (worst case dengan challenge di tiap milestone). JANGAN tulis "instant settlement" atau klaim waktu dalam hitungan detik/menit di komentar manapun — itu tidak sesuai desain state machine yang sengaja punya window keamanan berlapis.

### §9: Test acceptance criteria — checklist ini WAJIB semua lulus
Semua item di §9 `01_CONTRACT_SPEC.md` harus jadi test case eksplisit di `test/SternEscrow.t.sol`. Jangan skip satupun, terutama:
- Reentrancy guard di semua fungsi transfer
- Role mismatch harus revert (bukan cuma "tidak berhasil", tapi revert dengan pesan jelas)
- Urutan milestone tidak bisa di-skip

### §10: Keputusan terbuka — SUDAH DIJAWAB semua di `04_DISPUTE_BOND_COST_STRUCTURE.md` §5
Baca tabel "Isi tabel keputusan terbuka" di `04_...` §5 — semua 5 pertanyaan di §10 `01_CONTRACT_SPEC.md` sudah punya jawaban rekomendasi. Untuk no.3 (verifier bond native POL vs IDRT-demo) dan no.4 (siapa 3 signer multisig), **ini benar-benar masih perlu keputusan tim yang tidak bisa diriset** — tanyakan ke tim, jangan asumsikan sendiri.

---

## PERINGATAN KHUSUS — platform fee TIDAK ADA di `01_CONTRACT_SPEC.md`

`01_CONTRACT_SPEC.md` versi yang di-freeze **tidak menyebutkan fee platform sama sekali** — `releasePayment()` di §5.3 effects-nya murni "transfer IDRT-demo ke exporter", tidak ada potongan fee disebut. Ini kemungkinan besar berarti fee platform **sengaja dipisah ke layer non-smart-contract** (misal dipotong saat backend proses top-up/mint, bukan saat release).

**JANGAN menambahkan logic fee ke `releasePayment()` atau function manapun tanpa konfirmasi eksplisit dari tim** — itu mengubah effects dari function yang sudah frozen dan bisa merusak asumsi FE yang sudah baca §5.3 (FE mungkin sudah asumsi `exporter menerima 100% contractValue`, kalau kamu potong fee diam-diam, itu breaking change yang tidak terlihat sampai testing end-to-end).

Rekomendasi model fee (`0,3% + floor Rp150.000`, riset lengkap di `04_...` §4) tetap valid sebagai referensi bisnis, tapi **implementasinya kemungkinan besar di luar `SternEscrow.sol`** — tanyakan ke tim sebelum menambah apapun ke kontrak untuk ini.

---

## Yang HARUS dihindari (kesalahan dari desain lama & kesalahpahaman yang sempat terjadi saat diskusi, jangan diulang)

1. **JANGAN** buat kuorum 2-of-3 generik di mana beberapa oracle "vote" untuk boolean yang sama — sudah digantikan role-based signer per domain (§2 di `01_CONTRACT_SPEC.md`).
2. **JANGAN** hash-matching dokumen/data mentah sebagai mekanisme verifikasi utama — hash itu untuk bukti integritas (proofCid di IPFS), bukan untuk "mencocokkan kebenaran" data. Automated gate (§6) yang seharusnya validasi angka, dilakukan di gateway backend, bukan di kontrak (untuk Fase 0/1).
3. **JANGAN** biarkan `approve()`/`permit()` sebagai keputusan terbuka — WAJIB `permit()`, sudah final (lihat §3 di atas).
4. **JANGAN** pakai formula split yang sama untuk verifier bond slash (70/30) dan dispute bond frivolous (100% ke exporter) — dua kolam dana dan dua formula berbeda (lihat `04_...` §2).
5. **JANGAN** buat dispute bond tiered/proporsional bertingkat — `disputeBondBps` di constructor adalah SATU angka flat (3%), bukan array tier. (Ini kesalahan yang sempat muncul di draft riset pertama, sudah dikoreksi.)
6. **JANGAN** biarkan `mint()` di `IDRTDemo.sol` dipegang single private key tanpa rencana migrasi ke multisig/KMS untuk production — untuk testnet demo, dokumentasikan trust assumption ini secara eksplisit di NatSpec, jangan diam-diam.
7. **JANGAN** tambahkan logic platform fee ke kontrak tanpa konfirmasi tim — lihat peringatan khusus di atas.
8. **JANGAN** klaim di komentar kode atau NatSpec bahwa settlement "instan"/"dalam detik" — realistis hingga 42 jam, tulis apa adanya.

---

## Struktur file yang diharapkan sebagai output

```
contracts/
  SternEscrow.sol           # Kontrak utama, ikuti 01_CONTRACT_SPEC.md persis
  IDRTDemo.sol               # ERC20 + ERC20Permit + AccessControl (MINTER_ROLE)
  interfaces/
    ISternEscrow.sol         # Interface untuk dipakai backend/FE generate ABI, match 02_API_SPEC.md
test/
  SternEscrow.t.sol          # Semua item checklist §9 01_CONTRACT_SPEC.md sebagai test case eksplisit
  IDRTDemo.t.sol              # Test permit(), mint access control, decimals()
```

Pakai Foundry atau Hardhat — cek `SternEscrow_OLD_reference.sol` untuk convention import/style yang sudah dipakai tim sebelumnya, ikuti gaya yang sama supaya konsisten.

---

## Kalau menemukan konflik antar dokumen

`01_CONTRACT_SPEC.md` adalah sumber kebenaran tertinggi untuk signature/struct/event. `04_DISPUTE_BOND_COST_STRUCTURE.md` mengisi angka yang di `01_CONTRACT_SPEC.md` masih TBD. Kalau keduanya bertentangan di luar itu (misal ada asumsi lama yang tidak sengaja terbawa), **STOP dan laporkan konfliknya secara eksplisit**, jangan pilih salah satu secara sepihak — freeze interface ini dipegang dua tim sekaligus.
