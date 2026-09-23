const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, "migrations");

function migrationFiles(migrationsDir) {
  return fs.readdirSync(migrationsDir).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
}

function migrationChecksum(migrationsDir, name) {
  // Normalize line endings so a Windows checkout and a Linux deploy agree.
  const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8").replace(/\r\n?/g, "\n");
  return { sql, checksum: crypto.createHash("sha256").update(sql).digest("hex") };
}

function createIdentityPool(databaseUrl = process.env.DATABASE_URL, options = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for STERN company identity.");
  return new Pool({ connectionString: databaseUrl, ...options });
}

async function runMigrations({ pool, logger = console, migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  if (!pool) throw new Error("A PostgreSQL pool is required to run identity migrations.");
  const names = migrationFiles(migrationsDir);
  const client = await pool.connect();
  const applied = [];
  const skipped = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["stern_identity_migrations"]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query("SELECT name, checksum FROM schema_migrations");
    const installed = new Map(rows.map((row) => [row.name, row.checksum]));
    const missingFiles = [...installed.keys()].filter((name) => !names.includes(name));
    if (missingFiles.length) {
      throw new Error(`Applied identity migration file(s) are missing: ${missingFiles.join(", ")}. Restore them before continuing.`);
    }
    for (const name of names) {
      const { sql, checksum } = migrationChecksum(migrationsDir, name);
      if (installed.has(name)) {
        if (installed.get(name) !== checksum) {
          throw new Error(`Migration ${name} was modified after it was applied. Restore the original migration and create a new one.`);
        }
        skipped.push(name);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      applied.push(name);
    }
    await client.query("COMMIT");
    logger.info?.(`STERN identity migrations: ${applied.length} applied, ${skipped.length} already current.`);
    return { applied, skipped };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function assertMigrationsCurrent({ pool, migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  if (!pool) throw new Error("A PostgreSQL pool is required to check identity migrations.");
  const exists = await pool.query("SELECT to_regclass('schema_migrations') AS table_name");
  if (!exists.rows[0]?.table_name) {
    throw new Error("STERN identity schema is missing. Run the database connection check, then npm run migrate:identity before starting the gateway.");
  }
  const { rows } = await pool.query("SELECT name, checksum FROM schema_migrations");
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));
  const names = migrationFiles(migrationsDir);
  const missing = names.filter((name) => !applied.has(name));
  const unexpected = [...applied.keys()].filter((name) => !names.includes(name));
  const changed = names.filter((name) => applied.has(name) && applied.get(name) !== migrationChecksum(migrationsDir, name).checksum);
  if (missing.length || unexpected.length || changed.length) {
    throw new Error(`STERN identity schema is not current (pending: ${missing.length}, unknown: ${unexpected.length}, changed: ${changed.length}). Run the database connection check and resolve migrations before starting the gateway.`);
  }
}

async function main() {
  require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
  const pool = createIdentityPool();
  try {
    await runMigrations({ pool });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`STERN identity migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createIdentityPool, runMigrations, assertMigrationsCurrent };
