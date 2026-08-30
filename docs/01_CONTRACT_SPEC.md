# STERN Protocol — Contract Spec (Fase 0)

Status: **DRAFT — untuk sign-off Tim Blockchain**
Target network: Polygon Amoy testnet (chain ID 80002)
Solidity: ^0.8.20, pakai OpenZeppelin `AccessControl`, `Pausable`, `ReentrancyGuard`

Dokumen ini adalah **interface freeze**, bukan implementasi. Nama function/event/struct di sini final — kalau ada kebutuhan ubah, catat di change log paling bawah dan diskusikan dulu sebelum ubah di kode.

---

## 1. Ringkasan alur (state machine)

```
Created --(inspection gate)--> Inspected --(shipping gate)--> Shipped
  --(customs gate)--> ArrivedCleared --(challenge window lewat)--> TimelockActive
  --(24h lewat, no dispute)--> Completed

Dari state manapun (Created s.d. TimelockActive): Disputed -> Completed | Refunded
Dari state manapun sebelum Completed: jika globalDeadline lewat -> Refunded
```

Setiap transisi `Created -> Inspected -> Shipped -> ArrivedCleared` butuh **dua syarat sekaligus**:

1. **Automated gate**: data dari sumber independen (mock atau real API) match dalam toleransi yang ditentukan.
2. **Role gate**: wallet dengan role yang sesuai submit proof (hash SHA-256 dokumen di IPFS).

Setelah tiap milestone lolos, ada **challenge window** (default 6 jam) sebelum milestone berikutnya bisa disubmit — buyer/exporter bisa `raiseDispute()` khusus untuk milestone itu selama window ini.

---

## 2. Roles (`AccessControl`)

| Role constant | Dipegang oleh | Fungsi yang butuh role ini |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Multisig platform (Safe 2-of-3, bukan EOA tunggal) | `grantRole`, `revokeRole`, `pause`, `unpause` |
| `ROLE_QUALITY_AUDITOR` | Institusi surveyor asal (mis. Sucofindo) | `submitMilestoneProof(..., Milestone.Inspected, ...)` |
| `ROLE_LOGISTICS` | Shipping line / freight forwarder | `submitMilestoneProof(..., Milestone.Shipped, ...)` |
| `ROLE_CUSTOMS` | Customs broker / surveyor tujuan | `submitMilestoneProof(..., Milestone.ArrivedCleared, ...)` |
| `ROLE_KEEPER` (opsional) | Backend service / siapa saja | `releasePayment()` boleh dipanggil publik tanpa role — dicatat di sini biar jelas ini permissionless by design |

Catatan penting:
- Role di-grant **per wallet institusi**, bukan per-escrow. Satu institusi yang sudah punya role bisa jadi verifier di banyak escrow.
- Wallet pemegang role ini **EOA**, bukan Particle Smart Account. Lihat `03_PARTICLE_INTEGRATION.md` untuk alasannya.
- `grantRole`/`revokeRole` hanya callable lewat multisig — kalau Fase 1 belum sempat setup Safe, minimal dokumentasikan trust assumption sementara (siapa pegang admin key) dan jadwalkan migrasi ke multisig sebelum mainnet/nilai riil.

---

## 3. IDRT-Demo Token

Token stablecoin demo milik protokol sendiri (bukan mock USDT generik), dipakai sebagai unit pembayaran escrow.

```solidity
contract IDRTDemo is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 public constant DECIMALS = 2; // representasi Rupiah, 2 desimal

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE);
    function decimals() public pure override returns (uint8) { return DECIMALS; }
}
```

- `MINTER_ROLE` dipegang oleh backend service wallet (untuk fitur "Claim Demo Balance $10.000" — nominal disesuaikan jadi IDRT, misal Rp 150.000.000 demo balance).
- **Anti-abuse**: backend WAJIB cek `hasClaimed[address]` sebelum mint — satu wallet cuma bisa klaim sekali. Endpoint terkait ada di `02_API_SPEC.md` §2.2.
- Supply tidak dibatasi di level kontrak (ini token demo), tapi rate-limit klaim ada di level API/backend.
- `SternEscrow.createEscrow` akan `transferFrom` token ini, bukan native POL — jadi importer harus `approve()` dulu sebelum lock funds. **Ini penting untuk FE**: alur create escrow butuh 2 transaksi (approve + createEscrow), atau gunakan `permit()` (EIP-2612) kalau mau 1 transaksi — tim Blockchain putuskan salah satu dan catat di sini.

