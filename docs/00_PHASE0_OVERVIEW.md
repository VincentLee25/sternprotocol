# STERN Protocol — Fase 0: Design Sprint Freeze

Status: **DRAFT — menunggu sign-off kedua tim**
Terakhir diupdate: 29 Agustus 2026

## Tujuan dokumen ini

Fase 0 adalah tahap "freeze interface" sebelum dua tim (Web3/Blockchain Backend dan Frontend/UX) mulai kerja paralel untuk upgrade STERN Protocol dari MVP lokal ke production-ready testnet (Polygon Amoy) dengan Particle Network sebagai infrastruktur account abstraction.

**Aturan main Fase 0**: begitu dokumen-dokumen ini di-sign-off oleh kedua tim lead, bentuk interface (function signature, event, response JSON) dianggap **frozen**. Perubahan setelah freeze harus lewat proses change-request tertulis di sini, bukan diubah diam-diam di kode masing-masing tim — supaya integrasi di akhir gak jadi neraka.

## Dokumen yang termasuk Fase 0

| Dokumen | Isi | Dipakai oleh |
|---|---|---|
| `01_CONTRACT_SPEC.md` | State machine, role, struct, function & event signature smart contract | Tim Blockchain (implementasi) + Tim FE (baca ABI, tau kapan tx bisa dipanggil) |
| `02_API_SPEC.md` | Endpoint oracle-gateway/backend, request/response JSON | Tim FE (integrasi langsung) + Tim Blockchain (implementasi) |
| `03_PARTICLE_INTEGRATION.md` | Pembagian kerja Particle Network (Auth, AA, Paymaster) antara FE dan BE | Kedua tim, terutama FE |

## Kenapa spec-first, bukan backend-dulu-baru-FE

Kalau FE nunggu smart contract & backend selesai total dulu, kita kehilangan minggu-minggu kerja paralel. Solusinya: kunci dulu **bentuk** interface-nya di sini (bukan implementasinya), lalu:

- Tim Blockchain langsung implementasi kontrak + oracle-gateway sesuai spec ini.
- Tim FE langsung integrasi Particle Auth/AA (independen, gak butuh backend sama sekali) DAN develop UI escrow pakai **mock server** yang response-nya persis sama bentuknya dengan `02_API_SPEC.md` (pakai MSW, json-server, atau Express stub sederhana).
- Begitu backend real siap, FE tinggal ganti base URL — idealnya nyaris zero rework kalau spec dipegang teguh.

## Perubahan penting dari desain MVP lama

Supaya tim yang baca gak bingung kenapa bentuknya beda dari `sternprotocol-master` yang lama:

1. **Oracle consensus 2-of-3 per-check → Sequential milestone dengan role-based signer**. Tiga milestone (`INSPECTED` → `SHIPPED` → `ARRIVED_CLEARED`), masing-masing ditandatangani oleh institusi yang benar-benar berwenang (bukan 3 oracle generik ngecek hal yang sama).
2. **Hybrid gate**: tiap milestone tetap butuh automated data check (AIS/CEISA/VGM feed) yang match, DITAMBAH signature institusi + proof file di IPFS. Bukan cuma tombol approve/reject.
3. **Timelock 24 jam** setelah milestone ketiga lolos, sebelum dana benar-benar cair — beri ruang buyer buka dispute terakhir.
4. **Challenge window per-milestone** (6 jam) — masalah ketahuan lebih awal, gak numpuk di akhir.
5. **Stake & slashing per-role**, bukan per-escrow — institusi posting bond sekali saat role di-grant, kena slash kalau terbukti curang.
6. **Dispute bond untuk buyer** — mencegah buyer asal-asalan dispute buat nunda pembayaran.
7. **Role governance lewat multisig**, bukan single owner EOA.
8. **Global deadline safety valve** tetap ada di semua level — importer gak pernah stuck permanen kalau proses macet di titik manapun.
9. **USDT demo digantikan token IDRT-demo custom** — ERC20 mintable milik protokol sendiri, bukan mock stablecoin generik.
10. **Wallet institusi verifier (Sucofindo/shipping line/customs) tetap EOA, bukan Particle Smart Account** — signature verification jadi standar (`ecrecover`), gak perlu handle ERC-1271. Particle AA hanya dipakai untuk end-user (importer/exporter).

## Exit criteria Fase 0 (checklist sign-off)

Sebelum dua tim mulai kerja paralel, pastikan semua ini dicentang:

- [ ] Tim Blockchain sudah baca & setuju `01_CONTRACT_SPEC.md` — tidak ada function/event yang masih "TBD"
- [ ] Tim FE sudah baca & setuju `02_API_SPEC.md` — semua endpoint yang dibutuhkan UI sudah tercakup
- [ ] Kedua tim sepakat pembagian kerja Particle di `03_PARTICLE_INTEGRATION.md`
- [ ] Alamat kontrak IDRT-demo token, decimals, dan supply policy sudah disepakati (lihat `01_CONTRACT_SPEC.md` §3)
- [ ] Role governance multisig signer sudah ditentukan siapa saja (minimal nama/wallet placeholder untuk testnet)
- [ ] Particle Project ID + Paymaster policy dashboard sudah dibuat (boleh dummy dulu untuk mulai development)
- [ ] Kedua tim lead tanda tangan (comment approve) di PR yang berisi dokumen-dokumen ini

## Setelah Fase 0

- **Fase 1**: kerja paralel — Blockchain implementasi kontrak + gateway, FE integrasi Particle + UI dengan mock API.
- **Fase 2**: integrasi — ganti mock jadi endpoint & contract address asli di Amoy testnet, uji end-to-end.
- **Fase 3**: hardening — Slither/static analysis, test coverage state machine + slashing + dispute, audit eksternal sebelum pilot dengan nilai riil.

## Change log dokumen ini

| Tanggal | Perubahan | Oleh |
|---|---|---|
| 2026-08-29 | Draft awal Fase 0 dibuat | — |
