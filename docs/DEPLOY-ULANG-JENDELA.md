# Deploy ulang dengan jendela tantangan yang bisa dipakai

Tujuannya satu: supaya saat Anda menyalakan fault simulation, tombol **Review
dispute** muncul dan tetap ada cukup lama untuk ditekan.

## Kenapa harus deploy ulang

Jendela tantangan kontrak Anda sekarang **30 detik**. Di dalam 30 detik itu
harus terjadi: fault diterapkan dan halaman dimuat ulang, Review dispute
ditekan dan gateway dipanggil, lalu UserOperation ditandatangani dan
dikonfirmasi Amoy yang butuh 5 sampai 15 detik. Tidak bisa.

Nilainya `immutable` di kontrak:

```solidity
uint256 public immutable challengeWindowSeconds;
```

Tidak ada fungsi untuk mengubahnya. Satu-satunya jalan adalah kontrak baru.

## Angka yang saya sarankan

```
CHALLENGE_WINDOW_SECONDS=300
TIMELOCK_DURATION_SECONDS=300
```

Lima menit itu lega untuk demo sengketa, dan Anda tidak perlu terburu-buru
sama sekali.

Perhitungan yang perlu Anda tahu sebelum memilih. Kontrak melarang milestone
berikutnya sebelum jendela milestone sebelumnya **tutup**:

```solidity
require(block.timestamp > escrow.proofs[Milestone.Inspected].challengeDeadline,
        "challenge window open");
```

Jadi rantai tiga milestone butuh **dua kali** panjang jendela:

| Jendela | Demo sengketa | Rantai tiga milestone |
| --- | --- | --- |
| 30 detik (sekarang) | tidak mungkin | sekitar 1 menit |
| 180 detik | cukup | sekitar 6 menit |
| **300 detik** | **lega** | **sekitar 10 menit** |
| 600 detik | sangat lega | sekitar 20 menit |

Demo sengketa hanya butuh **satu** milestone ter-commit, jadi panjang jendela
tidak memperlambatnya sama sekali. Yang melambat hanya demo pelunasan penuh,
dan itu bisa Anda siapkan sebelum presentasi lalu tunjukkan hasilnya.

## Langkah-langkah

### 1. Catat dulu yang lama

```powershell
Select-String -Path .env -Pattern "^CONTRACT_ADDRESS|^CONTRACT_DEPLOY_BLOCK"
```

Simpan di Notepad. Kalau ada yang salah, Anda bisa kembali.

### 2. Deploy

Di PowerShell, dari akar repositori:

```powershell
$env:CHALLENGE_WINDOW_SECONDS="300"
$env:TIMELOCK_DURATION_SECONDS="300"
npx hardhat run scripts/deploy.js --network amoy
```

Skrip ini sudah Anda pakai sebelumnya. Dia men-deploy IDRTDemo dan
SternEscrow, memberi ketiga verifikator perannya, **dan langsung memasang
bond mereka**. Jadi tidak perlu `post-bond` setelah ini.

Jangan tutup terminalnya. Catat tiga baris dari outputnya:

```
IDRTDemo deployed to:      0x...
SternEscrow deployed to:   0x...
CONTRACT_DEPLOY_BLOCK:     48...
```

Pastikan juga baris ini benar sebelum lanjut:

```
Challenge window seconds: 300
Timelock duration seconds: 300
```

### 3. Isi variabel di tiga tempat

**`.env` di akar** (untuk gateway):

```
CONTRACT_ADDRESS=<SternEscrow yang baru>
CONTRACT_DEPLOY_BLOCK=<angka dari output>
```

`CONTRACT_DEPLOY_BLOCK` bukan opsional. Tanpa itu pemindaian riwayat
aktivitas memakai jendela 500.000 blok, yaitu 56 permintaan berurutan ke RPC,
dan pembacaan escrow jadi satu sampai tiga menit.

**`frontend/.env`**:

```
VITE_CONTRACT_ADDRESS=<SternEscrow yang baru>
VITE_IDRT_TOKEN_ADDRESS=<IDRTDemo yang baru>
```

**Railway**, service backend, menu Variables: `CONTRACT_ADDRESS` dan
`CONTRACT_DEPLOY_BLOCK`. Service frontend: dua variabel `VITE_` di atas.

### 4. Kembalikan saldo IDRT Anda

`deploy.js` men-deploy token IDRT **baru**, jadi saldo di token lama tidak
terlihat oleh kontrak baru — gateway membaca alamat tokennya langsung dari
kontrak escrow. Ada dua cara.

Cara cepat, lewat faucet di aplikasi. Faucet hanya sekali per alamat, jadi
hapus dulu catatannya:

```powershell
node scripts/reset-faucet-claim.js --list
node scripts/reset-faucet-claim.js <alamat-smart-account-anda>
```

Lalu tekan **Claim demo balance** di sidebar aplikasi.

Cara langsung, tanpa faucet:

```powershell
$env:SAFE_ADDRESS="<alamat Smart Account Anda>"
$env:IDRT_AMOUNT="150000000"
npx hardhat run scripts/mint-idrt-to-safe.js --network amoy
```

Alamat Smart Account Anda ada di sidebar aplikasi, di bawah IDRT-demo
balance, dan bisa diklik untuk menyalin.

### 5. Jalankan ulang

```powershell
npm run backend
```

dan di jendela lain

```powershell
cd frontend
npm run dev
```

`npm run dev` harus dijalankan ulang, bukan cuma di-refresh. Vite menanamkan
variabel `VITE_` saat proses dimulai, jadi nilai baru tidak terbaca sampai
prosesnya dihidupkan ulang.

### 6. Pastikan

```powershell
npm run chain-lag
```

Harus mencetak `jendela tantangan: 300 detik`. Kalau masih 30, berarti ada
variabel yang belum tersimpan atau gateway belum di-restart.

## Cara mendemokan sengketanya setelah ini

1. Buat escrow baru, lampirkan e-BL, kunci dananya.
2. Buka escrow itu, tekan **Verify milestones** satu kali. Inspected
   ter-commit, Shipped melaporkan challenge window open. Itu normal, berhenti
   di situ.
3. Kartu **Rehearse a dispute** berubah hijau dengan hitung mundur sekitar
   lima menit. Tekan **Make Inspected disagree**.
4. Tekan **Review dispute**, lalu **Lock bond & raise dispute**.
5. Buka **Ops** dengan private key arbiter untuk memutuskan sengketanya.

Jangan menekan Verify kedua kali sebelum langkah 4. Memajukan milestone akan
menutup jendela milestone sebelumnya, dan kesempatan itu hilang.

## Yang tidak perlu diubah

Escrow lama tetap ada di kontrak lama dan tidak bisa dipindahkan. Kunci
Pinata, kunci Particle, kunci Pimlico, kunci verifikator dan arbiter semuanya
tetap. Yang berubah hanya alamat kontrak, alamat token, dan blok deploy.
