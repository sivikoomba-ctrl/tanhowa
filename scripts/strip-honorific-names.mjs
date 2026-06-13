// One-shot backfill: strip leading honorifics from users.name and move the
// title into social_links.title. Mirrors the logic in PUT /api/users/me so
// existing rows match what new saves now produce.
//
// Usage:
//   node scripts/strip-honorific-names.mjs            # dry-run (default)
//   node scripts/strip-honorific-names.mjs --execute  # apply changes

try { process.loadEnvFile(".env.local"); } catch { /* env may already be set */ }

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE env missing");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

// Same map as app/api/users/me/route.ts (names are stored UPPERCASE).
const TITLE_MAP = {
  MR: "Mr.", MRS: "Mrs.", MISS: "Miss.", MS: "Ms.", DR: "Dr.", PROF: "Prof.",
  ER: "Er.", THIRU: "Mr.", TMT: "Mrs.", SELVI: "Miss.", SMT: "Mrs.",
  // NOTE: "Sri"/"Shri" deliberately excluded — they're name components
  // (e.g. "Srividhya") far more often than honorifics here.
};

function strip(name) {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length < 2) return null;
  const head = parts[0].replace(/\.$/, "").toUpperCase();
  const title = TITLE_MAP[head];
  if (!title) return null;
  return { cleanName: parts.slice(1).join(" "), title };
}

const url = `${SB_URL}/rest/v1/users?select=id,name,social_links`;
const res = await fetch(url, { headers: HEADERS });
if (!res.ok) {
  console.error("Fetch failed:", res.status, await res.text());
  process.exit(1);
}
const users = await res.json();

const targets = [];
for (const u of users) {
  const r = strip(u.name);
  if (r) targets.push({ u, ...r });
}

console.log(`Scanned ${users.length} users — ${targets.length} have a leading honorific.\n`);
for (const { u, cleanName, title } of targets) {
  console.log(`  "${u.name}"  ->  "${cleanName}"  (title: ${title})`);
}

if (!EXECUTE) {
  console.log(`\nDry-run. Re-run with --execute to apply.`);
  process.exit(0);
}

console.log(`\nApplying ${targets.length} updates...`);
let ok = 0, fail = 0;
for (const { u, cleanName, title } of targets) {
  const social = { ...(u.social_links || {}) };
  if (!social.title) social.title = title;
  const patch = await fetch(`${SB_URL}/rest/v1/users?id=eq.${u.id}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify({ name: cleanName, social_links: social }),
  });
  if (patch.ok) { ok++; }
  else { fail++; console.error(`  FAILED ${u.id}: ${patch.status} ${await patch.text()}`); }
}
console.log(`Done. Updated ${ok}, failed ${fail}.`);
