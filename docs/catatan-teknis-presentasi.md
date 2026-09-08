# Catatan Teknis STERN Protocol

Bahan belajar untuk mempresentasikan prototipe ini ke offtaker, calon mitra, atau juri.
Ditulis supaya bisa dibaca sendirian tanpa perlu membuka kode.

Pendamping berkas `STERN-Protocol-Prototipe.pptx`. Setiap slide di sana punya catatan
pembicara; dokumen ini adalah bahan di baliknya.

---

## 1. Satu paragraf, kalau hanya sempat menghafal satu hal

Importir mengunci dananya di dalam sebuah kontrak di blockchain. Kunci itu hanya terbuka
setelah tiga lembaga yang berbeda — auditor mutu, penyedia data logistik, dan kepabeanan —
masing-masing menaruh bukti untuk fakta yang berbeda. Tidak ada satu pihak pun, termasuk tim
pembuatnya, yang bisa membuka lebih cepat. Kalau tenggat lewat tanpa penyelesaian, importir
menarik dananya kembali sendiri tanpa perlu izin siapa pun.

---

## 2. Sistem ini pakai bahasa apa

Jawaban pendek: **Solidity untuk kontrak, JavaScript untuk sisanya.**

| Bagian | Bahasa | Ukuran | Kenapa bahasa itu |
|---|---|---|---|
| Kontrak pintar | Solidity 0.8.20 | 790 baris | Tidak ada pilihan lain untuk rantai EVM |
| Gerbang oracle | JavaScript (Node.js) | 2.280 baris | Pustaka Web3 paling matang ada di ekosistem ini |
| Antarmuka web | JavaScript + JSX (React) | 7.662 baris | Bahasa yang sama dengan gerbang; satu tim, satu bahasa |
| Uji kontrak | JavaScript (Hardhat/Mocha) | 291 baris | Kerangka uji bawaan Hardhat |

Total sekitar 11.000 baris kode buatan sendiri, di luar pustaka pihak ketiga.
Angka ini dihitung langsung dari repositori — kalau ditanya, katakan begitu.

Antarmuka jadi bagian terbesar bukan karena boros. Sebagian besar kode di sana menangani
keadaan gagal: bukti yang tidak cocok, dompet yang belum siap, transaksi yang masuk tapi
ditolak kontrak. Itu memang pekerjaannya.

---

## 3. Empat lapis, dan tugas masing-masing

Aliran permintaan selalu satu arah: lapis atas meminta ke lapis bawah, tidak pernah sebaliknya.

### Lapis 1 — Antarmuka pengguna (`frontend/`)

- **React 18** — pustaka antarmuka
- **Vite 5** — alat build dan server pengembangan
- **Tailwind CSS 3** — penataan tampilan
- **viem 2.44.4** — membaca dan menulis ke blockchain
- **lucide-react** — ikon

Yang dilihat importir, eksportir, dan arbiter di peramban. Tidak menyimpan apa pun yang
penting: semua status sebenarnya dibaca ulang dari rantai atau dari gerbang.

### Lapis 2 — Dompet tanpa repot

- **Particle Network Connect Kit 2.1** — masuk dengan akun Google
- **permissionless 0.4.0** — pustaka ERC-4337
- **Pimlico** — bundler dan paymaster

Ini bagian yang membuat produk bisa dipakai orang biasa. Pengguna masuk dengan akun Google;
di belakang layar terbentuk sebuah **Smart Account** (dompet berbentuk kontrak, standar
ERC-4337). Pengguna tidak pernah melihat frasa pemulihan, dan biaya gas ditalangi paymaster
sehingga pengguna tidak perlu memiliki MATIC sama sekali.

Istilah yang perlu dihafal:
- **EOA** — dompet biasa yang dikendalikan kunci privat. Di sini ia hanya jadi *pemilik*.
- **Smart Account** — dompet berbentuk kontrak. Ini alamat yang tercatat sebagai importir
  atau eksportir di escrow.
- **UserOperation** — "transaksi" versi ERC-4337. Dikirim ke bundler, bukan langsung ke rantai.
- **Paymaster** — pihak yang membayarkan gas.

> Satu jebakan yang penting: sebuah UserOperation yang **ditolak kontrak tetap menghasilkan
> tanda terima**. Jadi kode harus memeriksa `receipt.success`, bukan sekadar "ada tanda terima
> berarti berhasil". Kalau tidak, aplikasi akan melaporkan "dana dilepas" padahal tidak ada
> yang berpindah.

### Lapis 3 — Gerbang oracle (`backend/oracle-gateway/`)

- **Node.js + Express 4** — server HTTP
- **ethers.js v6** — menandatangani dan mengirim transaksi verifikator
- **dotenv**, **cors**

