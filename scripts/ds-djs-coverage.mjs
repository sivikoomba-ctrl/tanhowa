// Live DS/DJS coverage report — same shape as TANHOWA DSDJS COVERAGE REPORT.txt
// but pulled fresh from PostgREST.
//
// Usage: node scripts/ds-djs-coverage.mjs
// (mjs sibling of the older Python tools/onboard_officials.py which is broken
//  by the new sb_secret_* key format.)

try { process.loadEnvFile(".env.local"); } catch { /* env may already be set */ }

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE env missing");
  process.exit(1);
}

const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

const TN_DISTRICTS = [
  "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore",
  "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kancheepuram",
  "Kanniyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai",
  "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai",
  "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi",
  "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli",
  "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur",
  "Vellore", "Viluppuram", "Virudhunagar",
];

const url = `${SB_URL}/rest/v1/users?status=eq.approved&official_type=in.(state,district)&select=name,email,occupation,official_type,posting_details`;
const res = await fetch(url, { headers: HEADERS });
if (!res.ok) {
  console.error("Fetch failed:", res.status, await res.text());
  process.exit(1);
}
const users = await res.json();

const stateOfficials = users.filter(u => u.official_type === "state");
const districtOfficials = users.filter(u => u.official_type === "district");

// Bucket by district + designation
const byDistrict = {};
for (const d of TN_DISTRICTS) byDistrict[d] = { ds: [], djs: [], other: [] };

for (const u of districtOfficials) {
  const district = u.posting_details?.regular_district;
  if (!district || !byDistrict[district]) continue;
  const desig = (u.posting_details?.official_designation || "").toLowerCase();
  if (desig.includes("joint")) byDistrict[district].djs.push(u);
  else if (desig.includes("secretary")) byDistrict[district].ds.push(u);
  else byDistrict[district].other.push(u);
}

const fullCover = [], dsOnly = [], djsOnly = [], gap = [];
let dsCount = 0, djsCount = 0;
for (const d of TN_DISTRICTS) {
  const { ds, djs } = byDistrict[d];
  dsCount += ds.length;
  djsCount += djs.length;
  if (ds.length && djs.length) fullCover.push(d);
  else if (ds.length) dsOnly.push(d);
  else if (djs.length) djsOnly.push(d);
  else gap.push(d);
}

// Compute "today" in IST (UTC+5:30) — toISOString() alone returns the UTC date,
// which lags IST by 5.5h and mis-dates reports run late evening IST.
const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// --json: emit structured data (consumed by tools/generate_ds_djs_coverage_pdf.py)
if (process.argv.includes("--json")) {
  const districts = TN_DISTRICTS.map(d => ({
    district: d,
    ds: byDistrict[d].ds.map(u => u.name),
    djs: byDistrict[d].djs.map(u => u.name),
    gap: byDistrict[d].ds.length === 0 && byDistrict[d].djs.length === 0,
  }));
  process.stdout.write(JSON.stringify({
    date: today,
    totalDistricts: TN_DISTRICTS.length,
    dsCount, djsCount,
    covered: TN_DISTRICTS.length - gap.length,
    stateOfficials: stateOfficials.map(s => ({ name: s.name, occupation: s.occupation, email: s.email })),
    districts,
    fullCover, dsOnly, djsOnly, gap,
  }, null, 2));
  process.exit(0);
}

console.log("=== TANHOWA DS/DJS COVERAGE REPORT ===");
console.log(`Date: ${today}`);
console.log();
console.log("SUMMARY");
console.log("-------");
console.log(`Districts with any official: ${TN_DISTRICTS.length - gap.length}/${TN_DISTRICTS.length} (${Math.round((TN_DISTRICTS.length - gap.length) * 100 / TN_DISTRICTS.length)}%)`);
console.log(`District Secretaries (DS):   ${dsCount}/${TN_DISTRICTS.length}`);
console.log(`District Joint Secretaries:  ${djsCount}/${TN_DISTRICTS.length}`);
console.log(`Gap districts (no DS/DJS):   ${gap.length}`);
console.log();

console.log(`=== STATE OFFICIALS (${stateOfficials.length}) ===`);
for (const s of stateOfficials) {
  console.log(`${(s.name || "—").padEnd(28)} | ${(s.occupation || "—").padEnd(4)} | ${s.email}`);
}
console.log();

console.log("=== DISTRICT COVERAGE ===");
console.log(`${"District".padEnd(20)} ${"DS".padEnd(28)} ${"DJS"}`);
console.log("-".repeat(75));
for (const d of TN_DISTRICTS) {
  const ds = byDistrict[d].ds.map(u => u.name).join(", ") || "---";
  const djs = byDistrict[d].djs.map(u => u.name).join(", ") || "---";
  const tag = (byDistrict[d].ds.length === 0 && byDistrict[d].djs.length === 0) ? " [GAP]" : "";
  console.log(`${d.padEnd(20)} ${ds.padEnd(28)} ${djs}${tag}`);
}
console.log();
console.log(`=== FULLY COVERED (DS + DJS): ${fullCover.length} ===\n${fullCover.join(", ") || "—"}\n`);
console.log(`=== DS ONLY (no DJS): ${dsOnly.length} ===\n${dsOnly.join(", ") || "—"}\n`);
console.log(`=== DJS ONLY (no DS): ${djsOnly.length} ===\n${djsOnly.join(", ") || "—"}\n`);
console.log(`=== GAP DISTRICTS (no DS/DJS): ${gap.length} ===\n${gap.join(", ") || "—"}`);
