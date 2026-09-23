# Dokumen dagang: kuantitas, Invoice, Packing List, PEB & PIB

Dua kekurangan yang ditutup di sini:

1. **Tidak ada kuantitas.** Form hanya menanyakan komoditas — "Arabica Gayo
   Grade 1" — jadi escrow menyelesaikan 45.000.000 IDRT untuk jumlah barang
   yang tidak pernah dinyatakan. Itu bukan klausul yang bisa ditegakkan siapa
   pun.
2. **Tidak ada dokumen selain e-BL.** Commercial Invoice dan Packing List
   adalah dokumen yang **menyatakan jumlah barang**; PEB, PIB dan bukti bayar
   Bea Masuk adalah dokumen yang **membuktikan barang legal lewat dua
   perbatasan**. Tidak satu pun ada di sistem.

## Satu kendala yang menentukan seluruh desainnya

`documentCid` ditulis sekali di `_createEscrow` (`contracts/SternEscrow.sol`
baris 528) dan **tidak ada setter**. Satu escrow punya tepat satu alamat
dokumen, selamanya. Daftar CID tidak bisa ditambahkan belakangan.

Konsekuensinya terbagi dua, dan pembagiannya bukan pilihan gaya:

| Dokumen | Kapan ada | Rumahnya |
|---|---|---|
| e-BL, Invoice, Packing List | saat escrow dibuat | **manifest** di `documentCid` |
| PEB, PIB, bukti bayar | PEB saat ekspor, PIB saat impor — jauh setelah escrow dibuat | **`proofCid` milestone 3** |

## 1. Manifest: satu alamat untuk seluruh set

Yang masuk ke `documentCid` sekarang bukan PDF e-BL, tapi CID sebuah **manifest
JSON**:

```json
{
  "stern": "stern/escrow-manifest@1",
  "containerRef": "TGHU-2026-001",
  "commodity": "Arabica Gayo Grade 1",
  "quantity": { "value": 320, "unit": "bag", "valueKg": null, "text": "320 bag" },
  "documents": {
    "billOfLading":      { "cid": "Qm…", "sha256": "0x…", "size": 2263 },
    "commercialInvoice": { "cid": "Qm…", "sha256": "0x…", "size": 1871 },
    "packingList":       { "cid": "Qm…", "sha256": "0x…", "size": 1582 }
  }
}
```

Satu hash on-chain mengikat semuanya. Ubah satu angka di salah satu PDF →
CID PDF itu berubah → CID manifest berubah → tidak cocok dengan yang di
kontrak. Sifat yang sama seperti versi satu-PDF, cuma diperluas ke seluruh set.

**Manifest dibuat di gateway, bukan dikirim browser.** Ini penting: klien yang
bisa mengirim manifest sendiri bisa mendeklarasikan 20 ton sambil melampirkan
Packing List untuk 2 ton, dan pin akan mencatat kebohongan itu dengan setia.
Gateway yang mem-pin PDF-nya, menghitung CID-nya, lalu menulis manifest dari
apa yang benar-benar dia pin. Lihat `backend/oracle-gateway/manifestService.js`.

### Satuan

`kg`, `ton`, `bag`, `carton`, `pcs`, `container`. Hanya `kg` dan `ton` yang
dikonversi ke kilogram; **320 bag bukan berat**, dan mengarang angka kilogram
untuknya berarti menaruh angka di depan verifier yang tidak didukung dokumen
apa pun. Untuk satuan hitungan, `valueKg` = `null`.

### Pemeriksaan kuantitas — sengaja tidak memblokir

Gateway membandingkan kuantitas yang dideklarasikan dengan yang terbaca di
Invoice dan Packing List, toleransi 5%, dan menampilkan hasilnya. Tapi
ketidaksesuaian **tidak menggagalkan dokumen**.

Alasannya: *gross weight* memasukkan berat kemasan, *net weight* tidak. Gerbang
keras atas angka itu menghasilkan penolakan yang sebenarnya cuma artefak dari
angka mana yang kebetulan dicetak di dokumen. Penolakan palsu lebih buruk
daripada peringatan yang terlihat — dan seluruh klaim gateway ini adalah bahwa
penolakannya berarti sesuatu.

### Escrow lama tetap jalan

`verifyDocument` mendeteksi apakah `documentCid` itu manifest JSON atau PDF
e-BL langsung, dan mengembalikan **bentuk verdict yang sama** untuk keduanya.
Jadi escrow yang dibuat sebelum ini ada tetap terverifikasi persis seperti
sebelumnya, dengan nama pemeriksaan yang sama (`isPdf`, `hasText`,
`hasBillOfLadingNumber`, `hasContainerReference`).

## 2. Dokumen kepabeanan untuk Milestone 3

Milestone 3 (*Cleared*) mengklaim barang sudah legal lewat dua perbatasan.
Sebelum ini yang berdiri di belakang klaim itu hanya bacaan CEISA sintetis dan
`proofCid` yang isinya `bafy-verified-26-arrived_cleared` — string yang
berbentuk seperti CID tapi tidak resolve ke mana pun.

Sekarang, di panel Evidence ada kartu **Customs documents** untuk melampirkan:

| Slot | Dokumen | Wajib |
|---|---|---|
| `exportDeclaration` | **PEB** — Pemberitahuan Ekspor Barang | ya |
| `importDeclaration` | **PIB** — Pemberitahuan Impor Barang | tidak |
| `dutyPayment` | Bukti bayar Bea Masuk / pajak impor (SSPCP) | tidak |

Yang dibaca dari PDF-nya: nomor pendaftaran PEB dan PIB, tanggal pendaftaran,
kantor pabean, NPWP, Bea Masuk, PPN, PPh 22, dan **NTPN**.

> NTPN adalah yang membedakan **bea masuk yang dibayar** dari **bea masuk yang
> ditagih**. Tanpa NTPN atau tanggal bayar, dokumennya membuktikan jumlah
> terutang, bukan jumlah terbayar — dan pemeriksaan `hasPaymentReference`
> mengatakan itu.

### Apa yang digerbangi, dan apa yang tidak

Tiga keadaan, bukan dua:

| Keadaan | Milestone 3 |
|---|---|
| Tidak ada dokumen dilampirkan | **tidak diblokir** |
| Dilampirkan, diperiksa, dan salah | **diblokir** |
| Dilampirkan tapi pemeriksaan tidak bisa jalan (gateway IPFS lambat) | **tidak diblokir** |

Keadaan pertama penting: setiap escrow yang dibuat sebelum fitur ini ada tidak
punya satu pun dokumen itu, dan menolak milestone ketiga mereka secara
retroaktif adalah penolakan palsu tentang pengiriman yang sebetulnya lolos
bea cukai dengan baik. Yang diblokir hanyalah dokumen yang **ada dan gagal**.

Pola ini persis sama dengan `eblBlocks` — lihat `contractService.js`.

### Proof CID milestone 3

Kalau dokumen kepabeanan sudah dilampirkan, `proofCid` yang ditulis on-chain
untuk *Cleared* adalah **CID manifest kepabeanan itu**. Jadi proof di rantai
resolve ke PEB, PIB dan kuitansinya, dan siapa pun bisa mengambil ketiganya dan
mencocokkan hash-nya. Itu yang seharusnya dimaksud "proof CID".

Milestone 1 dan 2 tetap memakai string sintetis. Itu jujur tentang dirinya —
gateway menyatakan bahwa pemeriksaannya sendiri lolos, tanpa dokumen di
belakangnya — dan mengubah formatnya tidak memberi apa-apa.

### Feed CEISA ikut berubah

Kalau PEB/PIB terlampir **dan terverifikasi**, feed CEISA melaporkan nomor
pendaftaran, kantor pabean dan bea yang benar-benar dibayar dari PDF itu
(`source: "customs_documents"`). Kalau tidak, dia tetap sintetis dan
mengatakannya. Dokumen yang gagal verifikasi **tidak** boleh ikut bicara —
membaca angka darinya lebih buruk daripada membiarkan feed-nya sintetis, karena
angka itu akan terlihat bersumber.

## Endpoint

| Method | Path | Guna |
|---|---|---|
| `POST` | `/ipfs/manifest` | Pin e-BL + Invoice + Packing List + manifest. Balikannya CID untuk `documentCid` |
| `GET` | `/ipfs/manifest/schema` | Satuan dan slot dokumen yang diterima gateway |
| `POST` | `/customs/:escrowId` | Pin PEB + PIB + bukti bayar, catat ke escrow itu |
| `GET` | `/customs/:escrowId` | Manifest kepabeanan escrow itu + verdict-nya |

Batas: 8 MB per dokumen, 12 MB per set, body JSON gateway 20 MB.

## Deploy

`CUSTOMS_STORE_FILE` (default `backend/data/customs.json`) menyimpan kaitan
escrow → CID manifest kepabeanan.

> **Di Railway ini harus di volume**, sama seperti `IDENTITY_STORE_FILE` dan
> `DIRECTORY_STORE_FILE`. Dokumennya sendiri aman di IPFS, tapi tanpa volume
> setiap redeploy menghapus kaitan antara escrow dan dokumen kepabeanannya —
> dan milestone 3 akan kembali memakai `proofCid` sintetis.

## Tes

```bash
npm run test:manifest          # 60 tes: kuantitas, manifest, kepabeanan, gerbang milestone
npm run make-demo-docs         # 5 PDF demo yang konsisten dengan e-BL
npm run make-demo-docs -- TGHU-2026-001 --wrong-quantity   # variannya yang salah
```

PDF demo di `docs/demo/`: `invoice-`, `packing-list-`, `peb-`, `pib-`,
`bukti-bayar-`. Semua angkanya konsisten dengan e-BL: 320 bag, 19 200,00 kg
netto, 20 450,00 kg VGM, Belawan → Rotterdam, container TGHU-2026-001.

Untuk mengujinya di browser tanpa RPC atau kontrak:

```bash
npm run documents-stub         # gateway dokumen saja, :4112, plus node IPFS lokal di :4113
cd frontend && VITE_ORACLE_API=http://localhost:4112 npm run dev
```

Skrip Playwright-nya `scripts/test-support/documents-browser.mjs` — 28
pemeriksaan: kuantitas masuk ke manifest, manifest gugur kalau kuantitas
diedit, PEB/PIB/NTPN terbaca di panel, lebar ponsel.