Tugasnya: membaca sumber data, memutuskan lolos atau tidak, lalu menandatangani bukti dengan
kunci verifikator yang sesuai. Kunci verifikator ada di server, tidak pernah di peramban.

Berkas pentingnya:

| Berkas | Isi |
|---|---|
| `index.js` | Semua rute HTTP |
| `oracleService.js` | Membaca lima sumber data, menghasilkan bukti dan daftar ketidakcocokan |
| `contractService.js` | Berbicara ke kontrak: kirim bukti, baca status, putuskan sengketa |
| `identityService.js` | Akun perusahaan, kata sandi, MFA |
| `faucetService.js` | Membagikan token IDRT demo |

### Lapis 4 — Kontrak pintar (`contracts/`)

- **Solidity 0.8.20**
- **OpenZeppelin Contracts 5.2** — `AccessControl`, `Pausable`, `ReentrancyGuard`, `SafeERC20`
- **Hardhat 2.26** — kompilasi, uji, dan penerapan
- **Polygon Amoy** — jaringan uji, chain id 80002

Dua kontrak:
- `SternEscrow.sol` — memegang dana dan menegakkan aturan
- `IDRTDemo.sol` — token ERC-20 dua desimal, wakil rupiah untuk keperluan demo

Bagian paling rawan tidak ditulis sendiri. Kontrol peran, penjagaan reentrancy, dan
pemindahan token semuanya memakai OpenZeppelin apa adanya. Ini poin bagus untuk disebut
kalau ada yang bertanya soal keamanan.

---

## 4. Cara kerjanya, dari awal sampai dana pindah

1. **Importir membuat escrow.** Ia mengisi komoditas, nilai, alamat eksportir, dan tenggat
   global. Token IDRT sejumlah nilai kontrak berpindah dari dompetnya ke kontrak. Status:
   `Created`.

2. **Milestone 1 — Inspeksi.** Gerbang membaca VGM dan laporan inspeksi. Kalau berat kontainer
   cocok dan mutu lolos, verifikator ber-`ROLE_QUALITY_AUDITOR` mengirim bukti ke kontrak.
   Status: `Inspected`. Jendela sanggah 6 jam mulai berjalan.

3. **Milestone 2 — Pengapalan.** Gerbang membaca AIS. Kalau status keberangkatan `departed`,
   verifikator ber-`ROLE_LOGISTICS` mengirim bukti. Status: `Shipped`.

4. **Milestone 3 — Tiba & Bea Cukai.** Gerbang membaca CEISA. Kalau `approved`, verifikator
   ber-`ROLE_CUSTOMS` mengirim bukti. Status: `ArrivedCleared`.

5. **Timelock dimulai.** Siapa pun boleh memicu `initiateTimelock`. Kontrak menetapkan waktu
   pelepasan 24 jam ke depan. Status: `TimelockActive`.

6. **Pelepasan.** Setelah 24 jam lewat dan tidak ada sengketa terbuka, `releasePayment`
   memindahkan token ke eksportir. Status: `Completed`.

Jalur lain yang mungkin:

- **Sengketa** — pihak mana pun boleh membuka sengketa dalam 6 jam sejak sebuah bukti masuk,
  dengan menaruh jaminan 3% dari nilai kontrak. Status: `Disputed`. Arbiter memutus lewat
  `resolveDispute`, dan dana mengikuti putusan itu.
- **Pengembalian** — kalau tenggat global lewat tanpa penyelesaian, importir memanggil
  `claimRefund` dan token kembali kepadanya. Status: `Refunded`.
- **Perpanjangan tenggat** — satu pihak mengusulkan, pihak **yang lain** menyetujui. Kontrak
  menolak kalau pengusul yang mencoba menyetujui sendiri.

### Yang sebenarnya masuk ke rantai

Bukan dokumennya. Yang masuk hanya:
- alamat verifikator yang mengirim
- sebuah **CID** — sidik jari dokumen di IPFS
- nomor blok saat dikirim
- batas waktu jendela sanggah

Isi B/L, harga, dan nama pihak tidak pernah naik ke rantai. Ini jawaban untuk kekhawatiran
"apakah rahasia dagang saya jadi publik?" — tidak.

---

## 5. Angka-angka yang perlu dihafal

| Parameter | Nilai | Arti |
|---|---|---|
| Jendela sanggah | 6 jam | Waktu untuk menyanggah sebuah bukti setelah masuk |
| Timelock | 24 jam | Jeda terakhir sebelum dana benar-benar pindah |
| Jaminan sengketa | 3% dari nilai kontrak | Harus ditaruh untuk membuka sengketa |
| Pemotongan verifikator | 50% dari jaminannya | Kalau buktinya diputus salah |
| Pembagian potongan | 70% / 30% | Ke pihak yang dirugikan / ke kas protokol |
| Batas kesalahan | 3 kali | Setelah itu peran verifikator dicabut permanen |

