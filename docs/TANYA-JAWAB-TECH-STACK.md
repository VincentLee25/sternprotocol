# Tanya-Jawab Pilihan Teknologi

Pertanyaan tentang **kenapa memilih ini, bukan itu** — pertanyaan rekayasa, bukan
pertanyaan "apakah ini nyata".

Untuk yang kedua lihat [`TANYA-JAWAB-TEKNIS-JURI.md`](TANYA-JAWAB-TEKNIS-JURI.md).
Untuk naskah lisannya lihat
[`presentasi/naskah-techstack-2menit.md`](presentasi/naskah-techstack-2menit.md).

**Aturan menjawab pertanyaan jenis ini:** setiap pilihan teknologi harus dijelaskan dari
**masalah yang dipecahkannya**, bukan dari kelebihannya. Begitu Anda menyebut fitur tanpa
menyebut kenapa Anda membutuhkannya, Anda berpindah dari menjawab jadi memamerkan.

---

## A. Pilihan rantai dan bahasa

### "Kenapa Polygon? Kenapa tidak Ethereum, BSC, atau Solana?"

> Satu kontrak dagang menghasilkan banyak transaksi: kunci dana, tiga bukti milestone,
> mulai timelock, lepas dana — belum termasuk sengketa. Di Ethereum mainnet biayanya tidak
> masuk akal untuk pengapalan bernilai kecil, dan justru eksportir kecil yang jadi sasaran
> kami.
>
> Polygon setara EVM, jadi kontraknya bisa dipindahkan tanpa ditulis ulang, dan waktu
> bloknya sekitar dua detik. Solana lebih cepat lagi, tapi ekosistem account abstraction
> dan pustaka kontrak yang sudah teraudit ada di dunia EVM — dan itu yang lebih menentukan
> bagi kami daripada selisih kecepatan.

Kalau ditanya "kenapa tidak rantai privat / permissioned?":

> Karena seluruh argumen kami adalah tidak ada satu pihak pun yang bisa mengubah aturan —
> termasuk kami. Rantai privat punya pemilik. Begitu ada pemiliknya, kami cuma jadi bank
> versi baru dengan cerita yang lebih rumit.

### "Kenapa Solidity?"

> Untuk rantai EVM tidak ada pilihan lain yang praktis. Dan Solidity dipakai **hanya**
> untuk aturan uang — 790 baris. Semua yang lain di luar kontrak, karena kode di rantai
> itu mahal, tidak bisa diperbaiki, dan setiap baris tambahan adalah permukaan serangan
> tambahan.

### "Kenapa JavaScript untuk backend, bukan Go atau Rust?"

> Beban kerjanya bukan komputasi, tapi menunggu — memanggil RPC, memanggil sumber data,
> menunggu transaksi masuk blok. Di beban seperti itu perbedaan bahasa hampir tidak
> terasa.
>
> Yang lebih menentukan: pustaka Web3 paling matang ada di ekosistem JavaScript, dan satu
> bahasa untuk gerbang dan antarmuka berarti satu tim bisa mengerjakan keduanya. Untuk tim
> sebesar kami, itu bukan kenyamanan — itu syarat.

---

## B. Dompet dan account abstraction

### "Kenapa ERC-4337? Kenapa tidak MetaMask saja?"

Ini pertanyaan yang paling menguntungkan Anda. Jawab dari penggunanya:

> Karena penggunanya eksportir kopi, bukan pengguna kripto.
>
> Dengan MetaMask, orang harus memasang ekstensi, menyimpan dua belas kata frasa pemulihan,
> membeli MATIC di bursa hanya untuk membayar gas, dan memahami apa itu jaringan. Setiap
> langkah itu menggugurkan sebagian calon pengguna, dan di sasaran kami, gugurnya hampir
> semua.
>
> Dengan ERC-4337, mereka masuk pakai akun Google. Tidak ada frasa pemulihan, tidak perlu
> punya kripto, gasnya ditalangi. Kalau produknya menuntut orang belajar kripto dulu,
> produknya gagal — tidak peduli seberapa benar kontraknya.

### "Kenapa Safe, bukan implementasi smart account lain?"

> Safe adalah implementasi yang paling banyak dipakai dan didukung hampir semua bundler,
> jadi kami tidak terkunci pada satu penyedia. Dan alat pemulihan serta multisig-nya sudah
> ada — itu jalan yang wajar untuk akun perusahaan nanti.

