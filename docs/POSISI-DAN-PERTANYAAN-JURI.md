# Masalah, Posisi, dan Pertanyaan yang Akan Datang

Lapis "kenapa", bukan lapis "bagaimana". Untuk sisi teknis lihat
[`TANYA-JAWAB-TEKNIS-JURI.md`](TANYA-JAWAB-TEKNIS-JURI.md).

> **Satu peringatan di depan.** Dokumen ini tidak memuat satu pun angka statistik
> perdagangan Indonesia, dan itu disengaja. Angka yang tidak bisa Anda sebut sumbernya
> adalah kewajiban di panggung, bukan aset — satu pertanyaan "dari mana angka itu?" yang
> tidak terjawab merusak seluruh presentasi. Bagian terakhir menjelaskan angka apa yang
> perlu Anda kumpulkan sendiri, dan Anda sudah punya alatnya: formulir yang beredar itu.

---

## 1. Masalah yang diselesaikan

### Rumusan satu kalimat

> Dalam perdagangan lintas negara, pihak yang mengirim barang lebih dulu dan pihak yang
> membayar lebih dulu sama-sama menanggung risiko yang tidak bisa mereka kendalikan — dan
> satu-satunya cara menghilangkannya hari ini adalah membayar bank untuk berdiri di
> tengah, dengan biaya dan waktu yang membuat eksportir kecil tidak ikut.

### Kenapa ini masalah struktural, bukan masalah teknologi

Eksportir dan importir yang belum saling kenal menghadapi apa yang secara klasik disebut
**masalah pertukaran serentak**: tidak ada yang mau bergerak duluan.

- Eksportir mengapalkan duluan → menanggung risiko gagal bayar, dan sengketa selesai di
  yurisdiksi asing yang tidak ia kenal
- Importir membayar duluan → menanggung risiko barang tidak datang, atau datang dengan
  mutu berbeda

Ini bukan masalah kurangnya kepercayaan pribadi. Bahkan dua pihak yang jujur pun
menghadapinya, karena yang kurang bukan niat baik melainkan **kepastian yang bisa
diperiksa keduanya pada waktu yang sama.**

### Kenapa jalan keluar yang ada sekarang tidak menyelesaikannya

| Jalan yang ada | Menyelesaikan? | Ongkosnya |
|---|---|---|
| **Letter of Credit** | Ya | Mahal di dua sisi, berbasis dokumen kertas, pembayaran tertahan lama, dan bank memeriksa **dokumen**, bukan barang |
| **Open Account** | Tidak | Cepat dan murah, tapi seluruh risiko pindah ke eksportir |
| **Escrow bank** | Sebagian | Bank tetap bisa menahan atas pertimbangannya sendiri, dan aturannya ada di dokumen internal mereka |
| **Pembayaran di muka sebagian** | Sebagian | Membagi risiko, tidak menghilangkannya — dan tetap butuh kepercayaan |

Poin yang paling tajam, dan paling jarang disebut orang: **L/C memeriksa dokumen, bukan
barang.** Bank membayar ketika berkasnya lengkap dan konsisten. Kalau dokumennya rapi
tetapi kontainernya kosong, L/C tetap membayar. Itu bukan cacat pelaksanaan — memang
begitu desainnya, karena bank tidak berada di pelabuhan.

Itulah celah yang diisi STERN.

---

## 2. Apa yang berbeda dari yang kami bangun

### Perbedaan intinya, satu kalimat

> L/C melepas dana ketika **dokumennya** cocok. STERN melepas dana ketika **kejadiannya**
> terverifikasi — oleh tiga lembaga berbeda yang masing-masing menyatakan fakta berbeda,
> dan tidak ada satu pun yang bisa menyatakan fakta milik yang lain.

### Empat hal yang benar-benar berbeda

**1. Aturannya bisa dibaca, bukan dijanjikan.**
Syarat pelepasan dana ada di kontrak yang bisa dibaca siapa pun, baris demi baris, sebelum
menandatangani apa pun. Ketentuan L/C ada di dokumen bank dan tafsirnya ada pada bank.

