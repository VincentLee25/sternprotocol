// Mock backend matching docs/02_API_SPEC.md exactly — same request/response
// shapes the real oracle-gateway will serve. Swap each function's body for a
// fetch() to the real endpoint once it exists; callers never change.
const DELAY_MS = 500;
const wait = (ms = DELAY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeAddress(seed) {
  const hex = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0).toString(16), "");
  return `0x${hex.padEnd(40, "0").slice(0, 40)}`;
}

function fakeTxHash() {
  return `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
}

const session = { user: null };
const balances = new Map(); // smartAccountAddress -> { balance, hasClaimed }

// --- §1 Auth & session -------------------------------------------------
export async function postAuthSession({ authType, email }) {
  await wait(900);
  const smartAccountAddress = fakeAddress("smart-" + (email || Date.now()));
  const eoaOwnerAddress = fakeAddress("eoa-" + (email || Date.now()));
  session.user = {
    userId: `usr_${Math.random().toString(16).slice(2, 6)}`,
    smartAccountAddress,
    eoaOwnerAddress,
    authType,
    email,
    role: "importer",
    hasClaimedDemoBalance: false,
    createdAt: new Date().toISOString()
  };
  return { ...session.user };
}

export function getSession() {
  return session.user ? { ...session.user } : null;
}

export function signOut() {
  session.user = null;
}

// --- §2 Demo balance (IDRT-demo) ----------------------------------------
export async function claimDemoBalance(smartAccountAddress) {
  await wait(1100);
  const existing = balances.get(smartAccountAddress);
  if (existing?.hasClaimed) {
    const error = new Error("Demo balance already claimed for this wallet.");
    error.status = 409;
    throw error;
  }
  const amount = "150000000.00";
  balances.set(smartAccountAddress, { balance: amount, hasClaimed: true });
  if (session.user?.smartAccountAddress === smartAccountAddress) {
    session.user.hasClaimedDemoBalance = true;
  }
  return {
    status: "minted",
    amount,
    currency: "IDRT-demo",
    transactionHash: fakeTxHash(),
    newBalance: amount
  };
}

export async function getDemoBalance(smartAccountAddress) {
  await wait(250);
  const record = balances.get(smartAccountAddress) || { balance: "0.00", hasClaimed: false };
  return {
    smartAccountAddress,
    balance: record.balance,
    currency: "IDRT-demo",
    hasClaimed: record.hasClaimed
  };
}

export { fakeAddress, fakeTxHash };
