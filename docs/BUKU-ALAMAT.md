# Buku alamat counterparty (handle)

Supaya membuat escrow tidak berarti mengetik 42 karakter hex dua kali.

Di form **New escrow** sekarang ada kolom pencarian di atas **Exporter wallet**
dan **Arbiter wallet**: ketik `gayo`, pilih hasilnya, alamatnya terisi sendiri.
Di sidebar ada kartu **Your handle** untuk mendaftarkan handle milik wallet Anda
sendiri, supaya counterparty bisa menemukan Anda.

## Yang perlu jelas sejak awal

Ini **buku alamat**, bukan sistem identitas.

Handle dipilih sendiri dan gratis. Tidak ada apa pun yang membuktikan bahwa
yang mendaftar `gayocoffee` benar-benar perusahaan itu. Karena itu:

- alamat hasil pencarian **selalu ditampilkan** dan **tetap bisa diedit**;
- di bawah daftar hasil ada kalimat "Confirm the address before signing —
  nothing here proves who owns it";
- setelah dipilih, muncul chip kecil yang mencatat handle asal alamat itu, dan
  chip itu **hilang** kalau alamatnya ditimpa manual — karena handle-nya sudah
  tidak menggambarkan isi kolom.

Kalau nanti mau menjadikannya identitas sungguhan, yang dibutuhkan adalah
pembuktian: tanda tangan dari wallet itu atas handle-nya, atau verifikasi NIB /
NPWP oleh pihak yang berwenang. Itu pekerjaan lain, dan sengaja belum diklaim
di sini.

## Dua pengaman yang tetap ada

1. **Handle tidak bisa diambil alih.** Kalau `gayocoffee` sudah dipakai alamat
   lain, klaim ditolak dengan `409 HANDLE_TAKEN`. Alamat yang sama boleh
   mengganti nama sendiri, dan handle lamanya dilepas — satu alamat satu handle.
2. **Buku alamat tidak bisa diunduh utuh.** Pencarian di bawah 2 karakter
   ditolak (`422 QUERY_TOO_SHORT`), dan hasil dibatasi 10. Daftar lengkapnya
   adalah daftar siapa saja yang memakai deployment ini, jadi tidak diberikan
   ke siapa pun yang bisa menjangkau gateway.

## Endpoint

Semuanya publik — tidak ada `INTERNAL_API_KEY` di sini, dan tidak boleh ada:
browser yang memanggilnya.

| Method | Path | Guna |
|---|---|---|
| `POST` | `/directory/claim` | Daftarkan / ganti handle untuk sebuah Smart Account |
| `GET` | `/directory/lookup?q=` | Cari handle atau nama perusahaan (min. 2 karakter) |
| `GET` | `/directory/resolve/:handle` | Resolusi persis, untuk handle yang diketik `@nama` |
| `GET` | `/directory/address/:address` | Handle yang sedang dipegang alamat ini, atau `null` |

Aturan handle: 2–32 karakter, huruf kecil / angka / `.` / `-` / `_`, dimulai
huruf atau angka.

## Deploy

Datanya file JSON, lokasinya `DIRECTORY_STORE_FILE` (default
`backend/data/directory.json`).

> **Di Railway ini harus di volume.** Disk-nya ephemeral: tanpa volume,
> setiap redeploy menghapus semua handle yang sudah didaftarkan orang. Sama
> Akun perusahaan memakai PostgreSQL; direktori alamat ini masih memakai file JSON.

## Tes

```bash
npm run test:directory          # 24 tes: klaim, tolak, rename, urutan hasil
```

Untuk mengujinya di browser tanpa RPC, kontrak, atau IPFS:

```bash
npm run directory-stub          # gateway isi direktori saja, di :4111, sudah ada 4 entri
cd frontend && VITE_ORACLE_API=http://localhost:4111 npm run dev
```

Skrip Playwright-nya ada di `scripts/test-support/directory-browser.mjs`
(15 pemeriksaan: klaim, penolakan handle terpakai, debounce, alamat tetap
terlihat, chip hilang saat ditimpa, lebar ponsel).
