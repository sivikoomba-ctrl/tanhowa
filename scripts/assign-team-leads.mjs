// Step 4-5 of the team-lead plan: apply role='lead' for the chosen members and
// (with --notify) email each new lead.
//
// Telegram notifications are skipped — TELEGRAM_BOT_TOKEN is not in .env.local
// (only set in Vercel). Self-assignments (Sivakumar S → TM) skip the email too.
//
// Usage:
//   node scripts/assign-team-leads.mjs              # dry-run, no writes
//   node scripts/assign-team-leads.mjs --execute    # apply DB updates
//   node scripts/assign-team-leads.mjs --execute --notify  # apply + email leads

try { process.loadEnvFile(".env.local"); } catch { /* env may already be set */ }

const EXECUTE = process.argv.includes("--execute");
const NOTIFY = process.argv.includes("--notify");

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZM_TOKEN = process.env.ZEPTOMAIL_TOKEN;
const ZM_FROM = process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in";
const SELF_EMAIL = "sivikoomba@gmail.com"; // skip notifying the user about their own TM assignment

if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}
if (NOTIFY && !ZM_TOKEN) {
  console.error("--notify requested but ZEPTOMAIL_TOKEN missing");
  process.exit(1);
}

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// Final picks (team_name → exact-match user_name)
const PICKS = [
  { team: "Finance Team", lead: "MR. DEENAVARMAN M" },
  { team: "IT Team", lead: "MR. ARUN D" },
  { team: "Legal Team - Chennai", lead: "MR. SIVAKUMAR PANDI" },
  { team: "Legal Team - Madurai", lead: "MRS. JANA RANJANI K G" },
  { team: "Membership Registration Team", lead: "MRS. PAVITHRA S" },
  { team: "Task Management (TM) Team", lead: "MR. SIVAKUMAR S" },
  // HTT Team is skipped — owner will assign in the UI
];

