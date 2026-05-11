// Step 1 of the team-lead assignment plan: audit current state.
// Lists every team, its current lead (if any), member count, and member roster
// with designation/district for the leaderless ones.
//
// Uses PostgREST (HTTPS) — direct Postgres connection is blocked in the sandbox.
//
// Usage: node scripts/team-leads-audit.mjs
// Loads env from .env.local automatically.

try { process.loadEnvFile(".env.local"); } catch { /* env may already be set */ }

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function pg(table, query = "") {
  const url = `${SB_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}\n${await res.text()}`);
  return res.json();
}

const pad = (s, n) => String(s ?? "—").padEnd(n).slice(0, n);
const padL = (s, n) => String(s ?? "0").padStart(n).slice(-n);

try {
  // 1. All teams
  const teams = await pg("teams", "?select=id,name,is_private&order=name");

  // 2. All team_members in one shot (small table)
  const allMembers = await pg("team_members", "?select=team_id,user_id,role");

  // Group members by team
  const membersByTeam = new Map();
  for (const tm of allMembers) {
    if (!membersByTeam.has(tm.team_id)) membersByTeam.set(tm.team_id, []);
    membersByTeam.get(tm.team_id).push(tm);
  }

  // Find leads per team
  const teamSummary = teams.map(t => {
    const ms = membersByTeam.get(t.id) || [];
    const lead = ms.find(m => m.role === "lead");
    return { ...t, memberCount: ms.length, leadUserId: lead?.user_id || null };
  });

  // Need lead names — fetch the lead users
  const leadIds = teamSummary.filter(t => t.leadUserId).map(t => t.leadUserId);
  let leadNames = {};
  if (leadIds.length) {
    const idsCsv = leadIds.map(id => `"${id}"`).join(",");
    const leadUsers = await pg("users", `?id=in.(${idsCsv})&select=id,name`);
    leadNames = Object.fromEntries(leadUsers.map(u => [u.id, u.name]));
  }

  const noLead = teamSummary.filter(t => !t.leadUserId);
  console.log("\n=== TEAM-LEAD AUDIT ===");
  console.log(`Total teams       : ${teams.length}`);
  console.log(`Already has lead  : ${teams.length - noLead.length}`);
  console.log(`Leaderless        : ${noLead.length}`);
  console.log();

  console.log("--- ALL TEAMS ---");
  console.log(`${pad("Team Name", 36)} | Members | Private | Lead`);
  console.log("-".repeat(92));
  for (const t of teamSummary) {
    const lead = t.leadUserId ? (leadNames[t.leadUserId] || t.leadUserId) : "— (none)";
    console.log(`${pad(t.name, 36)} | ${padL(t.memberCount, 7)} | ${t.is_private ? "yes" : "no "}     | ${lead}`);
  }

  if (noLead.length === 0) {
    console.log("\nEvery team already has a lead. Nothing to do.");
    process.exit(0);
  }

  // 3. For each leaderless team, fetch member details + signal scores
  console.log("\n--- LEADERLESS TEAM ROSTERS (for candidate scoring) ---");

  for (const team of noLead) {
    const memberIds = (membersByTeam.get(team.id) || []).map(m => m.user_id);
    if (memberIds.length === 0) {
      console.log(`\n▼ ${team.name}  (no members — cannot assign)`);
      continue;
    }
    const idsCsv = memberIds.map(id => `"${id}"`).join(",");
    const members = await pg(
      "users",
      `?id=in.(${idsCsv})&status=eq.approved&select=id,name,email,occupation,posting_details,social_links&order=name`,
    );

    // Contribution + task counts in parallel
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const stats = await Promise.all(members.map(async (m) => {
      const [ctrRes, taskRes] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/contributions?user_id=eq.${m.id}&created_at=gt.${ninetyDaysAgo}&select=id`, {
          headers: { ...HEADERS, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" },
        }),
        fetch(`${SB_URL}/rest/v1/todos?committed_by=eq.${m.id}&select=id`, {
          headers: { ...HEADERS, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" },
        }),
      ]);
      const parseCount = (r) => {
        const range = r.headers.get("content-range") || "0";
        return parseInt(range.split("/")[1] || "0", 10);
      };
      return { id: m.id, ctr90: parseCount(ctrRes), tasksCommit: parseCount(taskRes) };
    }));
    const statsById = Object.fromEntries(stats.map(s => [s.id, s]));

    console.log(`\n▼ ${team.name}  (${members.length} approved member${members.length === 1 ? "" : "s"})`);
    console.log("  " + pad("Name", 28) + " | " + pad("Occupation", 14) + " | " + pad("District", 14) + " | Joined     | 90d ctr | Tasks");
    console.log("  " + "-".repeat(99));
    for (const m of members) {
      const dist = m.posting_details?.regular_district || "—";
      const joined = (m.social_links?.date_of_joining || "—").slice(0, 10);
      const s = statsById[m.id] || { ctr90: 0, tasksCommit: 0 };
      console.log(`  ${pad(m.name, 28)} | ${pad(m.occupation, 14)} | ${pad(dist, 14)} | ${pad(joined, 10)} | ${padL(s.ctr90, 7)} | ${padL(s.tasksCommit, 5)}`);
    }
  }
  console.log();
} catch (err) {
  console.error("\nQuery failed:", err.message);
  process.exitCode = 1;
}
