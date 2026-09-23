# Alur Full-Stack STERN — apa yang terjadi di balik layar

Menelusuri satu escrow dari awal sampai dana pindah, melewati keempat lapis.

Ini dokumen **cara kerja**, bukan cara memasang. Untuk deploy lihat
[`DEPLOY_RAILWAY_FULLSTACK.md`](DEPLOY_RAILWAY_FULLSTACK.md). Untuk bahan presentasi lihat
[`catatan-teknis-presentasi.md`](catatan-teknis-presentasi.md).

---

## Empat lapis dan siapa memegang kunci apa

| Lapis | Kode | Memegang |
|---|---|---|
| Web | `frontend/src/` | Tidak ada. Semua status dibaca ulang dari lapis bawah |
| Dompet | Particle + Pimlico | Kunci pengguna, tidak pernah menyentuh server kita |
| Gerbang | `backend/oracle-gateway/` | Kunci verifikator, kunci arbiter, kunci pencetak IDRT |
| Kontrak | `contracts/SternEscrow.sol` | **Dana**, dan satu-satunya sumber kebenaran |

**Aturan yang menjelaskan hampir semua keputusan desain di sini:** gerbang tidak pernah
menandatangani untuk pengguna, dan pengguna tidak pernah menandatangani untuk verifikator.
Setiap transaksi ditandatangani oleh pihak yang memang berwenang atasnya.

---

## Alur 1 — Masuk, dan dari mana alamat dompet berasal

Pengguna menekan "Sign in to continue". Yang terjadi berurutan, di
`frontend/src/lib/useSternAuth.js`:

```
1. Particle membuka modal      → pengguna pilih Google / email / X / dst.
2. Particle mengembalikan EOA  → account.address
3. toSafeSmartAccount()        → menurunkan alamat Safe dari EOA itu
4. createSmartAccountClient()  → klien yang bisa mengirim UserOperation
5. POST /auth/particle/session → backend memverifikasi Particle dan Safe,
                                  lalu mencari keanggotaan STERN di PostgreSQL
```

Yang paling sering disalahpahami: **alamat yang dipakai di escrow bukan
`account.address`.** Itu EOA hasil login sosial, dan ia hanya berperan sebagai *pemilik*.
Alamat yang tercatat sebagai importir atau eksportir adalah **alamat Safe**, diturunkan di
langkah 3.

Langkah 3 adalah `eth_call` sungguhan ke rantai — itulah kenapa `VITE_RPC_URL` harus RPC
yang mengizinkan permintaan dari peramban. Kalau tidak, login gagal dengan "Failed to
fetch" dan tidak ada yang menyebut RPC sebagai penyebabnya.

Selama langkah 3–4 berjalan, `status` bernilai `AUTHENTICATING` dan aplikasi menampilkan
layar "Preparing your wallet". Tanpa jeda itu, workspace sempat tampil satu frame dengan
dompet kosong dan saldo nol.

---

## Alur 2 — Membuat escrow

Importir mengisi formulir, menekan Create. `frontend/src/lib/sternContract.js`
mengirim **satu UserOperation berisi dua panggilan**:

```js
sendUserOperation({
  calls: [
    { to: IDRT_ADDRESS,    data: approve(ESCROW_ADDRESS, value) },
    { to: ESCROW_ADDRESS,  data: createEscrow(exporter, arbiter, cid,
                                              value, deadline, commodity, containerRef) }
  ]
})
```

Dua panggilan, satu operasi. Ini yang membuat pengalamannya berbeda dari dApp biasa:
dompet biasa menuntut pengguna menyetujui `approve` dulu, menunggu, lalu menyetujui
transaksi kedua. Di sini keduanya masuk satu paket dan gagal-berhasil bersama — kalau
`createEscrow` ditolak, `approve` ikut batal.

### Dari mana biaya gasnya

Pengguna tidak membayar. Alurnya:

```
Safe → UserOperation → bundler Pimlico → EntryPoint 0.7 → kontrak
                            ↑
                       paymaster Pimlico membayar gas
```

Itu sebabnya `VITE_PIMLICO_API_KEY` diperlukan untuk **mengirim**, tapi tidak untuk
**masuk**. Tanpa kunci itu alamat Safe tetap ketemu, hanya tidak bisa mengirim apa pun.

### Kenapa id escrow dibaca dari event

Setelah operasi masuk:

```js
const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash });
if (!receipt.success) throw new Error("... included but reverted ...");
const [created] = parseEventLogs({ eventName: "EscrowCreated", logs: receipt.logs });
return { escrowId: created.args.escrowId.toString() };
```

Dua hal penting di potongan itu:

**`receipt.success` wajib diperiksa.** Sebuah UserOperation yang **ditolak kontrak tetap
menghasilkan tanda terima.** Menganggap "ada tanda terima berarti berhasil" akan melaporkan
escrow yang tidak pernah terbentuk.

**Id dibaca dari event `EscrowCreated`, bukan ditebak.** UserOperation tidak mengembalikan
nilai balik. Menebak id dari `nextEscrowId` pernah menghasilkan bug "escrow not found" —
kalau ada transaksi lain menyela, tebakannya meleset.

---

## Alur 3 — Menampilkan daftar escrow

Web memanggil gerbang, bukan rantai:

```
Overview.jsx → sternApi.js → GET /escrows → contractService.listEscrows()
```

Di dalam `listEscrows()`:

```js
const total = Number(await contract.nextEscrowId());
for (let id = 0; id < total; id += 1) {
  const raw = await contract.getEscrow(id);
  ...
}
```

Gerbang **memindai kontrak dari id 0 sampai `nextEscrowId`**, satu per satu, lalu menyaring
menurut alamat dan peran.

Ini sengaja sederhana dan **memang tidak akan sanggup untuk volume tinggi** — setiap
pemuatan halaman berarti N panggilan RPC. Untuk MVP ini pilihan yang benar: tidak ada
indexer yang harus disinkronkan, tidak ada basis data yang bisa melenceng dari rantai.
Untuk produksi, ini bagian pertama yang harus diganti dengan indexer event.

### Kenapa lewat gerbang, bukan langsung ke rantai

Peramban *bisa* saja membaca kontrak sendiri. Tapi gerbang mengerjakan hal-hal yang
merepotkan kalau dilakukan di klien: memformat nilai IDRT sesuai desimal token, menerjemahkan
angka status jadi nama, menggabungkan bukti milestone, dan menyusun catatan aktivitas dari
event. Satu tempat, satu bentuk, dipakai semua halaman.

---

## Alur 4 — Verifikasi tiga milestone

Ini inti produknya. Dipicu `POST /oracle/verify/:id`, dijalankan
`verifyAndSubmitAll()`.

Untuk **tiap** milestone berurutan — `inspected`, `shipped`, `arrived_cleared` — gerbang
melewati enam gerbang periksa. Gagal di mana pun, milestone itu dan semua sesudahnya
berhenti:

```
1. Sudah pernah dikirim?      → lewati, laporkan already_submitted
2. Status escrow tepat satu   → kalau tidak: blocked
   tingkat di bawahnya?          "Escrow is Shipped; this milestone needs Inspected."
3. Jendela sanggah milestone  → kalau masih terbuka: challenge_window_open
   sebelumnya sudah lewat?       (+ retryAfter)
4. Sumber data lolos?         → kalau tidak: source_failed
5. Tanda tangani & kirim      → submitMilestoneProof()
6. Transaksi masuk?           → submitted (+ hash) / verifier_out_of_gas
```

### Langkah 3 memakai jam rantai, bukan jam komputer

```js
const now = BigInt(await chainNow(provider));   // block.timestamp, bukan Date.now()
if (prev[0] && now <= prev[4]) { ... }
```

