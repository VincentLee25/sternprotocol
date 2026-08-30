const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SternEscrow phase 0", function () {
  const CHALLENGE_WINDOW = 6 * 60 * 60;
  const TIMELOCK = 24 * 60 * 60;
  const DISPUTE_BPS = 300;
  const SLASH_BPS = 5000;
  const VALUE = 45_000_000_00n;
  const DEMO_BALANCE = 150_000_000_00n;
  const PROOF_OK = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
  const PROOF_BAD = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]);

  const Milestone = {
    None: 0,
    Inspected: 1,
    Shipped: 2,
    ArrivedCleared: 3
  };

  const State = {
    Created: 0,
    Inspected: 1,
    Shipped: 2,
    ArrivedCleared: 3,
    TimelockActive: 4,
    Disputed: 5,
    Completed: 6,
    Refunded: 7
  };

  async function deployFixture() {
    const [admin, importer, exporter, arbiter, quality, logistics, customs, outsider, treasury] =
      await ethers.getSigners();

    const IDRTDemo = await ethers.getContractFactory("IDRTDemo");
    const idrt = await IDRTDemo.deploy(admin.address);
    await idrt.waitForDeployment();

    const SternEscrow = await ethers.getContractFactory("SternEscrow");
    const escrow = await SternEscrow.deploy(
      await idrt.getAddress(),
      admin.address,
      CHALLENGE_WINDOW,
      TIMELOCK,
      DISPUTE_BPS,
      SLASH_BPS
    );
    await escrow.waitForDeployment();

    await escrow.connect(admin).setTreasuryAddress(treasury.address);

    await escrow.connect(admin).grantVerifierRole(await escrow.ROLE_QUALITY_AUDITOR(), quality.address);
    await escrow.connect(admin).grantVerifierRole(await escrow.ROLE_LOGISTICS(), logistics.address);
    await escrow.connect(admin).grantVerifierRole(await escrow.ROLE_CUSTOMS(), customs.address);

    for (const account of [importer, exporter, quality, logistics, customs]) {
      await idrt.connect(admin).mint(account.address, DEMO_BALANCE);
      await idrt.connect(account).approve(await escrow.getAddress(), DEMO_BALANCE);
    }

    for (const account of [quality, logistics, customs]) {
      await escrow.connect(account).postVerifierBond();
    }

    return { admin, importer, exporter, arbiter, quality, logistics, customs, outsider, treasury, idrt, escrow };
  }

  async function createEscrow(ctx, overrides = {}) {
    const deadline = overrides.deadline ?? (await time.latest()) + 14 * 24 * 60 * 60;
    const escrowId = await ctx.escrow.nextEscrowId();

    await ctx.escrow.connect(ctx.importer).createEscrow(
      ctx.exporter.address,
      ctx.arbiter.address,
      overrides.documentCid ?? "bafybeidoc",
      overrides.value ?? VALUE,
      deadline,
      overrides.commodity ?? "Arabica Gayo Grade 1",
      overrides.containerRef ?? "TGHU-2026-001"
    );

    return { escrowId, deadline };
  }

  async function verifyHappyMilestones(ctx, escrowId) {
    await ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK);
    await time.increase(CHALLENGE_WINDOW + 1);
    await ctx.escrow.connect(ctx.logistics).submitMilestoneProof(escrowId, Milestone.Shipped, "bafyebl", PROOF_OK);
    await time.increase(CHALLENGE_WINDOW + 1);
    await ctx.escrow.connect(ctx.customs).submitMilestoneProof(escrowId, Milestone.ArrivedCleared, "bafycustoms", PROOF_OK);
  }

  it("uses IDRT-demo with 2 decimals and minter access control", async function () {
    const ctx = await deployFixture();
    expect(await ctx.idrt.decimals()).to.equal(2);

    await expect(ctx.idrt.connect(ctx.importer).mint(ctx.importer.address, 1n))
      .to.be.revertedWithCustomError(ctx.idrt, "AccessControlUnauthorizedAccount");
  });

  it("locks IDRT and completes the full milestone/timelock lifecycle", async function () {
    const ctx = await deployFixture();
    const { escrowId } = await createEscrow(ctx);

    expect(await ctx.idrt.balanceOf(await ctx.escrow.getAddress())).to.equal(VALUE + 3n * 10_000_00n);

    await verifyHappyMilestones(ctx, escrowId);
    await time.increase(CHALLENGE_WINDOW + 1);
    await expect(ctx.escrow.connect(ctx.outsider).initiateTimelock(escrowId))
      .to.emit(ctx.escrow, "TimelockStarted");

    await expect(ctx.escrow.connect(ctx.outsider).releasePayment(escrowId))
      .to.be.revertedWith("timelock not elapsed");

    await time.increase(TIMELOCK);
    await expect(ctx.escrow.connect(ctx.outsider).releasePayment(escrowId))
      .to.emit(ctx.escrow, "PaymentReleased")
      .withArgs(escrowId, ctx.exporter.address, VALUE);

    const view = await ctx.escrow.getEscrow(escrowId);
    expect(view.state).to.equal(State.Completed);
    expect(await ctx.idrt.balanceOf(ctx.exporter.address)).to.equal(DEMO_BALANCE + VALUE);
  });

  it("rejects wrong verifier roles, missing bond, skipped order, and failed automated gate", async function () {
    const ctx = await deployFixture();
    const { escrowId } = await createEscrow(ctx);

    await expect(
      ctx.escrow.connect(ctx.logistics).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK)
    ).to.be.revertedWith("verifier role mismatch");

    await ctx.escrow.connect(ctx.admin).grantVerifierRole(await ctx.escrow.ROLE_QUALITY_AUDITOR(), ctx.outsider.address);
    await expect(
      ctx.escrow.connect(ctx.outsider).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK)
    ).to.be.revertedWith("verifier bond required");

    await expect(
      ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_BAD)
    ).to.be.revertedWith("automated gate failed");

    await expect(
      ctx.escrow.connect(ctx.logistics).submitMilestoneProof(escrowId, Milestone.Shipped, "bafyebl", PROOF_OK)
    ).to.be.revertedWith("invalid milestone order");
  });

  it("limits milestone disputes to the challenge window", async function () {
    const ctx = await deployFixture();
    const { escrowId } = await createEscrow(ctx);
    const bondAmount = (VALUE * BigInt(DISPUTE_BPS)) / 10_000n;

    await ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK);

    await expect(ctx.escrow.connect(ctx.importer).raiseDispute(escrowId, Milestone.Inspected))
      .to.emit(ctx.escrow, "DisputeRaised")
      .withArgs(escrowId, ctx.importer.address, Milestone.Inspected, bondAmount);

    const dispute = await ctx.escrow.getDispute(escrowId);
    expect(dispute.bondAmount).to.equal(bondAmount);
    expect((await ctx.escrow.getEscrow(escrowId)).state).to.equal(State.Disputed);
  });

  it("rejects milestone dispute after challenge window closes", async function () {
    const ctx = await deployFixture();
    const { escrowId } = await createEscrow(ctx);

    await ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK);
    await time.increase(CHALLENGE_WINDOW + 1);

    await expect(ctx.escrow.connect(ctx.importer).raiseDispute(escrowId, Milestone.Inspected))
      .to.be.revertedWith("challenge window closed");
  });

  it("handles valid dispute with IDRT verifier slash split 70/30", async function () {
    const ctx = await deployFixture();
    const { escrowId } = await createEscrow(ctx);
    const verifierBond = await ctx.escrow.MIN_VERIFIER_BOND();
    const slashAmount = (verifierBond * BigInt(SLASH_BPS)) / 10_000n;
    const importerCompensation = (slashAmount * 7000n) / 10_000n;
    const treasuryShare = slashAmount - importerCompensation;
    const disputeBond = (VALUE * BigInt(DISPUTE_BPS)) / 10_000n;

    await ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK);
    await ctx.escrow.connect(ctx.importer).raiseDispute(escrowId, Milestone.Inspected);

    await expect(ctx.escrow.connect(ctx.arbiter).resolveDispute(escrowId, false, "bafyreason", true, false))
      .to.emit(ctx.escrow, "VerifierSlashed")
      .withArgs(escrowId, ctx.quality.address, slashAmount, ctx.importer.address)
      .and.to.emit(ctx.escrow, "Refunded")
      .withArgs(escrowId, ctx.importer.address, VALUE);

    expect(await ctx.escrow.verifierBonds(ctx.quality.address)).to.equal(verifierBond - slashAmount);
    expect(await ctx.escrow.verifierSlashCount(ctx.quality.address)).to.equal(1);
    expect(await ctx.idrt.balanceOf(ctx.importer.address)).to.equal(DEMO_BALANCE + importerCompensation);
    expect(await ctx.idrt.balanceOf(ctx.treasury.address)).to.equal(treasuryShare);
    expect(await ctx.idrt.allowance(ctx.importer.address, await ctx.escrow.getAddress())).to.equal(DEMO_BALANCE - VALUE - disputeBond);
  });

  it("sends frivolous dispute bond to exporter without slashing verifier", async function () {
    const ctx = await deployFixture();
    const { escrowId } = await createEscrow(ctx);
    const disputeBond = (VALUE * BigInt(DISPUTE_BPS)) / 10_000n;

    await ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK);
    await ctx.escrow.connect(ctx.importer).raiseDispute(escrowId, Milestone.Inspected);
    await ctx.escrow.connect(ctx.arbiter).resolveDispute(escrowId, true, "bafyreason", false, true);

    expect(await ctx.idrt.balanceOf(ctx.exporter.address)).to.equal(DEMO_BALANCE + VALUE + disputeBond);
    expect(await ctx.escrow.verifierSlashCount(ctx.quality.address)).to.equal(0);
  });

  it("supports global deadline refund from an unfinished state", async function () {
    const ctx = await deployFixture();
    const deadline = (await time.latest()) + 100;
    const { escrowId } = await createEscrow(ctx, { deadline });

    await time.increaseTo(deadline + 1);
    await expect(ctx.escrow.connect(ctx.importer).claimRefund(escrowId))
      .to.emit(ctx.escrow, "Refunded")
      .withArgs(escrowId, ctx.importer.address, VALUE);

    expect((await ctx.escrow.getEscrow(escrowId)).state).to.equal(State.Refunded);
  });

  it("extends the global deadline when importer and exporter both approve", async function () {
    const ctx = await deployFixture();
    const { escrowId, deadline } = await createEscrow(ctx);
    const newDeadline = deadline + 3 * 24 * 60 * 60;

    await expect(ctx.escrow.connect(ctx.exporter).proposeDeadlineExtension(escrowId, newDeadline))
      .to.emit(ctx.escrow, "DeadlineExtensionProposed")
      .withArgs(escrowId, ctx.exporter.address, newDeadline);

    expect(await ctx.escrow.pendingDeadline(escrowId)).to.equal(newDeadline);
    expect(await ctx.escrow.extensionProposer(escrowId)).to.equal(ctx.exporter.address);

    await expect(ctx.escrow.connect(ctx.importer).approveDeadlineExtension(escrowId))
      .to.emit(ctx.escrow, "DeadlineExtended")
      .withArgs(escrowId, newDeadline);

    const view = await ctx.escrow.getEscrow(escrowId);
    expect(view.globalDeadline).to.equal(newDeadline);
    expect(await ctx.escrow.pendingDeadline(escrowId)).to.equal(0);
    expect(await ctx.escrow.extensionProposer(escrowId)).to.equal(ethers.ZeroAddress);
  });

  it("rejects invalid amendment approvals and clears pending extension on dispute", async function () {
    const ctx = await deployFixture();
    const { escrowId, deadline } = await createEscrow(ctx);

    await expect(
      ctx.escrow.connect(ctx.outsider).proposeDeadlineExtension(escrowId, deadline + 1000)
    ).to.be.revertedWith("not escrow party");

    await expect(
      ctx.escrow.connect(ctx.exporter).proposeDeadlineExtension(escrowId, deadline - 1)
    ).to.be.revertedWith("must extend deadline");

    await ctx.escrow.connect(ctx.exporter).proposeDeadlineExtension(escrowId, deadline + 1000);

    await expect(ctx.escrow.connect(ctx.exporter).approveDeadlineExtension(escrowId))
      .to.be.revertedWith("proposer cannot approve");

    await ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, "bafyinspection", PROOF_OK);
    await ctx.escrow.connect(ctx.importer).raiseDispute(escrowId, Milestone.Inspected);

    expect(await ctx.escrow.pendingDeadline(escrowId)).to.equal(0);
    expect(await ctx.escrow.extensionProposer(escrowId)).to.equal(ethers.ZeroAddress);
    await expect(ctx.escrow.connect(ctx.importer).approveDeadlineExtension(escrowId))
      .to.be.revertedWith("escrow disputed");
  });

  it("auto-revokes verifier roles after three slashes", async function () {
    const ctx = await deployFixture();

    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await ctx.escrow.connect(ctx.quality).postVerifierBond();
      }
      const { escrowId } = await createEscrow(ctx, { containerRef: `TGHU-2026-00${i}` });
      await ctx.escrow.connect(ctx.quality).submitMilestoneProof(escrowId, Milestone.Inspected, `bafyinspection${i}`, PROOF_OK);
      await ctx.escrow.connect(ctx.importer).raiseDispute(escrowId, Milestone.Inspected);
      await ctx.escrow.connect(ctx.arbiter).resolveDispute(escrowId, false, `bafyreason${i}`, true, false);
    }

    expect(await ctx.escrow.verifierSlashCount(ctx.quality.address)).to.equal(3);
    expect(await ctx.escrow.hasRole(await ctx.escrow.ROLE_QUALITY_AUDITOR(), ctx.quality.address)).to.equal(false);
  });
});
