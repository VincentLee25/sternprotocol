# Tanya-Jawab Teknis — pertanyaan yang akan ditembakkan juri

Jawaban dibaca dari kode, bukan dari ingatan. Setiap klaim menyebut berkasnya, supaya
siapa pun bisa memeriksa sendiri.

Yang **tidak** bisa dipastikan dari kode ditandai jelas. Jangan mengarang untuk bagian itu.

---

## Ringkas — sepuluh jawaban terpenting

| # | Pertanyaan | Jawaban singkat |
|---|---|---|
| 1 | IDRT-demo itu apa | ERC-20 sungguhan, kami deploy sendiri, 2 desimal, simbol `IDRTD` |
| 2 | Alamat kontrak | SternEscrow ada di `.env`; alamat IDRT dibaca dari kontrak escrow |
| 3 | Jaringan | Polygon Amoy, chain id **80002**, explorer `amoy.polygonscan.com` |
| 4 | Mint on-chain atau tidak | **On-chain**, ditandatangani dompet minter backend, bukan user |
| 5 | POL user berkurang kapan | **Tidak pernah.** Verifier dan minter yang bayar gas sendiri |
| 6 | Cakupan sponsor Pimlico | Seluruh transaksi user, atau tidak sama sekali |
| 7 | eBL | **Bukan IPFS.** Hash SHA-256 dokumen, diformat mirip CID |
| 8 | Tiga verifier | Tiga dompet berbeda, ditegakkan `AccessControl` di kontrak |
| 9 | Timelock | **24 jam**, `immutable` — demo 1 menit butuh deploy ulang |
| 10 | Release | Token benar-benar pindah, `safeTransfer` + event `PaymentReleased` |

---

## A. Token IDRT dan minting

**Ini token ERC-20 sungguhan.** `contracts/IDRTDemo.sol`:

```solidity
contract IDRTDemo is ERC20, ERC20Permit, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint8 public constant DECIMALS = 2;
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) { _mint(to, amount); }
}
```

Nama "IDRT Demo", simbol **IDRTD**, dua desimal — supaya nilai kontrak tercatat dalam rupiah
dan sen, bukan dalam pecahan 18 digit. Kami deploy sendiri lewat `scripts/deploy.js`. Ini
**bukan** IDRT yang beredar di pasar, dan bukan angka yang dikarang frontend.

### Tombol klaim benar-benar mengirim transaksi

`backend/oracle-gateway/faucetService.js`:

```js
const minterRole = await token.MINTER_ROLE();
if (!(await token.hasRole(minterRole, minter.address))) throw new Error("… does not have MINTER_ROLE …");
const tx = await token.connect(minter).mint(normalized, amount);
const receipt = await tx.wait();
```

Alurnya: user klik → `POST /demo-balance/claim` → **dompet minter di backend** memanggil
`mint()` → transaksi nyata dengan hash nyata.

Tidak ada popup dompet, karena bukan user yang menandatangani. Itu disengaja: `MINTER_ROLE`
tidak boleh dipegang peramban.

- Satu klaim per alamat, dicatat di `demo-claims.json` (klaim kedua ditolak 409)
- Jumlahnya dari `DEMO_BALANCE_IDRT`, bawaan **150.000.000,00**
- Token masuk langsung ke **alamat Safe**, bukan EOA

### Kalau ditanya "kenapa tiba-tiba saya punya sejuta IDRT?"

> Ini token testnet yang kami deploy sendiri. Kontraknya punya fungsi `mint` yang hanya bisa
> dipanggil pemegang `MINTER_ROLE` — dompet faucet kami, bukan pengguna. Tokennya memang
> diciptakan, dan itu memang cara faucet testnet bekerja. Di produksi, tempat ini diisi
> rupiah digital teregulasi, dan faucet tidak ada.

Jangan bilang "tokennya sudah ada". Menciptakan unit baru adalah yang sebenarnya terjadi,
dan mengakuinya lebih kuat daripada mengaburkannya.

---

## B. "POL saya dibayar siapa?"

