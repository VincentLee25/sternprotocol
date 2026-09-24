// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SternEscrowV3 is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ROLE_QUALITY_AUDITOR = keccak256("ROLE_QUALITY_AUDITOR");
    bytes32 public constant ROLE_LOGISTICS = keccak256("ROLE_LOGISTICS");
    bytes32 public constant ROLE_CUSTOMS = keccak256("ROLE_CUSTOMS");
    bytes32 public constant ROLE_KEEPER = keccak256("ROLE_KEEPER");

    uint256 public constant MIN_VERIFIER_BOND = 10_000_00;
    uint256 public constant MAX_SLASH_STRIKES = 3;
    uint256 public constant SLASH_AGGRIEVED_BPS = 7000;
    uint256 public constant SLASH_TREASURY_BPS = 3000;

    enum Milestone {
        None,
        Inspected,
        Shipped,
        ArrivedCleared
    }

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
        address verifier;
        string proofCid;
        uint256 submittedAtBlock;
        uint256 challengeDeadline;
    }

    struct Escrow {
        uint256 contractValue;
        address importer;
        address exporter;
        address arbiter;
        string documentCid;
        string commodity;
        string containerRef;
        uint256 globalDeadline;
        uint256 createdAt;
        State state;
        uint256 timelockReleaseAt;
        mapping(Milestone => MilestoneProof) proofs;
    }

    struct EscrowView {
        uint256 contractValue;
        address importer;
        address exporter;
        address arbiter;
        string documentCid;
        string commodity;
        string containerRef;
        uint256 globalDeadline;
        uint256 createdAt;
        State state;
        uint256 timelockReleaseAt;
    }

    struct DisputeRecord {
        bool open;
        address raisedBy;
        uint256 bondAmount;
        Milestone disputedMilestone;
        address resolvedVerifier;
        string reasoningCid;
        bool releaseToExporter;
        // Zero unless the dispute ended in a negotiated split. `releaseToExporter`
        // is a bool and cannot say "85% of it", so a split records the amount here
        // and leaves the bool false. Read this field before trusting the bool.
        uint256 settledToExporter;
        bool settledByAgreement;
    }

    IERC20 public immutable idrtToken;
    IERC20Permit public immutable idrtPermitToken;
    address public treasuryAddress;
    uint256 public immutable challengeWindowSeconds;
    uint256 public immutable timelockDurationSeconds;
    // Demo: the importer gets the same 60-second window after final verification.
    // Production deployments can use a longer constructor duration.
    uint256 public immutable disputeWindowSeconds;
    uint256 public immutable disputeBondBps;
    uint256 public immutable slashBps;
    uint256 public nextEscrowId;

    mapping(uint256 => Escrow) private escrows;
    mapping(uint256 => DisputeRecord) private disputes;
    mapping(uint256 => uint256) public pendingDeadline;
    mapping(uint256 => address) public extensionProposer;
    mapping(uint256 => uint256) public finalDisputeDeadline;
    mapping(uint256 => uint256) public disputeOpenedAt;
    mapping(address => uint256) public verifierBonds;
    mapping(address => uint256) public verifierSlashCount;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed importer,
        address indexed exporter,
        address arbiter,
        uint256 value,
        string documentCid,
        uint256 globalDeadline
    );
    event MilestoneVerified(
        uint256 indexed escrowId,
        Milestone milestone,
        address indexed verifier,
        string proofCid,
        uint256 challengeDeadline
    );
    event TimelockStarted(uint256 indexed escrowId, uint256 releaseAt);
    event PaymentReleased(uint256 indexed escrowId, address indexed exporter, uint256 amount);
    event Refunded(uint256 indexed escrowId, address indexed importer, uint256 amount);
    event DisputeRaised(
        uint256 indexed escrowId,
        address indexed raisedBy,
        Milestone contestedMilestone,
        uint256 bondAmount
    );
    event DisputeResolved(
        uint256 indexed escrowId,
        bool releasedToExporter,
        string reasoningCid,
        bool verifierSlashed
    );
    event DisputeSettledByAgreement(
        uint256 indexed escrowId,
        uint256 amountToExporter,
        uint256 amountToImporter,
        string agreementCid
    );
    event DisputeSettledByArbiter(
        uint256 indexed escrowId,
        uint256 amountToExporter,
        uint256 amountToImporter,
        string reasoningCid
    );
    event VerifierSlashed(
        uint256 indexed escrowId,
        address indexed verifier,
        uint256 amountSlashed,
        address indexed compensatedTo
    );
    event VerifierBondPosted(address indexed verifier, uint256 amount, uint256 totalBond);
    event VerifierRoleRevoked(address indexed verifier, bytes32 role, string reason);
    event DeadlineExtensionProposed(uint256 indexed escrowId, address indexed proposer, uint256 newDeadline);
    event DeadlineExtended(uint256 indexed escrowId, uint256 newDeadline);

    modifier escrowExists(uint256 escrowId) {
        require(escrows[escrowId].importer != address(0), "escrow not found");
        _;
    }

    constructor(
        address idrtTokenAddress,
        address admin,
        uint256 challengeWindowSeconds_,
        uint256 disputeWindowSeconds_,
        uint256 timelockDurationSeconds_,
        uint256 disputeBondBps_,
        uint256 slashBps_
    ) {
        require(idrtTokenAddress != address(0), "token zero address");
        require(admin != address(0), "admin zero address");
        require(challengeWindowSeconds_ > 0, "challenge window required");
        require(disputeWindowSeconds_ > 0, "dispute window required");
        require(timelockDurationSeconds_ > 0, "timelock required");
        require(disputeBondBps_ <= 10_000, "invalid dispute bps");
        require(slashBps_ <= 10_000, "invalid slash bps");

        idrtToken = IERC20(idrtTokenAddress);
        idrtPermitToken = IERC20Permit(idrtTokenAddress);
        treasuryAddress = admin;
        challengeWindowSeconds = challengeWindowSeconds_;
        timelockDurationSeconds = timelockDurationSeconds_;
        disputeWindowSeconds = disputeWindowSeconds_;
        disputeBondBps = disputeBondBps_;
        slashBps = slashBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function grantVerifierRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_isVerifierRole(role), "invalid verifier role");
        grantRole(role, account);
    }

    function revokeVerifierRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_isVerifierRole(role), "invalid verifier role");
        revokeRole(role, account);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setTreasuryAddress(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "treasury zero address");
        treasuryAddress = newTreasury;
    }

    function postVerifierBond() external nonReentrant {
        require(_hasVerifierRole(msg.sender), "verifier role required");
        uint256 currentBond = verifierBonds[msg.sender];
        require(currentBond < MIN_VERIFIER_BOND, "bond already sufficient");
        _postVerifierBond(MIN_VERIFIER_BOND - currentBond);
    }

    function postVerifierBond(uint256 amount) external nonReentrant {
        require(_hasVerifierRole(msg.sender), "verifier role required");
        require(amount > 0, "bond amount required");
        _postVerifierBond(amount);
    }

    function createEscrow(
        address exporter,
        address arbiter,
        string calldata documentCid,
        uint256 contractValue,
        uint256 globalDeadline,
        string calldata commodity,
        string calldata containerRef
    ) external whenNotPaused nonReentrant returns (uint256 escrowId) {
        escrowId = _createEscrow(
            msg.sender,
            exporter,
            arbiter,
            documentCid,
            contractValue,
            globalDeadline,
            commodity,
            containerRef
        );
    }

    function createEscrowWithPermit(
        address exporter,
        address arbiter,
        string calldata documentCid,
        uint256 contractValue,
        uint256 globalDeadline,
        string calldata commodity,
        string calldata containerRef,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused nonReentrant returns (uint256 escrowId) {
        idrtPermitToken.permit(msg.sender, address(this), contractValue, permitDeadline, v, r, s);
        escrowId = _createEscrow(
            msg.sender,
            exporter,
            arbiter,
            documentCid,
            contractValue,
            globalDeadline,
            commodity,
            containerRef
        );
    }

    function submitMilestoneProof(
        uint256 escrowId,
        Milestone milestone,
        string calldata proofCid,
        bytes calldata automatedCheckPayload
    ) external whenNotPaused nonReentrant escrowExists(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        bytes32 requiredRole = _roleForMilestone(milestone);

        require(hasRole(requiredRole, msg.sender), "verifier role mismatch");
        require(verifierBonds[msg.sender] >= MIN_VERIFIER_BOND, "verifier bond required");
        require(verifierSlashCount[msg.sender] < MAX_SLASH_STRIKES, "verifier revoked by slashing");
        require(bytes(proofCid).length > 0, "proof CID required");
        require(_automatedCheckPassed(automatedCheckPayload), "automated gate failed");

        if (milestone == Milestone.Inspected) {
            require(escrow.state == State.Created, "invalid milestone order");
        } else if (milestone == Milestone.Shipped) {
            require(escrow.state == State.Inspected, "invalid milestone order");
            require(block.timestamp > escrow.proofs[Milestone.Inspected].challengeDeadline, "challenge window open");
        } else if (milestone == Milestone.ArrivedCleared) {
            require(escrow.state == State.Shipped, "invalid milestone order");
            require(block.timestamp > escrow.proofs[Milestone.Shipped].challengeDeadline, "challenge window open");
        } else {
            revert("invalid milestone");
        }

        uint256 challengeDeadline = block.timestamp + challengeWindowSeconds;
        escrow.proofs[milestone] = MilestoneProof({
            submitted: true,
            verifier: msg.sender,
            proofCid: proofCid,
            submittedAtBlock: block.number,
            challengeDeadline: challengeDeadline
        });
        escrow.state = State(uint8(milestone));
        if (milestone == Milestone.ArrivedCleared) {
            finalDisputeDeadline[escrowId] = block.timestamp + disputeWindowSeconds;
        }

        emit MilestoneVerified(escrowId, milestone, msg.sender, proofCid, challengeDeadline);
    }

    function initiateTimelock(uint256 escrowId) external whenNotPaused escrowExists(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state == State.ArrivedCleared, "not arrived cleared");
        require(block.timestamp > finalDisputeDeadline[escrowId], "dispute window open");

        escrow.state = State.TimelockActive;
        escrow.timelockReleaseAt = finalDisputeDeadline[escrowId] + timelockDurationSeconds;
        emit TimelockStarted(escrowId, escrow.timelockReleaseAt);
    }

    function releasePayment(uint256 escrowId)
        external
        whenNotPaused
        nonReentrant
        escrowExists(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state == State.TimelockActive, "timelock not active");
        require(block.timestamp >= escrow.timelockReleaseAt, "timelock not elapsed");
        _release(escrowId);
    }

    // Permissionless progression for an external keeper. Time alone cannot
    // submit a transaction; a caller still has to invoke this function.
    function advanceSettlement(uint256 escrowId) external whenNotPaused nonReentrant escrowExists(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.state == State.ArrivedCleared) {
            require(block.timestamp > finalDisputeDeadline[escrowId], "dispute window open");
            escrow.state = State.TimelockActive;
            escrow.timelockReleaseAt = finalDisputeDeadline[escrowId] + timelockDurationSeconds;
            emit TimelockStarted(escrowId, escrow.timelockReleaseAt);
            if (block.timestamp >= escrow.timelockReleaseAt) _release(escrowId);
        } else if (escrow.state == State.TimelockActive) {
            require(block.timestamp >= escrow.timelockReleaseAt, "timelock not elapsed");
            _release(escrowId);
        } else {
            revert("settlement cannot advance");
        }
    }

    function claimRefund(uint256 escrowId)
        external
        whenNotPaused
        nonReentrant
        escrowExists(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.importer, "only importer");
        require(escrow.state != State.Completed, "escrow already completed");
        require(escrow.state != State.Refunded, "escrow already refunded");
        require(escrow.state == State.Created || escrow.state == State.Inspected ||
            escrow.state == State.Shipped, "verified trade follows settlement");
        require(block.timestamp > escrow.globalDeadline, "global deadline not passed");

        DisputeRecord storage dispute = disputes[escrowId];
        if (dispute.open && dispute.bondAmount > 0) {
            uint256 bondAmount = dispute.bondAmount;
            dispute.bondAmount = 0;
            idrtToken.safeTransfer(dispute.raisedBy, bondAmount);
        }
        dispute.open = false;

        _refund(escrowId);
    }

    function raiseDispute(uint256 escrowId, Milestone contestedMilestone)
        external
        whenNotPaused
        nonReentrant
        escrowExists(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.importer, "only importer may dispute");
        require(escrow.state != State.Completed, "escrow already completed");
        require(escrow.state != State.Refunded, "escrow already refunded");
        require(escrow.state != State.Disputed, "escrow already disputed");

        require(uint8(contestedMilestone) <= uint8(Milestone.ArrivedCleared), "invalid milestone");
        if (escrow.state == State.ArrivedCleared) {
            require(block.timestamp <= finalDisputeDeadline[escrowId], "dispute window closed");
        } else {
            // An exception may prevent a proof from being submitted at all.
            // The importer can still contest the active trade before its deadline.
            require(escrow.state == State.Created || escrow.state == State.Inspected ||
                escrow.state == State.Shipped, "dispute window closed");
            require(block.timestamp <= escrow.globalDeadline, "trade deadline passed");
        }

        uint256 bondAmount = (escrow.contractValue * disputeBondBps) / 10_000;
        require(bondAmount > 0, "dispute bond too small");

        idrtToken.safeTransferFrom(msg.sender, address(this), bondAmount);
        _clearPendingExtension(escrowId);
        disputes[escrowId] = DisputeRecord({
            open: true,
            raisedBy: msg.sender,
            bondAmount: bondAmount,
            disputedMilestone: contestedMilestone,
            resolvedVerifier: address(0),
            reasoningCid: "",
            releaseToExporter: false,
            settledToExporter: 0,
            settledByAgreement: false
        });
        disputeOpenedAt[escrowId] = block.timestamp;
        escrow.state = State.Disputed;

        emit DisputeRaised(escrowId, msg.sender, contestedMilestone, bondAmount);
    }

    function proposeDeadlineExtension(uint256 escrowId, uint256 newDeadline)
        external
        whenNotPaused
        escrowExists(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state != State.Completed, "escrow already completed");
        require(escrow.state != State.Refunded, "escrow already refunded");
        require(escrow.state != State.Disputed, "escrow disputed");
        require(msg.sender == escrow.importer || msg.sender == escrow.exporter, "not escrow party");
        require(newDeadline > escrow.globalDeadline, "must extend deadline");

        pendingDeadline[escrowId] = newDeadline;
        extensionProposer[escrowId] = msg.sender;
        emit DeadlineExtensionProposed(escrowId, msg.sender, newDeadline);
    }

    function approveDeadlineExtension(uint256 escrowId)
        external
        whenNotPaused
        escrowExists(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state != State.Completed, "escrow already completed");
        require(escrow.state != State.Refunded, "escrow already refunded");
        require(escrow.state != State.Disputed, "escrow disputed");
        require(msg.sender == escrow.importer || msg.sender == escrow.exporter, "not escrow party");

        uint256 newDeadline = pendingDeadline[escrowId];
        require(newDeadline != 0, "no pending extension");
        require(msg.sender != extensionProposer[escrowId], "proposer cannot approve");

        escrow.globalDeadline = newDeadline;
        _clearPendingExtension(escrowId);
        emit DeadlineExtended(escrowId, newDeadline);
    }

    function resolveDispute(
        uint256 escrowId,
        bool releaseToExporter,
        string calldata reasoningCid,
        bool slashVerifier,
        bool bondFrivolous
    ) external whenNotPaused nonReentrant escrowExists(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        DisputeRecord storage dispute = disputes[escrowId];
        require(msg.sender == escrow.arbiter, "only arbiter");
        require(escrow.state == State.Disputed && dispute.open, "escrow not disputed");
        require(block.timestamp >= disputeOpenedAt[escrowId] + timelockDurationSeconds,
            "negotiation window open");
        require(bytes(reasoningCid).length > 0, "reasoning CID required");
        require(!(bondFrivolous && slashVerifier), "frivolous cannot slash verifier");

        address resolvedVerifier;
        if (slashVerifier) {
            resolvedVerifier = _slashVerifier(escrowId, dispute.disputedMilestone);
        }

        uint256 disputeBond = dispute.bondAmount;
        dispute.bondAmount = 0;
        dispute.open = false;
        dispute.reasoningCid = reasoningCid;
        dispute.releaseToExporter = releaseToExporter;
        dispute.resolvedVerifier = resolvedVerifier;

        if (releaseToExporter) {
            _release(escrowId);
        } else {
            _refund(escrowId);
        }

        if (disputeBond > 0) {
            idrtToken.safeTransfer(bondFrivolous ? escrow.exporter : dispute.raisedBy, disputeBond);
        }

        emit DisputeResolved(escrowId, releaseToExporter, reasoningCid, slashVerifier);
    }

    /// @notice Settle a dispute on a full release, refund, or split agreed by both parties.
    /// @dev The gateway verifies both owner signatures and pins the exact terms.
    /// The designated arbiter then submits the CID and amount to the contract.
    /// The arbiter is trusted to execute that agreement; this function does not
    /// verify the signatures on-chain. The CID makes the decision auditable.
    ///
    /// No verifier is slashed here. A negotiated settlement is not a finding that
    /// a verifier lied, and the dispute bond goes back to the importer who raised the
    /// dispute: they did not act frivolously, they got an outcome.
    function resolveDisputeByAgreement(
        uint256 escrowId,
        uint256 amountToExporter,
        string calldata agreementCid
    ) external whenNotPaused nonReentrant escrowExists(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        DisputeRecord storage dispute = disputes[escrowId];
        require(msg.sender == escrow.arbiter, "only arbiter");
        require(escrow.state == State.Disputed && dispute.open, "escrow not disputed");
        require(bytes(agreementCid).length > 0, "agreement CID required");

        uint256 total = escrow.contractValue;
        // Both parties may agree to full release, full refund, or a split.
        // An agreement is not a finding that the verifier should be slashed.
        require(amountToExporter <= total, "amount exceeds escrow");

        uint256 amountToImporter = total - amountToExporter;
        uint256 disputeBond = dispute.bondAmount;

        escrow.contractValue = 0;
        escrow.state = amountToExporter == 0 ? State.Refunded : State.Completed;
        _clearPendingExtension(escrowId);

        dispute.bondAmount = 0;
        dispute.open = false;
        dispute.reasoningCid = agreementCid;
        dispute.releaseToExporter = amountToExporter == total;
        dispute.settledToExporter = amountToExporter;
        dispute.settledByAgreement = true;

        idrtToken.safeTransfer(escrow.exporter, amountToExporter);
        idrtToken.safeTransfer(escrow.importer, amountToImporter);
        if (disputeBond > 0) {
            idrtToken.safeTransfer(dispute.raisedBy, disputeBond);
        }

        emit DisputeSettledByAgreement(
            escrowId,
            amountToExporter,
            amountToImporter,
            agreementCid
        );
    }

    // After negotiation, the arbiter may order a partial payout based on
    // evidence even when the parties did not sign a settlement agreement.
    function resolveDisputeSplit(
        uint256 escrowId,
        uint256 amountToExporter,
        string calldata reasoningCid
    ) external whenNotPaused nonReentrant escrowExists(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        DisputeRecord storage dispute = disputes[escrowId];
        require(msg.sender == escrow.arbiter, "only arbiter");
        require(escrow.state == State.Disputed && dispute.open, "escrow not disputed");
        require(block.timestamp >= disputeOpenedAt[escrowId] + timelockDurationSeconds,
            "negotiation window open");
        require(bytes(reasoningCid).length > 0, "reasoning CID required");
        uint256 total = escrow.contractValue;
        require(amountToExporter > 0 && amountToExporter < total, "not a split");

        uint256 bond = dispute.bondAmount;
        dispute.bondAmount = 0;
        dispute.open = false;
        dispute.reasoningCid = reasoningCid;
        dispute.settledToExporter = amountToExporter;
        escrow.contractValue = 0;
        escrow.state = State.Completed;
        _clearPendingExtension(escrowId);

        idrtToken.safeTransfer(escrow.exporter, amountToExporter);
        idrtToken.safeTransfer(escrow.importer, total - amountToExporter);
        if (bond > 0) idrtToken.safeTransfer(dispute.raisedBy, bond);
        emit DisputeSettledByArbiter(escrowId, amountToExporter, total - amountToExporter, reasoningCid);
    }

    function getEscrow(uint256 escrowId) external view escrowExists(escrowId) returns (EscrowView memory) {
        Escrow storage escrow = escrows[escrowId];
        return EscrowView({
            contractValue: escrow.contractValue,
            importer: escrow.importer,
            exporter: escrow.exporter,
            arbiter: escrow.arbiter,
            documentCid: escrow.documentCid,
            commodity: escrow.commodity,
            containerRef: escrow.containerRef,
            globalDeadline: escrow.globalDeadline,
            createdAt: escrow.createdAt,
            state: escrow.state,
            timelockReleaseAt: escrow.timelockReleaseAt
        });
    }

    function getMilestoneProof(uint256 escrowId, Milestone milestone)
        external
        view
        escrowExists(escrowId)
        returns (MilestoneProof memory)
    {
        return escrows[escrowId].proofs[milestone];
    }

    function getDispute(uint256 escrowId)
        external
        view
        escrowExists(escrowId)
        returns (DisputeRecord memory)
    {
        return disputes[escrowId];
    }

    function isReleaseEligible(uint256 escrowId) external view escrowExists(escrowId) returns (bool) {
        Escrow storage escrow = escrows[escrowId];
        return escrow.state == State.TimelockActive && block.timestamp >= escrow.timelockReleaseAt;
    }

    function _createEscrow(
        address importer,
        address exporter,
        address arbiter,
        string calldata documentCid,
        uint256 contractValue,
        uint256 globalDeadline,
        string calldata commodity,
        string calldata containerRef
    ) private returns (uint256 escrowId) {
        require(exporter != address(0), "exporter zero address");
        require(arbiter != address(0), "arbiter zero address");
        require(contractValue > 0, "contract value required");
        require(globalDeadline > block.timestamp, "global deadline must be future");
        require(bytes(documentCid).length > 0, "document CID required");
        require(bytes(containerRef).length > 0, "container ref required");

        escrowId = nextEscrowId++;
        Escrow storage escrow = escrows[escrowId];
        escrow.contractValue = contractValue;
        escrow.importer = importer;
        escrow.exporter = exporter;
        escrow.arbiter = arbiter;
        escrow.documentCid = documentCid;
        escrow.commodity = commodity;
        escrow.containerRef = containerRef;
        escrow.globalDeadline = globalDeadline;
        escrow.createdAt = block.timestamp;
        escrow.state = State.Created;

        idrtToken.safeTransferFrom(importer, address(this), contractValue);

        emit EscrowCreated(escrowId, importer, exporter, arbiter, contractValue, documentCid, globalDeadline);
    }

    function _postVerifierBond(uint256 amount) private {
        verifierBonds[msg.sender] += amount;
        idrtToken.safeTransferFrom(msg.sender, address(this), amount);
        emit VerifierBondPosted(msg.sender, amount, verifierBonds[msg.sender]);
    }

    function _release(uint256 escrowId) private {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state != State.Completed, "escrow already completed");
        require(escrow.state != State.Refunded, "escrow already refunded");

        uint256 amount = escrow.contractValue;
        escrow.contractValue = 0;
        escrow.state = State.Completed;
        _clearPendingExtension(escrowId);
        idrtToken.safeTransfer(escrow.exporter, amount);

        emit PaymentReleased(escrowId, escrow.exporter, amount);
    }

    function _refund(uint256 escrowId) private {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state != State.Completed, "escrow already completed");
        require(escrow.state != State.Refunded, "escrow already refunded");

        uint256 amount = escrow.contractValue;
        escrow.contractValue = 0;
        escrow.state = State.Refunded;
        _clearPendingExtension(escrowId);
        idrtToken.safeTransfer(escrow.importer, amount);

        emit Refunded(escrowId, escrow.importer, amount);
    }

    function _slashVerifier(uint256 escrowId, Milestone disputedMilestone) private returns (address verifier) {
        require(disputedMilestone != Milestone.None, "no verifier to slash");

        Escrow storage escrow = escrows[escrowId];
        MilestoneProof storage proof = escrow.proofs[disputedMilestone];
        verifier = proof.verifier;
        require(verifier != address(0), "verifier not found");

        uint256 slashAmount = (verifierBonds[verifier] * slashBps) / 10_000;
        require(slashAmount > 0, "slash amount zero");

        verifierBonds[verifier] -= slashAmount;
        verifierSlashCount[verifier] += 1;

        address compensatedTo = escrow.importer;
        uint256 compensation = (slashAmount * SLASH_AGGRIEVED_BPS) / 10_000;
        uint256 treasuryShare = slashAmount - compensation;

        idrtToken.safeTransfer(compensatedTo, compensation);
        idrtToken.safeTransfer(treasuryAddress, treasuryShare);

        emit VerifierSlashed(escrowId, verifier, slashAmount, compensatedTo);

        if (verifierSlashCount[verifier] >= MAX_SLASH_STRIKES) {
            _revokeVerifierRoles(verifier);
        }
    }

    function _revokeVerifierRoles(address verifier) private {
        _revokeVerifierRoleIfHeld(verifier, ROLE_QUALITY_AUDITOR);
        _revokeVerifierRoleIfHeld(verifier, ROLE_LOGISTICS);
        _revokeVerifierRoleIfHeld(verifier, ROLE_CUSTOMS);
    }

    function _revokeVerifierRoleIfHeld(address verifier, bytes32 role) private {
        if (hasRole(role, verifier)) {
            _revokeRole(role, verifier);
            emit VerifierRoleRevoked(verifier, role, "3x slashed, auto circuit-breaker");
        }
    }

    function _clearPendingExtension(uint256 escrowId) private {
        delete pendingDeadline[escrowId];
        delete extensionProposer[escrowId];
    }

    function _roleForMilestone(Milestone milestone) private pure returns (bytes32) {
        if (milestone == Milestone.Inspected) return ROLE_QUALITY_AUDITOR;
        if (milestone == Milestone.Shipped) return ROLE_LOGISTICS;
        if (milestone == Milestone.ArrivedCleared) return ROLE_CUSTOMS;
        revert("invalid milestone");
    }

    function _isVerifierRole(bytes32 role) private pure returns (bool) {
        return role == ROLE_QUALITY_AUDITOR || role == ROLE_LOGISTICS || role == ROLE_CUSTOMS;
    }

    function _hasVerifierRole(address account) private view returns (bool) {
        return hasRole(ROLE_QUALITY_AUDITOR, account)
            || hasRole(ROLE_LOGISTICS, account)
            || hasRole(ROLE_CUSTOMS, account);
    }

    function _automatedCheckPassed(bytes calldata automatedCheckPayload) private pure returns (bool) {
        require(automatedCheckPayload.length > 0, "automated gate payload required");
        return abi.decode(automatedCheckPayload, (bool));
    }
}
