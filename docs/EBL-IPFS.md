# e-BL di IPFS — cara kerja dan cara menyalakannya

Sebelumnya: dokumen e-BL di-hash SHA-256 di browser, lalu diberi awalan
`bafybeistern` supaya kelihatan seperti CID. Gateway "memverifikasi" dengan
memeriksa apakah string itu dimulai dengan dua belas karakter tersebut.
Dokumennya tidak pernah di-pin ke mana pun, dan CID itu tidak resolve ke
apa-apa. Siapa pun bisa mengarang string yang lolos.

Sekarang: dokumennya di-pin ke IPFS betulan, dan yang ditulis ke kontrak
adalah alamat tempat dokumen itu benar-benar bisa diambil.

## Apa yang diperiksa

Empat langkah, dan langkah ketiga adalah alasan seluruh perubahan ini ada.

1. **Pin.** Browser mengirim byte PDF ke gateway. Gateway mem-pin ke layanan
   pinning dan menerima CID.
2. **CID dihitung ulang sendiri.** Gateway menghitung CID dari byte yang sama
   dengan pustaka dan pengaturan yang dipakai node IPFS asli. Kalau hasilnya
   sama dengan CID yang diberikan layanan, layanan itu tidak mungkin menukar
   isinya. Ini bedanya antara "layanan bilang alamatnya ini" dan "kami sendiri
   sudah memeriksa alamatnya".
3. **Diambil kembali lewat CID, lalu di-hash ulang.** Gateway mengunduh byte
   dari alamat itu melalui gateway IPFS publik dan menghitung CID-nya lagi.
   Kalau cocok, byte yang bisa diambil siapa pun di alamat itu identik dengan
   dokumen yang dipakai saat escrow dibuat. Ini properti yang mock lama tidak
   bisa nyatakan sama sekali.
4. **PDF-nya dibaca.** Teks diekstrak, lalu diperiksa apakah ini benar bill of
   lading dan apakah menyebut nomor kontainer yang jadi pokok escrow ini. Bill
   of lading yang sah untuk kiriman orang lain bukan bukti untuk kiriman ini.

Enam pemeriksaan yang harus lulus: `cidResolves`, `cidMatchesContent`,
`isPdf`, `hasText`, `hasBillOfLadingNumber`, `hasContainerReference`.

Selain itu gateway membacakan isi dokumen untuk ditampilkan: nomor B/L,
shipper, consignee, nama kapal, nomor voyage, pelabuhan muat dan bongkar,
berat, tanggal terbit, dan daftar nomor kontainer.

## Cara menyalakan

Pilih salah satu. Tanpa keduanya aplikasi tetap jalan, tapi jatuh ke hash
lokal yang tidak resolve ke mana-mana, dan layarnya mengatakan begitu.

### Pinata (paling cepat)

1. Daftar di pinata.cloud, buka **API Keys**, buat kunci baru dengan izin
   `pinFileToIPFS`.
2. Di variabel gateway (Railway: service backend):

   ```
   PINATA_JWT=<JWT dari Pinata>
   ```

JWT ini bisa mem-pin, meng-unpin, dan menagih biaya. Dia rahasia. Jangan
pernah dipasang dengan awalan `VITE_`, karena apa pun yang berawalan itu
ikut masuk ke bundle browser dan bisa dibaca siapa saja.

### Node IPFS sendiri

```
IPFS_API_URL=http://127.0.0.1:5001
```

Isi `IPFS_API_AUTH` kalau node itu ada di belakang proxy yang minta header
Authorization.

### Memeriksa mode yang sedang aktif

```bash
curl https://<gateway-anda>/ipfs/status
```

`"configured": true` berarti verifikasi asli. `false` berarti masih jalur
mundur. Nilai yang sama juga muncul di `/health`.

## Rute gateway

| Rute | Fungsi |
| --- | --- |
| `GET /ipfs/status` | Mode yang aktif, penyedia pinning, daftar gateway baca. |
| `POST /ipfs/pin` | Mem-pin dokumen. Body: `{ fileName, contentBase64, containerRef }`. Mengembalikan CID plus hasil baca-ulangnya. |
| `GET /ipfs/verify/:cid` | Putusan atas sebuah CID. Query `containerRef` opsional. |
| `GET /ipfs/document/:cid` | Menyajikan PDF-nya, supaya aplikasi tidak bergantung pada header CORS gateway publik. |

