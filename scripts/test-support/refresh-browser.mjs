// Times a manual Refresh in a real browser, against a gateway whose activity
// endpoint is deliberately slow.
//
//   ACTIVITY_DELAY_MS=8000 node scripts/test-support/documents-gateway-stub.js
//   cd frontend && VITE_ORACLE_API=http://localhost:4112 npm run build && npx vite preview
//   node scripts/test-support/refresh-browser.mjs
//
// The complaint: pressing Refresh held a page-level "Reading the latest state"
// overlay for minutes. The cause was that the refresh awaited the event
// history, which on the gateway is a log scan over a wide block range — so the
// overlay was covering a blockchain rescan and calling it a state read.
//
// Timing is the whole assertion here, which is why this cannot be a unit test:
// the question is not whether the data arrives but whether the page waits for
// it. The stub delays the history by ACTIVITY_DELAY_MS; the state must appear
// well inside that, and the history must still arrive afterwards.
import { chromium } from "playwright";
import { signIn } from "./browser-session.mjs";

const BASE = process.env.APP_URL || "http://127.0.0.1:4173";
const API = process.env.API_URL || "http://127.0.0.1:4112";
const DELAY = Number(process.env.ACTIVITY_DELAY_MS || 8000);
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

// When each gateway RESPONSE lands. Responses, not requests: the claim is
// about what the page waits for, and a request timestamp says nothing about
// that.
//
// Matched on port rather than on the base URL string, because the build is
// made with VITE_ORACLE_API=http://localhost:4112 while this script talks to
// 127.0.0.1 — the same server, two spellings, and a startsWith() against one
// of them silently matches nothing.
const apiPort = new URL(API).port;
const responses = [];
page.on("response", (response) => {
  try {
    const url = new URL(response.url());
    if (url.port === apiPort) responses.push({ at: Date.now(), path: url.pathname });
  } catch {
    // Not a URL we can parse; not ours either.
  }
});
const landed = (pattern) => responses.find((entry) => pattern.test(entry.path));

await signIn(page, { base: BASE, api: API, log: console.log });

await page.getByRole("button", { name: /escrows/i }).first().click();
await page.waitForTimeout(1500);
await page.getByText("TGHU-2026-001").first().click();
await page.waitForTimeout(2500);

// --- the refresh ------------------------------------------------------------
const modal = page.getByText("Reading the latest state");
responses.length = 0;
const pressedAt = Date.now();
await page.getByRole("button", { name: /^refresh/i }).first().click();

// Sample the overlay while the slow history request is in flight. Waiting for
// it to appear and then disappear does not work here and the reason is the
// result: against a fast state read it never appears at all, so a
// waitFor("visible") just burns its own timeout and reports that as the
// overlay's lifetime.
let overlayVisibleMs = 0;
let overlayEverSeen = false;
let stateReadAt = null;
while (Date.now() - pressedAt < DELAY - 500) {
  if (await modal.isVisible().catch(() => false)) {
    overlayEverSeen = true;
    overlayVisibleMs += 150;
  }
  if (!stateReadAt && landed(/^\/escrows\/\d+$/)) stateReadAt = landed(/^\/escrows\/\d+$/).at;
  await page.waitForTimeout(150);
}

console.log(
  `  note  overlay ${overlayEverSeen ? `visible for about ${overlayVisibleMs}ms` : "never appeared"}`
);
check(
  "the page is not held by an overlay while the history loads",
  overlayVisibleMs < 3000,
  `overlay held ${overlayVisibleMs}ms of a ${DELAY}ms history load`
);

const state = landed(/^\/escrows\/\d+$/);
check("the refresh reads the escrow's state", Boolean(state), responses.map((r) => r.path).join(" "));

// While the history is in flight the page says so INSIDE the Activity panel,
// never over the whole page.
check("and no page-level overlay is showing by now", !(await modal.isVisible().catch(() => false)));
await page.screenshot({ path: `${shots}/refresh-state-ready.png`, fullPage: true });

// Now wait for the history. Asserting on it before this point is asserting on
// a request that is still in flight, which is the whole point of the change —
// and it made this check fail for the right reason, which is worse than
// useless in a suite.
await page.getByText("Escrow created and funds locked").waitFor({ timeout: DELAY + 15000 });
check("the history arrives on its own", true, `after ${Date.now() - pressedAt}ms`);

const activity = landed(/\/activity$/);
check("and it was fetched, separately", Boolean(activity), responses.map((r) => r.path).join(" "));
if (state && activity) {
  check(
    "the state landed first, by roughly the history's own cost",
    activity.at - state.at > DELAY * 0.5,
    `state at +${state.at - pressedAt}ms, history at +${activity.at - pressedAt}ms`
  );
}
check(
  "and the updating note is gone once it lands",
  !(await page.getByText(/Updating activity…/).first().isVisible().catch(() => false))
);
await page.screenshot({ path: `${shots}/refresh-history-arrived.png`, fullPage: true });

check("no script errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
