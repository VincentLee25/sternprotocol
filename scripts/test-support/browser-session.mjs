// Signing a browser suite into the workspace.
//
// Shared because every suite needs the same three steps and, more to the point,
// the same ONE account: the workspace step refuses unless the company user's
// registered wallet matches the wallet the session derives, and
// identityService refuses to register the same wallet twice. Two suites with
// their own credentials against one stub therefore cannot both get in — the
// second registration is rejected for the wallet, and its sign-in then fails
// on the password, three steps away from the cause.
//
// So: one company, one wallet, reused. A suite that wants its own account needs
// its own stub, not its own credentials.

// mockBackend derives the smart account by hashing the characters of
// "smart-buyer@example.com", so this address is deterministic. It is what the
// workspace step compares against.
export const SESSION_WALLET = "0x736d6172742d6275796572406578616d706c652e";

export const SESSION = {
  companyName: "PT Demo Importir",
  username: "sternbrowsertests",
  email: "browser@stern.test",
  password: "Rahasia12345!",
  walletAddress: SESSION_WALLET
};

/**
 * Registers the shared company against the gateway, if it is not there already.
 *
 * A 409 is the expected answer on every run after the first. Anything else is
 * reported rather than swallowed: a failed registration otherwise surfaces
 * later as "invalid email or password", which sends you looking at the
 * password.
 */
export async function ensureCompany(api, log = console.log) {
  const response = await fetch(`${api}/auth/register-company`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(SESSION)
  });
  if (!response.ok && response.status !== 409) {
    log(`  note  registration returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  // Confirm the account can actually sign in before driving the browser at it.
  //
  // A 409 has two causes and they are not equivalent: this same account already
  // exists, which is fine and expected on every run after the first — or a
  // DIFFERENT account holds this wallet, left behind by an older suite against
  // the same store, in which case nothing here will ever get in. Without this
  // check that second case surfaces as a Playwright timeout on the workspace
  // button, which says nothing about the cause.
  const login = await fetch(`${api}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: SESSION.email, password: SESSION.password })
  });
  if (!login.ok) {
    throw new Error(
      `Cannot sign in as ${SESSION.email} (HTTP ${login.status}). ` +
        `Registration answered ${response.status}. If that was 409, another account already holds ` +
        `wallet ${SESSION_WALLET} in this gateway's identity store — restart the stub for a fresh one.`
    );
  }

  return response.status;
}

/** Landing page to workspace, through company sign-in and the wallet step. */
export async function signIn(page, { base, api, log = console.log } = {}) {
  await ensureCompany(api, log);

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Access workspace" }).first().click();
  await page.waitForTimeout(2500);

  await page.locator('input[name="email"]').fill(SESSION.email);
  await page.locator('input[name="password"]').fill(SESSION.password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForTimeout(2000);

  // The wallet step. Its label depends on whether Particle is configured;
  // without it the social buttons are disabled and this is the way through.
  await page
    .getByRole("button", { name: /continue to workspace|continue with google, apple/i })
    .first()
    .click();
  await page.waitForTimeout(2500);
}
