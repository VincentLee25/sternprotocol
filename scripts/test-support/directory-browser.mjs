// Drives the handle lookup and the handle-claim card in a real browser.
//
// Against the directory stub (scripts/test-support/directory-gateway-stub.js)
// and a build made with VITE_ORACLE_API pointed at it. Checks what a unit test
// cannot: that the debounce lands, that a pick actually writes the address into
// the field, and that the address stays visible afterwards — the whole point of
// the design.
import { chromium } from "playwright";

const BASE = process.env.APP_URL || "http://127.0.0.1:4173";
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

// CHROME_PATH is for machines where Playwright's own download is not present
// (this repo does not depend on playwright, so it is run ad hoc).
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
// Only real script errors. Console errors are not usable as a signal here: the
// stub serves the directory and nothing else, so the app's own polling of
// /escrows and /oracle/* fails by design, and outbound TLS in this sandbox goes
// through a proxy the browser does not trust. Those say nothing about the code
// under test.
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));

// The workspace is reached through company sign-in, and the workspace step
// refuses unless the company user's registered wallet matches the one the
// session derives. mockBackend hashes "smart-buyer@example.com", so that
// address is deterministic — this is it.
const API = process.env.API_URL || "http://127.0.0.1:4111";
const CREDENTIALS = { email: "dir@stern.test", password: "Rahasia12345!" };
const registration = await fetch(`${API}/auth/register-company`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    companyName: "PT Demo Importir",
    username: "dirimportir",
    walletAddress: "0x736d6172742d6275796572406578616d706c652e",
    ...CREDENTIALS
  })
});
if (!registration.ok && registration.status !== 409) {
  console.log(`  note  registration returned ${registration.status}: ${(await registration.text()).slice(0, 200)}`);
}

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Access workspace" }).first().click();
await page.waitForTimeout(2500);
await page.locator('input[name="email"]').fill(CREDENTIALS.email);
await page.locator('input[name="password"]').fill(CREDENTIALS.password);
await page.getByRole("button", { name: /^continue$/i }).click();
await page.waitForTimeout(2000);
await page
  .getByRole("button", { name: /continue to workspace|continue with google, apple/i })
  .first()
  .click();
await page.waitForTimeout(2500);

// --- the claim card in the sidebar ----------------------------------------
//
// The mock session's address is deterministic, so on a second run against the
// same store this wallet already holds a handle and the card shows a rename
// instead. Both are correct; the test takes whichever is on screen rather than
// depending on the store being empty.
const sidebar = page.locator("aside").first();
const claimButton = page.getByRole("button", { name: /claim a handle/i });
const renameButton = page.getByRole("button", { name: /change your handle/i });
const fresh = await claimButton.isVisible().catch(() => false);
check(
  "the sidebar offers a handle to claim, or the one already held",
  fresh || (await renameButton.isVisible().catch(() => false))
);
await (fresh ? claimButton : renameButton).click();
await page.getByPlaceholder("gayocoffee").fill("demo.importer");
await page.getByPlaceholder("Company name (optional)").fill("PT Demo Importir");
await page.getByRole("button", { name: /^save$/i }).click();
await page.waitForTimeout(800);
check("the claimed handle is shown back", (await sidebar.innerText()).includes("@demo.importer"));

// A handle someone else holds must be refused, and the refusal must reach the
// person typing rather than being swallowed.
await page.getByRole("button", { name: /change your handle/i }).click();
await page.getByPlaceholder("gayocoffee").fill("gayocoffee");
await page.getByRole("button", { name: /^save$/i }).click();
await page.waitForTimeout(800);
check(
  "a taken handle is refused on screen",
  await page.getByText(/already taken/i).isVisible().catch(() => false)
);
await page.getByRole("button", { name: /^cancel$/i }).click();
check("the held handle survives a refused rename", (await sidebar.innerText()).includes("@demo.importer"));

// --- the lookup on the escrow form ----------------------------------------
await page.getByRole("button", { name: /new escrow/i }).first().click();
await page.waitForTimeout(600);

const exporterSearch = page.getByPlaceholder(/find the exporter by handle/i);
check("the exporter field has a handle search", await exporterSearch.isVisible());

// One character must not list the book.
await exporterSearch.fill("g");
await page.waitForTimeout(600);
check(
  "one character lists nothing",
  !(await page.getByText("PT Gayo Highland Coffee").isVisible().catch(() => false))
);

await exporterSearch.fill("gayo");
await page.getByText("PT Gayo Highland Coffee").waitFor({ timeout: 4000 });
check("two or more characters search", true);
check(
  "the caveat is on screen at the moment of choosing",
  await page.getByText(/nothing here proves who owns it/i).isVisible()
);
await page.screenshot({ path: `${shots}/directory-lookup.png` });

await page.getByText("PT Gayo Highland Coffee").click();
await page.waitForTimeout(400);

const exporterInput = page.locator('input[value="0x1111111111111111111111111111111111111111"]');
check("picking a handle fills the address in", (await exporterInput.count()) > 0);
check(
  "the address stays visible and editable",
  (await exporterInput.count()) > 0 && !(await exporterInput.first().isDisabled())
);
check(
  "the form records where the address came from",
  (await page.getByText(/gayocoffee · PT Gayo Highland Coffee/).count()) > 0
);

// Typing over the address must drop the chip: the handle no longer describes
// what is in the field.
await exporterInput.first().fill("0x9999999999999999999999999999999999999999");
await page.waitForTimeout(300);
check(
  "typing over the address clears the handle chip",
  (await page.getByText(/gayocoffee · PT Gayo Highland Coffee/).count()) === 0
);
await page.screenshot({ path: `${shots}/directory-picked.png` });

// --- a handle that does not exist -----------------------------------------
await exporterSearch.fill("zzzz");
await page.waitForTimeout(700);
check(
  "an unknown handle says to paste the address instead",
  await page.getByText(/paste the address in the field below/i).isVisible()
);

// --- phone width -----------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await exporterSearch.fill("rotterdam");
await page.getByText("Rotterdam Beans BV").waitFor({ timeout: 4000 });
const box = await page.getByText("Rotterdam Beans BV").boundingBox();
check("the results fit a phone", box !== null && box.x >= 0 && box.x + box.width <= 390,
  box ? `x=${Math.round(box.x)} w=${Math.round(box.width)}` : "no box");
await page.screenshot({ path: `${shots}/directory-phone.png` });

check("no script errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
