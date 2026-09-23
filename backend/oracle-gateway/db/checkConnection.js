const path = require("path");
const { createIdentityPool } = require("./migrate");

async function main() {
  require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
  const variableName = process.argv.includes("--public") ? "DATABASE_PUBLIC_URL" : "DATABASE_URL";
  const detected = Boolean(process.env[variableName]);
  console.log(`${variableName} detected: ${detected ? "yes" : "no"}`);
  if (!detected) {
    process.exitCode = 1;
    return;
  }

  const pool = createIdentityPool(process.env[variableName], { connectionTimeoutMillis: 10000 });
  try {
    const result = await pool.query("SELECT 1 AS connected");
    if (result.rows[0]?.connected !== 1) throw new Error("Unexpected database response");
    console.log("PostgreSQL connectivity: OK (SELECT 1)");
  } catch (error) {
    // Database errors may include connection details; report only a stable code.
    const code = /^[A-Z0-9_]{1,12}$/.test(error.code || "") ? ` (${error.code})` : "";
    console.error(`PostgreSQL connectivity: FAILED${code}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("PostgreSQL connectivity: FAILED");
  process.exitCode = 1;
});