Semuanya bisa disetel saat penerapan lewat `.env` — sebutkan itu kalau ada yang menganggap
24 jam terlalu lama atau 6 jam terlalu singkat.

---

## 6. Peran di kontrak

| Peran | Boleh melakukan |
|---|---|
| `ROLE_QUALITY_AUDITOR` | Mengirim bukti milestone 1 saja |
| `ROLE_LOGISTICS` | Mengirim bukti milestone 2 saja |
| `ROLE_CUSTOMS` | Mengirim bukti milestone 3 saja |
| `DEFAULT_ADMIN_ROLE` | Memberi/mencabut peran, menjeda kontrak |
| Importir | Membuat escrow, menarik pengembalian, membuka sengketa |
| Eksportir | Menerima pembayaran, membuka sengketa |
| Arbiter | Memutus sengketa |

**Ini pemisahan wewenang (separation of duties), bukan multi-factor authentication.** Jangan
tertukar. MFA adalah satu identitas yang membuktikan dirinya dengan dua cara. Ini tiga
lembaga berbeda yang menyatakan tiga fakta berbeda, dan tidak ada satu pun yang bisa
menyatakan fakta milik yang lain. Kalau audiens punya latar perbankan, mereka akan langsung
menghargai bedanya.

---

## 7. Akun perusahaan dan MFA

Terpisah dari dompet, dan penting untuk dipahami supaya tidak salah menjelaskan.

- Registrasi: nama perusahaan, email, username, alamat dompet, kata sandi (minimal 12 karakter)
- Pendaftar pertama otomatis jadi `owner`
- `owner` boleh menambah `admin` atau `operator`; `admin` hanya boleh menambah `operator`;
  tidak ada yang bisa membuat `owner` kedua
- Kata sandi disimpan dengan **scrypt + salt acak**, dibandingkan dengan `timingSafeEqual`
- MFA memakai **TOTP** standar (HMAC-SHA1, langkah 30 detik) — kompatibel dengan Google
  Authenticator

**Batas yang harus disebut jujur:** MFA ini mengamankan *sesi perusahaan* di gerbang, bukan
gerbang masuk ke workspace. Workspace dijaga oleh Smart Account Particle. Jadi jangan
mengatakan "MFA melindungi akses ke dana". Yang benar: "MFA melindungi identitas perusahaan
dan endpoint manajemen user."

Kalau ditanya kenapa terpisah, jawabannya justru kuat: kunci dana adalah kunci kriptografis,
bukan kata sandi. Kata sandi yang bocor tidak bisa memindahkan uang siapa pun.

---

## 8. Daftar endpoint gerbang

**Publik**
- `GET /health` — status gerbang
- `GET /escrows`, `GET /escrows/:id` — daftar dan detail escrow
- `GET /escrows/:id/timelock`, `/activity`, `/dispute`
- `GET /oracle/evidence/:id` — bukti dan ketidakcocokan untuk sebuah escrow
- `GET /verifiers`, `GET /oracle/status`, `GET /oracle/identity`
- `POST /oracle/verify/:id` — menjalankan verifikasi dan mengirim yang lolos
- `POST /oracle/simulate/:id` — menyalakan kasus gagal untuk peragaan
- `POST /demo-balance/claim` — faucet token demo

**Perlu sesi perusahaan**
- `POST /auth/register-company`, `POST /auth/login`
- `GET /auth/me`
- `POST /auth/mfa/setup`, `/confirm`, `/verify`
- `GET|POST /companies/:companyId/users`

**Perlu `INTERNAL_API_KEY`**
- `POST /submit-oracle/:id`
- `POST /milestones/:id/submit`
- `POST /resolve-dispute/:id`

Tiga yang terakhir dijaga kunci karena pemanggilnya boleh memilih milestone, CID bukti, dan
override sumber data. Kalau kunci itu sampai ke peramban, siapa pun bisa memalsukan bukti
lewat DevTools. **`INTERNAL_API_KEY` tidak boleh pernah masuk ke kode frontend.**

`POST /oracle/verify/:id` sengaja tidak dijaga kunci karena tidak menerima masukan yang bisa
dikemudikan pemanggil: ia membaca sumbernya sendiri dan menolak apa pun yang gagal. Yang
tetap ia berikan adalah gas milik gerbang, jadi di penerapan publik ia perlu rate limit.

---

## 9. Cara menjalankan

```bash
# 1. Kontrak
npm install
npm run compile
npm test                       # 291 baris uji kontrak
npx hardhat run scripts/deploy.js --network amoy

# 2. Gerbang oracle
npm run backend                # butuh .env terisi

# 3. Antarmuka
cd frontend && npm install && npm run dev
```

