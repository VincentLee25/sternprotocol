# STERN Protocol — Particle Network Integration Spec (Fase 0)

Status: **DRAFT — untuk sign-off kedua tim**

Dokumen ini eksplisit menjawab: **siapa kerjain apa** soal Particle Network. Ini paling sering bikin bentrok karena sebagian besar Particle itu kerjaan FE murni, bukan backend — kalau gak dituliskan, gampang salah asumsi.

---

## 1. Tiga komponen Particle yang dipakai

| Komponen | Fungsi | Siapa pegang |
|---|---|---|
| **Auth Core** (social login) | Google/Email/No HP login, wallet muncul otomatis | **Tim FE** — full client-side SDK |
| **Smart Account / AA (ERC-4337)** | Wallet abstraksi di belakang login sosial, jadi `msg.sender` yang sama fungsinya dengan EOA biasa | **Tim FE** — SDK client-side, address-nya langsung dipakai kontrak tanpa kontrak perlu tau bedanya |
| **Paymaster** | Sponsor gas (POL) supaya user gak perlu punya POL sama sekali | **Konfigurasi: Tim Blockchain/infra** (setup policy + top-up saldo di dashboard). **Trigger per transaksi: Tim FE** (attach paymaster context tiap `sendUserOperation`) |

**Poin penting**: login, wallet creation, dan pengiriman transaksi (create escrow, raise dispute, claim refund) semuanya **client-side di FE**, langsung ke smart contract. Backend/`oracle-gateway` **tidak** jadi perantara untuk transaksi importer/exporter — backend cuma jadi perantara untuk institusi verifier (lihat §4).

---

## 2. Siapa pakai Particle, siapa tidak

| Aktor | Tipe wallet | Kenapa |
|---|---|---|
| Importer (buyer) | Particle Smart Account (login via Google/Email/HP) | Target UX utama — gak perlu paham private key/seed phrase |
| Exporter (seller) | Particle Smart Account | Sama |
| Institusi verifier (Sucofindo, shipping line, customs broker) | **EOA biasa**, dikelola backend | Signature verification jadi standar `ecrecover`, gak perlu handle ERC-1271 untuk smart contract wallet. Institusi ini juga butuh akuntabilitas kunci yang jelas — bukan wallet yang bisa direcover lewat email seperti user biasa. |
| Arbiter (penengah dispute) | Bisa Particle Smart Account **atau** EOA, tergantung siapa arbiternya | Kalau arbiter adalah institusi formal → EOA. Kalau arbiter adalah representative platform yang login biasa → Smart Account. **Perlu diputuskan per-deployment**, tidak fixed. |
| Admin multisig (role governance) | Gnosis Safe (EOA-based multisig) | Bukan Particle sama sekali — ini governance kontrak, out of scope Particle |

---

## 3. Tanggung jawab Tim FE

- [ ] Integrasi **Particle Connect Kit** (Auth Core + AA) — social login (Google/Email/No HP) menghasilkan Smart Account address
- [ ] Setup **Paymaster context** di setiap `sendUserOperation` — pastikan sponsor policy nempel di transaksi `createEscrow`, `raiseDispute`, `claimRefund`, `releasePayment` (dan `approve()`/`permit()` token IDRT-demo)
- [ ] Handle **UX approve token** sebelum `createEscrow` (2 tx flow) — atau kalau tim Blockchain pilih `permit()`, handle typed-data signature request dari Particle SDK
- [ ] Tampilkan status wallet: "Connected via Google (email@...)", bukan tampilkan address mentah sebagai identitas utama (lebih ramah non-teknis)
- [ ] Tombol "Claim Demo Balance" → panggil `POST /demo-balance/claim` (lihat `02_API_SPEC.md` §2)
- [ ] Handle error dari Paymaster (misal saldo POL sponsor habis) — tampilkan pesan jelas, bukan error teknis mentah
- [ ] Bangun UI 3-milestone (upload bukti per role, status signature per institusi), timelock countdown, tombol dispute per-milestone dan dispute umum
- [ ] Develop pakai mock server yang response-nya persis `02_API_SPEC.md` sebelum backend real siap

---

## 4. Tanggung jawab Tim Blockchain/Infra

