# STERN Protocol — API Spec (Fase 0)

Status: **DRAFT — untuk sign-off Tim FE + Tim Blockchain**
Base URL (dev): `http://localhost:4000`
Base URL (staging): `https://stern-gateway.<domain>.com` — TBD

Dokumen ini adalah **interface freeze** untuk backend/oracle-gateway. Tim FE bisa mulai development dengan mock server yang meniru bentuk response di sini — begitu backend real siap, tinggal ganti base URL.

---

## Prinsip pembagian kerja: kapan FE panggil contract langsung vs lewat backend?

Ini yang paling sering bikin bingung, jadi eksplisit dari awal:

- **Transaksi yang dilakukan importer/exporter** (create escrow, raise dispute, claim refund) → **FE panggil smart contract langsung** lewat Particle AA SDK (`sendUserOperation`), disponsori Paymaster. Backend TIDAK jadi perantara transaksi ini.
- **Submission dari institusi verifier** (Sucofindo/shipping line/customs) → **lewat backend** (`oracle-gateway`), karena institusi ini pakai EOA yang dikelola backend service, bukan wallet Particle di browser mereka (lihat `03_PARTICLE_INTEGRATION.md`).
- **Data read/query untuk UI** (daftar escrow, status timelock, riwayat aktivitas) → **lewat backend** sebagai indexer/cache, supaya FE gak perlu query RPC berkali-kali dan bisa gabungkan data on-chain + off-chain (nama institusi, dsb).
- **Upload file & hashing** (dokumen inspeksi, eBL, dsb) → **lewat backend** ke IPFS pinning service.
- **Klaim demo balance IDRT** → **lewat backend**, karena minting butuh `MINTER_ROLE` yang dipegang backend, bukan user.

---

## 1. Auth & session

### `POST /auth/session`

Dipanggil FE setelah user berhasil login via Particle (Google/Email/HP) dan Smart Account address sudah didapat. Backend pakai ini untuk registrasi/lookup user record (bukan untuk auth kontrak — kontrak tidak butuh session, `msg.sender` yang menentukan).

**Request**
```json
{
  "smartAccountAddress": "0xAbC123...",
  "eoaOwnerAddress": "0xDef456...",
  "authType": "google",
  "email": "buyer@example.com"
}
```

**Response `200`**
```json
{
  "userId": "usr_9f2a",
  "smartAccountAddress": "0xAbC123...",
  "role": "importer",
  "hasClaimedDemoBalance": false,
  "createdAt": "2026-08-29T10:00:00.000Z"
}
```

---

## 2. Demo balance (IDRT-demo)

### `POST /demo-balance/claim`

**Request**
```json
{ "smartAccountAddress": "0xAbC123..." }
```

**Response `200`**
```json
{
  "status": "minted",
  "amount": "150000000.00",
  "currency": "IDRT-demo",
  "transactionHash": "0x789...",
  "newBalance": "150000000.00"
}
```

**Response `409` (sudah pernah klaim)**
```json
{ "ok": false, "error": "Demo balance already claimed for this wallet." }
```

### `GET /demo-balance/:smartAccountAddress`

**Response `200`**
```json
{
  "smartAccountAddress": "0xAbC123...",
  "balance": "148500000.00",
  "currency": "IDRT-demo",
  "hasClaimed": true
}
```

---

## 3. Escrow registry (read model / indexer)

### `GET /escrows?role=importer&address=0xAbC123...`

Query param opsional: `role` (`importer`/`exporter`/`arbiter`), `address`, `state`.

**Response `200`**
```json
{
  "escrows": [
    {
      "escrowId": "12",
      "state": "Shipped",
      "commodity": "Arabica Gayo Grade 1",
      "containerRef": "TGHU-2026-001",
      "value": "45000000.00",
      "currency": "IDRT-demo",
      "importer": "0xAbC...",
      "exporter": "0xDef...",
      "arbiter": "0xGhi...",
      "globalDeadline": "2026-09-15T00:00:00.000Z",
      "createdAt": "2026-08-20T08:00:00.000Z"
    }
  ],
  "total": 1
}
```

### `GET /escrows/:escrowId`

