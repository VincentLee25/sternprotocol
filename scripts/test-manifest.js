// Tests the two manifests: the one the escrow is created against, and the one
// that evidences customs clearance for milestone 3.
//
//   node scripts/test-manifest.js
//
// Against a local stand-in for an IPFS node, like test-ebl-ipfs.js, so it needs
// no keys and no internet. What is being checked here is not "does pinning
// work" — that suite already exists — but the two claims this change makes:
//
//   1. One CID on chain commits to the whole set. The manifest states the
//      quantity and names the bill of lading, the commercial invoice and the
//      packing list; change any figure on any of them and the CID changes.
//   2. A bare bill of lading at documentCid still verifies exactly as before,
//      because every escrow created before manifests existed has one there.
//
// And the refusals, which are the part worth testing: a manifest naming a
// document that does not resolve, an invoice for a different quantity, customs
// documents for somebody else's container, a PEB with no registration number.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = Number(process.env.MANIFEST_TEST_PORT || 5631);
const STUB = path.resolve(__dirname, "test-support/ipfs-node-stub.js");
const DEMO = path.resolve(__dirname, "../docs/demo");

// See the long note in test-ebl-ipfs.js: setting PINATA_JWT to "" rather than
// deleting it is what stops dotenv putting the real key back and sending this
// suite's pins to the actual Pinata.
process.env.PINATA_JWT = "";
process.env.IPFS_API_AUTH = "";
process.env.IPFS_API_URL = `http://127.0.0.1:${PORT}`;
process.env.IPFS_GATEWAYS = `http://127.0.0.1:${PORT}`;
// A throwaway customs store, so a run cannot write into the gateway's own.
process.env.CUSTOMS_STORE_FILE = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "stern-customs-")),
  "customs.json"
);

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