- [ ] Buat **Particle Project** di dashboard, dapatkan Project ID + Client Key + App ID untuk FE
- [ ] Setup **Paymaster policy**: allow-list method yang disponsori (`createEscrow`, `raiseDispute`, `claimRefund`, `releasePayment`, `approve`/`permit` pada token IDRT-demo) — **jangan sponsor semua method sembarangan**, supaya gak ada yang bisa drain saldo paymaster lewat method lain
- [ ] Top-up saldo **POL Amoy testnet** di dashboard Paymaster secara berkala
- [ ] Setup **rate limit** di level paymaster policy (per-user, per-jam) untuk cegah abuse — testnet tapi tetap perlu batas biar gak ada satu wallet spam transaksi gratis
- [ ] Deploy kontrak `IDRTDemo` (ERC20 mintable), pegang `MINTER_ROLE` di backend service wallet
- [ ] Deploy kontrak `SternEscrow` sesuai `01_CONTRACT_SPEC.md`, publish ABI final ke FE
- [ ] Bangun/upgrade `oracle-gateway`: endpoint upload IPFS, endpoint submit proof per role, endpoint demo balance, endpoint read model/indexer
- [ ] Kelola EOA institusi verifier (key management — idealnya pakai KMS/HSM, bukan `.env` plaintext untuk versi production nanti, meski untuk testnet demo `.env` boleh dulu)
- [ ] Setup Gnosis Safe multisig untuk `DEFAULT_ADMIN_ROLE`

---

## 5. Alur teknis: dari login sampai transaksi tereksekusi

1. User klik "Login with Google" → Particle Auth Core buka popup OAuth → dapat auth token
2. Particle AA SDK bikin/lookup Smart Account address terkait auth token itu (deterministic, sama tiap login)
3. FE panggil `POST /auth/session` (lihat `02_API_SPEC.md` §1) untuk registrasi/lookup user di backend kita sendiri (bukan Particle)
4. User klik "Claim Demo Balance" → FE panggil `POST /demo-balance/claim` → backend mint IDRT-demo ke Smart Account address user
5. User isi form "New Escrow" → FE minta signature `approve()`/`permit()` (Particle SDK handle popup konfirmasi) → FE kirim `createEscrow` sebagai UserOperation dengan Paymaster context → Particle Bundler relay ke chain, Paymaster (saldo POL kita) yang bayar gas → tx settle, event `EscrowCreated` muncul
6. Institusi verifier (via portal terpisah, bukan Particle) submit proof → **lewat backend** (`POST /milestones/:escrowId/submit`) → backend validasi automated gate → backend sign & kirim tx pakai EOA institusi (native gas dibayar backend, bukan lewat Paymaster Particle karena ini bukan UserOperation ERC-4337)

---

## 6. Environment variables yang dibutuhkan

**Frontend (`.env`)**
```
VITE_PARTICLE_PROJECT_ID=
VITE_PARTICLE_CLIENT_KEY=
VITE_PARTICLE_APP_ID=
VITE_CONTRACT_ADDRESS=
VITE_IDRT_TOKEN_ADDRESS=
VITE_ORACLE_API=
VITE_CHAIN_ID=80002
```

**Backend/oracle-gateway (`.env`)**
```
RPC_URL=
CONTRACT_ADDRESS=
IDRT_TOKEN_ADDRESS=
MINTER_PRIVATE_KEY=            # untuk mint demo balance
VERIFIER_PRIVATE_KEYS=          # comma-separated EOA institusi (Sucofindo, logistics, customs)
IPFS_PINNING_API_KEY=
PARTICLE_PAYMASTER_API_KEY=     # jika backend perlu query status paymaster
```

---

## 7. Checklist keamanan minimum sebelum go-live testnet publik

- [ ] Paymaster policy method allow-list sudah diverifikasi tidak bisa dipanggil untuk drain saldo (misal lewat fallback function)
- [ ] Rate limit klaim demo balance per wallet (sekali) DAN per IP/device (cegah sybil farming banyak akun Google buat klaim berkali-kali)
- [ ] `VERIFIER_PRIVATE_KEYS` tidak pernah ter-commit ke git, idealnya dari secret manager
- [ ] Multisig admin sudah live, bukan single EOA owner
- [ ] Monitoring saldo POL Paymaster + alert kalau mendekati habis

---

## 8. Keputusan terbuka

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Institusi verifier submit proof lewat portal terpisah atau reuse Particle login juga (tapi tetap map ke EOA di belakang)? | _TBD — rekomendasi Fase 0: portal terpisah sederhana, EOA murni_ |
| 2 | Arbiter pakai Particle atau EOA? | _TBD per-deployment_ |
| 3 | Paymaster: sponsor 100% gas selamanya, atau ada plan sponsor bertingkat (mis. gratis untuk N transaksi pertama)? | _TBD, untuk MVP: sponsor penuh_ |

---

## Change log

| Tanggal | Perubahan | Oleh |
|---|---|---|
| 2026-08-29 | Draft awal Particle integration spec Fase 0 | — |