**Response `200`**
```json
{
  "escrowId": "12",
  "state": "Shipped",
  "commodity": "Arabica Gayo Grade 1",
  "containerRef": "TGHU-2026-001",
  "value": "45000000.00",
  "currency": "IDRT-demo",
  "documentCid": "bafybeistern...",
  "importer": "0xAbC...",
  "exporter": "0xDef...",
  "arbiter": "0xGhi...",
  "globalDeadline": "2026-09-15T00:00:00.000Z",
  "createdAt": "2026-08-20T08:00:00.000Z",
  "milestones": {
    "inspected": {
      "submitted": true,
      "verifier": "0xSucofindo...",
      "verifierName": "Sucofindo",
      "proofCid": "bafybeiproof1...",
      "submittedAt": "2026-08-21T09:00:00.000Z",
      "challengeDeadline": "2026-08-21T15:00:00.000Z",
      "automatedCheckPassed": true
    },
    "shipped": {
      "submitted": true,
      "verifier": "0xLogistics...",
      "verifierName": "Maersk Line",
      "proofCid": "bafybeiproof2...",
      "submittedAt": "2026-08-23T14:00:00.000Z",
      "challengeDeadline": "2026-08-23T20:00:00.000Z",
      "automatedCheckPassed": true
    },
    "arrivedCleared": {
      "submitted": false,
      "verifier": null,
      "proofCid": null,
      "submittedAt": null,
      "challengeDeadline": null,
      "automatedCheckPassed": null
    }
  },
  "timelock": {
    "active": false,
    "releaseAt": null
  },
  "dispute": {
    "open": false
  }
}
```

### `GET /escrows/:escrowId/timelock`

Endpoint ringkas khusus buat FE nampilin countdown tanpa fetch seluruh escrow object.

**Response `200`**
```json
{
  "escrowId": "12",
  "state": "TimelockActive",
  "timelockReleaseAt": "2026-08-25T14:00:00.000Z",
  "canDispute": true,
  "canRelease": false,
  "secondsRemaining": 43200
}
```

### `GET /escrows/:escrowId/activity`

Riwayat aktivitas gabungan on-chain event + metadata off-chain (nama institusi, dsb), buat activity log di UI.

**Response `200`**
```json
{
  "escrowId": "12",
  "activity": [
    {
      "time": "2026-08-21T09:00:00.000Z",
      "type": "milestone_verified",
      "actor": "Sucofindo",
      "actorAddress": "0xSucofindo...",
      "text": "Inspected milestone verified, proof uploaded",
      "transactionHash": "0xabc..."
    },
    {
      "time": "2026-08-20T08:00:00.000Z",
      "type": "escrow_created",
      "actor": "importer",
      "actorAddress": "0xAbC...",
      "text": "Escrow created, 45,000,000 IDRT-demo locked",
      "transactionHash": "0xdef..."
    }
  ]
}
```

---

## 4. Milestone proof (verifier institusi)

### `POST /milestones/:escrowId/upload`

Upload file bukti (PDF sertifikat/eBL) ke IPFS, dapetin CID. Dipanggil sebelum submit proof.

**Request**: `multipart/form-data`, field `file`

**Response `200`**
```json
{
  "cid": "bafybeiproof3...",
  "fileName": "inspection-certificate.pdf",
  "size": 245678,
  "sha256": "a1b2c3..."
}
```

### `POST /milestones/:escrowId/submit`

Dipanggil oleh institusi verifier (via portal/app khusus institusi, bukan wallet importer/exporter). Backend yang menandatangani & mengirim transaksi on-chain atas nama wallet institusi (EOA yang dikelola backend), setelah validasi automated gate.

**Request**
```json
{
  "milestone": "inspected",
  "proofCid": "bafybeiproof3...",
  "verifierAddress": "0xSucofindo...",
  "overrides": {
    "vgm_match": true,
    "gate_in_status": "confirmed"
  }
}
```

**Response `200` (sukses, automated check pass)**
```json
{
  "status": "verified",
  "milestone": "inspected",
  "automatedCheck": {
    "source": "vgm-mock",
    "passed": true,
    "payload": { "vgm_kg": 24000, "expected_vgm_kg": 24000, "gate_in_status": "confirmed" }
  },
  "transactionHash": "0xabc...",
  "challengeDeadline": "2026-08-21T15:00:00.000Z"
}
```

**Response `422` (automated check gagal, proof ditolak sebelum on-chain)**
```json
{
  "status": "rejected",
  "milestone": "inspected",
  "automatedCheck": {
    "source": "vgm-mock",
    "passed": false,
    "reason": "VGM mismatch: actual 23500kg vs expected 24000kg"
  }
}
```

