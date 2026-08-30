// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISternEscrow {
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
    }

    function createEscrow(
        address exporter,
        address arbiter,
        string calldata documentCid,
        uint256 contractValue,
        uint256 globalDeadline,
        string calldata commodity,
        string calldata containerRef
    ) external returns (uint256 escrowId);

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
    ) external returns (uint256 escrowId);

    function postVerifierBond() external;
    function postVerifierBond(uint256 amount) external;
    function submitMilestoneProof(
        uint256 escrowId,
        Milestone milestone,
        string calldata proofCid,
        bytes calldata automatedCheckPayload
    ) external;
    function initiateTimelock(uint256 escrowId) external;
    function releasePayment(uint256 escrowId) external;
    function claimRefund(uint256 escrowId) external;
    function raiseDispute(uint256 escrowId, Milestone contestedMilestone) external;
    function proposeDeadlineExtension(uint256 escrowId, uint256 newDeadline) external;
    function approveDeadlineExtension(uint256 escrowId) external;
    function resolveDispute(
        uint256 escrowId,
        bool releaseToExporter,
        string calldata reasoningCid,
        bool slashVerifier,
        bool bondFrivolous
    ) external;
    function getEscrow(uint256 escrowId) external view returns (EscrowView memory);
    function getMilestoneProof(uint256 escrowId, Milestone milestone) external view returns (MilestoneProof memory);
    function getDispute(uint256 escrowId) external view returns (DisputeRecord memory);
    function isReleaseEligible(uint256 escrowId) external view returns (bool);
    function pendingDeadline(uint256 escrowId) external view returns (uint256);
    function extensionProposer(uint256 escrowId) external view returns (address);
    function nextEscrowId() external view returns (uint256);
}
