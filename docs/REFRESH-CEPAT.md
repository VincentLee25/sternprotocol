# Refresh yang cepat: state dulu, riwayat belakangan

Keluhannya: menekan **Refresh** di halaman escrow menahan overlay
*"Reading the latest state"* sampai berpuluh detik — kadang menit. Yang
ditunggu bukan state-nya. Yang ditunggu adalah **pemindaian ulang seluruh
riwayat event di blockchain**, karena refresh memanggil ketiganya sekaligus:

```
reload()
 ├─ GET /escrows/:id            ← beberapa eth_call, cepat
 ├─ GET /escrows/:id/activity   ← eth_getLogs sepanjang ribuan block, berat
 └─ GET /escrows/:id/timelock   ← cepat
```

`Promise.all` membuat yang cepat menunggu yang lambat. Overlay menutupi
pemindaian sejarah dan menyebutnya "membaca state".

Diukur dengan `scripts/test-support/refresh-browser.mjs` terhadap gateway yang
endpoint riwayatnya sengaja dibuat 8 detik:

| | Overlay menahan halaman |
|---|---|
| Sebelum | **7.050 ms** dari 8.000 ms |
| Sesudah | **tidak muncul sama sekali** |

## Yang diubah

### 1. Riwayat keluar dari jalur kritis (frontend)

`loadEscrowDetail()` sekarang **tidak** mengambil riwayat. Ada fungsi kedua,
`loadActivityForDetail()`, yang dipanggil setelah state sudah di layar.

Ini pola yang **sudah dipakai halaman daftar** sejak lama
(`loadEscrowRows` / `loadActivityForRows`). Halaman detail satu-satunya tempat
yang masih membayar sejarah hanya untuk melihat perubahan state.

Overlay `ProgressModal` ditutup begitu state selesai — bukan begitu riwayat
selesai. Sementara riwayat masih jalan, yang muncul hanyalah baris kecil
**"Updating activity…"** di dalam panel Activity itu sendiri. Tidak ada overlay
tingkat halaman untuk riwayat, pernah.

`activity` sengaja dibiarkan `undefined` (bukan array kosong) saat state
di-merge, supaya log yang sudah tampil tidak dikosongkan selama request kedua
berjalan.

### 2. Pemindaian log jadi inkremental (backend)

Ini akar masalahnya. Cache di depan pemindaian dulu berumur **15 detik** —
cukup untuk satu load halaman, dan tidak cukup untuk apa pun yang dilakukan
manusia sesudahnya. Refresh setengah menit kemudian memindai ulang **seluruh
sejarah dari block deploy**. Menekan Refresh biayanya sama dengan load pertama,
selamanya.

Log yang sudah ter-mine tidak bisa berubah, jadi tidak ada yang perlu dibaca
ulang. Sekarang cache-nya menyimpan apa yang sudah didapat dan hanya meminta
block yang bertambah sejak terakhir.

Diukur dengan `npm run test:activity` (menghitung request ke provider palsu):

| | `eth_getLogs` |
|---|---|
| Pembacaan pertama | 5 (rentang 4.000 block, window 1.000) |
| Refresh berikutnya | **1** |
| Refresh dalam 5 detik | **0** |

Di deployment sungguhan dengan rentang fallback 500.000 block dan window 9.000,
pembacaan pertama itu **56 request**. Refresh sekarang **1**.

Dua penungguan yang berbeda, dan keduanya menjawab pertanyaan berbeda:

- `HEAD_TTL_MS` (5 detik) — berapa lama cache dilayani tanpa menanyakan posisi
  kepala rantai. Cukup menutupi ledakan request dari satu load halaman.
- `REORG_OVERLAP_BLOCKS` (64) — seberapa jauh ke belakang dipindai ulang setiap
  kali menambah. Rantai bisa me-reorganisasi block terbarunya, jadi log
  terbaru belum immutable. Membaca ulang ekor pendek dan men-dedup adalah yang
  mencegah **event hantu** bertahan di cache sepanjang umur proses — itu lebih
  buruk daripada event yang hilang, karena tidak ada alasan untuk
  meragukannya.

### 3. Timestamp block di-cache selamanya

Timestamp block yang sudah ter-mine tidak berubah, tapi dulu dibaca ulang tiap
refresh. Sekarang dibagi antar-panggilan, dibatasi 2.000 entri.

### 4. `getEscrow()` jadi paralel

Dulu **sembilan round trip berurutan**: escrow, alamat token, decimals-nya,
tiga milestone proof, dispute, dan release eligibility — masing-masing menunggu
yang sebelumnya. Di RPC publik dengan ~300 ms per hop itu sekitar 3 detik pada
setiap refresh, untuk pembacaan yang tidak saling bergantung sama sekali.

Sekarang satu `Promise.all`. Dan `decimals` token di-cache: itu fakta yang
tidak bisa berubah sepanjang umur deployment, tapi dulu dibayar dua round trip
di **setiap** pembacaan escrow.

## Yang sengaja TIDAK saya lakukan

Permintaannya menyebut *"prefer a narrow/event-indexed strategy for the
specific escrowId if practical"*. Saya tidak melakukannya, dan alasannya
penting.

Jumlah request ditentukan oleh **rentang block**, bukan oleh filter topic. Satu
`eth_getLogs` per window, mau filternya sempit atau lebar. Jadi memfilter per
`escrowId` **tidak mengurangi satu pun request** — yang berkurang hanya jumlah
byte yang dikembalikan.

Yang hilang kalau difilter per escrow: satu pemindaian yang melayani **semua**
escrow. Sekarang `escrowId` sengaja dibiarkan terbuka di topic1, sehingga
dashboard berisi selusin escrow membayar 56 request total, bukan 672. Memfilter
per escrow akan membuat dashboard jauh lebih mahal tanpa keuntungan apa pun di
halaman detail.

Jadi kemenangan yang benar bukan filter yang lebih sempit, tapi **tidak
memindai ulang apa yang sudah dipindai** — itu yang dikerjakan di atas.

## Yang tetap harus kamu set

`CONTRACT_DEPLOY_BLOCK` sudah dihormati dan **tetap layak di-set**. Tanpa itu,
titik awal diperkirakan dari timestamp escrow 0 dengan margin 20% — dan margin
itulah yang membuat pemindaian pertama mahal. Angkanya dicetak oleh
`scripts/deploy.js`.

Estimasinya sekarang juga **stabil** antar-panggilan, bukan cuma murah: cache
log di-key pada block awal, jadi estimasi yang bergeser beberapa block tiap
refresh akan terlihat sebagai rentang baru dan membuang cache-nya — tepat
pemindaian ulang total yang semua ini dimaksudkan untuk menghentikan.

## Tes

```bash
npm run test:activity     # 22 tes: hitungan request, reorg, duplikat, paralelisme
```

Untuk yang di browser:

```bash
ACTIVITY_DELAY_MS=8000 npm run documents-stub
cd frontend && VITE_ORACLE_API=http://localhost:4112 npm run build && npx vite preview
node scripts/test-support/refresh-browser.mjs
```

`ACTIVITY_DELAY_MS` menggantikan biaya sungguhan endpoint itu. Tes-nya mengukur
waktu, bukan isi — pertanyaannya bukan apakah datanya datang, tapi apakah
halamannya menunggu.
