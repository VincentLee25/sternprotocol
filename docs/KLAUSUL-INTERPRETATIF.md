# Klausul interpretatif: human-in-the-loop untuk yang tidak bisa dibaca mesin

Ini jawaban untuk sanggahan paling kuat terhadap STERN, dan sebaiknya
disampaikan begitu — bukan disembunyikan.

**Sanggahannya:** tiga milestone STERN semuanya objektif. VGM kontainer cocok
atau tidak. Kapal sudah berangkat atau belum. Bea Cukai sudah menerbitkan SPPB
atau belum. Itu semua **pembacaan**, dan mesin memang bisa membacanya.

Kontrak dagang sungguhan tidak hanya berisi pembacaan. Isinya juga:

- "biji kopi harus dalam kondisi **layak jual**"
- "**substantially in conformity** with sample"
- "kemasan **layak untuk pengangkutan laut**"

Tidak ada feed yang menjawab itu. Yang menjawab adalah orang, dan orang yang
wajar bisa berbeda pendapat.

## Jawaban yang salah

Memberi skor pada klausul semacam itu dengan sebuah model, lalu menyebut
angkanya "verifikasi". Angka itu akan menjadi **figur paling menentukan di
seluruh layar dan yang paling tidak bisa dipertahankan**. Kalau ada juri yang
menanyakan dasar angkanya, tidak ada jawaban selain "modelnya bilang begitu".

## Yang STERN lakukan

Kebalikannya: penilaian manusia tidak dihilangkan dan tidak disamarkan, tapi
**dinyatakan, ditugaskan, dicatat, dan dijadikan prasyarat**.

1. Klausul interpretatif **dideklarasikan sejak awal** sebagai interpretatif.
2. Klausul itu **menyebut alamat orang** yang harus menilainya.
3. Putusan orang itu **tidak diterima tanpa alasan tertulis** (minimal 40
   karakter, dan alasannya di-pin ke IPFS).
4. Sampai alasan itu ada, gateway **menolak mengirim proof** untuk milestone
   yang digantungi klausul tersebut — penolakan yang sama seperti untuk e-BL
   yang salah kontainer atau dokumen bea cukai yang gagal dibaca.

Jadi yang terjadi bukan "AI menilai mutu kopi". Yang terjadi: **surveyor menilai
mutu kopi, dan sistem tidak bisa jalan sampai penilaiannya tertulis.**

## Dua bagian, sengaja disimpan terpisah

| | Di mana | Kenapa |
|---|---|---|
| **Teks klausul** | di dalam manifest penciptaan escrow (`documentCid` di chain) | Tidak bisa diedit, dan **tidak ada yang bisa menambah klausul yang menguntungkan setelah barang berlayar** |
| **Review/putusan** | `backend/oracle-gateway/clauseService.js` (append-only) | Ditulis setelahnya — itu definisinya. Penilai boleh berubah pikiran, putusan lama tetap terbaca |

Pemisahan ini bukan pilihan gaya. `documentCid` ditulis sekali di
`_createEscrow` dan tidak punya setter, jadi satu-satunya hal yang alamatnya
sampai ke chain adalah manifest. Klausul di luar manifest = klausul yang bisa
disisipkan belakangan.

## Tiga putusan yang tersedia

| Putusan | Menahan milestone? | Alasan desainnya |
|---|---|---|
| `met` — Terpenuhi | tidak | — |
| `met_with_reservation` — Terpenuhi dengan catatan | **tidak** | Penilai yang hanya diberi pilihan "aman" atau "hentikan pembayaran" akan memilih aman, dan catatannya — justru bagian yang paling perlu dibaca nanti — tidak pernah tertulis |
| `not_met` — Tidak terpenuhi | **ya** | — |

Klausul yang **belum dinilai siapa pun** juga menahan. Default-nya menahan,
bukan meloloskan: term yang layak dituliskan ke dalam instrumen layak dijawab
sebelum uangnya pindah.

## Bagaimana kalau escrow lama tidak punya klausul?

Tidak terpengaruh sama sekali. `assess()` mengembalikan `declared: false`, dan
`contractService.clauseBlocks()` langsung `return false` kalau
`verification.clausesDeclared !== true`. Ini diuji eksplisit di
`scripts/test-clauses.js` bagian 9 — fitur ini tidak boleh merusak produk yang
sudah jalan demi menambah sesuatu ke dalamnya.

## Alur di UI

**Saat membuat escrow** (`frontend/src/pages/NewEscrow.jsx`) — kartu
"Interpretive clauses", sebelum kartu dokumen, karena klausulnya ikut di-pin
bersama dokumen. Tiga field per klausul dan tidak lebih:

- teks klausulnya,
- milestone mana yang ditahannya,
- alamat siapa yang menilainya (default: arbiter escrow ini).

Mengubah klausul **membatalkan manifest yang sudah di-pin** — sama seperti
mengubah kuantitas. Kalau tidak, CID di chain akan menyatakan klausul yang tidak
pernah disetujui siapa pun di layar itu.

**Di halaman escrow** (`frontend/src/components/ClausePanel.jsx`) — panel
"Interpretive clauses · human review" persis di bawah instrumen, karena memang
bagian dari akta. Isinya: teks klausul, milestone yang ditahan, alamat penilai,
status (menunggu / terpenuhi / terpenuhi dengan catatan / tidak terpenuhi), dan
kalau sudah dinilai: alasannya, CID alasannya, siapa yang memutus, kapan.

Form putusan **hanya muncul untuk wallet yang alamatnya disebut klausul itu.**

## Endpoint

```
GET  /clauses/schema                      putusan yang tersedia + panjang alasan minimum
GET  /clauses/:escrowId                   klausul (dari manifest) + review-nya + efek per milestone
POST /clauses/:escrowId/:clauseId/review  { verdict, reasoning, reviewedBy }
```

`POST …/review` **sengaja tidak di belakang `INTERNAL_API_KEY`.** Penilainya
manusia yang namanya disebut, memakai browser, dan kunci itu tidak boleh sampai
ke browser. Untuk produksi, langkah berikutnya adalah meminta **tanda tangan
dari wallet penilai** pada payload putusannya — bukan menaruh kunci internal di
frontend.

## Yang ditegakkan gateway

`contractService.clauseBlocks(milestone, verification)` dipanggil di
`milestonePassed`, tepat setelah `eblBlocks`. Perilakunya diuji langsung:

```
tidak ada klausul dideklarasikan  -> milestone lolos
ada klausul, tidak ada yang menahan -> milestone lolos
ada klausul menahan 'inspected'   -> 'inspected' ditolak
                                  -> 'shipped' tetap lolos
```

Satu klausul menahan satu milestone. Tidak menahan dua lainnya.

## Uji

```bash
npm run test:clauses     # 36 pemeriksaan, tanpa chain dan tanpa IPFS
npm run test:all         # termasuk yang di atas
```

Test-nya juga menjalankan kasus "gateway tanpa layanan pinning": review tetap
tercatat dan tetap menahan milestone, hanya tidak bisa dikutip lewat alamat —
dan catatannya **menyatakan itu** (`reasoningNotPinned`) daripada
menyiratkan CID yang tidak dimilikinya.