**2. Tidak ada satu pihak pun yang memegang kunci — termasuk kami.**
Dana dikunci kontrak. Gerbang oracle kami tidak bisa memindahkannya; ia hanya menaruh
bukti dan menyiapkan calldata. Ini bisa dibuktikan, bukan cuma dijanjikan: kalau server
kami mati hari ini, dana tetap terkunci dan importir tetap bisa menariknya kembali setelah
tenggat.

**3. Verifikasi tersebar, bukan terpusat.**
Tiga peran terpisah — mutu, logistik, kepabeanan — dan pemisahannya ditegakkan kontrak,
bukan kebiasaan kode. Untuk memalsukan satu pembayaran, tiga lembaga yang tidak saling
berhubungan harus berbohong tentang tiga hal berbeda pada saat yang sama. Dan verifikator
menaruh jaminan yang dipotong kalau terbukti salah, jadi kejujuran punya harga yang
ditagih otomatis.

**4. Kedua pihak melihat hal yang sama, pada saat yang sama.**
Tidak ada lagi dua versi cerita. Bukti bertanda waktu, dan sumbernya satu.

### Yang membuatnya bisa dipakai orang biasa

Ini bagian yang paling sering diremehkan, padahal paling menentukan apakah ini produk atau
demonstrasi teknologi:

- Masuk dengan akun Google, email, nomor telepon, atau X
- Dompet terbentuk sendiri — tidak ada frasa pemulihan untuk dicatat dan dihilangkan
- Biaya gas ditalangi; pengguna tidak perlu memiliki kripto apa pun
- Nilai kontrak dalam rupiah dan sen, bukan dalam pecahan 18 digit

Eksportir kopi di Gayo tidak perlu tahu apa itu blockchain untuk memakainya. Itu syarat,
bukan bonus.

---

## 3. Yang HARUS Anda akui sendiri

Ini yang membedakan presentasi yang dipercaya dari yang tidak. Sebutkan sebelum ditanya.

**Escrow bukan ide baru.** Yang kami klaim baru adalah kombinasinya: escrow yang dipicu
verifikasi multi-pihak atas kejadian fisik, dengan verifikator yang menanggung jaminan, di
atas rantai publik, dengan pengalaman masuk tanpa dompet kripto.

**Kami belum tersambung ke sumber data sungguhan.** VGM, AIS, CEISA, inspeksi — kelimanya
masih simulasi yang dapat dikendalikan. Bentuk panggilannya sudah sama, sambungannya
belum. Yang bisa kami peragakan hari ini adalah **mesinnya**, dan justru itu yang paling
sulit.

**Ini token demo di jaringan uji, bukan rupiah.**

**Kontraknya belum diaudit pihak ketiga.** Bagian paling rawan memakai OpenZeppelin yang
sudah diaudit luas, dan ada fungsi `pause` untuk keadaan darurat. Tapi kontrak kami sendiri
belum.

**Kami belum menyelesaikan satu pengapalan sungguhan pun.**

Kalimat yang bisa dipakai:

> Kalau ada satu hal yang ingin saya sampaikan sendiri sebelum ditanya: yang bekerja hari
> ini adalah mesinnya, bukan sambungannya. Kami sengaja membangun bagian yang paling sulit
> lebih dulu — logika yang menentukan kapan dana boleh bergerak — karena menyambungkan API
> adalah pekerjaan yang jelas, sedangkan mesin yang salah tidak bisa diperbaiki dengan API
> yang benar.

---

## 4. Pertanyaan yang akan datang, dan jawabannya

### A. Pertanyaan pembunuh

**"Banyak proyek trade finance berbasis blockchain sudah gagal dan tutup. Kenapa kalian
akan berbeda?"**

Ini pertanyaan paling berbahaya, dan paling mungkin datang dari juri yang paham industri.
Jangan mengelak.

> Betul, dan menurut kami sebabnya sama: proyek-proyek itu menuntut **seluruh industri
> bergabung dulu** sebelum ada nilai bagi siapa pun. Kalau bank, pelayaran, dan bea cukai
> belum semuanya ikut, jaringannya tidak berguna.
>
> Kami mengambil arah sebaliknya. Satu pasang eksportir–importir bisa memakai ini hari ini
> tanpa siapa pun lagi ikut serta. Verifikator bisa satu surveyor independen. Nilainya ada
> di pengapalan pertama, bukan setelah dua puluh institusi menandatangani nota kesepahaman.