> **Keputusan terbuka**: approve+createEscrow (2 tx) vs EIP-2612 permit (1 tx, butuh signature typed-data dari FE). Direkomendasikan pakai `permit()` karena UX lebih mulus buat AA wallet — tapi perlu dikonfirmasi ERC20 permit kompatibel dengan Particle Smart Account signing flow sebelum dipilih final.

---

## 4. Struct & Enum

```solidity
enum Milestone { None, Inspected, Shipped, ArrivedCleared }

enum State {
    Created,
    Inspected,
    Shipped,
    ArrivedCleared,
    TimelockActive,
    Disputed,
    Completed,
    Refunded
}

struct MilestoneProof {
    bool submitted;
    address verifier;        // wallet yang submit, harus punya role sesuai
    string proofCid;         // SHA-256 hash dokumen di IPFS
    uint256 submittedAtBlock;
    uint256 challengeDeadline; // submittedAt + challengeWindow
}

struct Escrow {
    uint256 contractValue;        // dalam IDRT-demo, unit terkecil (2 desimal)
    address importer;
    address exporter;
    address arbiter;              // pemegang keputusan dispute
    string documentCid;           // dokumen kontrak/invoice awal
    string commodity;
    string containerRef;
    uint256 globalDeadline;       // safety valve — kalau lewat, importer bisa refund kapan pun
    uint256 createdAt;
    State state;
    uint256 timelockReleaseAt;    // diisi saat masuk TimelockActive
    mapping(Milestone => MilestoneProof) proofs; // Inspected / Shipped / ArrivedCleared
}

struct DisputeRecord {
    bool open;
    address raisedBy;
    uint256 bondAmount;          // dispute bond dari buyer, dikunci selama dispute
    Milestone disputedMilestone; // milestone mana yang didispute, None jika di TimelockActive
    address resolvedVerifier;    // verifier yang di-slash jika dispute valid, address(0) jika tidak ada
    string reasoningCid;         // wajib diisi arbiter saat resolve
    bool releaseToExporter;      // hasil keputusan
}
```

---

## 5. Function signatures

### 5.1 Setup & governance

```solidity
constructor(
    address idrtTokenAddress,
    address admin,                 // multisig address
    uint256 challengeWindowSeconds,   // default 6 jam = 21600
    uint256 timelockDurationSeconds,  // default 24 jam = 86400
    uint256 disputeBondBps,           // basis points dari contractValue, mis. 200 = 2%
    uint256 slashBps                  // basis points bond verifier yang di-slash, mis. 5000 = 50%
);

function grantVerifierRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE);
function revokeVerifierRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE);
function pause() external onlyRole(DEFAULT_ADMIN_ROLE);
function unpause() external onlyRole(DEFAULT_ADMIN_ROLE);
```

### 5.2 Verifier bond (stake)

```solidity
// Dipanggil sekali oleh institusi verifier setelah role di-grant, sebelum bisa submit proof apa pun.
function postVerifierBond() external payable; // atau pakai IDRT jika bond dalam token, bukan native POL — TBD tim Blockchain

function verifierBonds(address verifier) external view returns (uint256);
function verifierSlashCount(address verifier) external view returns (uint256);
uint256 public constant MIN_VERIFIER_BOND = /* nilai default, mis. setara 1000 IDRT-demo */;
uint256 public constant MAX_SLASH_STRIKES = 3; // role auto-revoked setelah strike ke-N
```

### 5.3 Escrow lifecycle

```solidity
function createEscrow(
    address exporter,
    address arbiter,
    string calldata documentCid,
    uint256 contractValue,        // dalam unit IDRT-demo
    uint256 globalDeadline,
    string calldata commodity,
    string calldata containerRef
) external whenNotPaused nonReentrant returns (uint256 escrowId);
// Requires: msg.sender sudah approve() IDRT-demo >= contractValue ke contract ini (atau signature permit — lihat §3)

function submitMilestoneProof(
    uint256 escrowId,
    Milestone milestone,
    string calldata proofCid,
    bytes calldata automatedCheckPayload // data dari oracle-gateway untuk automated gate, format lihat §6
) external whenNotPaused nonReentrant;
// Requires: msg.sender punya role sesuai milestone, verifierBonds[msg.sender] >= MIN_VERIFIER_BOND
// Requires: escrow.state cocok urutan (Created->Inspected, Inspected->Shipped, Shipped->ArrivedCleared)
// Requires: automated gate check pass (lihat §6)
// Effects: set proofs[milestone], set challengeDeadline, pindah state, emit MilestoneVerified

function initiateTimelock(uint256 escrowId) external whenNotPaused;
// Requires: state == ArrivedCleared, block.timestamp > proofs[ArrivedCleared].challengeDeadline
// Effects: state = TimelockActive, timelockReleaseAt = now + timelockDuration

function releasePayment(uint256 escrowId) external whenNotPaused nonReentrant;
// Permissionless — siapa saja bisa panggil (keeper bot / importer / exporter)
// Requires: state == TimelockActive, block.timestamp >= timelockReleaseAt
// Effects: state = Completed, transfer IDRT-demo ke exporter, emit PaymentReleased

function claimRefund(uint256 escrowId) external whenNotPaused nonReentrant;
// Requires: msg.sender == escrow.importer, block.timestamp > escrow.globalDeadline, state != Completed && state != Refunded
// Effects: state = Refunded, transfer IDRT-demo kembali ke importer, emit Refunded
```