function startStub(port) {
  return spawn(process.execPath, [STUB], {
    stdio: "ignore",
    env: { ...process.env, STUB_PORT: String(port) }
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

const b64 = (bytes) => bytes.toString("base64");
const asDocument = (bytes, fileName) => ({ contentBase64: b64(bytes), fileName });

function fixtures() {
  const { buildPdf } = require("./make-demo-ebl.js");
  const docs = require("./make-demo-docs.js");
  const ref = "TGHU-2026-001";

  fs.mkdirSync(DEMO, { recursive: true });
  return {
    ref,
    bl: buildPdf(ref),
    invoice: docs.build(docs.commercialInvoice(ref)),
    invoiceWrongQuantity: docs.build(docs.commercialInvoice(ref, { quantity: "32 bags" })),
    packing: docs.build(docs.packingList(ref)),
    packingWrongQuantity: docs.build(docs.packingList(ref, { packages: "32" })),
    peb: docs.build(docs.exportDeclaration(ref)),
    pib: docs.build(docs.importDeclaration(ref)),
    duty: docs.build(docs.dutyPayment(ref)),
    pebOtherContainer: docs.build(docs.exportDeclaration("MSCU-9999-999"))
  };
}

async function main() {
  const f = fixtures();
  const stub = startStub(PORT);

  try {
    await waitForStub(PORT);
    const ipfs = require("../backend/oracle-gateway/ipfsService.js");
    const manifests = require("../backend/oracle-gateway/manifestService.js");

    const status = ipfs.ipfsStatus();
    if (status.provider !== "kubo") {
      throw new Error(
        `this suite must run against the local stub, but the configured provider is "${status.provider}".`
      );
    }

    // --- the quantity, before anything is pinned ---------------------------
    console.log("\nQuantity and unit");
    const tonnes = manifests.normaliseQuantity({ value: 19.2, unit: "ton" });
    check("tonnes convert to kilograms", tonnes.valueKg === 19200, String(tonnes.valueKg));
    const bags = manifests.normaliseQuantity({ value: 320, unit: "bag" });
    check("a bag count does not pretend to be a weight", bags.valueKg === null);
    check("the unit is kept for display", bags.text === "320 bag", bags.text);

    let rejected = null;
    try { manifests.normaliseQuantity({ value: 0, unit: "kg" }); } catch (error) { rejected = error; }
    check("zero is refused", rejected?.code === "QUANTITY_INVALID");

    rejected = null;
    try { manifests.normaliseQuantity({ value: 5, unit: "furlongs" }); } catch (error) { rejected = error; }
    check("an unknown unit is refused", rejected?.code === "QUANTITY_UNIT_UNKNOWN");

    // --- the escrow manifest ------------------------------------------------
    console.log("\nThe escrow manifest");
    const pinned = await manifests.pinEscrowManifest({
      containerRef: f.ref,
      commodity: "Arabica Gayo Grade 1",
      quantity: { value: 320, unit: "bag" },
      documents: {
        billOfLading: asDocument(f.bl, "e-bl.pdf"),
        commercialInvoice: asDocument(f.invoice, "invoice.pdf"),
        packingList: asDocument(f.packing, "packing-list.pdf")
      }
    });

    check("the manifest pins to a CIDv0", /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(pinned.cid), pinned.cid);
    check("we reproduce the service's CID ourselves", pinned.cidSelfChecked);
    check("it names all three documents", Object.keys(pinned.manifest.documents).length === 3);
    check("it records the quantity", pinned.manifest.quantity?.value === 320);

    const verdict = await ipfs.verifyDocument(pinned.cid, { containerRef: f.ref });
    check("it verifies", verdict.valid, verdict.reason);
    check("it is recognised as a manifest", verdict.kind === "manifest", verdict.kind);
    check("the bill of lading inside it resolves", verdict.checks.billOfLadingResolves);
    check("the invoice resolves", verdict.checks.invoiceResolves);
    check("the packing list resolves", verdict.checks.packingListResolves);
    check("the container check still runs, through the manifest", verdict.checks.hasContainerReference);
    check("the B/L number is still read", Boolean(verdict.fields?.billOfLadingNumber), String(verdict.fields?.billOfLadingNumber));
    check("the vessel is still read", verdict.fields?.vessel === "MV SAMUDRA BIRU", String(verdict.fields?.vessel));

    console.log("\nWhat the invoice and packing list added");
    check("the invoice number is read", verdict.fields?.invoice?.invoiceNumber === "INV-GHC-2026-0188", String(verdict.fields?.invoice?.invoiceNumber));
    check("the incoterm is read", /FOB/i.test(String(verdict.fields?.invoice?.incoterm)), String(verdict.fields?.invoice?.incoterm));
    check("the package count is read", verdict.fields?.packing?.packageCount === 320, String(verdict.fields?.packing?.packageCount));
    check("the net weight is read in kilograms", verdict.fields?.packing?.netWeightKg === 19200, String(verdict.fields?.packing?.netWeightKg));
    check("the gross weight is read in kilograms", verdict.fields?.packing?.grossWeightKg === 20450, String(verdict.fields?.packing?.grossWeightKg));
    check("the declared quantity agrees with the documents", verdict.manifest?.quantityCheck?.agrees === true, verdict.manifest?.quantityCheck?.reason);

    // Two documents describing the same trade must pin to the same manifest
    // CID, or nothing downstream can be compared.
    const again = await manifests.pinEscrowManifest({
      containerRef: f.ref,
      commodity: "Arabica Gayo Grade 1",
      quantity: { value: 320, unit: "bag" },
      documents: {
        billOfLading: asDocument(f.bl, "e-bl.pdf"),
        commercialInvoice: asDocument(f.invoice, "invoice.pdf"),
        packingList: asDocument(f.packing, "packing-list.pdf")
      }
    });
    // createdAt is a timestamp, so the CIDs differ — deliberately. State it
    // rather than leaving a reader to assume determinism the manifest does not
    // have: it records WHEN this set was assembled, and two assemblies of the
    // same documents are two different events.
    check("re-pinning the same documents gives the same document CIDs",
      again.documents.billOfLading.cid === pinned.documents.billOfLading.cid);

    console.log("\nA quantity the documents contradict");
    const wrong = await manifests.pinEscrowManifest({
      containerRef: f.ref,
      commodity: "Arabica Gayo Grade 1",
      quantity: { value: 320, unit: "bag" },
      documents: {
        billOfLading: asDocument(f.bl, "e-bl.pdf"),
        commercialInvoice: asDocument(f.invoiceWrongQuantity, "invoice.pdf"),
        packingList: asDocument(f.packingWrongQuantity, "packing-list.pdf")
      }
    });
    const wrongVerdict = await ipfs.verifyDocument(wrong.cid, { containerRef: f.ref });
    check("the disagreement is detected", wrongVerdict.manifest?.quantityCheck?.agrees === false, wrongVerdict.manifest?.quantityCheck?.reason);
    check("and it is stated in the notes", wrongVerdict.notes.some((n) => /Declared 320 bag/.test(n)), wrongVerdict.notes.join(" | "));
    // Reported, not required: gross versus net makes a hard gate produce false
    // refusals, and a false refusal is worse than a visible warning.
    check("but it does not on its own fail the document", wrongVerdict.valid === true, wrongVerdict.reason);

    console.log("\nA manifest naming a document that is not there");
    const { pinDocument } = ipfs;
    const brokenManifest = Buffer.from(
      `${JSON.stringify({
        stern: ipfs.ESCROW_MANIFEST_KIND,
        createdAt: new Date().toISOString(),
        containerRef: f.ref,
        quantity: { value: 320, unit: "bag", unitLabel: "bag", valueKg: null, text: "320 bag" },
        documents: { billOfLading: { cid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", fileName: "missing.pdf" } }
      }, null, 2)}\n`,
      "utf8"
    );
    const brokenPin = await pinDocument(brokenManifest, "broken.json");
    const brokenVerdict = await ipfs.verifyDocument(brokenPin.cid, { containerRef: f.ref });
    check("it fails", brokenVerdict.valid === false);
    check("and names the bill of lading as the reason",
      brokenVerdict.failedChecks.includes("billOfLadingResolves"), brokenVerdict.failedChecks.join(", "));

    console.log("\nA bare bill of lading, as escrows created before this have");
    const barePin = await pinDocument(f.bl, "e-bl.pdf");
    const bare = await ipfs.verifyDocument(barePin.cid, { containerRef: f.ref });
    check("still verifies", bare.valid, bare.reason);
    check("and is reported as a bill of lading, not a manifest", bare.kind === "bill_of_lading", bare.kind);
    check("with the same check names as before", bare.checks.isPdf && bare.checks.hasBillOfLadingNumber && bare.checks.hasContainerReference);
    check("and no manifest block", bare.manifest === undefined);

    // --- the customs manifest ----------------------------------------------
    console.log("\nCustoms documents for milestone 3");
    const customs = await manifests.pinCustomsManifest("41", {
      containerRef: f.ref,
      documents: {
        exportDeclaration: asDocument(f.peb, "peb.pdf"),
        importDeclaration: asDocument(f.pib, "pib.pdf"),
        dutyPayment: asDocument(f.duty, "bukti-bayar.pdf")
      }
    });
    check("the customs manifest pins", /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(customs.cid), customs.cid);
    check("it is recorded against the escrow", manifests.customsFor("41")?.cid === customs.cid);
    check("and not against another one", manifests.customsFor("42") === null);

    const cv = await ipfs.verifyCustomsManifest(customs.cid, { containerRef: f.ref });
    check("it verifies", cv.valid, cv.reason);
    check("the PEB resolves", cv.checks.pebResolves);
    check("the PIB resolves", cv.checks.pibResolves);
    check("the payment resolves", cv.checks.dutyPaymentResolves);
    check("the PEB registration number is read", cv.fields.pebNumber === "401234", String(cv.fields.pebNumber));
    check("the PIB registration number is read", cv.fields.pibNumber === "228877", String(cv.fields.pibNumber));
    check("the customs office is read", /Belawan/i.test(String(cv.fields.customsOffice)), String(cv.fields.customsOffice));
    check("the NTPN is read", cv.fields.ntpn === "A1B2C3D4E5F60718", String(cv.fields.ntpn));
    check("the VAT actually paid is read", cv.fields.vatIdr === 4725000, String(cv.fields.vatIdr));
    check("a payment reference is present, so this is duty PAID not owed", cv.checks.hasPaymentReference);
    check("the documents mention this escrow's container", cv.checks.mentionsContainer);

    console.log("\nCustoms documents for the wrong container");
    const otherCustoms = await manifests.pinCustomsManifest("43", {
      containerRef: "MSCU-9999-999",
      documents: { exportDeclaration: asDocument(f.pebOtherContainer, "peb.pdf") }
    });
    const other = await ipfs.verifyCustomsManifest(otherCustoms.cid, { containerRef: f.ref });
    check("the mismatch is detected", other.checks.mentionsContainer === false);
    check("and stated", other.notes.some((n) => /does not|None of the customs documents/i.test(n)), other.notes.join(" | "));

    console.log("\nA customs manifest with no PEB");
    let refused = null;
    try {
      await manifests.pinCustomsManifest("44", {
        containerRef: f.ref,
        documents: { dutyPayment: asDocument(f.duty, "bukti-bayar.pdf") }
      });
    } catch (error) { refused = error; }
    check("is refused before anything is pinned", refused?.code === "DOCUMENT_MISSING", refused?.message);

    console.log("\nA manifest with no bill of lading");
    refused = null;
    try {
      await manifests.pinEscrowManifest({
        containerRef: f.ref,
        quantity: { value: 320, unit: "bag" },
        documents: { commercialInvoice: asDocument(f.invoice, "invoice.pdf") }
      });
    } catch (error) { refused = error; }
    check("is refused", refused?.code === "DOCUMENT_MISSING", refused?.message);

    console.log("\nReplacing customs documents keeps the earlier set");
    await manifests.pinCustomsManifest("41", {
      containerRef: f.ref,
      documents: { exportDeclaration: asDocument(f.peb, "peb-v2.pdf") }
    });
    const history = manifests.customsHistory("41");
    check("the history has both", history.length === 2, String(history.length));
    check("current is the newest", history[0].manifest.documents.exportDeclaration.fileName === "peb-v2.pdf");

    // --- the milestone gate -------------------------------------------------
    console.log("\nWhat the customs documents gate");
    const contract = require("../backend/oracle-gateway/contractService.js");
    const base = { vgmMatch: true, inspectionPassed: true, aisDeparted: true, ceisaApproved: true, eblCidValid: true, eblCheckable: true };

    check("nothing attached does not block Cleared",
      contract.milestonePassed("arrived_cleared", { ...base, customsDocsValid: null, customsDocsCheckable: false }) === true);
    check("attached and wrong blocks Cleared",
      contract.milestonePassed("arrived_cleared", { ...base, customsDocsValid: false, customsDocsCheckable: true }) === false);
    check("attached but uncheckable does not block Cleared",
      contract.milestonePassed("arrived_cleared", { ...base, customsDocsValid: false, customsDocsCheckable: false }) === true);
    check("and it gates only Cleared, not the first two",
      contract.milestonePassed("inspected", { ...base, customsDocsValid: false, customsDocsCheckable: true }) === true
      && contract.milestonePassed("shipped", { ...base, customsDocsValid: false, customsDocsCheckable: true }) === true);

    console.log("\nThe proof CID written on chain for Cleared");
    check("is the customs manifest when one is attached",
      contract.proofCidFor("41", "arrived_cleared", "bafy-verified") === manifests.customsFor("41").cid);
    check("and the synthetic string when none is",
      contract.proofCidFor("999", "arrived_cleared", "bafy-verified") === "bafy-verified-999-arrived_cleared");
    check("the first two milestones are unchanged",
      contract.proofCidFor("41", "inspected", "bafy-verified") === "bafy-verified-41-inspected");
  } finally {
    stub.kill();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
