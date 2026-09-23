# Deploy Ulang STERN Protocol

Runbook untuk menerbitkan ulang aplikasi yang **sudah pernah live**.

Untuk pemasangan pertama kali (bikin akun Railway, Vercel, dompet, faucet), pakai
[`TRIAL_DEMO_AND_DEPLOY.md`](TRIAL_DEMO_AND_DEPLOY.md) bagian C. Dokumen ini tidak
mengulang hal itu.

> `DEPLOY_AMOY.md` sudah usang. Isinya menjelaskan arsitektur lama berbasis MetaMask
> dengan `ORACLE_QUORUM`, `postBond()`, dan `submitAttestation` — semuanya sudah tidak
> ada di kontrak sekarang. Jangan diikuti.

---

## Tentukan dulu: Anda ada di kasus yang mana

Tiga kasus, dan **ongkosnya sangat berbeda**. Salah menebak akan membuat Anda melakukan
pekerjaan yang tidak perlu, atau lebih buruk, membuang seluruh escrow yang sudah ada.

| Yang Anda ubah | Kasus | Perlu deploy kontrak ulang? | Escrow lama hilang? |
|---|---|---|---|
| Apa pun di `frontend/` | **A** | Tidak | Tidak |
| Apa pun di `backend/` | **B** | Tidak | Tidak |
| Apa pun di `contracts/` | **C** | Ya | **Ya** |

Mengubah `.env` saja bukan perubahan kode, tapi tetap butuh deploy ulang — lihat bagian
"Kalau yang berubah hanya variabel" di bawah.

---

## Kasus A — hanya frontend yang berubah

Contoh: mengganti `authTypes`, memperbaiki teks, mengubah tampilan.

```bash
cd frontend
npm run build          # pastikan lolos SEBELUM push
```

Kalau build lolos, push ke branch yang tersambung ke host frontend. Vercel atau host
sejenis akan membangun ulang sendiri.

**Yang paling sering menjebak di sini:** Vite menanam nilai `VITE_*` ke dalam bundle saat
**build**, bukan saat aplikasi berjalan. Jadi:

- Mengubah variabel di dashboard host lalu menekan Save **tidak berpengaruh apa-apa**.
  Anda harus memicu deploy ulang supaya nilainya ikut terbangun.
- Semua nilai `VITE_*` **bisa dibaca siapa saja** yang membuka bundle di peramban.
  Jangan pernah menaruh kunci privat di sana. `VITE_PIMLICO_API_KEY` memang ikut
  terkirim ke publik — batasi dengan Sponsorship Policy di dashboard Pimlico.

Verifikasi setelah live: buka URL-nya, pastikan halaman login muncul (bukan layar putih),
lalu buka DevTools → Console dan pastikan tidak ada error merah.

---

## Kasus B — hanya backend yang berubah

Contoh: menambah endpoint, memperbaiki logika oracle.

```bash
node --check backend/oracle-gateway/index.js    # cek sintaks
npm run test:identity                           # uji identitas
```

Push, lalu Railway membangun ulang sendiri. Start command-nya tetap:

```
node backend/oracle-gateway/index.js
```

Verifikasi:

```bash
curl https://<domain-railway-anda>/health
```

Harus mengembalikan JSON, bukan halaman error.

**Yang menjebak di sini:** akun perusahaan sekarang tersimpan di PostgreSQL.
Pastikan `DATABASE_URL` mengarah ke database yang sama dan impor `identities.json`
lama sebelum deploy pertama versi ini. Volume `/data` tetap diperlukan untuk
riwayat klaim faucet dan berkas JSON lain:

```
DATABASE_URL=postgresql://...
DEMO_CLAIMS_FILE=/data/demo-claims.json
```

Kalau Anda sedang mendekati hari demo dan sudah mendaftarkan akun perusahaan untuk
peragaan, cek ini dulu sebelum menekan deploy — akun itu tidak bisa dikembalikan.

---

## Kasus C — kontrak berubah

**Baca seluruh bagian ini sebelum menjalankan apa pun.**

Kontrak di blockchain tidak bisa diperbarui di tempat. Deploy ulang menghasilkan
**alamat baru**, dan alamat baru berarti kontrak kosong: semua escrow, bukti milestone,
sengketa, dan saldo IDRT yang lama **tidak ikut pindah dan tidak bisa dipindahkan.**

Kalau Anda punya escrow demo yang sudah disiapkan untuk presentasi, escrow itu akan
hilang. Siapkan ulang setelahnya, dan sediakan waktu untuk itu.

### C.1 — Siapkan `.env` di root

```bash
AMOY_RPC_URL=https://<rpc-amoy-anda>
DEPLOYER_PRIVATE_KEY=0x...
ORACLE_PRIVATE_KEYS=0x<quality>,0x<logistics>,0x<customs>
```