### 5.4 Dispute

```solidity
function raiseDispute(uint256 escrowId, Milestone contestedMilestone) external payable whenNotPaused nonReentrant;
// contestedMilestone = None jika dispute diajukan saat TimelockActive (dispute umum, bukan spesifik satu milestone)
// Requires: msg.sender == escrow.importer || msg.sender == escrow.exporter
// Requires: state bukan Completed/Refunded/Disputed
// Requires: jika contestedMilestone != None, harus masih dalam challengeDeadline milestone tsb
// Requires: msg.value (atau IDRT transferFrom) >= contractValue * disputeBondBps / 10000
// Effects: state = Disputed, kunci bond, emit DisputeRaised

function resolveDispute(
    uint256 escrowId,
    bool releaseToExporter,
    string calldata reasoningCid,   // WAJIB — dokumen alasan keputusan di IPFS
    bool slashVerifier,             // true jika verifier yang milestone-nya didispute terbukti curang
    bool bondFrivolous               // true jika dispute buyer terbukti tidak berdasar
) external whenNotPaused nonReentrant;
// Requires: msg.sender == escrow.arbiter
// Requires: state == Disputed
// Effects:
//   - jika releaseToExporter: transfer contractValue ke exporter
//   - else: transfer contractValue ke importer
//   - dispute bond: kembali ke buyer jika !bondFrivolous, else ke exporter
//   - jika slashVerifier: panggil _slashVerifier() untuk verifier milestone yang didispute
//   - state = Completed atau Refunded sesuai keputusan
//   - emit DisputeResolved
```

### 5.5 View functions

```solidity
function getEscrow(uint256 escrowId) external view returns (Escrow memory); // tanpa mapping proofs (return terpisah)
function getMilestoneProof(uint256 escrowId, Milestone milestone) external view returns (MilestoneProof memory);
function getDispute(uint256 escrowId) external view returns (DisputeRecord memory);
function isReleaseEligible(uint256 escrowId) external view returns (bool);
function nextEscrowId() external view returns (uint256);
```

---

## 6. Automated gate (hybrid check)

`submitMilestoneProof` menerima `automatedCheckPayload` yang isinya bergantung milestone:

| Milestone | Sumber data | Syarat lolos gate |
|---|---|---|
| `Inspected` | Mock/real VGM feed | `vgm_match == true && gate_in_status == "confirmed"` |
| `Shipped` | Mock/real AIS feed | `departure_status == "departed"` |
| `ArrivedCleared` | Mock/real CEISA feed | `customs_status == "approved"` |

**Keputusan desain**: automated check ini divalidasi **di oracle-gateway** (backend), bukan langsung di smart contract, supaya kontrak tidak perlu tau bentuk API eksternal. Gateway yang sudah verifikasi data match baru **memanggilkan** `submitMilestoneProof` on-chain atas nama verifier (via relay), atau verifier submit langsung dan gateway sudah cross-check sebelumnya lewat off-chain signature tambahan.

> **Perlu diputuskan tim Blockchain**: apakah `automatedCheckPayload` di-encode sebagai bytes yang di-decode dan divalidasi di kontrak (butuh oracle data feed on-chain, lebih trustless tapi lebih kompleks), atau cukup event log dari gateway yang FE percaya (lebih simpel untuk MVP production-ready, tapi menambah trust ke gateway). **Rekomendasi Fase 0**: pakai opsi kedua (gateway-validated) untuk kecepatan development, dicatat sebagai known trust assumption yang perlu diperkuat di roadmap lanjutan (oracle on-chain seperti Chainlink Functions).

---

## 7. Events

