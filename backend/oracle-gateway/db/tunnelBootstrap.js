// Local-only preloader for running the existing migration/import CLIs through
// a private Railway SSH tunnel. It never logs or persists the connection URL.
const port = Number(process.env.STERN_DB_TUNNEL_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("A valid STERN_DB_TUNNEL_PORT is required.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the private database tunnel.");
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
}
if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
  throw new Error("DATABASE_URL must be a PostgreSQL URL.");
}
databaseUrl.hostname = "127.0.0.1";
databaseUrl.port = String(port);
process.env.DATABASE_URL = databaseUrl.toString();
