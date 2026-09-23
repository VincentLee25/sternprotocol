// Drives the document set on the creation form and the customs upload on the
// evidence panel, in a real browser, against the documents stub.
//
//   node scripts/test-support/documents-gateway-stub.js        # :4112
//   cd frontend && VITE_ORACLE_API=http://localhost:4112 npm run build && npx vite preview
//   node scripts/test-support/documents-browser.mjs
//
// What this checks that a unit test cannot: that the quantity reaches the
// manifest, that editing it afterwards drops the pinned manifest instead of
// putting a stale one on chain, and that the customs upload turns the panel's
// "not attached" into a verdict read off the real PEB.
import { chromium } from "playwright";

const BASE = process.env.APP_URL || "http://127.0.0.1:4173";
const DEMO = process.env.DEMO_DIR || "docs/demo";
const shots = process.env.SHOT_DIR || ".";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Access workspace" }).first().click();
await page.getByRole("button", { name: /sign in to continue/i }).click();
await page.waitForTimeout(1500);

// --- the creation form ------------------------------------------------------
await page.getByRole("button", { name: /new escrow/i }).first().click();
await page.waitForTimeout(500);

check("the form asks for a quantity", await page.getByLabel(/^quantity/i).first().isVisible());
const units = await page.locator('select[name="quantityUnit"] option').allTextContents();
check("with a unit to pick", units.includes("kg") && units.includes("ton") && units.includes("bag"), units.join(","));

check("it asks for a commercial invoice", (await page.getByText("Commercial invoice").count()) > 0);
check("and a packing list", (await page.getByText("Packing list").count()) > 0);
check(
  "and says which one is required",
  (await page.getByText(/choose the bill of lading first/i).count()) > 0
);

await page.locator('input[name="exporter"]').fill("0x1111111111111111111111111111111111111111");
await page.locator('input[name="arbiter"]').fill("0x2222222222222222222222222222222222222222");
await page.locator('input[name="value"]').fill("45000000");
await page.locator('input[name="commodity"]').fill("Arabica Gayo Grade 1");
await page.locator('input[name="containerRef"]').fill("TGHU-2026-001");
await page.locator('input[name="quantity"]').fill("320");
await page.selectOption('select[name="quantityUnit"]', "bag");
await page.locator('input[name="deadline"]').fill("2027-01-01T12:00");

// Three file inputs, in the order the slots are declared.
const fileInputs = page.locator('input[type="file"]');
await fileInputs.nth(0).setInputFiles(`${DEMO}/e-bl-TGHU-2026-001.pdf`);
await fileInputs.nth(1).setInputFiles(`${DEMO}/invoice-TGHU-2026-001.pdf`);
await fileInputs.nth(2).setInputFiles(`${DEMO}/packing-list-TGHU-2026-001.pdf`);
await page.waitForTimeout(300);

check(
  "nothing is uploaded until Pin is pressed",
  await page.getByText(/nothing has left this browser yet/i).isVisible()
);

await page.getByRole("button", { name: /pin 3 documents to ipfs/i }).click();
await page.getByText(/Manifest address/i).waitFor({ timeout: 30000 });
check("pinning produces a manifest address", true);

const cid = (await page.locator("p.font-mono.break-all").first().innerText()).trim();
check("which is a CIDv0", /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid), cid);

check("the manifest lists the quantity", (await page.getByText("320 bag").count()) > 0);
check(
  "and each document behind the one address",
  (await page.getByText(/behind that one address/i).count()) > 0
);
check(
  "the quantity is checked against the documents",
  (await page.getByText(/within 5% of|matching the declared quantity/i).count()) > 0
);
check("the invoice number was read", (await page.getByText("INV-GHC-2026-0188").count()) > 0);
check("the net weight was read", (await page.getByText(/19\.200 kg/).count()) > 0);
await page.screenshot({ path: `${shots}/documents-pinned.png`, fullPage: true });

