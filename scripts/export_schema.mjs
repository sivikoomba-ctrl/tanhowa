/**
 * Exports the full Supabase public schema as a setup.sql file.
 * Run from the P002 TANHOWA directory: node tools/export_schema.mjs
 */
import postgres from "postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from .env.local
const envPath = path.join(__dirname, "../.env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const sql = postgres(env.DATABASE_URL, { ssl: "require" });

async function run() {
  const out = [];

  out.push("-- ============================================================");
  out.push("-- TNAHOA Portal — Full Schema Export");
  out.push(`-- Exported from TANHOWA (tanhowa.in) on ${new Date().toISOString()}`);
  out.push("-- Apply via Supabase SQL editor or: node scripts/apply-sql.mjs setup.sql");
  out.push("-- ============================================================\n");

  // ── Extensions ─────────────────────────────────────────────────────────────
  out.push("-- Extensions");
  const exts = await sql`SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql')`;
  for (const e of exts) out.push(`CREATE EXTENSION IF NOT EXISTS "${e.extname}";`);
  out.push("");

  // ── Enums ──────────────────────────────────────────────────────────────────
  out.push("-- Enums");
  const enums = await sql`
    SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname`;
  for (const e of enums) {
    const vals = e.labels.map(l => `'${l}'`).join(", ");
    out.push(`CREATE TYPE ${e.typname} AS ENUM (${vals});`);
  }
  out.push("");

  // ── Tables ─────────────────────────────────────────────────────────────────
  out.push("-- Tables");
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;

  for (const { table_name } of tables) {
    const cols = await sql`
      SELECT column_name, data_type, udt_name, character_maximum_length,
             numeric_precision, numeric_scale, is_nullable, column_default,
             is_identity, identity_generation
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table_name}
      ORDER BY ordinal_position`;

    const colDefs = cols.map(c => {
      let type = c.data_type === "USER-DEFINED" ? c.udt_name
               : c.data_type === "character varying" ? `varchar(${c.character_maximum_length || ""})`
               : c.data_type === "ARRAY" ? `${c.udt_name.replace(/^_/, "")}[]`
               : c.data_type;
      let def = `  ${c.column_name} ${type}`;
      if (c.is_identity === "YES") def += ` GENERATED ${c.identity_generation} AS IDENTITY`;
      if (c.column_default && c.is_identity !== "YES") def += ` DEFAULT ${c.column_default}`;
      if (c.is_nullable === "NO") def += " NOT NULL";
      return def;
    });

    // PKs
    const pks = await sql`
      SELECT kcu.column_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = ${table_name}
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position`;
    if (pks.length) colDefs.push(`  PRIMARY KEY (${pks.map(p => p.column_name).join(", ")})`);

    out.push(`CREATE TABLE IF NOT EXISTS ${table_name} (`);
    out.push(colDefs.join(",\n"));
    out.push(");\n");
  }

  // ── Foreign keys ───────────────────────────────────────────────────────────
  out.push("-- Foreign Keys");
  const fks = await sql`
    SELECT tc.constraint_name, tc.table_name,
           kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column,
           rc.delete_rule, rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, tc.constraint_name`;
  for (const fk of fks) {
    const onDelete = fk.delete_rule !== "NO ACTION" ? ` ON DELETE ${fk.delete_rule}` : "";
    out.push(`ALTER TABLE ${fk.table_name} ADD CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table}(${fk.foreign_column})${onDelete};`);
  }
  out.push("");

  // ── Unique constraints ─────────────────────────────────────────────────────
  out.push("-- Unique Constraints");
  const uqs = await sql`
    SELECT tc.constraint_name, tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
    ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position`;
  const uqMap = new Map();
  for (const u of uqs) {
    const key = `${u.table_name}::${u.constraint_name}`;
    if (!uqMap.has(key)) uqMap.set(key, { table: u.table_name, name: u.constraint_name, cols: [] });
    uqMap.get(key).cols.push(u.column_name);
  }
  for (const { table, name, cols } of uqMap.values()) {
    out.push(`ALTER TABLE ${table} ADD CONSTRAINT ${name} UNIQUE (${cols.join(", ")});`);
  }
  out.push("");

  // ── Indexes ────────────────────────────────────────────────────────────────
  out.push("-- Indexes");
  const idxs = await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT IN (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_type IN ('PRIMARY KEY','UNIQUE')
      )
    ORDER BY tablename, indexname`;
  for (const i of idxs) out.push(`${i.indexdef};`);
  out.push("");

  // ── Functions ──────────────────────────────────────────────────────────────
  out.push("-- Functions");
  const fns = await sql`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
    ORDER BY p.proname`;
  for (const f of fns) out.push(`${f.def};\n`);

  // ── Triggers ───────────────────────────────────────────────────────────────
  out.push("-- Triggers");
  const trgs = await sql`
    SELECT trigger_name, event_manipulation, event_object_table,
           action_timing, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name`;
  for (const t of trgs) {
    out.push(`CREATE OR REPLACE TRIGGER ${t.trigger_name}`);
    out.push(`  ${t.action_timing} ${t.event_manipulation} ON ${t.event_object_table}`);
    out.push(`  FOR EACH ROW ${t.action_statement};\n`);
  }

  // ── RLS ────────────────────────────────────────────────────────────────────
  out.push("-- Row Level Security");
  for (const { table_name } of tables) {
    const rlsOn = await sql`
      SELECT relrowsecurity FROM pg_class
      WHERE relname = ${table_name} AND relnamespace = 'public'::regnamespace`;
    if (rlsOn[0]?.relrowsecurity) out.push(`ALTER TABLE ${table_name} ENABLE ROW LEVEL SECURITY;`);
  }
  out.push("");

  const policies = await sql`
    SELECT tablename, policyname, cmd, qual, with_check, roles
    FROM pg_policies WHERE schemaname = 'public'
    ORDER BY tablename, policyname`;
  for (const p of policies) {
    const roles = p.roles?.length ? ` TO ${p.roles.join(", ")}` : "";
    const using = p.qual ? ` USING (${p.qual})` : "";
    const withCheck = p.with_check ? ` WITH CHECK (${p.with_check})` : "";
    out.push(`CREATE POLICY "${p.policyname}" ON ${p.tablename} FOR ${p.cmd}${roles}${using}${withCheck};`);
  }
  out.push("");

  // ── Storage buckets ────────────────────────────────────────────────────────
  out.push("-- Storage Buckets (re-create manually in Supabase dashboard or via API)");
  const buckets = await sql`SELECT id, name, public FROM storage.buckets ORDER BY name`;
  for (const b of buckets) {
    out.push(`-- INSERT INTO storage.buckets (id, name, public) VALUES ('${b.id}', '${b.name}', ${b.public});`);
  }
  out.push("");

  const output = out.join("\n");
  const outFile = path.join(__dirname, "setup.sql");
  fs.writeFileSync(outFile, output, "utf8");
  console.log(`✅ Schema exported to scripts/setup.sql (${(output.length / 1024).toFixed(0)} KB, ${tables.length} tables)`);

  await sql.end();
}

run().catch(e => { console.error(e); process.exit(1); });