Kontrak membandingkan dengan `block.timestamp`, dan di Amoy jam itu tertinggal beberapa
detik dari jam dinding. Dulu pemeriksaan ini memakai `Date.now()`, dan tepat di tepi
jendela sanggah penjaganya meloloskan panggilan sementara kontrak menolaknya. Membaca blok
terbaru salah ke arah yang aman: kalau rantai belum menyusul, gerbang melapor "masih
menunggu" alih-alih membakar gas pada penolakan.

### Langkah 4 adalah alasan produk ini ada

```js
if (!milestonePassed(name, verification)) {
  results[name] = {
    status: "source_failed",
    reason: "The automated check did not pass, so no proof was written on chain."
  };
}
```

**Penolakan di sini adalah produk yang bekerja, bukan produk yang gagal.** Sumber yang
tidak cocok tidak boleh pernah sampai ke rantai. Inilah yang diperagakan di langkah 4 skrip
demo, dan kenapa langkah itu lebih penting daripada langkah "dana berhasil dilepas".

### Siapa menandatangani apa

```js
const wallet = pickVerifier(wallets, milestone);   // dompet dipilih menurut milestone
const payload = AbiCoder.encode(["bool"], [passed]);
await contract.submitMilestoneProof(contractId, id, proofCid, payload);
```

Milestone menentukan dompet mana yang dipakai, dan kontrak memaksakannya lagi lewat
`AccessControl`:

| Milestone | Dompet | Peran yang diwajibkan kontrak |
|---|---|---|
| 1 Inspeksi | `ORACLE_PRIVATE_KEYS` ke-1 | `ROLE_QUALITY_AUDITOR` |
| 2 Pengapalan | ke-2 | `ROLE_LOGISTICS` |
| 3 Bea Cukai | ke-3 | `ROLE_CUSTOMS` |

Kalau urutan di `.env` tertukar, dompet logistik akan mencoba mengirim bukti kepabeanan dan
kontrak menolaknya. Pemisahan ini bukan konvensi di kode — kontrak yang menegakkannya.

### Yang benar-benar naik ke rantai

Bukan dokumennya. Hanya: alamat verifikator, sebuah **CID** (sidik jari dokumen di IPFS),
nomor blok, dan batas waktu jendela sanggah. Isi B/L, harga, dan nama pihak tidak pernah
tersimpan di rantai.

---

## Alur 5 — Sengketa: gerbang menyiapkan, pengguna menandatangani

Pola paling khas di sistem ini. Membuka sengketa perlu jaminan 3% dari nilai kontrak, dan
jaminan itu uang **pengguna** — jadi gerbang tidak boleh mengirimkannya.

```
1. FE  → GET /escrows/:id/dispute/prepare
2. GW  → hitung bondAmount = contractValue × disputeBondBps / 10000
         cek jendela sanggah masih terbuka (pakai chainNow)
         kembalikan calldata, JANGAN kirim
3. FE  → sendUserOperation({ calls: [ approve(bond), raiseDispute(...) ] })
4. Safe pengguna yang menandatangani, Pimlico yang membayar gas
```

Gerbang menghitung dan memvalidasi; dompet pengguna yang mengeksekusi. Gerbang tidak pernah
punya kemampuan memindahkan uang pengguna, bahkan kalau gerbangnya diretas.

Putusannya lain lagi: `resolveDispute` ditandatangani `ARBITER_PRIVATE_KEY` di gerbang,
di belakang `INTERNAL_API_KEY`. Arbiter adalah peran institusi, bukan pengguna.

---

## Alur 6 — Timelock dan pelepasan

Setelah bukti ketiga masuk, escrow berstatus `ArrivedCleared`. Belum selesai:

```
ArrivedCleared → initiateTimelock()  → TimelockActive, timelockReleaseAt = now + 24 jam
TimelockActive → (tunggu 24 jam)     → releasePayment() → Completed
```

Keduanya lewat `settlementFlow.js`, ditandatangani Safe pengguna.