| Aksi | Yang membayar gas |
|---|---|
| Login, buat escrow, release, refund, dispute, timelock | **Paymaster Pimlico** |
| Klaim faucet | Dompet minter backend |
| Submit tiga milestone proof | **Ketiga dompet verifier, masing-masing sendiri** |
| Putusan sengketa | Dompet arbiter |

**Saldo POL tidak pernah ditampilkan di UI.** Yang muncul hanya IDRT.

Sponsor Pimlico dipasang di level klien, bukan per transaksi (`frontend/src/lib/smartAccount.js`):

```js
const client = createSmartAccountClient({ account: safeAccount, chain: polygonAmoy,
  bundlerTransport: http(PIMLICO_URL), paymaster: pimlicoClient });
```

Jadi **setiap** UserOperation lewat klien itu disponsori. Kalau `VITE_PIMLICO_API_KEY`
kosong, `client` bernilai `null` — alamat Safe tetap ketemu tapi tidak ada yang bisa
dikirim. Semua atau tidak sama sekali; tidak ada kondisi separuh.

### Yang aman diucapkan, dan yang tidak

Aman: **"Pengguna tidak pernah membayar gas."**

Jangan: "semua gas di sistem ini disponsori." Verifier dan minter membayar sendiri, dan
itu jawaban yang lebih jujur sekaligus lebih menarik — verifier menanggung biayanya sendiri
untuk menaruh bukti.

Ini juga sumber error `insufficient funds` yang pernah muncul saat uji coba: dompet
verifier kehabisan POL. Bukan bug.

---

## C. Lapis dompet

| Komponen | Peran sebenarnya |
|---|---|
| Particle Connect Kit | **Login sosial saja** (`authWalletConnectors`) |
| permissionless | `toSafeSmartAccount` — membangun Safe |
| Pimlico | **Bundler dan paymaster sekaligus** |
| viem | Klien RPC dan encoding |
| EntryPoint | **v0.7** (`entryPoint07Address`) |

Plugin `aa()` milik Particle **tidak dipakai** — Safe + Pimlico dipilih menggantikannya,
dan alasannya ditulis di komentar `smartAccount.js`. **wagmi tidak dipakai.**

Alur transaksi user selalu:

```
EOA (dari login sosial, hanya pemilik)
  ↓
Safe Smart Account   ← ini alamat yang tercatat di escrow
  ↓
UserOperation → bundler → EntryPoint 0.7 → kontrak
```

EOA tidak pernah mengirim transaksi langsung. Alamat Safe tampil di sidebar.

> **Belum diuji:** apakah login Google yang sama di dua peramban menghasilkan alamat Safe
> yang sama. Secara desain seharusnya ya, karena Safe diturunkan dari EOA-nya. Uji sendiri
> sebelum lomba — jangan diklaim di panggung tanpa dicoba.

---

## D. Jaringan dan penelusuran

- Jaringan: **Polygon Amoy**, chain id **80002**
- Explorer: **amoy.polygonscan.com**
- `SternEscrow` dan `IDRTDemo` di-deploy oleh `scripts/deploy.js`

Alamat SternEscrow ada di `CONTRACT_ADDRESS`. **Alamat IDRT tidak disimpan di env backend
sama sekali** — gerbang membacanya dari kontrak:

```js
const tokenAddress = await escrow.idrtToken();
```

Ini justru poin bagus: **juri bisa menemukan alamat tokennya sendiri** dari kontrak escrow
di explorer, tanpa perlu percaya kata kami.

Yang bisa dilihat juri di explorer dengan satu alamat escrow: kode kontrak, seluruh
transaksi, event (`EscrowCreated`, `MilestoneVerified`, `PaymentReleased`), nomor blok, dan
perpindahan token ERC-20.

Kalimat yang boleh diucapkan:

> Kalau tidak percaya tampilan kami, buka alamat ini di PolygonScan. Semua yang barusan
> Anda lihat ada di sana, dan Anda tidak perlu izin kami untuk membacanya.

Di UI, setiap hash transaksi, alamat verifier, dan nomor blok sudah menjadi tautan langsung
ke explorer.

---

## E. eBL dan CID — bagian paling rawan

**Tidak ada yang diunggah ke IPFS.**

`frontend/src/lib/ebl.js` mengambil berkas yang dipilih, meng-hash **SHA-256 di dalam
peramban**, lalu memformat hasilnya jadi string berawalan `bafybeistern…`:

```js
const digest = await crypto.subtle.digest("SHA-256", content);
return { cid: `bafybeistern${toBase32(new Uint8Array(digest)).slice(0, 34)}` };
```

Prefiks itu ada supaya lolos pemeriksaan `ipfs-mock.js`, yang hanya mengecek awalannya.

**Kalau juri mencoba membuka CID itu di gateway IPFS, tidak akan ketemu.**

### Kalimat yang jujur dan tetap kuat

> Yang naik ke rantai adalah sidik jari SHA-256 dari dokumennya, bukan dokumennya. Dokumen
> yang sama selalu menghasilkan sidik jari yang sama, jadi dokumen yang diganti belakangan
> langsung ketahuan. Penyimpanan IPFS sungguhan belum tersambung — yang ada baru
> jangkarnya.

Sisi yang benar dan patut disebut: hash itu **benar-benar** dari isi berkas, bukan angka
acak. Jadi klaim "dokumen sama = CID sama" itu sah.

### Satu eBL, tiga proof CID berbeda

- eBL adalah jangkar dokumen di level escrow, satu untuk seluruh kontrak
- Tiap milestone punya proof CID sendiri yang **dibuat gerbang**:
  `bafy-verified-<escrowId>-<milestone>`
- Proof CID itu **bukan** berasal dari sumber datanya

Sebut ini eksplisit. Kalau tidak, terdengar seolah tiap milestone punya dokumen sendiri.

---

## F. Oracle

Kelima sumber adalah **mock deterministik lokal** di `backend/mock-apis/`: `vgm-mock.js`,
`ais-mock.js`, `ceisa-mock.js`, `inspection-mock.js`, `ipfs-mock.js`.

Dipindai: **nol panggilan HTTP keluar.** Tidak ada API eksternal, tidak ada sambungan ke
CEISA, AIS, atau penyedia VGM mana pun.

Alurnya:

```
POST /oracle/verify/:id
  → baca kelima sumber mock
  → cocokkan dengan nilai yang diharapkan
  → yang lolos: verifier menandatangani, submit ke rantai
  → yang gagal: DITOLAK, tidak ada yang ditulis
```

Tidak ada basis data hasil verifikasi. Gerbang membaca state escrow dari kontrak, dan
langsung submit. Frontend membaca ulang dari gerbang, yang membaca dari kontrak.

**Penolakan adalah produk yang bekerja.** Peragakan satu kasus gagal — itu bagian paling
meyakinkan dari seluruh demo.

---

## G. Tiga verifier

Ditegakkan berlapis, dan lapis terakhirnya ada di kontrak:

| Lapis | Penjaga |
|---|---|
| Konfigurasi | `ORACLE_PRIVATE_KEYS` ditolak kalau bukan tepat tiga |
| Deploy | `deploy.js` memberi satu peran per dompet |
| Kontrak | `_roleForMilestone` + `AccessControl` OpenZeppelin |

| Milestone | Peran |
|---|---|
| 1 Inspeksi | `ROLE_QUALITY_AUDITOR` |
| 2 Pengapalan | `ROLE_LOGISTICS` |
| 3 Bea Cukai | `ROLE_CUSTOMS` |

**Ya, kontrak benar-benar revert** kalau verifier salah mencoba submit. Dompet Logistics
yang mengirim bukti kepabeanan ditolak di level kontrak, bukan di backend. Ini pemisahan
wewenang sungguhan, bukan konvensi kode — dan bisa diperagakan.

Untuk membuktikan ketiganya beda alamat, panggil `GET /verifiers` dan tunjukkan hasilnya.

---

## H. Timelock

**24 jam.** `scripts/deploy.js`:

```js
const TIMELOCK_DURATION_SECONDS = 24 * 60 * 60;
```

Bisa di-override lewat `TIMELOCK_DURATION_SECONDS`, **tapi hanya saat deploy** — di kontrak
nilainya `immutable`.

### Konsekuensi untuk demo

**Demo 1 menit hanya mungkin dengan men-deploy ulang** pakai `TIMELOCK_DURATION_SECONDS=60`.