`ORACLE_PRIVATE_KEYS` harus berisi **tepat tiga** kunci, dipisah koma, dan ketiganya
harus berbeda. Urutannya menentukan peran:

| Urutan | Peran yang diberikan |
|---|---|
| ke-1 | `ROLE_QUALITY_AUDITOR` (milestone 1 — inspeksi) |
| ke-2 | `ROLE_LOGISTICS` (milestone 2 — pengapalan) |
| ke-3 | `ROLE_CUSTOMS` (milestone 3 — bea cukai) |

Kalau urutannya tertukar, verifikasi akan gagal dengan penolakan peran, dan pesannya
tidak akan menyebut urutan sebagai penyebabnya. Catat urutan yang Anda pakai.

### C.2 — Pastikan keempat dompet punya POL

Deployer dan ketiga verifikator masing-masing mengirim transaksi saat deploy
(`grantVerifierRole`, `mint`, `approve`, `postVerifierBond`). Semuanya butuh gas.

Ambil dari [faucet Polygon](https://faucet.polygon.technology), pilih jaringan **Polygon
Amoy**. Faucet dibatasi biasanya sekali per hari per alamat, jadi minta untuk keempat
alamat sekaligus sebelum lanjut.

Jaminan verifikator sendiri dibayar dengan IDRT, bukan POL — token itu dicetak otomatis
oleh skrip deploy. Jadi POL hanya untuk gas.

### C.3 — Kompilasi, uji, deploy

```bash
npm run compile
npm test
npx hardhat run scripts/deploy.js --network amoy
```

Keluarannya akan berisi:

```
ROLE_QUALITY_AUDITOR: 0x... (IDRT bond posted)
ROLE_LOGISTICS:       0x... (IDRT bond posted)
ROLE_CUSTOMS:         0x... (IDRT bond posted)
IDRTDemo deployed to:    0x...     ← catat
SternEscrow deployed to: 0x...     ← catat
```

**Catat dua alamat itu.** Keduanya dibutuhkan di langkah berikutnya.

Kalau gagal dengan `insufficient funds`, salah satu dompet belum menerima POL dari
faucet. Kalau gagal dengan `Need 3 verifier signers`, `ORACLE_PRIVATE_KEYS` tidak berisi
tepat tiga kunci.

### C.4 — Sebarkan alamat baru ke TIGA tempat

Ini langkah yang paling sering terlewat, dan gejalanya membingungkan: aplikasi terlihat
jalan tapi setiap escrow hilang, atau gerbang menjawab "escrow not found" untuk escrow
yang jelas-jelas baru dibuat. Penyebabnya selalu sama — frontend dan backend menunjuk ke
dua kontrak yang berbeda.

| Tempat | Variabel | Isi |
|---|---|---|
| `.env` root | `CONTRACT_ADDRESS` | alamat SternEscrow |
| Railway | `CONTRACT_ADDRESS` | alamat SternEscrow |
| Host frontend | `VITE_CONTRACT_ADDRESS` | alamat SternEscrow |
| Host frontend | `VITE_IDRT_TOKEN_ADDRESS` | alamat IDRTDemo |

Setelah mengubah variabel di Railway, **picu deploy ulang**. Perubahan variabel tidak
masuk ke proses yang sedang berjalan. Sama untuk host frontend — ingat Vite menanam nilai
saat build.

---

## Kalau yang berubah hanya variabel

Tidak ada kode yang disentuh, tapi tetap harus deploy ulang:

- **Variabel backend** (Railway) — ubah, lalu picu redeploy. Proses yang sedang jalan
  memegang nilai lama di memori.
- **Variabel frontend** (`VITE_*`) — ubah, lalu picu redeploy. Nilai lama sudah tertanam
  di dalam bundle yang sekarang disajikan.

---

## Daftar variabel lengkap

### Backend (Railway) — jangan pernah masuk ke frontend atau GitHub

```
PORT=${{PORT}}
RPC_URL=https://<rpc-amoy>
CONTRACT_ADDRESS=0x<SternEscrow>
ORACLE_PRIVATE_KEYS=0x<quality>,0x<logistics>,0x<customs>
ARBITER_PRIVATE_KEY=0x<arbiter>
IDRT_MINTER_PRIVATE_KEY=0x<deployer atau minter>
INTERNAL_API_KEY=<acak, panjang>
AUTH_TOKEN_SECRET=<acak, minimal 32 karakter>
CORS_ORIGINS=https://<domain-frontend-anda>
DATABASE_URL=postgresql://...
PARTICLE_PROJECT_ID=<project-id>
PARTICLE_SERVER_KEY=<server-key-rahasia>
DEMO_CLAIMS_FILE=/data/demo-claims.json
```

`CORS_ORIGINS` harus berisi domain frontend yang persis, bukan `*`. Kalau salah,
gejalanya adalah "Could not reach the STERN gateway" di peramban padahal `/health`
menjawab normal saat dipanggil lewat curl.

`INTERNAL_API_KEY` menjaga tiga rute tulis (`/submit-oracle`, `/milestones/:id/submit`,
`/resolve-dispute`) yang pemanggilnya boleh memilih milestone dan CID bukti. **Kalau
kunci ini sampai ke bundle frontend, siapa pun bisa memalsukan bukti lewat DevTools.**
Kunci ini tidak pernah boleh diberi awalan `VITE_`.

### Frontend — semuanya publik begitu terbangun

```
VITE_ORACLE_API=https://<domain-railway>
VITE_CONTRACT_ADDRESS=0x<SternEscrow>
VITE_IDRT_TOKEN_ADDRESS=0x<IDRTDemo>
VITE_RPC_URL=https://<rpc-amoy-yang-mengizinkan-CORS>
VITE_CHAIN_ID=80002
VITE_PARTICLE_PROJECT_ID=...
VITE_PARTICLE_CLIENT_KEY=...
VITE_PARTICLE_APP_ID=...
VITE_PIMLICO_API_KEY=...
VITE_PARTICLE_ENABLED=true
```

Dua jebakan pada nilai-nilai ini:

**`VITE_ORACLE_API` tidak boleh diakhiri garis miring.** Garis miring di ujung
menghasilkan `//escrows`, dan Express menjawabnya 404.

**`VITE_RPC_URL` harus RPC yang mengizinkan permintaan dari peramban.** Peramban
memanggil RPC secara langsung untuk menurunkan alamat Smart Account. RPC tanpa header
CORS gagal dengan pesan telanjang "Failed to fetch", dan
`rpc-amoy.polygon.technology` diketahui menolak. Yang bisa dicoba, berurutan:

```
https://polygon-amoy-bor-rpc.publicnode.com
https://polygon-amoy.drpc.org
https://polygon-amoy.g.alchemy.com/v2/<kunci-anda>     ← paling andal
```

---

## Verifikasi setelah deploy ulang

Jalankan berurutan. Berhenti di kegagalan pertama — kegagalan berikutnya biasanya cuma
akibat dari yang pertama.

1. `curl https://<domain-railway>/health` → JSON, bukan halaman error
2. `curl https://<domain-railway>/verifiers` → tiga alamat verifikator, sesuai yang
   dicetak skrip deploy
3. Buka URL frontend → halaman login muncul, Console bersih
4. Masuk → alamat Smart Account muncul di sidebar, saldo IDRT terbaca
5. Buat satu escrow kecil dengan tenggat pendek → muncul di daftar setelah transaksi masuk
6. Jalankan verifikasi tiga milestone → ketiganya lolos
7. Nyalakan satu kasus gagal (`POST /oracle/simulate/:id` dengan sebuah fault) →
   kontrak **menolak**, bukan meloloskan
8. Kembalikan simulasi ke `{"fault":"none"}`

Langkah 7 yang paling penting. Alur mulus bisa lolos meski gerbang salah menunjuk
kontrak; alur gagal tidak.

---

## Kalau ada yang salah

| Gejala | Penyebab yang paling mungkin |
|---|---|
| "escrow not found" untuk escrow yang baru dibuat | `CONTRACT_ADDRESS` backend ≠ `VITE_CONTRACT_ADDRESS` frontend |
| "Could not reach the STERN gateway" tapi `/health` normal via curl | `CORS_ORIGINS` tidak memuat domain frontend |
| "Failed to fetch" saat masuk | `VITE_RPC_URL` menunjuk RPC yang menolak permintaan peramban |
| Akun perusahaan hilang setelah deploy | Volume `/data` belum terpasang di Railway |
| Nilai `.env` baru seperti tidak terbaca | Belum deploy ulang — variabel tidak masuk ke proses/bundle yang sedang jalan |
| `insufficient funds` saat verifikasi | Dompet verifikator kehabisan POL; isi ulang dari faucet |
| Semua escrow hilang setelah deploy kontrak | Perilaku normal. Kontrak baru = alamat baru = kosong |
| 404 di setiap panggilan gerbang | `VITE_ORACLE_API` diakhiri garis miring |

---

## Yang harus dicek sebelum hari demo

```bash
npm run compile
npm test
npm run test:identity
cd frontend && npm run build
```

Lalu jalankan delapan langkah verifikasi di atas **pada URL publik**, bukan di localhost.
Yang bisa lolos di localhost tapi gagal di produksi hampir selalu soal env: CORS, RPC
yang menolak peramban, atau alamat kontrak yang tidak sinkron.

Terakhir: kalau host gerbang Anda memakai paket gratis yang tidur saat menganggur,
panggil `/health` sekitar semenit sebelum naik panggung supaya panggilan oracle pertama
tidak tertahan proses bangun.