```solidity
event EscrowCreated(uint256 indexed escrowId, address indexed importer, address indexed exporter, address arbiter, uint256 value, string documentCid, uint256 globalDeadline);
event MilestoneVerified(uint256 indexed escrowId, Milestone milestone, address indexed verifier, string proofCid, uint256 challengeDeadline);
event TimelockStarted(uint256 indexed escrowId, uint256 releaseAt);
event PaymentReleased(uint256 indexed escrowId, address indexed exporter, uint256 amount);
event Refunded(uint256 indexed escrowId, address indexed importer, uint256 amount);
event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, Milestone contestedMilestone, uint256 bondAmount);
event DisputeResolved(uint256 indexed escrowId, bool releasedToExporter, string reasoningCid, bool verifierSlashed);
event VerifierSlashed(uint256 indexed escrowId, address indexed verifier, uint256 amountSlashed, address indexed compensatedTo);
event VerifierBondPosted(address indexed verifier, uint256 amount, uint256 totalBond);
event VerifierRoleRevoked(address indexed verifier, bytes32 role, string reason);
```

---

## 8. Aturan bisnis kunci (ringkas, untuk referensi cepat)

- Challenge window default: **6 jam** per milestone.
- Timelock default: **24 jam** setelah `ArrivedCleared` lolos challenge window-nya.
- Dispute bond: **2% dari contract value** (bisa disesuaikan per deployment).
- Slash: **50% dari bond verifier**, dibagi **70% ke pihak dirugikan, 30% ke treasury**.
- Verifier kena slash **3x** → role otomatis di-revoke (circuit breaker).
- Global deadline: importer selalu bisa refund kalau lewat deadline ini, **apa pun state-nya** kecuali sudah `Completed`.
- `releasePayment()` bersifat **permissionless** — siapa saja termasuk keeper bot bisa trigger begitu timelock lewat, biar dana gak nyangkut nunggu satu pihak spesifik trigger manual.

---

## 9. Test acceptance criteria (untuk test suite Fase 1)

Minimal test case yang harus lulus sebelum kontrak dianggap siap Fase 2:

- [ ] Happy path: `Created -> Inspected -> Shipped -> ArrivedCleared -> TimelockActive -> Completed`, saldo pindah benar
- [ ] Milestone tidak bisa disubmit oleh wallet tanpa role yang sesuai
- [ ] Milestone tidak bisa disubmit kalau `automatedCheckPayload` gagal gate
- [ ] Milestone tidak bisa di-skip urutannya (submit `Shipped` sebelum `Inspected` lolos harus revert)
- [ ] Dispute per-milestone hanya bisa dibuka dalam challenge window, ditolak setelah lewat
- [ ] Dispute umum di `TimelockActive` bisa dibuka sebelum `timelockReleaseAt`
- [ ] `releasePayment()` revert kalau dipanggil sebelum `timelockReleaseAt`
- [ ] `releasePayment()` sukses dipanggil oleh address manapun (bukan cuma importer/exporter) setelah timelock lewat
- [ ] Dispute frivolous: bond buyer hangus ke exporter, verifier tidak di-slash
- [ ] Dispute valid: bond buyer balik, verifier di-slash sesuai split 70/30
- [ ] Verifier dengan bond di bawah `MIN_VERIFIER_BOND` tidak bisa submit proof
- [ ] Verifier kena slash 3x → role auto-revoked, submit berikutnya revert
- [ ] `claimRefund()` sukses di state manapun (kecuali `Completed`) setelah `globalDeadline` lewat
- [ ] `grantRole`/`revokeRole` hanya callable dari multisig admin, bukan EOA sembarangan
- [ ] Reentrancy guard aktif di semua fungsi yang transfer token

---

## 10. Keputusan terbuka (perlu diputuskan Tim Blockchain sebelum coding, tulis hasilnya di sini)

| # | Pertanyaan | Opsi | Keputusan |
|---|---|---|---|
| 1 | `approve()`+`createEscrow` (2 tx) vs `permit()` (1 tx)? | Lihat §3 | _TBD_ |
| 2 | `automatedCheckPayload` divalidasi on-chain atau trust ke gateway? | Lihat §6 | Direkomendasikan: gateway-validated (Fase 1) |
| 3 | Verifier bond dalam native POL atau IDRT-demo token? | | _TBD_ |
| 4 | Siapa 3 signer multisig admin untuk testnet? | | _TBD_ |
| 5 | `disputeBondBps` dan `slashBps` final berapa? | Default 2% / 50% | _TBD, bisa disesuaikan_ |

---

## Change log

| Tanggal | Perubahan | Oleh |
|---|---|---|
| 2026-08-29 | Draft awal spec kontrak Fase 0 | — |
