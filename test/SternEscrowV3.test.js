const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("STERN demo dispute flow (V3)", function () {
  const VALUE = 45_000_000_00n;
  const GATE = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);

  async function fixture() {
    const [admin, importer, exporter, arbiter, quality, logistics, customs, outsider] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("IDRTDemo")).deploy(admin.address);
    const escrow = await (await ethers.getContractFactory("SternEscrowV3")).deploy(
      await token.getAddress(), admin.address, 30, 60, 60, 300, 5000
    );
    await Promise.all([token.waitForDeployment(), escrow.waitForDeployment()]);
    for (const [role, account] of [
      ["ROLE_QUALITY_AUDITOR", quality], ["ROLE_LOGISTICS", logistics], ["ROLE_CUSTOMS", customs]
    ]) {
      await escrow.connect(admin).grantVerifierRole(await escrow[role](), account.address);
      await token.connect(admin).mint(account.address, 10_000_00n);
      await token.connect(account).approve(await escrow.getAddress(), 10_000_00n);
      await escrow.connect(account)["postVerifierBond()"]();
    }
    await token.connect(admin).mint(importer.address, VALUE * 2n);
    await token.connect(importer).approve(await escrow.getAddress(), VALUE * 2n);
    await escrow.connect(importer).createEscrow(
      exporter.address, arbiter.address, "bafytrade", VALUE,
      (await time.latest()) + 10000, "Coffee", "CONT-1"
    );
    return { token, escrow, importer, exporter, arbiter, quality, logistics, customs, outsider };
  }

  async function verifyAll(ctx) {
    await ctx.escrow.connect(ctx.quality).submitMilestoneProof(0, 1, "bafyinspection", GATE);
    await time.increase(31);
    await ctx.escrow.connect(ctx.logistics).submitMilestoneProof(0, 2, "bafyshipment", GATE);
    await time.increase(31);
    await ctx.escrow.connect(ctx.customs).submitMilestoneProof(0, 3, "bafycustoms", GATE);
  }

  it("keeps exception and dispute distinct; only importer can formally dispute", async function () {
    const ctx = await fixture();
    await expect(ctx.escrow.connect(ctx.exporter).raiseDispute(0, 1))
      .to.be.revertedWith("only importer may dispute");
    // A failed verification leaves no proof, but does not create a dispute.
    await expect(ctx.escrow.connect(ctx.quality).submitMilestoneProof(0, 1, "bafybad", ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false])))
      .to.be.revertedWith("automated gate failed");
    expect((await ctx.escrow.getEscrow(0)).state).to.equal(0);
    await ctx.escrow.connect(ctx.importer).raiseDispute(0, 1);
    expect((await ctx.escrow.getEscrow(0)).state).to.equal(5);
  });

  it("gives the importer 60 seconds after final verification, then settles in another 60 seconds", async function () {
    const ctx = await fixture();
    await verifyAll(ctx);
    expect(await ctx.escrow.disputeWindowSeconds()).to.equal(60n);
    expect(await ctx.escrow.timelockDurationSeconds()).to.equal(60n);
    await expect(ctx.escrow.connect(ctx.outsider).advanceSettlement(0))
      .to.be.revertedWith("dispute window open");
    await time.increase(61);
    await ctx.escrow.connect(ctx.outsider).advanceSettlement(0);
    await expect(ctx.escrow.connect(ctx.importer).raiseDispute(0, 0))
      .to.be.revertedWith("dispute window closed");
    await time.increase(60);
    await ctx.escrow.connect(ctx.outsider).advanceSettlement(0);
    expect((await ctx.escrow.getEscrow(0)).state).to.equal(6);
    expect(await ctx.token.balanceOf(ctx.exporter.address)).to.equal(VALUE);
  });

  it("catches up immediately when the settlement keeper runs late", async function () {
    const ctx = await fixture();
    await verifyAll(ctx);
    await time.increase(121);
    await ctx.escrow.connect(ctx.outsider).advanceSettlement(0);
    expect((await ctx.escrow.getEscrow(0)).state).to.equal(6);
    expect(await ctx.token.balanceOf(ctx.exporter.address)).to.equal(VALUE);
  });

  it("locks disputed funds, gives negotiation time, and permits arbiter evidence-based split", async function () {
    const ctx = await fixture();
    await verifyAll(ctx);
    await ctx.escrow.connect(ctx.importer).raiseDispute(0, 0);
    await expect(ctx.escrow.connect(ctx.outsider).advanceSettlement(0))
      .to.be.revertedWith("settlement cannot advance");
    await expect(ctx.escrow.connect(ctx.arbiter).resolveDisputeSplit(0, VALUE * 7n / 10n, "bafyreason"))
      .to.be.revertedWith("negotiation window open");
    await time.increase(10001);
    await expect(ctx.escrow.connect(ctx.importer).claimRefund(0))
      .to.be.revertedWith("verified trade follows settlement");
    await ctx.escrow.connect(ctx.arbiter).resolveDisputeSplit(0, VALUE * 7n / 10n, "bafyreason");
    expect(await ctx.token.balanceOf(ctx.exporter.address)).to.equal(VALUE * 7n / 10n);
    expect((await ctx.escrow.getEscrow(0)).state).to.equal(6);
  });

  it("lets the designated arbiter execute a pinned agreement split", async function () {
    const ctx = await fixture();
    await ctx.escrow.connect(ctx.importer).raiseDispute(0, 0);
    await ctx.escrow.connect(ctx.arbiter).resolveDisputeByAgreement(0, VALUE / 2n, "bafyagreement");
    expect((await ctx.escrow.getEscrow(0)).state).to.equal(6);
  });

  it("settles full refund or release by agreement without waiting for arbitration", async function () {
    for (const toExporter of [0n, VALUE]) {
      const ctx = await fixture();
      await ctx.escrow.connect(ctx.importer).raiseDispute(0, 0);
      await ctx.escrow.connect(ctx.arbiter).resolveDisputeByAgreement(0, toExporter, "bafyagreement");
      expect((await ctx.escrow.getEscrow(0)).state).to.equal(toExporter === 0n ? 7 : 6);
      expect(await ctx.token.balanceOf(ctx.exporter.address)).to.equal(toExporter);
    }
  });
});