Variabel `.env` yang wajib untuk gerbang: `RPC_URL`, `CONTRACT_ADDRESS`,
`ORACLE_PRIVATE_KEYS` (tiga kunci verifikator, dipisah koma), `ARBITER_PRIVATE_KEY`,
`IDRT_MINTER_PRIVATE_KEY`, `AUTH_TOKEN_SECRET` (minimal 32 karakter acak),
`INTERNAL_API_KEY`.

Untuk frontend, `.env` harus berada di dalam folder `frontend/`, dan nilainya dibaca saat
**boot** — mengubahnya tanpa merestart server tidak berpengaruh.

---

## 10. Batas prototipe — sebutkan sendiri sebelum ditanya

Ini yang membedakan presentasi prototipe yang dipercaya dari yang tidak.

**Sudah berjalan:**
- Kontrak escrow lengkap dengan tiga milestone, jendela sanggah, timelock, pengembalian
- Sengketa, putusan arbiter, dan pemotongan jaminan verifikator
- Masuk dengan akun Google, gas ditalangi
- Akun perusahaan dengan peran dan MFA TOTP
- Perpanjangan tenggat atas persetujuan dua pihak

**Belum ada:**
- Sambungan sungguhan ke CEISA, AIS, dan penyedia VGM — kelimanya masih simulasi yang
  dapat dikendalikan, justru supaya kasus gagal bisa diperagakan
- Rupiah sungguhan — yang berpindah adalah token demo di jaringan uji
- Audit keamanan pihak ketiga atas kontrak
- Penerapan di jaringan utama
- Panel arbiter untuk memutus sengketa lewat antarmuka (saat ini lewat endpoint)
- Uji beban dengan banyak kontrak berjalan bersamaan

Jangan pernah mengaku sudah tersambung ke Bea Cukai. Satu klaim palsu meruntuhkan semua
klaim lain yang sebenarnya benar.

---

## 11. Pertanyaan sulit dan jawabannya

**"Bagaimana kalau oracle-nya berbohong?"**
Verifikator wajib menaruh jaminan sebelum boleh mengirim bukti. Kalau arbiter memutuskan
buktinya salah, jaminan itu dipotong 50% — 70% mengalir ke pihak yang dirugikan. Tiga kali
salah, perannya dicabut permanen. Dan untuk memalsukan satu pembayaran, tiga lembaga yang
tidak saling berhubungan harus berbohong tentang tiga hal berbeda pada saat yang sama.

**"Kalau gerbang oracle mati atau internet putus?"**
Dana tetap terkunci di kontrak. Tidak ada yang bisa menyentuhnya. Dan tenggat global tetap
berjalan, jadi importir tetap bisa menarik dananya kembali.

**"Siapa yang menanggung kalau kontraknya ada bug?"**
Jujur: kontrak ini belum diaudit pihak ketiga. Itu ada di daftar "belum ada". Yang bisa
dikatakan: bagian paling rawan memakai OpenZeppelin yang sudah diaudit luas, dan kontrak
punya fungsi `pause` untuk keadaan darurat.

**"Apa bedanya dengan escrow bank biasa?"**
Bank bisa menahan dana atas pertimbangannya sendiri, dan aturannya ada di dokumen internal
mereka. Kontrak tidak bisa menahan, dan aturannya bisa Anda baca sendiri baris demi baris.

**"Apakah saya harus paham kripto?"**
Tidak. Masuk dengan akun Google, tidak ada frasa pemulihan, dan biaya gas tidak dibayar
pengguna. Nilai kontrak dicatat dalam rupiah dan sen, bukan dalam mata uang kripto.

**"Kenapa blockchain, kenapa bukan basis data biasa?"**
Karena syarat utamanya adalah bahwa **tidak ada satu pihak pun** yang bisa mengubah aturan
setelah dana masuk — termasuk kami. Basis data selalu punya administrator. Kontrak tidak.

---

## 12. Saran cara membawakan

- Mulai dari masalah, bukan dari teknologi. Offtaker tidak membeli blockchain, ia membeli
  kepastian.
- Sebut sejak awal bahwa ini prototipe di jaringan uji. Kejujuran di menit pertama membuat
  sisa presentasi dipercaya.
- **Peragakan satu kasus gagal.** Prototipe yang hanya bisa menunjukkan kasus mulus belum
  membuktikan apa pun. Beri jeda di situ dan biarkan orang membaca layar penolakannya.
- Siapkan tangkapan layar cadangan sebelum naik panggung. Jaringan uji kadang lambat, dan
  demo yang macet tanpa cadangan lebih merusak daripada tidak berdemo sama sekali.
- Tutup dengan permintaan kecil: bukan komitmen pembelian, melainkan satu jam waktu mereka
  untuk menunjukkan di mana alur ini tidak cocok dengan cara kerja mereka yang sebenarnya.
  Jawaban itu bahan paling berharga yang bisa dibawa pulang.