async function pg(table, query = "", init = {}) {
  const url = `${SB_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, { ...init, headers: { ...SB_HEADERS, ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method || "GET"} ${url} → ${res.status} ${res.statusText}\n${body}`);
  }
  // Some PATCH responses return [] when no row matched — caller handles that
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sendEmail(to, name, teamName) {
  const subject = `TANHOWA — You have been designated Team Lead of ${teamName}`;
  const htmlbody = `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="https://www.tanhowa.in/logo.png" alt="TANHOWA" width="88" style="display:block; margin: 0 auto 8px; max-width: 88px; height: auto;" />
        <h1 style="color: #2d6a4f; font-size: 28px; margin: 0;">TANHOWA</h1>
        <p style="color: #40916c; font-size: 14px; margin: 4px 0 0;">Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span style="display: inline-block; background: #fef9c3; color: #854d0e; font-weight: 700; font-size: 13px; padding: 4px 16px; border-radius: 20px; border: 1px solid #fde68a;">★ Team Lead Designation</span>
        </div>
        <p style="color: #333; font-size: 15px; margin: 0 0 16px;">
          Dear <strong>${name}</strong>,
        </p>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px; line-height: 1.6;">
          You have been designated as the <strong>Team Lead</strong> of the
          <strong>${teamName}</strong> on the TANHOWA portal.
        </p>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px; line-height: 1.6;">
          As Team Lead, you'll coordinate team members, drive task completion,
          and act as the primary point-of-contact for the team's work. Your
          name will appear first on the team card with a Crown icon for all
          members to see.
        </p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://www.tanhowa.in/dashboard/teams" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Team</a>
        </div>
        <p style="color: #666; font-size: 12px; margin: 20px 0 0; text-align: center;">
          Thank you for stepping up. — TANHOWA
        </p>
      </div>
    </div>
  `;

  const payload = {
    from: { address: ZM_FROM, name: "TANHOWA" },
    to: [{ email_address: { address: to, name } }],
    subject,
    htmlbody,
  };
  const res = await fetch("https://api.zeptomail.in/v1.1/email", {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${ZM_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`ZeptoMail ${res.status}: ${await res.text()}`);
}

(async () => {
  console.log(`\n=== ASSIGN TEAM LEADS ===  mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN"}  notify: ${NOTIFY ? "yes" : "no"}\n`);

  // 1. Fetch all teams + needed users in one shot
  const teams = await pg("teams", "?select=id,name");
  const teamByName = Object.fromEntries(teams.map(t => [t.name, t]));

  const leadNames = PICKS.map(p => p.lead);
  const namesCsv = leadNames.map(n => `"${n.replace(/"/g, '""')}"`).join(",");
  const users = await pg("users", `?name=in.(${namesCsv})&select=id,name,email,telegram_chat_id`);
  const userByName = Object.fromEntries(users.map(u => [u.name, u]));

  // 2. Resolve picks and validate
  const resolved = [];
  for (const pick of PICKS) {
    const team = teamByName[pick.team];
    const user = userByName[pick.lead];
    if (!team) {
      console.warn(`  ⚠ Team not found: "${pick.team}" — skipping`);
      continue;
    }
    if (!user) {
      console.warn(`  ⚠ User not found: "${pick.lead}" for team "${pick.team}" — skipping`);
      continue;
    }
    resolved.push({ ...pick, teamId: team.id, userId: user.id, userEmail: user.email });
  }

  console.log("Resolved picks:");
  for (const r of resolved) {
    console.log(`  • ${r.team.padEnd(34)} → ${r.lead.padEnd(28)}  (${r.userEmail})`);
  }
  console.log();

  if (!EXECUTE) {
    console.log("DRY-RUN — no DB writes, no emails. Re-run with --execute --notify to apply.\n");
    return;
  }

  // 3. Apply role updates + audit log entries
  console.log("Applying role updates + audit logs...");
  for (const r of resolved) {
    // PATCH team_members.role
    const patched = await pg(
      "team_members",
      `?team_id=eq.${r.teamId}&user_id=eq.${r.userId}`,
      { method: "PATCH", body: JSON.stringify({ role: "lead" }) },
    );
    if (!patched || patched.length === 0) {
      console.warn(`  ⚠ ${r.team}: PATCH matched 0 rows — user may not be a member`);
      continue;
    }
    // INSERT audit_logs row
    await pg("audit_logs", "", {
      method: "POST",
      body: JSON.stringify({
        // Owner is performing the action — use the lead user as the actor since
        // we don't have a session here; details captures intent.
        user_id: r.userId,
        action: "team_lead_assigned",
        target_type: "team",
        target_id: r.teamId,
        details: { team_name: r.team, lead_name: r.lead, source: "scripts/assign-team-leads.mjs" },
      }),
    }).catch(e => console.warn(`  ⚠ Audit log failed for ${r.team}: ${e.message}`));

    console.log(`  ✓ ${r.team.padEnd(34)} → ${r.lead}`);
  }
  console.log();

  if (!NOTIFY) {
    console.log("Notifications skipped (--notify not set).\n");
    return;
  }

  // 4. Notify each new lead (skip self)
  console.log("Sending email notifications...");
  for (const r of resolved) {
    if (r.userEmail === SELF_EMAIL) {
      console.log(`  — ${r.lead}: skipped (self)`);
      continue;
    }
    if (!r.userEmail) {
      console.warn(`  ⚠ ${r.lead}: no email on record — skipped`);
      continue;
    }
    try {
      await sendEmail(r.userEmail, r.lead, r.team);
      console.log(`  ✓ ${r.lead.padEnd(28)} → ${r.userEmail}`);
    } catch (e) {
      console.warn(`  ✗ ${r.lead}: ${e.message}`);
    }
    // gentle throttle (avoids the Gmail 4.7.28 domain-rate-limit pattern noted in CLAUDE.md)
    await new Promise(r => setTimeout(r, 300));
  }
  console.log();
  console.log("Telegram notifications skipped — TELEGRAM_BOT_TOKEN not in local env (only set in Vercel).");
  console.log("If you want Telegram pings, re-run from a context that has the bot token, or message the leads from the bot manually.\n");
})().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