### "Kalau Particle atau Pimlico mati, sistem kalian mati juga dong?"

Pertanyaan bagus, dan jawabannya harus jujur:

> Untuk transaksi baru, ya — pengguna tidak bisa menandatangani sampai penyedia
> penggantinya dipasang. Itu ketergantungan yang nyata, dan kami tidak menyangkalnya.
>
> Yang **tidak** ikut mati adalah dananya. Dana ada di kontrak, bukan di Particle maupun
> Pimlico. Kontraknya tetap bisa dipanggil oleh dompet mana pun, termasuk MetaMask biasa.
> Dan bundler ERC-4337 itu komoditas — bukan cuma Pimlico yang menyediakannya.
>
> Jadi risikonya adalah gangguan layanan, bukan hilangnya dana. Itu perbedaan yang menurut
> kami penting.

### "Kenapa EntryPoint 0.7?"

> Itu versi stabil yang didukung bundler yang kami pakai saat membangun.

Jangan mengarang alasan yang lebih dalam kalau memang itu alasannya.

---

## C. Arsitektur backend

### "Kenapa perlu backend? Bukannya blockchain itu maksudnya tanpa perantara?"

> Backend kami tidak berdiri di antara pengguna dan dananya — ia tidak bisa memindahkan
> uang siapa pun. Yang ia lakukan cuma dua: membaca sumber data lalu menandatangani bukti
> sebagai verifikator, dan menyusun data supaya antarmuka tidak perlu memindai rantai
> sendiri.
>
> Kunci verifikator ada di server justru karena **tidak boleh** ada di peramban. Kalau
> kunci itu ikut terkirim ke bundle, siapa pun bisa memalsukan bukti dari DevTools.

### "Kenapa antarmuka membaca lewat gerbang, bukan langsung dari rantai?"

> Peramban bisa saja membaca kontrak sendiri. Tapi gerbang mengerjakan hal-hal yang
> merepotkan di klien: memformat nilai sesuai desimal token, menerjemahkan angka status
> jadi nama, menggabungkan bukti, dan menyusun riwayat dari event. Satu tempat, satu
> bentuk, dipakai semua halaman.
>
> Yang penting: gerbang bukan sumber kebenaran. Ia membaca dari kontrak setiap kali. Kalau
> jawabannya berbeda dari rantai, yang benar rantai.

### "Data pengguna disimpan di mana?"

Ini titik lemah. Akui, jangan diperhalus:

> Di berkas JSON. Untuk MVP itu cukup, tapi jelas bukan bentuk yang benar untuk produksi —
> ia tidak bisa berjalan di banyak instance, dan butuh volume persisten supaya tidak hilang
> saat deploy ulang. Basis data sungguhan adalah salah satu hal pertama yang harus diganti.

### "Bagaimana kalau RPC-nya down?"

> Antarmuka gagal membaca dan menampilkan pesannya, tapi tidak ada state yang rusak — tidak
> ada yang di-cache untuk melenceng. Dana tetap terkunci, dan tenggat global tetap berjalan
> di rantai, jadi hak importir menarik dananya tidak hilang.

---

## D. Keamanan

### "Kontraknya sudah diaudit?"

> Belum oleh pihak ketiga, dan itu ada di daftar yang kami sebut sendiri sebagai belum ada.
>
> Yang bisa kami katakan: bagian paling rawan tidak kami tulis sendiri. Kontrol peran,
> penjagaan reentrancy, dan pemindahan token memakai OpenZeppelin apa adanya — pustaka yang
> sudah diaudit banyak pihak dan dipakai luas. Kontraknya juga punya `pause` untuk keadaan
> darurat, dan ada 19 uji otomatis yang menutup alur utamanya termasuk pembagian
> pemotongan 70/30 dan tepi jendela sanggah.
>
> Tapi audit tetap audit. Kami tidak akan memindahkan uang sungguhan sebelum ada.

### "Kalau ada bug di kontrak, bisa diperbaiki?"

Jawab jujur — ini konsekuensi desain yang nyata:

> Tidak. Kontrak ini tidak memakai pola proxy, jadi tidak bisa di-upgrade. Parameter seperti
> timelock dan jendela sanggah juga `immutable` — ditetapkan saat deploy dan tidak bisa
> diubah setelahnya.
>
> Itu pilihan yang disengaja: kontrak yang bisa diubah pemiliknya berarti ada pemilik yang
> bisa mengubah aturan setelah dana masuk, dan itu persis yang ingin kami hilangkan. Harganya
> adalah kalau ada bug, jalan keluarnya `pause` lalu deploy versi baru — bukan tambal di
> tempat.
>
> Untuk produksi, ini yang membuat audit jadi wajib, bukan opsional.

### "Siapa yang pegang admin key?"

> `DEFAULT_ADMIN_ROLE` bisa memberi dan mencabut peran verifikator, dan menjeda kontrak. Ia
> **tidak bisa** memindahkan dana escrow siapa pun — tidak ada fungsi seperti itu di
> kontrak. Untuk produksi peran itu seharusnya dipegang multisig, bukan satu dompet.

---

## E. Skalabilitas

### "Berapa banyak escrow yang bisa ditangani?"

Ini pertanyaan yang paling mudah dijawab dengan mengarang. Jangan.

> Kontraknya tidak punya batas — biayanya per transaksi, bukan per jumlah escrow.
>
> Yang jadi hambatan gerbang kami: untuk menampilkan daftar, ia memindai kontrak dari id 0
> sampai id terakhir, satu per satu. Itu O(n) per pemuatan halaman, dan jelas tidak akan
> sanggup untuk volume tinggi.
>
> Kami memilih itu dengan sadar untuk MVP: tidak ada indexer yang harus disinkronkan, tidak
> ada basis data yang bisa melenceng dari rantai. Untuk produksi, indexer event adalah hal
> pertama yang harus diganti, dan itu pekerjaan yang jelas — bukan masalah penelitian.

Kalau ditanya "sudah diuji beban?" — jawab **belum**, itu ada di daftar belum ada.

### "Kalau biaya gas naik?"

> Yang menanggung gas pengguna adalah paymaster, jadi kenaikan biaya jadi urusan model
> bisnis kami, bukan urusan pengguna. Di Polygon biayanya sangat kecil dibanding nilai
> kontrak dagang — tapi kami belum menghitungnya pada volume sungguhan, jadi saya tidak mau
> menyebut angka.

---

## F. Pengujian dan kualitas

### "Bagaimana kalian menguji ini?"

> Ada 19 uji otomatis untuk kontrak lewat Hardhat, dan yang diuji bukan cuma alur mulus:
> penolakan peran verifikator yang salah, urutan milestone yang dilompati, sengketa di luar
> jendela sanggah, pembagian pemotongan 70/30, sengketa yang dinilai mengada-ada, pencabutan
> peran otomatis setelah tiga kali salah, dan pengembalian dana lewat tenggat global.
>
> Untuk sisi identitas ada uji terpisah yang mencakup peran perusahaan dan MFA.
>
> Yang belum: uji end-to-end otomatis untuk antarmuka, dan uji beban.

### "Kenapa tidak pakai TypeScript?"

Kalau ini ditanya, jawab jujur dan singkat:

> Untuk ukuran tim dan waktu yang kami punya, itu pertukaran yang kami ambil. Untuk basis
> kode sebesar ini ke depan, TypeScript pilihan yang lebih tepat.

Jangan membela keputusan yang memang bisa diperdebatkan.

---

## G. Tiga hal yang jangan pernah diucapkan

| Jangan | Kenapa |
|---|---|
| "Sistem kami tidak bisa diretas" | Tidak ada yang bisa mengatakan itu |
| "Blockchain membuatnya otomatis aman" | Menunjukkan Anda tidak paham apa yang diamankan |
| Angka skalabilitas tanpa pengukuran | Satu pertanyaan susulan menghancurkannya |

---

## H. Pola menjawab yang berlaku untuk semuanya

Tiga langkah, dan urutannya penting:

1. **Sebut masalahnya dulu** — "penggunanya eksportir kopi, bukan pengguna kripto"
2. **Baru teknologinya** — "makanya ERC-4337, bukan MetaMask"
3. **Lalu batasnya, kalau ada** — "tapi itu membuat kami bergantung pada penyedia bundler"

Langkah ketiga yang membuat dua langkah pertama dipercaya. Jawaban yang tidak punya batas
sama sekali terdengar seperti brosur, dan juri yang berpengalaman akan mencari batas itu
sendiri — lebih baik Anda yang menyebutkannya.
