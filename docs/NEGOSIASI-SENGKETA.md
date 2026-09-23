# Negosiasi setelah sengketa dibuka

## Masalahnya

Begitu `raiseDispute` dipanggil, escrow membeku dan satu-satunya jalan keluar
adalah `resolveDispute` — yang hanya boleh dipanggil arbiter, dan yang
**biner**:

```solidity
if (releaseToExporter) { _release(escrowId); } else { _refund(escrowId); }
```

Tidak ada nilai di antaranya. Itu backstop yang wajar dan **pilihan pertama yang
buruk**, karena sengketa dagang sungguhan jarang soal "siapa yang benar" —
lebih sering soal **"barang ini sekarang bernilai berapa"**. Klaim mutu selesai
di 85% nilai invoice; kedatangan telat selesai dengan diskon.

Mekanisme yang hanya bisa memberi semua atau tidak sama sekali **mendorong
kedua pihak berkeras minta semua**, karena mengalah sedikit pun berarti
kehilangan segalanya.

## Yang ditambahkan

Sebuah lapisan **sebelum** arbiter memutus. Selama sengketa terbuka, importir
dan eksportir bertukar usulan yang konkret dan tercatat. Kalau keduanya
menyetujui usulan yang sama, gateway mem-pin kesepakatannya dan arbiter
**mengeksekusi kesepakatan itu**, bukan memutuskan untuk mereka.

`reasoningCid` yang ditulis arbiter ke chain menjadi **alamat kesepakatan
kedua pihak** — jadi yang tercatat di chain adalah penyelesaian para pihak
sendiri, bukan tafsiran pihak ketiga atasnya.

## Aturan yang ditegakkan

Semua dibaca **dari chain**, bukan dari request — kalau tidak, siapa pun bisa
mengirim usulan atas nama lawan transaksinya.

| Aturan | Kode error |
|---|---|
| Hanya importir atau eksportir yang boleh mengusulkan/menyetujui | `NOT_A_PARTY` |
| Hanya saat sengketa benar-benar terbuka | `NO_OPEN_DISPUTE` |
| Usulan wajib beralasan, minimal 20 karakter | `NOTE_REQUIRED` |
| Pengusul tidak bisa menyetujui usulannya sendiri | `SELF_ACCEPT` |
| Usulan yang sudah digantikan tidak bisa disetujui | `PROPOSAL_SUPERSEDED` |
| Pembagian harus 1–9999 bps (0 dan 10000 bukan pembagian) | `SPLIT_INVALID` |
| Maksimal 20 usulan; lewat itu ini bukan lagi negosiasi | `TOO_MANY_PROPOSALS` |

Aturan "pengusul tidak boleh menyetujui sendiri" adalah aturan yang sama yang
sudah ditegakkan kontrak pada `approveDeadlineExtension`
(`require(msg.sender != extensionProposer[escrowId])`).

Usulan baru **menggantikan** usulan yang masih terbuka. Dua tawaran hidup di
meja adalah cara satu pihak akhirnya menyetujui tawaran yang sudah ditinggalkan
pihak lain.

## Pembagian sebagian: `resolveDisputeByAgreement`

Dua dari tiga hasil bisa dieksekusi kontrak yang lama:

| Hasil | Panggilan |
|---|---|
| `release_to_exporter` | `resolveDispute(id, true, agreementCid, …)` |
| `refund_to_importer` | `resolveDispute(id, false, agreementCid, …)` |
| `split` (mis. 85/15) | **butuh fungsi baru** |

Fungsi barunya sekarang ada di `contracts/SternEscrow.sol`:

```solidity
function resolveDisputeByAgreement(
    uint256 escrowId,
    uint256 amountToExporter,
    string calldata agreementCid
) external whenNotPaused nonReentrant escrowExists(escrowId)
```

Keputusan desainnya, satu per satu:

- **Arbiter tetap yang mengirim transaksinya.** Bukan karena arbiter yang
  menentukan angkanya — para pihak yang menentukan — tapi karena
  kesepakatannya hidup off-chain, dan membiarkan satu pihak sendiri
  mengeksekusi "kesepakatan" berarti membiarkannya mengeksekusi kesepakatan
  yang tidak pernah disepakati.
- **`agreementCid` wajib.** Pembayarannya harus bisa diaudit terhadap sebuah
  dokumen, bukan terhadap ucapan arbiter.
- **`require(amountToExporter > 0 && amountToExporter < total, "not a split")`.**
  Dua ujungnya adalah `resolveDispute`, yang juga memutuskan slashing dan bond
  frivolous; mengalihkan pelepasan penuh lewat fungsi ini akan melewati
  keduanya secara diam-diam.
- **Tidak ada verifier yang di-slash.** Penyelesaian yang dinegosiasikan bukan
  temuan bahwa verifier berbohong.
- **Bond sengketa kembali ke yang mengajukan.** Mereka tidak bertindak
  sembarangan — mereka mendapat hasil.
- **State akhirnya `Completed`**, dengan event tersendiri
  `DisputeSettledByAgreement(escrowId, amountToExporter, amountToImporter, agreementCid)`.
  `DisputeRecord` mendapat field baru `settledToExporter`, karena
  `releaseToExporter` adalah bool dan tidak bisa mengatakan "85% dari itu".
  **Apa pun yang membaca hasil sengketa harus memeriksa field ini lebih dulu.**

