# Alur tes sengketa

Ada **dua** jalur sengketa di aplikasi ini, dan keduanya asli di blockchain.
Saya sebelumnya cuma menunjukkan yang sempit. Yang kedua jauh lebih longgar
dan itu yang sebaiknya Anda pakai untuk presentasi.

---

## Jalur B — pakai ini untuk demo

Sengketa atas escrow secara keseluruhan, diajukan saat fase timelock. Tidak
perlu fault simulation, tidak ada balapan 90 detik.

Masuk sebagai **importir atau eksportir** escrow itu. Pihak lain tidak bisa.

1. Buat escrow, lampirkan e-BL, kunci dananya.
2. Tekan **Verify milestones**. Satu tekan meng-commit satu milestone lalu
   berhenti. Ulangi sampai ketiganya COMMITTED. Tiap tekan perlu menunggu
   jendela milestone sebelumnya tutup.
3. Tunggu jendela milestone ketiga tutup juga. Kontrak mewajibkannya:

   ```solidity
   require(block.timestamp > escrow.proofs[Milestone.ArrivedCleared].challengeDeadline,
           "challenge window open");
   ```

4. Di rail kanan muncul tombol **Start timelock**. Tekan.
5. Sekarang tombol **Open dispute** hidup, dan berlaku **selama seluruh
   durasi timelock**, bukan 90 detik.
6. Tekan **Open dispute**. Jaminan terkunci, escrow jadi Disputed, dana beku.
7. Buka **ops console**, masuk dengan private key arbiter, putuskan
   sengketanya. Di situ uangnya benar-benar berpindah.

Berapa lama jendela Anda di langkah lima: buka escrow-nya, lihat Article I,
baris **Timelock**. Kalau masih nilai bawaan deploy, itu 24 jam.

Dasarnya di kontrak:

```solidity
require(escrow.state == State.TimelockActive, "general dispute only in timelock");
require(block.timestamp < escrow.timelockReleaseAt, "timelock elapsed");
```

---

## Jalur A — yang sempit, untuk memperlihatkan buktinya bertentangan

Sengketa atas **satu milestone tertentu**, hanya bisa di dalam jendela
tantangan milestone itu. Di deployment Anda jendelanya sekitar 90 detik.

Kelebihannya: inilah satu-satunya jalur yang memperlihatkan bukti yang sudah
tertulis di rantai berselisih dengan sumbernya. Kekurangannya: waktunya
sangat mepet.

Pakai escrow **baru** dan sengketakan milestone **pertama**, karena escrow
yang milestone-nya sudah lama ter-commit jendelanya sudah tutup.

1. Buat escrow baru, lampirkan e-BL, kunci dananya.
2. Buka escrow itu. Tekan **Verify milestones**. Cepat, karena cuma satu
   transaksi. Inspected jadi COMMITTED, Shipped bilang challenge window open.
   Itu normal.
3. Tekan **Make Inspected disagree**.
4. Tekan **Review dispute**.
5. Tekan **Lock bond & raise dispute**.

Langkah 3, 4 dan 5 harus beruntun tanpa berhenti. Dari selesai langkah 2
sampai selesai langkah 5 butuh sekitar 40 detik, dan Anda punya sekitar 75
detik. Cukup, tapi tidak ada waktu ragu.

Escrow baru selalu dimulai tanpa fault, karena fault disimpan per escrow.

### Kalau ingin jalur A jadi santai

Deploy ulang dengan jendela lebih panjang:

```
CHALLENGE_WINDOW_SECONDS=600
```

Nilai itu `immutable` di kontrak, jadi tidak ada cara mengubahnya tanpa
deploy ulang. Konsekuensinya rantai milestone butuh sepuluh menit
antar-milestone. Akali dengan menjalankan escrow pelunasan sebelum
presentasi, lalu di panggung tunjukkan hasilnya yang sudah matang.

---

## Beda keduanya, dan kapan menyebut yang mana

| | Jalur A | Jalur B |
| --- | --- | --- |
| Yang disengketakan | satu milestone | escrow secara keseluruhan |
| Jendelanya | jendela tantangan, ~90 detik | seluruh durasi timelock |
| Perlu fault simulation | ya | tidak |
| Memperlihatkan bukti bertentangan | ya | tidak |
| Tombolnya | Review dispute, di panel Evidence | Open dispute, di rail kanan |

Untuk juri, jalur B lebih mewakili kenyataan: importir yang tidak setuju
tidak perlu menunggu ada oracle yang salah, dia cukup menaruh jaminan dan
menyerahkan keputusan ke arbiter sebelum dana cair. Jalur A yang memperlihatkan
mekanisme buktinya.

Kalau punya waktu, tunjukkan keduanya. Kalau cuma satu, pakai B.

---

## Yang terjadi pada uang

Jaminan sengketa dihitung `contractValue * disputeBondBps / 10000`. Cek
nilainya sendiri di amoy.polygonscan.com, kontrak Anda, tab Read Contract,
fungsi `disputeBondBps`. Tiga ratus berarti tiga persen.

Arbiter punya empat keputusan yang bisa dikombinasikan:

- **releaseToExporter** — dana ke eksportir atau kembali ke importir.
- **bondFrivolous** — jaminan jatuh ke eksportir karena sengketanya dinilai
  asal-asalan. Kalau tidak, jaminan kembali ke yang mengajukan.
- **slashVerifier** — verifikator yang salah kehilangan lima puluh persen
  bond-nya, dibagi tujuh puluh ke importir dan tiga puluh ke kas.
- **reasoningCid** — alasan tertulis, wajib dan tidak boleh kosong.

Tiga kali di-slash, peran verifikator itu dicabut permanen oleh kontrak.
Jangan men-slash verifikator yang sama tiga kali saat menguji, karena
`postVerifierBond` mewajibkan peran yang sudah dicabut itu dan tidak bisa
memulihkannya.

## Satu catatan kecil yang salah di UI

Tabel izin di `EscrowDetail.jsx` memberi arbiter `dispute: true`, padahal
kontraknya hanya mengizinkan importir dan eksportir:

```solidity
require(msg.sender == escrow.importer || msg.sender == escrow.exporter, "not escrow party");
```

Jadi kalau arbiter menekan Open dispute, transaksinya akan ditolak kontrak.
Tidak berbahaya, tapi jangan dipakai saat demo.