Frontend tidak bisa memalsukannya. `releasePayment` membandingkan dengan `block.timestamp`,
jadi kalau timer di layar habis sementara kontraknya belum, panggilan akan revert dengan
`timelock not elapsed`.

Sebelum lomba, pastikan: kontrak yang sedang live itu 24 jam atau 60 detik? Kalau 24 jam,
jangan janjikan demo pelepasan dana dalam satu sesi.

`initiateTimelock()` ditandatangani Safe pengguna, lewat `settlementFlow.js`.

---

## I. Release

`contracts/SternEscrow.sol`:

```solidity
function _release(uint256 escrowId) private {
    uint256 amount = escrow.contractValue;
    escrow.contractValue = 0;
    escrow.state = State.Completed;
    idrtToken.safeTransfer(escrow.exporter, amount);
    emit PaymentReleased(escrowId, escrow.exporter, amount);
}
```

Dan kontrak memang memegang tokennya sejak awal — `createEscrow` melakukan:

```solidity
idrtToken.safeTransferFrom(importer, address(this), contractValue);
```

Jadi:

- Token **benar-benar** berpindah dari kontrak ke Safe eksportir
- Ada event `Transfer` ERC-20 yang bisa dilihat di explorer
- Saldo eksportir benar-benar naik
- Status `Completed` berasal dari **state kontrak**, bukan state frontend
- Hash transaksi ditampilkan dan bisa diklik

Penandatangannya Safe pengguna, dikirim sebagai UserOperation.

---

## Empat pertanyaan penutup — siapkan jawabannya

### "Kenapa tiba-tiba saya punya sejuta IDRT?"

> Karena kontrak tokennya punya fungsi `mint`, dan dompet faucet kami memegang hak itu. Ini
> testnet — tokennya memang diciptakan untuk keperluan demo. Di produksi, tempat ini diisi
> rupiah digital teregulasi dan tidak ada faucet sama sekali.

### "POL saya sebenarnya dibayar siapa?"

> Pengguna tidak pernah membayar gas — semua transaksi pengguna disponsori paymaster. Yang
> membayar gasnya sendiri adalah verifikator institusi, untuk setiap bukti yang mereka
> tanam. Itu memang bagian dari desainnya: kejujuran mereka punya biaya, dan biaya itu
> mereka tanggung.

### "Ini beneran on-chain atau cuma frontend?"

> Silakan buka alamat kontraknya di PolygonScan. Setiap bukti milestone punya hash
> transaksi, nomor blok, dan alamat verifikator yang menandatanganinya — semuanya bisa
> diklik dari layar ini. Kalau Anda tidak percaya tampilan kami, jangan percaya; baca
> sendiri di sana.

### "Kalau backend kalian mati, apa yang tetap aman?"

> Dana tetap terkunci di kontrak. Gerbang tidak pernah bisa memindahkan uang siapa pun —
> ia hanya menaruh bukti dan menyiapkan calldata; yang menandatangani pemindahan dana
> selalu dompet penggunanya sendiri. Dan tenggat global tetap berjalan, jadi importir tetap
> bisa menarik dananya kembali meski gerbang kami tidak pernah hidup lagi.

---

## Yang harus dicek sendiri sebelum lomba

Tiga hal yang tidak bisa dipastikan dari kode:

1. **Buka alamat SternEscrow di `amoy.polygonscan.com`** — pastikan kontraknya ada dan
   punya riwayat transaksi
2. **`curl <gateway>/verifiers`** — pastikan ketiganya `active: true`, peran cocok dengan
   milestone, dan bond tidak nol
3. **Login Google yang sama di dua peramban** — bandingkan alamat Safe-nya

Dan satu hal soal keamanan: jangan pernah mengirim `.env`, `ORACLE_PRIVATE_KEYS`,
`DEPLOYER_PRIVATE_KEY`, `PIMLICO_API_KEY`, atau `INTERNAL_API_KEY` ke siapa pun — termasuk
lewat screenshot atau share screen. Kunci yang pernah terlihat orang lain harus dianggap
bocor; ganti dompetnya dan deploy ulang. Prosedurnya di
[`DEPLOY_ULANG.md`](DEPLOY_ULANG.md) kasus C.
