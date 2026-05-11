import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";

// Sends a Telegram designation message to every current Team Lead.
// Skip rules:
//   - Leads without a linked telegram_chat_id are reported back (we cannot reach them).
//   - The caller (super_admin firing this) is also skipped — they already know.
// This route is idempotent in practice: it just sends a fresh message; safe to retry.
export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getServiceClient();

  // Fetch every team's lead in one query
  const { data: leads, error } = await supabase
    .from("team_members")
    .select("team:team_id(id, name), user:user_id(id, name, email, telegram_chat_id)")
    .eq("role", "lead");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type LeadRow = {
    team: { id: string; name: string } | null;
    user: { id: string; name: string; email: string; telegram_chat_id: string | null } | null;
  };

  const sent: string[] = [];
  const skipped: { lead: string; team: string; reason: string }[] = [];
  const failed: { lead: string; team: string; error: string }[] = [];

  for (const row of (leads || []) as unknown as LeadRow[]) {
    const team = row.team;
    const user = row.user;
    if (!team || !user) continue;

    if (user.email === session.email) {
      skipped.push({ lead: user.name, team: team.name, reason: "self (caller)" });
      continue;
    }
    if (!user.telegram_chat_id) {
      skipped.push({ lead: user.name, team: team.name, reason: "no linked Telegram" });
      continue;
    }

    const message =
      `<b>★ Team Lead Designation — TANHOWA</b>\n\n` +
      `Hello ${user.name},\n\n` +
      `You are the Team Lead of <b>${team.name}</b>.\n\n` +
      `As Lead, you'll coordinate members, drive task completion, and act as the team's primary point-of-contact. Your name now appears first on the team card with a Crown icon.\n\n` +
      `View your team: https://www.tanhowa.in/dashboard/teams\n\n` +
      `Thank you for stepping up. — TANHOWA`;

    try {
      const res = await sendTelegramMessage(user.telegram_chat_id, message);
      if (res && res.ok === false) {
        failed.push({ lead: user.name, team: team.name, error: res.description || "send failed" });
      } else {
        sent.push(`${user.name} (${team.name})`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ lead: user.name, team: team.name, error: msg });
    }
    // Gentle throttle
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    sent,
    skipped,
    failed,
    summary: {
      total_leads: (leads || []).length,
      sent: sent.length,
      skipped: skipped.length,
      failed: failed.length,
    },
  });
}
