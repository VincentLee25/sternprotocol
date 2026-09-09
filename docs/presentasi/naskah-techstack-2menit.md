# Naskah: Tech Stack — maksimal 2 menit

Untuk dibawakan di **slide 10 (Arsitektur)**, lanjut ke **slide 11 (bahasa)** saat menyebut
Solidity dan JavaScript.

Panjang naskah ± 230 kata. Dibaca dengan tempo presentasi yang nyaman — bukan tempo
membaca — keluarnya sekitar **1 menit 55 detik**. Sisanya sengaja dibiarkan kosong; di
panggung orang selalu bicara lebih lambat daripada saat latihan.

Tanda waktu di kiri adalah patokan, bukan target. Kalau di 1:00 Anda masih di bagian
gerbang oracle, percepat — jangan potong bagian kejujuran di akhir.

---

## Naskah

**[0:00]**

> Empat lapis. Dan yang paling bawah yang menentukan segalanya.

*(jeda sebentar — biarkan diagram di layar terbaca)*

**[0:10]**

> Bahasanya dua saja. **Solidity** untuk kontrak — sekitar delapan ratus baris, dan itu
> satu-satunya tempat aturan uang ditulis. **JavaScript** untuk sisanya: gerbang oracle
> dan antarmuka. Totalnya sekitar sebelas ribu baris.

**[0:30]**

> Lapis paling bawah, kontrak pintar di Polygon. Di sinilah dana dikunci.
>
> Bagian yang paling rawan — kontrol peran, penjagaan reentrancy, pemindahan token — tidak
> kami tulis sendiri. Kami pakai OpenZeppelin, pustaka yang sudah diaudit banyak pihak.

**[0:52]**

> Di atasnya, gerbang oracle. Node.js. Tugasnya membaca sumber data, memutuskan lolos atau
> tidak, lalu menandatangani bukti. Kunci verifikator ada di server, tidak pernah di
> peramban.

**[1:08]**

> Lalu lapis yang membuat ini bisa dipakai orang biasa: dompet. Standarnya ERC-4337.
>
> Pengguna masuk dengan akun Google — atau email, nomor telepon, X — dan dompetnya
> terbentuk sendiri. Tidak ada frasa pemulihan yang harus dicatat, dan biaya gas ditalangi.
> Pengguna tidak perlu memiliki kripto sama sekali.

**[1:32]**

> Paling atas, antarmuka. React dan Vite.

**[1:38]**

> Satu hal yang perlu saya sebut sendiri: ini berjalan di jaringan uji. Yang berpindah
> token demo, bukan rupiah. Dan kelima sumber data — VGM, AIS, CEISA, inspeksi, IPFS —
> masih simulasi. Bentuk panggilannya sudah sama dengan sambungan sungguhan, tapi
> sambungannya belum ada.

**[1:55]**

> Kalau ada satu hal yang perlu diingat dari bagian ini: tampilan boleh diganti, gerbang
> boleh diganti — tapi aturan uangnya ada di lapis paling bawah, dan itu tidak bisa diubah
> diam-diam oleh siapa pun.

---

## Versi 45 detik

Kalau waktu dipotong atau sesi sudah molor, pakai ini. Bukan versi terburu-buru dari yang
di atas — memang naskah yang berbeda.

> Dua bahasa. Solidity untuk kontrak, JavaScript untuk gerbang oracle dan antarmuka.
>
> Yang penting cuma satu: aturan uang ada di kontrak, di Polygon, dan bagian paling
> rawannya memakai OpenZeppelin — pustaka yang sudah diaudit banyak pihak, bukan tulisan
> kami sendiri.
>
> Di atasnya ada dompet berstandar ERC-4337, supaya pengguna cukup masuk dengan akun
> Google dan tidak perlu memiliki kripto sama sekali.
>
> Ini masih di jaringan uji, dan sumber datanya masih simulasi. Saya sebutkan itu sekarang
> supaya tidak ada salah paham nanti.

---

## Catatan membawakan

**Jangan menyebut versi.** Tidak ada yang peduli React 18 atau Vite 5. Kalau ada yang
bertanya, jawabannya ada di `catatan-teknis-presentasi.md`.

**Kalimat OpenZeppelin itu penting, jangan dilewati.** Ini bagian dari naskah yang paling
mungkin menjawab kekhawatiran juri sebelum sempat ditanyakan. "Bagian paling rawan tidak
kami tulis sendiri" jauh lebih kuat daripada mengklaim kode Anda aman.

**Bagian [1:38] jangan dipercepat dan jangan diperhalus.** Menyebut batas sendiri di
tengah penjelasan teknis membuat semua klaim sebelumnya terdengar lebih dapat dipercaya.
Kalau Anda melewatinya dan seseorang menemukannya sendiri, seluruh bagian ini jadi
terdengar seperti jualan.

**Angka yang boleh disebut, karena dihitung dari repositori:** 800 baris Solidity, 11.000
baris total. Kalau ditanya dari mana, katakan apa adanya — dihitung dari kode, bukan
perkiraan.

**Kalau ditanya "kenapa blockchain, kenapa bukan basis data biasa?"** — ini pertanyaan
yang hampir pasti datang setelah bagian ini. Jawabannya satu kalimat:

> Karena syaratnya adalah tidak ada satu pihak pun yang bisa mengubah aturan setelah dana
> masuk — termasuk kami. Basis data selalu punya administrator. Kontrak tidak.
