# Cara memasang verifikasi e-BL IPFS

Yang Anda ubah sendiri cuma **satu variabel di Railway**. Sisanya ada di
berkas, dan berkasnya sudah saya siapkan.

---

## Langkah 0 — selamatkan suntingan Anda sendiri dulu

**Baca ini sebelum menjalankan apa pun.** Anda menyunting sendiri
`frontend/src/pages/NewEscrow.jsx` untuk menaruh alamat wallet demo di teks
`hint`. Versi saya berkas itu berubah banyak dan **tidak** memuat suntingan
Anda, jadi teks alamat demo itu akan hilang kalau Anda langsung pindah
branch.

Simpan dulu:

```powershell
cd C:\Users\user\OneDrive\Dokumen\GitHub\sternprotocol
git status
```

Kalau `NewEscrow.jsx` muncul sebagai berubah dan belum di-commit, git akan
menolak pindah branch. Commit dulu supaya tidak hilang:

```powershell
git add frontend/src/pages/NewEscrow.jsx
git commit -m "demo: alamat wallet demo di hint"
```

Setelah langkah 1 selesai, teks itu perlu Anda tambahkan ulang. Lihat
bagian **Menambahkan kembali alamat wallet demo** di bawah.

## Langkah 1 — masukkan berkasnya

Bundle-nya **tidak perlu** ditaruh di akar repositori. Dia bukan bagian dari
proyek, cuma wadah berisi commit. Taruh di mana saja, misalnya `Downloads`,
lalu tunjuk alamatnya dari perintah `git fetch`. Kalau Anda tetap menaruhnya
di akar repositori, jangan di-commit.

Pilih satu cara. Cara A lebih rapi karena riwayat commit ikut masuk.

### Cara A — bundle git (disarankan)

Di PowerShell:

```powershell
cd C:\Users\user\OneDrive\Dokumen\GitHub\sternprotocol

# Bundle ini butuh dua commit dasar yang ada di origin/master.
# Ambil dulu supaya keduanya pasti ada di repositori Anda.
git fetch origin master

git fetch "C:\Users\user\Downloads\stern-ebl-ipfs.bundle" "refs/heads/*:refs/heads/*"
git checkout claude/markdown-instructions-bdxkg4
```

Di Git Bash, jalurnya pakai garis miring biasa:

```bash
cd /c/Users/user/OneDrive/Dokumen/GitHub/sternprotocol
git fetch origin master
git fetch /c/Users/user/Downloads/stern-ebl-ipfs.bundle 'refs/heads/*:refs/heads/*'
git checkout claude/markdown-instructions-bdxkg4
```

Yang Anda harapkan setelah itu:

```
git log --oneline -1
ee4d374 docs: step-by-step install guide for the e-BL IPFS change
```

Bundle ini berisi 48 commit, yaitu seluruh pekerjaan sesi ini, bukan hanya
e-BL. Karena `origin/master` leluhur langsungnya, penerapannya fast-forward
dan tidak menimpa riwayat apa pun.

Kalau git mengeluh soal berkas terkunci, jeda dulu sinkronisasi OneDrive.
OneDrive kadang memegang berkas saat git mau menulisnya.

### Cara B — arsip berkas

Kalau bundle-nya menyulitkan, ekstrak `stern-ebl-files.tar.gz` di akar
repositori. Isinya hanya berkas yang berubah untuk e-BL. Cara ini menimpa
berkas, jadi suntingan Anda di `NewEscrow.jsx` tetap tertimpa.

Di PowerShell (Windows 10 ke atas sudah punya `tar`):

```powershell
cd C:\Users\user\OneDrive\Dokumen\GitHub\sternprotocol
tar -xzf C:\Users\user\Downloads\stern-ebl-files.tar.gz
```

## Langkah 2 — pasang pustakanya

Dua pustaka baru. Wajib, kalau tidak gateway melaporkan e-BL gagal.

```bash
npm install
```

Di Railway ini jalan sendiri saat build.

## Langkah 3 — satu variabel di Railway

Ini satu-satunya yang harus Anda isi sendiri. Di Railway, buka **service
backend** (yang menjalankan gateway, bukan frontend), menu **Variables**,
tambahkan:

```
PINATA_JWT=<JWT dari Pinata>
```

Cara mendapatkannya:

1. Daftar di pinata.cloud, gratis.
2. Menu **API Keys** → **New Key**.
3. Aktifkan izin **pinFileToIPFS**.
4. Salin **JWT**-nya, bukan API Key atau API Secret.

JWT ini rahasia. Dia bisa mem-pin, meng-unpin, dan menagih biaya. Taruh
**hanya** di service backend. Jangan pernah di frontend, dan jangan pernah
diberi awalan `VITE_`, karena apa pun berawalan itu ikut masuk ke bundle
browser dan bisa dibaca siapa saja.

Variabel lain tidak perlu diisi. `IPFS_GATEWAYS` sudah punya nilai bawaan
yang jalan.

## Langkah 4 — pastikan sudah asli

```bash
curl https://<gateway-anda>/ipfs/status
```

Yang Anda cari:

```json
{ "configured": true, "provider": "pinata", "librariesReady": true }
```

Arti tiap kemungkinan:

| Hasil | Arti | Perbaikannya |
| --- | --- | --- |
| `configured: true` | Verifikasi asli aktif | Selesai |
| `provider: null` | `PINATA_JWT` belum terbaca | Cek ejaan variabel, lalu redeploy |
| `librariesReady: false` | Install gagal | Jalankan `npm install`, lihat `dependencyError` di jawaban yang sama |

---

