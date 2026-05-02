// One-shot helper: apply a .sql file to the Supabase Postgres via DATABASE_URL.
// Usage: node scripts/apply-sql.mjs <path-to-sql-file>
// Loads env from .env.local automatically.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {
  // ignore — env may already be set
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-sql.mjs <path-to-sql-file>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.local missing or empty)");
  process.exit(1);
}

const sqlText = readFileSync(resolve(file), "utf8");
console.log(`→ Applying ${file} (${sqlText.length} chars)`);

const sql = postgres(url, { ssl: "require", max: 1 });
try {
  await sql.unsafe(sqlText);
  console.log("✓ Applied successfully");
} catch (err) {
  console.error("✗ Failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