> **Cek dulu sebelum menyebut nama.** Kalau Anda ingin menyebut contoh spesifik, pastikan
> statusnya sendiri lebih dulu — status proyek berubah, dan salah menyebut sesuatu sudah
> tutup padahal masih jalan akan langsung dikoreksi juri.

**"Kenapa blockchain? Kenapa tidak basis data biasa saja?"**

> Karena syarat utamanya adalah tidak ada satu pihak pun yang bisa mengubah aturan setelah
> dana masuk — termasuk kami. Basis data selalu punya administrator. Kontrak tidak.
>
> Kalau ada pihak yang keduanya percaya sepenuhnya, basis data memang cukup. Masalahnya,
> pihak seperti itulah yang selama ini bernama bank, dan biayanya yang membuat eksportir
> kecil tidak ikut.

**"Kalau oracle-nya berbohong, blockchain jadi tidak ada gunanya, kan?"**

> Benar, dan itu sebabnya oracle bukan satu pihak. Tiga lembaga menyatakan tiga fakta
> berbeda, dan tidak ada yang bisa menyatakan fakta milik yang lain — itu ditegakkan
> kontrak. Masing-masing juga menaruh jaminan yang dipotong 50% kalau arbiter memutuskan
> buktinya salah, dengan 70% mengalir ke pihak yang dirugikan. Tiga kali salah, perannya
> dicabut permanen.
>
> Kami tidak menghilangkan masalah oracle. Kami membuatnya mahal.

**"Regulasinya bagaimana? Bank Indonesia mengizinkan ini?"**

> Yang berpindah di prototipe ini token demo di jaringan uji, jadi belum menyentuh ranah
> regulasi pembayaran. Untuk penerapan sungguhan, mata uangnya harus rupiah digital yang
> diakui — dan itu ada di peta jalan kami sebagai hal yang bergantung regulasi, bukan
> sesuatu yang kami klaim bisa selesaikan sendiri.
>
> Justru itu salah satu alasan kami membawanya ke sini.

Jangan pernah mengaku sudah memenuhi ketentuan apa pun. Anda tidak tahu, dan mereka tahu.

### B. Pertanyaan soal pasar

**"Siapa pengguna pertama kalian?"**

Jawaban terkuat menyempit, bukan melebar. Satu koridor komoditas, satu jenis pembeli. Kalau
belum ditentukan, katakan itu sedang dicari lewat data yang sedang dikumpulkan — jauh lebih
baik daripada menjawab "semua eksportir Indonesia".

**"Kenapa eksportir mau ganti dari cara yang sudah jalan?"**

> Yang sudah jalan itu bukan L/C bagi mereka — kebanyakan eksportir kecil tidak sanggup
> pakai L/C. Yang mereka pakai adalah pembayaran di muka sebagian, dan menanggung sisanya
> sebagai risiko. Kami tidak mengajak mereka pindah dari L/C; kami mengajak mereka pindah
> dari menanggung risiko sendirian.

**"Model bisnisnya apa?"**

Kalau belum ada, katakan belum ada. Yang tidak boleh: mengarang persentase di tempat.
Arah yang masuk akal: biaya per kontrak yang jauh di bawah biaya L/C, atau biaya untuk
verifikator institusi. Sebut sebagai arah, bukan sebagai keputusan.

**"Siapa yang mau jadi verifikator, dan kenapa?"**

> Surveyor independen sudah melakukan pekerjaan ini hari ini dan dibayar untuk itu. Yang
> kami tambahkan adalah tempat menaruh hasilnya yang tidak bisa disangkal belakangan. Bagi
> mereka ini saluran baru untuk jasa yang sudah mereka jual, bukan pekerjaan baru.

### C. Pertanyaan soal risiko

**"Kalau barangnya tiba tapi mutunya berbeda dari kontrak?"**

> Itu tepat kasus yang ditangani milestone pertama dan jendela sanggah. Inspeksi mutu
> terjadi sebelum barang berangkat, dan bukti apa pun bisa disanggah dalam jendelanya
> dengan menaruh jaminan. Yang tidak kami klaim: kami tidak bisa mendeteksi mutu yang
> berubah di tengah pelayaran — tidak ada sistem yang bisa, dan itu wilayah asuransi.