## Yang berubah di setiap berkas

Anda tidak perlu menyunting ini. Daftarnya ada supaya Anda tahu apa yang
masuk, dan bisa menjawab kalau ditanya.

### Berkas baru

| Berkas | Isinya |
| --- | --- |
| `backend/oracle-gateway/ipfsService.js` | Inti pekerjaannya: pin, hitung ulang CID, ambil kembali lewat CID, baca PDF, periksa medan bill of lading |
| `scripts/make-demo-ebl.js` | Membuat PDF bill of lading asli untuk demo |
| `scripts/test-ebl-ipfs.js` | 36 uji, tanpa kunci dan tanpa internet |
| `scripts/test-support/ipfs-node-stub.js` | Node IPFS tiruan untuk uji, menghitung CID sama seperti node asli |
| `docs/EBL-IPFS.md` | Penjelasan lengkap cara kerjanya |

### Berkas yang diubah

| Berkas | Perubahannya |
| --- | --- |
| `backend/oracle-gateway/index.js` | Empat rute baru: `/ipfs/status`, `/ipfs/pin`, `/ipfs/verify/:cid`, `/ipfs/document/:cid`. Batas JSON dinaikkan ke 12 MB karena PDF dikirim sebagai base64. `/health` ikut melaporkan status IPFS |
| `backend/oracle-gateway/oracleService.js` | Sumber `ipfs` tidak lagi mock. Membaca `documentCid` dan `containerRef` escrow dari kontrak, lalu memeriksa dokumennya sungguhan |
| `backend/oracle-gateway/config.js` | Variabel `PINATA_JWT`, `IPFS_API_URL`, `IPFS_API_AUTH`, `IPFS_GATEWAYS` |
| `frontend/src/lib/ebl.js` | Sebelumnya dead code yang mengarang CID palsu. Sekarang mengirim dokumen ke gateway untuk di-pin |
| `frontend/src/lib/sternApi.js` | Fungsi klien untuk empat rute baru |
| `frontend/src/lib/evidence.js` | Label berubah jadi "e-BL verified". Helper `eblSummary` |
| `frontend/src/pages/NewEscrow.jsx` | Melampirkan PDF, menampilkan CID, enam chip pemeriksaan, dan isi bill of lading sebelum escrow dibuat |
| `frontend/src/pages/EscrowDetail.jsx` | CID jadi tautan yang bisa diklik. Hash lama dikenali dan diberi label `(not pinned)` |
| `frontend/src/components/EvidencePanel.jsx` | Kartu e-BL terpisah dengan CID, pemeriksaan, dan isi dokumen |
| `package.json` | Dua dependensi, dua skrip npm |
| `.env.example` | Bagian IPFS dengan penjelasan tiap variabel |

## Menambahkan kembali alamat wallet demo

Versi saya `NewEscrow.jsx` memakai teks `hint` yang asli, jadi alamat demo
Anda perlu ditempel ulang. Buka `frontend/src/pages/NewEscrow.jsx` dan cari
dua baris ini, ada di sekitar baris 198 dan 211:

```jsx
<Field label="Exporter wallet" htmlFor="exporter" required error={showError("exporter")} hint="Receives IDRT-demo once all three milestones are verified.">
```

```jsx
<Field label="Arbiter wallet" htmlFor="arbiter" required error={showError("arbiter")} hint="Resolves disputes — independent of importer and exporter.">
```

Ganti isi `hint` pada keduanya, misalnya:

```jsx
hint="Receives IDRT-demo once all three milestones are verified. Demo exporter: 0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381"
```

```jsx
hint="Resolves disputes — independent of importer and exporter. Demo arbiter: 0x0997657e121213909bE3E9d7701df0753Fb102ed"
```

Dua hal yang perlu diperhatikan soal alamat demo itu.

Pertama, ejaan. Di versi Anda sebelumnya tertulis "arbitter" dan "addres".
Keduanya salah, yang benar "arbiter" dan "address". Teks ini tampil di layar
saat demo, jadi layak dibetulkan.

Kedua, dan ini lebih penting: **pendemo tidak boleh login sebagai
0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381** saat membuat escrow yang
memakai alamat itu sebagai exporter. Kontraknya mengizinkan importer sama
dengan exporter, dan validator di frontend hanya menolak arbiter yang sama
dengan exporter. Jadi kalau pendemo login dengan wallet itu lalu mengisinya
sebagai exporter, escrow-nya jadi tanpa ada yang menghalangi, dan alurnya
akan terlihat aneh di depan juri.

## Menjalankan ujinya

```bash
npm run test:ebl        # 36 uji
npm run make-demo-ebl   # PDF e-BL untuk demo
```

## Kalau tidak sempat memasang Pinata

Tidak apa-apa. Aplikasinya tetap jalan. Pemeriksaan e-BL jatuh ke jalur
mundur, dan kedua layar memberi label bahwa dokumennya tidak di-pin. Yang
penting jangan mengklaim verifikasi asli kalau `/ipfs/status` masih
menunjukkan `configured: false`.

## Ingat batasnya saat presentasi

Yang jadi asli hanya e-BL. Empat sumber oracle lain masih simulasi: VGM,
AIS, CEISA, dan inspection semuanya mock deterministik lokal di
`backend/mock-apis/`, tanpa satu pun panggilan keluar. Sebutkan batas itu
sendiri kalau ditanya.

Dan satu lagi: IPFS membuktikan isi dokumennya tidak berubah, bukan bahwa
dokumennya diterbitkan carrier yang sah. Untuk itu perlu tanda tangan
digital penerbit, dan itu belum ada.
