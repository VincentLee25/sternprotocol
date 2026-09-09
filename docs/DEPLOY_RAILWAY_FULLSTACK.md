# Deploy Full-Stack di Railway — dari nol sampai jalan

Menerbitkan **frontend dan gerbang oracle, keduanya di Railway**, dari satu repositori.

Untuk deploy ulang setelah semuanya sudah live, pakai [`DEPLOY_ULANG.md`](DEPLOY_ULANG.md).
Dokumen ini untuk pemasangan pertama, atau kalau Anda mau mulai dari bersih.

> Catatan sebelum mulai: menaruh frontend di Railway berarti dua service berjalan, jadi
> kuota pemakaian terpakai lebih cepat dibanding menaruh frontend di Vercel (gratis untuk
> build statis). Yang Anda dapat sebagai gantinya: satu dashboard, satu tagihan, satu
> tempat mengurus variabel. Itu pertukaran yang wajar — dokumen ini tidak akan
> mempersoalkannya lagi.

---

## Gambaran

Dua service, satu repositori:

| Service | Root Directory | Menjalankan |
|---|---|---|
| `stern-gateway` | *(kosong / root)* | `node backend/oracle-gateway/index.js` |
| `stern-web` | `frontend` | `npm start` (menyajikan hasil `vite build`) |

Kontrak **tidak** di-deploy dari Railway. Kontrak di-deploy sekali dari laptop Anda, lalu
alamatnya ditempel ke kedua service.

Urutannya penting, karena dua service ini saling membutuhkan alamat satu sama lain:

```
1. Deploy kontrak (laptop)  → dapat 2 alamat kontrak
2. Deploy gateway (Railway) → dapat URL gateway
3. Deploy web (Railway)     → dapat URL web, pakai URL gateway
4. Kembali ke gateway       → isi CORS_ORIGINS dengan URL web, redeploy
```

Langkah 4 sering terlupa, dan gejalanya menyesatkan — lihat bagian akhir.

---

## Bagian 0 — Yang perlu disiapkan

| # | Perlu | Untuk apa |
|---|---|---|
| 1 | Akun Railway | Menjalankan kedua service |
| 2 | Akun Particle (dashboard.particle.network) | Login sosial — 3 kunci |
| 3 | Akun Pimlico (dashboard.pimlico.io) | Menalangi biaya gas — 1 kunci |
| 4 | 5 dompet kosong | Deployer, 3 verifikator, arbiter |
| 5 | Node.js di laptop | Deploy kontrak |

### Lima dompet

Buat lima akun **baru** di MetaMask, khusus untuk proyek ini. Jangan pernah memakai
dompet yang menyimpan aset sungguhan.

| Dompet | Tugas |
|---|---|
| `stern-deployer` | Deploy kontrak, dan mencetak IDRT untuk faucet |
| `stern-quality` | Verifikator milestone 1 — inspeksi |
| `stern-logistics` | Verifikator milestone 2 — pengapalan |
| `stern-customs` | Verifikator milestone 3 — bea cukai |
| `stern-arbiter` | Memutus sengketa |