### Ini butuh deploy ulang

Fungsinya ada di repo; **belum tentu ada di kontrak yang ter-deploy.**

Karena itu executability **tidak di-hardcode** di mana pun. Gateway menanyakannya
ke bytecode:

```js
// contractService.supportsAgreementSettlement()
const selector = new ethers.Interface(loadAbi())
  .getFunction("resolveDisputeByAgreement").selector;
const code = await provider.getCode(config.contractAddress);
return code.includes(selector.slice(2));
```

Dispatcher Solidity menanamkan selector 4-byte setiap fungsi eksternal sebagai
literal, jadi selector yang tidak ada di bytecode adalah fungsi yang tidak ada.
Bytecode di sebuah alamat tidak pernah berubah, jadi satu probe per alamat cukup.

Probe ini **gagal ke arah aman**: kalau tidak bisa dijalankan, jawabannya
"tidak". Mengatakan pembagian bisa dieksekusi lalu transaksinya gagal lebih
buruk daripada mengatakan tidak bisa lalu ternyata bisa.

Setelah deploy ulang, jawabannya berubah sendiri — tidak ada flag yang perlu
disetel.

### Yang ditampilkan UI kalau belum bisa

Panelnya mengatakannya **sebelum ada yang mengusulkan pembagian**, bukan setelah
keduanya menandatangani:

> The contract at this address can only release or refund in full, so a partial
> split cannot be executed on chain here. You can still record one — it is a
> real agreement and it is pinned — but settling it needs a deployment that has
> `resolveDisputeByAgreement()`.

Kesepakatan pembagiannya **tetap dicatat dan tetap di-pin** (itu memang yang
disepakati para pihak), ditandai `executable: false`, dan jalan keluarnya
**ditawarkan, bukan dijalankan**: sepakati ulang sebagai `release_to_exporter`
atau `refund_to_importer`. Memilih hasil biner terdekat secara diam-diam akan
menaruh angka di layar yang tidak diikuti uangnya.

## Endpoint

```
GET  /negotiation/:escrowId                       thread + kesepakatan + apa yang bisa chain eksekusi
POST /negotiation/:escrowId/propose               { by, outcome, splitToExporterBps?, note }
POST /negotiation/:escrowId/accept/:proposalId    { by }
POST /negotiation/:escrowId/withdraw              { by }
POST /resolve-dispute/:contractId/by-agreement    { agreementId }   ← INTERNAL_API_KEY
```

`POST /resolve-dispute/:id/by-agreement` **tidak menerima angkanya dari
request.** Angkanya dibaca ulang dari kesepakatan yang sudah di-pin gateway
sendiri, karena caller yang bisa menyebut angka bisa menyebut angka apa saja dan
dokumen yang di-pin tidak lagi sama dengan yang dibayarkan. Nilai escrow di
chain juga diperiksa ulang terhadap nilai saat kesepakatan dibuat
(`VALUE_CHANGED`).

Di ops console arbiter menandatanganinya **dengan kuncinya sendiri**
(`opsAuth.settleByAgreementAsArbiter`), bukan lewat gateway — kontrak
mensyaratkan `msg.sender == escrow.arbiter`, dan merutekannya lewat server
berarti server memegang kunci yang bisa menyelesaikan sengketa.

## UI

**Halaman escrow** (`frontend/src/components/NegotiationPanel.jsx`) — muncul di
kolom utama saat `state === "Disputed"`, bukan di rail, karena ini percakapan
dan bukan tombol. Isinya thread usulan (siapa, apa, berapa dalam rupiah,
alasannya, statusnya), form usulan/counter, tombol terima untuk lawan
transaksi, dan blok kesepakatan dengan CID-nya.

Angka selalu ditampilkan **dalam rupiah, bukan persen saja**: persentase yang
harus dikonversi sendiri oleh lawan transaksi adalah persentase yang akan
dikonversi berbeda. Konversinya memakai `decimals` yang dikirim gateway, bukan
angka 2 yang ditebak di frontend.

**Ops console** (`frontend/src/pages/OpsConsole.jsx`) — kesepakatan para pihak
ditampilkan **di atas** form keputusan biner, dengan legend form itu berubah
menjadi "Or decide it yourself". Arbiter yang memaksakan hasil biner di atas
kesepakatan yang sudah ditandatangani kedua pihak telah membatalkan keduanya
tanpa alasan.

## Uji

```bash
npm run test:negotiation   # 37 pemeriksaan, chain di-stub
npm test                   # hardhat: 3 test baru untuk resolveDisputeByAgreement
```

Bagian 7 test-nya menjalankan kesepakatan **yang sama** dua kali — sekali
terhadap deployment yang tidak punya fungsinya, sekali terhadap yang punya — dan
memastikan yang dilaporkan berubah. Itu satu hal yang fitur ini tidak boleh
salah.

> `npx hardhat test` **tidak bisa dijalankan dari sandbox Claude** (unduhan solc
> diblokir allowlist jaringan). Test kontraknya harus dijalankan di mesin Anda.