// Editing the quantity must invalidate the pinned manifest: it records a
// figure, and a stale one on chain would state a quantity nobody agreed to.
await page.locator('input[name="quantity"]').fill("32");
await page.waitForTimeout(400);
check(
  "editing the quantity drops the pinned manifest",
  (await page.getByText(/Manifest address/i).count()) === 0
);
check(
  "and the review rail says so",
  (await page.getByText(/3 chosen, not pinned/i).count()) > 0
);

// --- the customs card on the evidence panel --------------------------------
//
// Reached by clicking through the dashboard, not by a reload: this app has no
// routes, and a reload drops the mock session and lands back on the landing
// page.
await page.getByRole("button", { name: /escrows/i }).first().click();
await page.waitForTimeout(1500);
await page.getByText("TGHU-2026-001").first().click();
await page.waitForTimeout(2500);

// The stub keeps what a previous run uploaded, so this escrow may already have
// documents attached. Both states are correct; the "not attached" copy is only
// asserted when that is the state on screen.
const notAttached = await page
  .getByText(/Milestone 3 claims the goods are legally through both borders/i)
  .isVisible()
  .catch(() => false);
if (notAttached) {
  check("the panel says what claiming Cleared should carry", true);
  check(
    "and that nothing is blocked while they are missing",
    await page.getByText(/Nothing is blocked while they are missing/i).isVisible().catch(() => false)
  );
  await page.screenshot({ path: `${shots}/customs-not-attached.png`, fullPage: true });
} else {
  check(
    "the panel already shows a customs verdict",
    await page.getByText(/Customs documents on IPFS/i).isVisible().catch(() => false)
  );
}

await page
  .getByRole("button", { name: /attach peb, pib and proof of payment|replace the customs documents/i })
  .click();
await page.waitForTimeout(300);

const customsInputs = page.locator('input[type="file"]');
const count = await customsInputs.count();
await customsInputs.nth(count - 3).setInputFiles(`${DEMO}/peb-TGHU-2026-001.pdf`);
await customsInputs.nth(count - 2).setInputFiles(`${DEMO}/pib-TGHU-2026-001.pdf`);
await customsInputs.nth(count - 1).setInputFiles(`${DEMO}/bukti-bayar-TGHU-2026-001.pdf`);
await page.waitForTimeout(300);

await page.getByRole("button", { name: /pin to ipfs/i }).click();
await page.getByText(/Customs documents on IPFS/i).waitFor({ timeout: 30000 });
check("attaching them gives a verdict", true);

check("the PEB number is read off the document", (await page.getByText("401234").count()) > 0);
check("the PIB number too", (await page.getByText("228877").count()) > 0);
check("and the NTPN, which is what makes it duty PAID", (await page.getByText("A1B2C3D4E5F60718").count()) > 0);
check("the PPN actually paid is shown", (await page.getByText(/4\.725\.000/).count()) > 0);
check(
  "the checks are listed",
  (await page.getByText(/duty paid, not just owed/i).count()) > 0
);
check(
  "each declaration keeps its own address",
  (await page.locator("a", { hasText: /^Qm/ }).count()) >= 3
);
check(
  "the picker closes once the upload succeeds",
  (await page.getByRole("button", { name: /^pin to ipfs$/i }).count()) === 0
);
await page.screenshot({ path: `${shots}/customs-attached.png`, fullPage: true });

// --- phone width -----------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
const card = await page.getByText(/Customs documents on IPFS/i).boundingBox();
check("the customs card fits a phone", card !== null && card.x >= 0 && card.x + card.width <= 390,
  card ? `x=${Math.round(card.x)} w=${Math.round(card.width)}` : "no box");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("with no horizontal page scroll", overflow <= 1, `overflow ${overflow}px`);
await page.screenshot({ path: `${shots}/customs-phone.png`, fullPage: true });

check("no script errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