**"Kalau kedua pihak bersekongkol menipu pihak ketiga?"**

> Sistem ini melindungi eksportir dari importir dan sebaliknya. Ia tidak dirancang
> melindungi pihak di luar kontrak, dan kami tidak mengklaim begitu.

**"Kalau terjadi sengketa hukum sungguhan, pengadilan mana?"**

> Kontrak menyelesaikan sengketa soal **fakta** — apakah barang diperiksa, berangkat, dan
> masuk. Ia tidak menggantikan hukum untuk sengketa soal **maksud** dan penafsiran
> perjanjian. Yurisdiksi tetap perlu disepakati di kontrak dagangnya. Yang berkurang adalah
> berapa banyak hal yang harus diperkarakan.

Jawaban ini penting. Mengaku menggantikan sistem hukum akan langsung dianggap naif.

### D. Pertanyaan yang sebenarnya menguji kejujuran

**"Ini beneran jalan atau cuma tampilan?"**

Jangan dijawab dengan kata-kata. Buka PolygonScan dan tunjukkan transaksinya. Semua hash
dan alamat verifikator di layar sudah bisa diklik.

**"Ada yang sudah pakai?"**

> Belum. Kami sedang mengumpulkan data proses dari eksportir untuk memastikan alurnya cocok
> dengan cara kerja mereka yang sebenarnya sebelum meminta siapa pun memakainya.

**"Berapa lama kalian membuat ini?"**

Jawab apa adanya. Melebih-lebihkan mudah dicek dari repositori.

---

## 5. Angka yang masih perlu Anda kumpulkan

Presentasi ini akan jauh lebih kuat dengan lima angka yang bisa Anda sebut sumbernya —
dan formulir yang sedang Anda edarkan adalah tempat mendapatkannya:

1. **Berapa lama pembayaran tertahan** pada pengapalan terakhir responden
2. **Berapa persen yang pernah mengalami keterlambatan atau gagal bayar**
3. **Berapa yang benar-benar memakai L/C**, dan berapa yang tidak sanggup
4. **Berapa biaya yang mereka bayar** untuk pengamanan pembayaran hari ini
5. **Berapa lama sengketa terakhir** memakan waktu sampai selesai

Lima kalimat seperti *"dari 40 eksportir yang kami tanya, 31 tidak pernah memakai L/C, dan
alasan paling sering disebut adalah biaya"* bernilai lebih besar daripada statistik nasional
mana pun — karena itu data Anda sendiri, tidak ada yang bisa membantahnya, dan menunjukkan
Anda benar-benar berbicara dengan calon penggunanya.

**Jangan memakai angka yang tidak bisa Anda sebut sumbernya.** Satu pertanyaan "dari mana
angka itu?" yang tidak terjawab menghapus kepercayaan pada seluruh sisa presentasi.

---

## 6. Yang harus dihindari di panggung

| Jangan | Karena |
|---|---|
| "Kami menghilangkan kebutuhan akan bank" | Tidak benar, dan terdengar naif |
| "Sudah tersambung ke Bea Cukai" | Tidak benar. Satu klaim palsu meruntuhkan yang lain |
| "Blockchain menjamin barangnya asli" | Tidak. Ia menjamin buktinya tidak bisa diubah belakangan |
| "Ini menggantikan L/C" | Untuk pengguna yang mampu pakai L/C, belum. Posisinya di bawah itu |
| "Sistem kami tidak bisa diretas" | Jangan pernah |
| Angka tanpa sumber | Satu pertanyaan susulan menghancurkannya |
| Menghindari pertanyaan sulit | Juri yang bertanya sudah tahu jawabannya |

---

## 7. Kalimat penutup

Kalau hanya satu kalimat yang diingat orang dari presentasi Anda, buat kalimat ini:

> **Dana dilepas oleh bukti, bukan oleh janji.**

Dan untuk penutup yang meminta sesuatu — minta yang kecil dan masuk akal. Bukan komitmen
pemakaian, melainkan satu jam waktu mereka untuk menunjukkan di mana alur ini tidak cocok
dengan cara kerja mereka yang sebenarnya. Permintaan itu hampir selalu diterima, dan
jawabannya adalah bahan paling berharga yang bisa Anda bawa pulang.
