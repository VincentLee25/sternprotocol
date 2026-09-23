import { ethers } from "ethers";

// Container reference: 4 letters (owner + category), then digits, tolerant of
// dashes, e.g. TGHU-2026-001 or MSKU2026014.
const CONTAINER_REF = /^[A-Za-z]{4}[-\s]?[A-Za-z0-9]{2,10}([-\s][A-Za-z0-9]{1,6})?$/;

export function validateEscrowForm(form, cid) {
  const errors = {};

  if (!form.exporter) {
    errors.exporter = "Exporter wallet is required.";
  } else if (!ethers.isAddress(form.exporter)) {
    errors.exporter = "Not a valid Ethereum address (0x + 40 hex characters).";
  }

  if (!form.arbiter) {
    errors.arbiter = "Arbiter wallet is required.";
  } else if (!ethers.isAddress(form.arbiter)) {
    errors.arbiter = "Not a valid Ethereum address (0x + 40 hex characters).";
  } else if (form.exporter && form.arbiter.toLowerCase() === form.exporter.toLowerCase()) {
    errors.arbiter = "Arbiter must be different from the exporter — they hold the tie-breaking vote.";
  }

  const value = Number(form.value);
  if (!form.value) {
    errors.value = "Contract value is required.";
  } else if (!Number.isFinite(value) || value <= 0) {
    errors.value = "Enter a positive number.";
  } else if (value > 1e9) {
    errors.value = "Value is unrealistically large for this demo.";
  }

  if (!form.commodity || form.commodity.trim().length < 3) {
    errors.commodity = "Describe the commodity (min. 3 characters).";
  }

  // The quantity the contract value is being paid for. It lives in the
  // manifest rather than on chain — the contract has no field for it — but it
  // is not optional: an escrow that settles a sum against a commodity name and
  // no amount states no enforceable term.
  const quantity = Number(form.quantity);
  if (!form.quantity) {
    errors.quantity = "Quantity is required — how much of it is this escrow for?";
  } else if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.quantity = "Enter a positive number.";
  }

  if (!form.containerRef) {
    errors.containerRef = "Container reference is required.";
  } else if (!CONTAINER_REF.test(form.containerRef.trim())) {
    errors.containerRef = "Expected format like TGHU-2026-001 (4-letter prefix + numbers).";
  }

  if (!form.deadline) {
    errors.deadline = "Settlement deadline is required.";
  } else {
    const deadlineMs = new Date(form.deadline).getTime();
    if (!Number.isFinite(deadlineMs)) {
      errors.deadline = "Invalid date.";
    } else if (deadlineMs < Date.now() + 2 * 60 * 1000) {
      // The contract asks only for `globalDeadline > block.timestamp`. The two
      // minutes here are for clock drift between this browser and the chain,
      // nothing more.
      //
      // This used to demand a full hour, which is not a rule the contract has —
      // and it made claimRefund impossible to exercise, since a refund needs the
      // deadline to have PASSED. An hour of waiting to test one button is not a
      // safety property, it is an obstacle.
      errors.deadline = "Deadline must be at least a couple of minutes ahead — the contract rejects a deadline that is already past.";
    }
  }

  if (!cid) {
    errors.document =
      "Attach the bill of lading and pin it — the address of the pinned manifest is what anchors the contract.";
  }

  return { errors, valid: Object.keys(errors).length === 0 };
}