`POST /ipfs/pin` sengaja tidak dilindungi `INTERNAL_API_KEY`: browser yang
memanggilnya saat membuat escrow, dan kunci itu tidak boleh sampai ke bundle.
Konsekuensinya rute ini memakai kuota pinning gateway untuk siapa pun yang
bisa menjangkaunya, jadi batasnya satu dokumen 8 MB, dan pada deployment
publik sebaiknya diberi rate limit. Rute ini tidak bisa memalsukan apa pun:
pin bukan bukti, dan CID yang dikembalikannya baru berarti setelah tanda
tangan pengguna sendiri memasukkannya ke `createEscrow`.

## Yang berubah di layar

**Halaman New escrow.** Setelah PDF dilampirkan, halaman menampilkan CID-nya,
tautan untuk membuka dokumen, enam chip pemeriksaan, dan isi bill of lading
yang terbaca. Ini muncul **sebelum** escrow dibuat, supaya operator masih bisa
berubah pikiran. Setelah dibuat, CID itu permanen di kontrak.

Dua jenis masalah dibedakan:

- **Diblokir.** Tidak ada yang resolve di CID itu, atau byte yang resolve
  ternyata hash-nya berbeda. Menuliskan alamat semacam itu ke kontrak berarti
  menyimpan rujukan yang tidak membuktikan apa pun, jadi tidak ada tombol
  override. Lampirkan ulang dokumennya.
- **Perlu konfirmasi.** Dokumennya bisa diambil dan alamatnya benar, tapi
  gateway tidak yakin ini bill of lading untuk kontainer ini. Itu penilaian
  yang boleh diambil operator, jadi sistemnya bertanya, bukan menolak.

**Panel Evidence di halaman escrow.** Ada kartu e-BL terpisah dari empat
sumber data lain: sumber lain itu bacaan angka, yang ini dokumen. Kartunya
memuat CID (bisa diklik), keenam pemeriksaan, isi dokumen yang terbaca, dan
dari gateway mana byte-nya diambil.

Label pemeriksaannya berubah dari "Document CID valid" menjadi **"e-BL
verified"**, karena sekarang memang itu yang dikerjakan.

## Escrow lama

Escrow yang dibuat sebelum perubahan ini menyimpan hash lokal, bukan CID.
Aplikasi mengenalinya dan mengatakan apa adanya: ditampilkan sebagai
`(not pinned)` dan tidak dijadikan tautan. Pemeriksaan e-BL-nya akan gagal
dengan alasan yang jelas, bukan gagal tanpa keterangan. Tidak ada migrasi —
`documentCid` immutable di kontrak. Untuk demo, buat escrow baru.

## Menjalankan ujinya

```bash
npm run test:ebl
```

36 pemeriksaan, tanpa kunci dan tanpa internet: ada stand-in node IPFS lokal
yang menghitung CID dengan pustaka dan pengaturan yang sama seperti node asli.
Bagian yang paling penting adalah kasus penolakannya, termasuk satu node yang
sengaja menyajikan byte berbeda dari CID yang diminta.

Membuat berkas e-BL contoh untuk demo:

```bash
npm run make-demo-ebl                  # docs/demo/e-bl-TGHU-2026-001.pdf
node scripts/make-demo-ebl.js TGHU-2026-002
```

Berkas itu PDF asli dengan medan bill of lading yang lengkap, jadi bisa
dipakai langsung untuk melampirkan dokumen saat demo.

## Untuk menjawab juri

Kalau ditanya "apa buktinya dokumen ini asli dan tidak diganti":

> Kontrak menyimpan alamat IPFS dokumennya. Alamat itu turunan dari isi
> dokumen, jadi mengubah satu byte akan mengubah alamatnya. Bapak/Ibu bisa
> ambil sendiri dokumen itu dari gateway IPFS mana pun dengan alamat yang
> tertulis di kontrak, hitung ulang alamatnya, dan hasilnya harus sama. Kalau
> ada yang menukar isinya, alamatnya tidak akan cocok lagi, dan itulah yang
> diperiksa gateway kami setiap kali.

Yang **tidak** boleh diklaim: bahwa ini menjamin dokumennya diterbitkan
carrier yang sah. IPFS membuktikan isinya tidak berubah, bukan bahwa isinya
benar. Untuk itu perlu tanda tangan digital penerbit, dan itu belum ada.
Katakan terus terang kalau ditanya — batas yang jelas lebih kuat daripada
klaim yang bisa dibongkar.