Kelimanya perlu POL untuk gas. Ambil dari [faucet Polygon](https://faucet.polygon.technology),
pilih jaringan **Polygon Amoy**. Faucet dibatasi biasanya sekali sehari per alamat, jadi
minta untuk kelima alamat sekaligus.

Jaminan verifikator dibayar dengan IDRT, bukan POL — token itu dicetak otomatis oleh skrip
deploy. Jadi POL murni untuk gas.

---

## Bagian 1 — Deploy kontrak dari laptop

### 1.1 Isi `.env` di root repositori

```bash
AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
DEPLOYER_PRIVATE_KEY=<kunci stern-deployer>
ORACLE_PRIVATE_KEYS=<kunci quality>,<kunci logistics>,<kunci customs>
```

**Urutan `ORACLE_PRIVATE_KEYS` menentukan peran.** Tepat tiga kunci, dipisah koma, tanpa
spasi, ketiganya berbeda:

| Urutan | Peran |
|---|---|
| ke-1 | `ROLE_QUALITY_AUDITOR` — milestone 1 |
| ke-2 | `ROLE_LOGISTICS` — milestone 2 |
| ke-3 | `ROLE_CUSTOMS` — milestone 3 |

Awalan `0x` boleh ada boleh tidak — keduanya diterima. Yang penting panjangnya 64 karakter
heksadesimal.

### 1.2 Deploy

```bash
npm install
npm run compile
npm test
npx hardhat run scripts/deploy.js --network amoy
```

Keluarannya:

```
ROLE_QUALITY_AUDITOR: 0x... (IDRT bond posted)
ROLE_LOGISTICS:       0x... (IDRT bond posted)
ROLE_CUSTOMS:         0x... (IDRT bond posted)
IDRTDemo deployed to:    0xAAA...     ← CATAT
SternEscrow deployed to: 0xBBB...     ← CATAT
```

**Catat dua alamat terakhir.** Keduanya dipakai berkali-kali di bawah.

Kalau gagal `insufficient funds`, ada dompet yang belum dapat POL. Kalau gagal
`Need 3 verifier signers`, `ORACLE_PRIVATE_KEYS` tidak berisi tepat tiga kunci.

---

## Bagian 2 — Service gateway di Railway

### 2.1 Buat service

1. Railway → **New Project** → **Deploy from GitHub repo** → pilih repositori ini
2. Buka service yang terbentuk → **Settings**
3. Isi:

| Kolom | Nilai |
|---|---|
| Service Name | `stern-gateway` |
| Root Directory | *(kosongkan)* |
| Start Command | `npm start` |

`package.json` di root sudah punya `"start": "node backend/oracle-gateway/index.js"`, jadi
Railway bisa mendeteksinya sendiri dan kolom Start Command sebenarnya boleh dikosongkan.

> **Jangan pakai `npm run backend` di Railway**, meskipun Railway sendiri yang
> menyarankannya. Skrip itu menjalankan `post-bond.js` lebih dulu, yang mengirim transaksi
> ke rantai **setiap kali service dimulai** — boros gas, dan kalau skrip itu gagal karena
> alasan apa pun, `&&` membuat gerbangnya tidak pernah menyala sama sekali. Jaminan
> verifikator sudah dipasang oleh `scripts/deploy.js`; tidak perlu diulang saat boot.

### 2.2 Pasang volume — lakukan sekarang, jangan nanti

**Settings → Volumes → New Volume**, mount path: `/data`

Tanpa ini, setiap deploy ulang **menghapus semua akun perusahaan yang terdaftar** dan
riwayat klaim faucet. Kalau Anda sudah mendaftarkan akun untuk demo lalu baru memasang
volume, akun itu sudah hilang dan tidak bisa dikembalikan.

### 2.3 Variabel gateway

**Variables → Raw Editor**, tempel semuanya sekaligus:

```
RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
CONTRACT_ADDRESS=0xBBB...
ORACLE_PRIVATE_KEYS=<quality>,<logistics>,<customs>
ARBITER_PRIVATE_KEY=<kunci stern-arbiter>
IDRT_MINTER_PRIVATE_KEY=<kunci stern-deployer>
INTERNAL_API_KEY=<acak panjang, buat sendiri>
AUTH_TOKEN_SECRET=<acak minimal 32 karakter, buat sendiri>
CORS_ORIGINS=*
IDENTITY_STORE_FILE=/data/identities.json
DEMO_CLAIMS_FILE=/data/demo-claims.json
DEMO_BALANCE_IDRT=150000000.00
```

Catatan per variabel:

- **`PORT` jangan diisi.** Railway menyuntikkannya sendiri, dan `config.js` sudah
  membacanya.
- **`IDRT_MINTER_PRIVATE_KEY`** harus dompet yang memegang `MINTER_ROLE` di IDRTDemo.
  Deployer memegangnya, jadi memakai kunci deployer adalah pilihan paling sederhana.
- **`AUTH_TOKEN_SECRET`** minimal 32 karakter acak. Buat sendiri, jangan menyalin contoh
  dari dokumen mana pun.
- **`INTERNAL_API_KEY`** menjaga tiga rute yang pemanggilnya boleh memilih milestone dan
  CID bukti. **Nilai ini tidak boleh pernah masuk ke service frontend.**
- **`CORS_ORIGINS=*` hanya sementara.** Diperbaiki di Bagian 4.

Variabel yang **tidak usah** dipasang, karena tidak dibaca kode mana pun:
`FRONTEND_ORACLE_API`, `REQUIRED_CONFIRMATIONS`, `ORACLE_QUORUM`, `ORACLE_BOND_ETH`.
`ORACLE_PRIVATE_KEY` (tunggal) juga tidak perlu — ia hanya cadangan yang kalah dari yang
jamak.

### 2.4 Terbitkan domain dan uji

**Settings → Networking → Generate Domain.** Catat URL-nya, misalnya
`https://stern-gateway-production.up.railway.app`.

```bash
curl https://<url-gateway>/health
curl https://<url-gateway>/verifiers
```

`/health` harus mengembalikan JSON. `/verifiers` harus menampilkan tiga verifikator dengan
`active: true` dan peran yang cocok dengan milestone-nya. Kalau ada yang `active: false`,
peran belum diberikan — periksa lagi urutan `ORACLE_PRIVATE_KEYS`.

**Jangan lanjut sebelum kedua perintah ini benar.** Masalah di sini akan muncul lagi
nanti dalam bentuk yang jauh lebih membingungkan.

---

## Bagian 3 — Service frontend di Railway

### 3.1 Buat service kedua

Di project yang **sama**: **New → GitHub Repo** → pilih repositori yang sama lagi.

| Kolom | Nilai |
|---|---|
| Service Name | `stern-web` |
| Root Directory | `frontend` |
| Build Command | *(kosongkan — terdeteksi otomatis)* |
| Start Command | `npm start` |

Repositori ini sudah siap untuk itu: `frontend/package.json` punya
`"start": "serve -s dist -l ${PORT:-4173}"` dan `serve` sudah terdaftar sebagai
dependency. Railway akan menjalankan `npm install`, `npm run build`, lalu `npm start`.

### 3.2 Variabel frontend

```
VITE_ORACLE_API=https://<url-gateway-dari-2.4>
VITE_CONTRACT_ADDRESS=0xBBB...
VITE_IDRT_TOKEN_ADDRESS=0xAAA...
VITE_CHAIN_ID=80002
VITE_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
VITE_PARTICLE_PROJECT_ID=<dari dashboard Particle>
VITE_PARTICLE_CLIENT_KEY=<dari dashboard Particle>
VITE_PARTICLE_APP_ID=<dari dashboard Particle>
VITE_PIMLICO_API_KEY=<dari dashboard Pimlico>
VITE_PARTICLE_ENABLED=true
```

Tiga hal yang wajib dipahami di sini:

**Semua nilai `VITE_*` bisa dibaca siapa saja** yang membuka bundle di peramban. Tidak ada
yang rahasia di daftar ini. Jangan pernah menaruh kunci privat atau `INTERNAL_API_KEY`
dengan awalan `VITE_`.

`VITE_PIMLICO_API_KEY` ikut terbit ke publik — itu memang tidak terhindarkan. Batasi
dengan **Sponsorship Policy** di dashboard Pimlico, atau siapa pun yang membaca bundle bisa
menghabiskannya.

**`VITE_ORACLE_API` tanpa garis miring di ujung.** Garis miring menghasilkan `//escrows`,
dan Express menjawabnya 404.

**`VITE_RPC_URL` harus RPC yang mengizinkan permintaan dari peramban.** Peramban memanggil
RPC langsung untuk menurunkan alamat Smart Account. RPC tanpa header CORS gagal dengan
pesan telanjang "Failed to fetch", dan `rpc-amoy.polygon.technology` diketahui menolak.
Urutan yang bisa dicoba:

```
https://polygon-amoy-bor-rpc.publicnode.com
https://polygon-amoy.drpc.org
https://polygon-amoy.g.alchemy.com/v2/<kunci-anda>     ← paling andal
```

### 3.3 Terbitkan domain

**Settings → Networking → Generate Domain.** Catat URL-nya, misalnya
`https://stern-web-production.up.railway.app`.

---

## Bagian 4 — Hubungkan keduanya

Sekarang kedua URL sudah ada. Kembali ke **`stern-gateway` → Variables**, ganti:

```
CORS_ORIGINS=https://<url-web-dari-3.3>
```

Persis, tanpa garis miring di ujung, bukan `*`.

Lalu **picu deploy ulang service gateway.** Perubahan variabel tidak masuk ke proses yang
sedang berjalan — kalau tidak di-redeploy, nilai lamanya masih dipakai.

> Railway punya cara yang lebih rapi untuk ini: di `CORS_ORIGINS` Anda bisa menulis
> `https://${{stern-web.RAILWAY_PUBLIC_DOMAIN}}`, dan Railway mengisinya sendiri. Sama
> untuk `VITE_ORACLE_API` di sisi web. Kalau sintaks itu berhasil, nilainya ikut menyesuaikan
> saat domain berubah. Kalau tidak, tempel URL-nya secara manual — hasilnya sama.

---

## Bagian 5 — Verifikasi

Jalankan berurutan. **Berhenti di kegagalan pertama** — kegagalan berikutnya biasanya cuma
akibat dari yang pertama.

| # | Langkah | Yang benar |
|---|---|---|
| 1 | `curl <gateway>/health` | JSON, bukan halaman error |
| 2 | `curl <gateway>/verifiers` | 3 verifikator, `active: true`, peran cocok |
| 3 | Buka URL web | Halaman login muncul, Console peramban bersih |
| 4 | Masuk (Google / email / X) | Alamat Smart Account muncul di sidebar |
| 5 | Lihat saldo | IDRT terbaca, tombol klaim jalan |
| 6 | Buat escrow kecil, tenggat pendek | Muncul di daftar setelah transaksi masuk |
| 7 | Jalankan verifikasi 3 milestone | Ketiganya lolos |
| 8 | Nyalakan satu kasus gagal | Kontrak **menolak**, bukan meloloskan |
| 9 | Kembalikan simulasi ke normal | — |

Langkah 8 dan 9:

```bash
curl -X POST <gateway>/oracle/simulate/0 \
  -H 'Content-Type: application/json' -d '{"fault":"vgm"}'

curl -X POST <gateway>/oracle/simulate/0 \
  -H 'Content-Type: application/json' -d '{"fault":"none"}'
```

**Nama fault harus persis dari daftar ini**, karena nama yang tidak dikenali diam-diam
dianggap `none` — simulasinya tidak menyala, verifikasi lolos seperti biasa, dan Anda akan
mengira kontraknya menerima bukti buruk padahal tidak ada bukti buruk yang dikirim:

```
none · quality · quality_auditor · vgm · inspection · logistics · ais · customs · ceisa · ipfs
```

**Langkah 8 yang paling penting.** Alur mulus bisa lolos meski gerbang menunjuk kontrak
yang salah. Alur gagal tidak.

---

## Kalau ada yang salah

| Gejala | Penyebab paling mungkin |
|---|---|
| "Could not reach the STERN gateway" tapi `/health` normal via curl | `CORS_ORIGINS` belum diisi URL web, atau gateway belum di-redeploy setelah diubah |
| 404 di setiap panggilan gerbang | `VITE_ORACLE_API` berakhir garis miring |
| "Failed to fetch" saat masuk | `VITE_RPC_URL` menunjuk RPC yang menolak peramban |
| Halaman putih, Console penuh error | Build frontend gagal — cek log build service `stern-web` |
| Login jalan tapi mode demo | Salah satu dari tiga `VITE_PARTICLE_*` kosong |
| Masuk tapi tidak bisa kirim transaksi | `VITE_PIMLICO_API_KEY` kosong atau kena batas policy |
| "escrow not found" untuk escrow yang baru dibuat | `CONTRACT_ADDRESS` gateway ≠ `VITE_CONTRACT_ADDRESS` web |
| Faucet gagal | `IDRT_MINTER_PRIVATE_KEY` bukan pemegang `MINTER_ROLE` |
| Login perusahaan gagal | `AUTH_TOKEN_SECRET` kosong atau kurang dari 32 karakter |
| Putusan sengketa gagal | `ARBITER_PRIVATE_KEY` kosong |
| `insufficient funds` saat verifikasi | Dompet verifikator kehabisan POL — isi dari faucet |
| Akun perusahaan hilang setelah deploy | Volume `/data` belum terpasang |
| Nilai variabel baru seperti tidak terbaca | Belum redeploy — nilai lama masih di proses/bundle |

---

## Ringkasan variabel

### `stern-gateway` — semuanya rahasia

```
RPC_URL, CONTRACT_ADDRESS, ORACLE_PRIVATE_KEYS, ARBITER_PRIVATE_KEY,
IDRT_MINTER_PRIVATE_KEY, INTERNAL_API_KEY, AUTH_TOKEN_SECRET, CORS_ORIGINS,
IDENTITY_STORE_FILE, DEMO_CLAIMS_FILE, DEMO_BALANCE_IDRT
```

### `stern-web` — semuanya publik

```
VITE_ORACLE_API, VITE_CONTRACT_ADDRESS, VITE_IDRT_TOKEN_ADDRESS, VITE_CHAIN_ID,
VITE_RPC_URL, VITE_PARTICLE_PROJECT_ID, VITE_PARTICLE_CLIENT_KEY,
VITE_PARTICLE_APP_ID, VITE_PIMLICO_API_KEY, VITE_PARTICLE_ENABLED
```

Tidak ada satu pun nilai dari daftar pertama yang boleh muncul di daftar kedua.

---

## Kebiasaan menjaga kunci

Halaman Variables di Railway menampilkan nilai secara terang-terangan. **Sembunyikan
dulu sebelum membagikan layar** — kunci privat yang terlihat sekali di panggilan video
sudah harus dianggap bocor, sekalipun itu testnet.

Kalau ada kunci yang pernah terlihat orang lain, terpasang di screenshot, atau masuk ke
riwayat chat: buat dompet baru, deploy ulang kontrak, ganti nilainya. Prosedurnya ada di
[`DEPLOY_ULANG.md`](DEPLOY_ULANG.md) kasus C.