Timelock adalah rem terakhir: bahkan setelah ketiga lembaga menyatakan semuanya beres,
masih ada satu hari penuh bagi pihak mana pun untuk menahan.

Jalur keluar yang lain:

- **`claimRefund()`** — importir menariknya kembali setelah tenggat global lewat. Tidak
  perlu izin siapa pun; kontrak yang mengembalikan.
- **`resolveDispute()`** — arbiter memutus, dana mengikuti putusan.

---

## Jalur mana yang dipakai: rantai atau tiruan

Ada satu keputusan yang menentukan banyak hal:

```js
const isChain = isOnChainReady && (escrow.source === "gateway" || escrow.source === "chain");
```

Kalau `false`, tombol berjalan di ledger tiruan dan tidak ada transaksi yang dikirim.

Baris ini pernah berbunyi `escrow.source === "chain"` saja. Karena `escrowSource` menandai
baris dari gerbang dengan `"gateway"`, kondisinya **tidak pernah benar untuk escrow
sungguhan** — sehingga tombol Release melaporkan "Funds released to exporter" sementara
tidak ada apa pun yang terkirim.

Diam-diam mengklaim penyelesaian yang tidak terjadi adalah kegagalan terburuk yang bisa
dimiliki aplikasi ini. Kalau Anda menyentuh percabangan mock/chain di mana pun, ingat baris
ini.

---

## Identitas perusahaan — otorisasi sesudah Particle

Particle adalah satu-satunya titik masuk autentikasi. Gerbang memverifikasi token
Particle dan menurunkan alamat Safe secara independen, lalu mencocokkannya dengan
`auth_identities` di PostgreSQL. Identitas baru mengisi nama perusahaan, email kerja,
dan handle STERN; alamat Safe tidak diketik. Registrasi membuat membership `owner`.

```
POST /auth/particle/session  → anggota lama: MFA jika aktif, lalu sesi STERN
                            → identitas baru: registrationRequired
POST /auth/register-company  → profil + perusahaan + owner membership di PostgreSQL
POST /auth/mfa/verify        → TOTP 30 detik → sesi STERN
```

Owner mengundang admin/operator; admin hanya boleh mengundang operator. Pengguna
baru maupun lama menerima undangan setelah Particle Auth, dan MFA pengguna lama
diselesaikan sebelum membership baru dibuat. Tidak ada kata sandi STERN kedua.

---

## Mengapa lapisannya begitu

| Keputusan | Alasan |
|---|---|
| Gerbang tidak pernah menandatangani untuk pengguna | Diretasnya gerbang tidak boleh berarti hilangnya dana pengguna |
| Kunci verifikator di server, bukan peramban | Kunci di bundle = siapa pun bisa memalsukan bukti dari DevTools |
| Web membaca dari gerbang, bukan menyimpan sendiri | Status yang di-cache akan melenceng dari rantai, dan rantai yang benar |
| Semua tenggat dibandingkan dengan `block.timestamp` | Jam kontrak satu-satunya jam yang mengikat |
| Milestone dipisah per peran di kontrak | Kalau hanya di kode gerbang, ia sekadar konvensi |
| Isi dokumen tidak naik ke rantai | Rahasia dagang tetap rahasia; cukup sidik jarinya |

---

## Yang harus diingat kalau menyentuh kode ini

**Selalu periksa `receipt.success`.** Operasi yang ditolak tetap memberi tanda terima.

**Jangan pernah memakai `Date.now()` untuk membandingkan tenggat.** Pakai `chainNow()`.

**Jangan pernah memberi awalan `VITE_` pada rahasia.** Semua nilai `VITE_*` terbit ke
publik di dalam bundle.

**Jangan biarkan tombol tulis menyala tanpa penandatangan.** Lebih baik tombol mati dengan
alasan tertulis daripada tombol hidup yang melapor sukses palsu.

**Baca id dari event, jangan menebak dari penghitung.**
