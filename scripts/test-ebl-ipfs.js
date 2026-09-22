// Tests the e-BL path: pin a bill of lading to IPFS, fetch it back by CID,
// and check that the bytes hash to the address they came from.
//
//   node scripts/test-ebl-ipfs.js
//
// Runs against a local stand-in for an IPFS node rather than the real network,
// so it needs no keys and no internet. The stand-in computes CIDs with the
// same library and settings a real node uses, which is what makes the
// comparison meaningful — see scripts/test-support/ipfs-node-stub.js.
//
// The interesting cases are the refusals. A check that only ever passes is not
// a check, so most of this file is about the ways a document is supposed to be
// rejected: a CID that resolves to nothing, a gateway that serves different
// bytes than the address promises, a valid bill of lading for somebody else's
// container, a scan with no readable text, and the placeholder CIDs that
// escrows created before this existed still carry.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.EBL_TEST_PORT || 5621);
const STUB = path.resolve(__dirname, "test-support/ipfs-node-stub.js");
const FIXTURE = path.resolve(__dirname, "../docs/demo/e-bl-TGHU-2026-001.pdf");

process.env.IPFS_API_URL = `http://127.0.0.1:${PORT}`;
process.env.IPFS_GATEWAYS = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function startStub(port, { tamper = false } = {}) {
  return spawn(process.execPath, [STUB], {
    stdio: "ignore",
    env: { ...process.env, STUB_PORT: String(port), ...(tamper ? { STUB_SWAP_CONTENT: "1" } : {}) }
  });
}

async function waitForStub(port) {
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/ipfs/ping`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`the IPFS stub never came up on ${port}`);
}

function ensureFixture() {
  if (!fs.existsSync(FIXTURE)) {
    const { buildPdf } = require("./make-demo-ebl.js");
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, buildPdf("TGHU-2026-001"));
  }
  return fs.readFileSync(FIXTURE);
}

async function main() {
  const pdf = ensureFixture();
  const stub = startStub(PORT);

  try {
    await waitForStub(PORT);
    const ipfs = require("../backend/oracle-gateway/ipfsService.js");

    console.log("\nThe real document");
    const pinned = await ipfs.pinDocument(pdf, "e-bl-TGHU-2026-001.pdf");
    check("pins to a CIDv0", /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(pinned.cid), pinned.cid);
    check("we reproduce the service's CID ourselves", pinned.cidSelfChecked);

    const good = await ipfs.verifyDocument(pinned.cid, { containerRef: "TGHU-2026-001" });
    check("verifies", good.valid, good.reason);
    check("the bytes hash back to the CID", good.checks.cidMatchesContent);
    check("is a PDF", good.checks.isPdf);
    check("text is readable", good.checks.hasText);
    check("B/L number read", good.fields.billOfLadingNumber === "IDSUBU2026001", good.fields.billOfLadingNumber);
    check("vessel is the vessel, not the shipper", good.fields.vessel === "MV SAMUDRA BIRU", good.fields.vessel);
    check("gross weight keeps its thousands separator", /19\s?200,00/.test(good.fields.grossWeight || ""), good.fields.grossWeight);
    check("voyage read", good.fields.voyage === "0264E", good.fields.voyage);
    check("both ports read",
      /Belawan/.test(good.fields.portOfLoading || "") && /Rotterdam/.test(good.fields.portOfDischarge || ""));
    check("both parties read", Boolean(good.fields.shipper && good.fields.consignee));
    check("only real container numbers are listed",
      good.fields.containerNumbers.length === 1 && good.fields.containerNumbers[0] === "TGHU-2026-001",
      JSON.stringify(good.fields.containerNumbers));

    console.log("\nA bill of lading for a different container");
    const wrong = await ipfs.verifyDocument(pinned.cid, { containerRef: "MSKU-9999-999" });
    check("refused", !wrong.valid);
    check("names the failing check", wrong.failedChecks.includes("hasContainerReference"));
    check("says which container is missing", /MSKU-9999-999/.test(wrong.notes.join(" ")));

    console.log("\nA CID nothing resolves at");
    const missing = await ipfs.verifyDocument("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", {});
    check("refused", !missing.valid);
    check("reported as unavailable", missing.available === false);
    check("lists the gateways it tried", new RegExp(`127\\.0\\.0\\.1:${PORT}`).test(missing.reason));

    console.log("\nThe placeholder CIDs from before the document was pinned");
    const placeholder = await ipfs.verifyDocument("bafybeisternelectronicbillofla", {});
    check("refused", !placeholder.valid);
    check("diagnosed as a placeholder", placeholder.placeholder === true);
    check("explains the fix", /pinned/i.test(placeholder.reason), placeholder.reason);

    const keccak = await ipfs.verifyDocument(`0x${"ab".repeat(32)}`, {});
    check("a keccak hash is refused too", !keccak.valid && keccak.placeholder === true);

    console.log("\nContent that is not a bill of lading");
    const text = await ipfs.pinDocument(Buffer.from("a plain text note, not a bill of lading"), "note.txt");
    const textVerdict = await ipfs.verifyDocument(text.cid, {});
    check("resolves", textVerdict.checks.cidResolves);
    check("but is refused", !textVerdict.valid);
    check("names the PDF check", textVerdict.failedChecks.includes("isPdf"));

    console.log("\nNo CID at all");
    const none = await ipfs.verifyDocument(null, {});
    check("refused without touching the network", !none.valid && none.available === false);

    console.log("\nFault simulation overrides a good document");
    const faulted = await ipfs.verifyDocumentCached(pinned.cid, {
      containerRef: "TGHU-2026-001",
      simulateFault: true
    });
    check("refused", !faulted.valid);
    check("labelled as simulated, not as a real failure", faulted.simulatedFault === true);
    check("the simulation appears in the failed checks", faulted.failedChecks.includes("simulatedFault"));

    console.log("\nThe verdict is cached, because a CID's content cannot change");
    const cached = await ipfs.verifyDocumentCached(pinned.cid, { containerRef: "TGHU-2026-001" });
    check("still valid", cached.valid);
    check("served from cache", cached.cached === true);
  } finally {
    stub.kill();
  }

  // The case this whole design exists for, on its own node so the tampering is
  // isolated: the gateway answers, but with bytes that do not hash to the CID
  // that was asked for. Nothing else in the check would notice.
  console.log("\nA gateway that serves different bytes than the CID promises");
  const tamperPort = PORT + 1;
  const tamperStub = startStub(tamperPort, { tamper: true });
  try {
    await waitForStub(tamperPort);
    process.env.IPFS_API_URL = `http://127.0.0.1:${tamperPort}`;
    process.env.IPFS_GATEWAYS = `http://127.0.0.1:${tamperPort}`;
    for (const name of ["./config.js", "./ipfsService.js"]) {
      delete require.cache[require.resolve(`../backend/oracle-gateway/${name.slice(2)}`)];
    }
    const ipfs = require("../backend/oracle-gateway/ipfsService.js");

    const pinned = await ipfs.pinDocument(pdf, "e-bl.pdf");
    const verdict = await ipfs.verifyDocument(pinned.cid, { containerRef: "TGHU-2026-001" });
    check("the CID still resolves", verdict.checks.cidResolves);
    check("the content mismatch is caught", verdict.checks.cidMatchesContent === false);
    check("refused", verdict.valid === false);
    check("says what it hashed to instead", /hash to Qm/.test(verdict.notes.join(" ")), verdict.notes.join(" "));
  } finally {
    tamperStub.kill();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error("harness error:", error);
  process.exit(2);
});