**Response `403` (wallet tidak punya role sesuai)**
```json
{ "ok": false, "error": "Verifier address does not hold ROLE_QUALITY_AUDITOR for this network." }
```

---

## 5. Dispute

### `POST /escrows/:escrowId/dispute`

Endpoint bantu untuk hitung bond amount & siapkan calldata — **transaksi aktual tetap dikirim FE langsung ke kontrak** lewat Particle AA (lihat prinsip di atas). Endpoint ini dipakai FE sebelum mengirim tx, biar tau nominal bond yang harus di-approve.

**Request**
```json
{ "contestedMilestone": "shipped" }
```

**Response `200`**
```json
{
  "escrowId": "12",
  "disputeBondAmount": "900000.00",
  "currency": "IDRT-demo",
  "contestedMilestone": "shipped",
  "windowStillOpen": true,
  "challengeDeadline": "2026-08-23T20:00:00.000Z"
}
```

### `GET /escrows/:escrowId/dispute`

**Response `200`**
```json
{
  "escrowId": "12",
  "open": true,
  "raisedBy": "0xAbC...",
  "contestedMilestone": "shipped",
  "bondAmount": "900000.00",
  "raisedAt": "2026-08-23T18:00:00.000Z",
  "resolved": false
}
```

---

## 6. Oracle / verifier registry

### `GET /verifiers`

Daftar institusi verifier yang punya role, buat panel "consortium" di UI (mirip `CONSORTIUM` di lib lama, tapi sekarang per-role bukan per-check).

**Response `200`**
```json
{
  "verifiers": [
    {
      "address": "0xSucofindo...",
      "name": "Sucofindo",
      "role": "ROLE_QUALITY_AUDITOR",
      "bond": "10000000.00",
      "slashCount": 0,
      "active": true
    },
    {
      "address": "0xMaersk...",
      "name": "Maersk Line",
      "role": "ROLE_LOGISTICS",
      "bond": "10000000.00",
      "slashCount": 1,
      "active": true
    }
  ]
}
```

---

## 7. Health & status

### `GET /health`

```json
{
  "ok": true,
  "service": "stern-oracle-gateway",
  "network": "amoy",
  "contractAddress": "0x...",
  "idrtTokenAddress": "0x...",
  "timestamp": "2026-08-29T10:00:00.000Z"
}
```

---

## 8. Error format standar

Semua endpoint yang gagal mengikuti bentuk ini konsisten (biar FE cukup satu error handler):

```json
{
  "ok": false,
  "error": "Human-readable message here",
  "code": "MACHINE_READABLE_CODE"
}
```

Daftar `code` yang perlu di-handle FE secara khusus (bukan cuma tampilkan generic error):

| Code | Kapan muncul | Saran UI |
|---|---|---|
| `DEMO_BALANCE_ALREADY_CLAIMED` | Klaim ulang demo balance | Tampilkan saldo saat ini, sembunyikan tombol klaim |
| `VERIFIER_ROLE_MISMATCH` | Institusi submit proof tanpa role sesuai | Pesan jelas: "Wallet ini belum terdaftar sebagai verifier untuk milestone ini" |
| `AUTOMATED_CHECK_FAILED` | Data feed tidak match | Tampilkan detail mismatch dari `automatedCheck.reason` |
| `CHALLENGE_WINDOW_CLOSED` | Dispute diajukan setelah window lewat | Arahkan ke dispute umum di TimelockActive (jika masih memungkinkan) |
| `TIMELOCK_NOT_ELAPSED` | `releasePayment` dipanggil terlalu awal | Tampilkan countdown, disable tombol sampai waktunya |

---

## 9. Keputusan terbuka

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Apakah `/escrows` pakai pagination (cursor/offset)? Perlu jika escrow makin banyak | _TBD_ |
| 2 | Apakah indexer pakai polling RPC atau event listener persistent (mis. via The Graph subgraph)? | _TBD, rekomendasi: event listener + DB cache untuk MVP_ |
| 3 | Format upload file — batas ukuran max, tipe file yang diterima? | _TBD, sarankan PDF/JPG/PNG, max 10MB_ |
| 4 | IPFS pinning service pilihan (web3.storage, Pinata, dsb)? | _TBD_ |

---

## Change log

| Tanggal | Perubahan | Oleh |
|---|---|---|
| 2026-08-29 | Draft awal API spec Fase 0 | — |
