# Cara memasang verifikasi e-BL IPFS

Yang Anda ubah sendiri cuma **satu variabel di Railway**. Sisanya ada di
berkas, dan berkasnya sudah saya siapkan.

---

## Langkah 1 — masukkan berkasnya

Pilih satu cara. Cara A lebih rapi karena riwayat commit ikut masuk.

### Cara A — bundle git (disarankan)

```bash
cd sternprotocol
git fetch /path/ke/stern-ebl-ipfs.bundle 'refs/heads/*:refs/heads/*'
git checkout claude/markdown-instructions-bdxkg4
```

Bundle itu berisi 47 commit, yaitu seluruh pekerjaan sesi ini, bukan hanya
e-BL. Karena `origin/master` adalah leluhur langsungnya, ini fast-forward
dan tidak menimpa apa pun.

### Cara B — arsip berkas

Kalau bundle-nya menyulitkan, ekstrak `stern-ebl-files.tar.gz` di akar
repositori. Isinya hanya berkas yang berubah untuk e-BL.

```bash
cd sternprotocol
tar xzf /path/ke/stern-ebl-files.tar.gz
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
