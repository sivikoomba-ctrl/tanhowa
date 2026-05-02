import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendTelegramMessage, sendTelegramMessageReplace, notifyTaskCommitted, notifyTaskStatusChanged, answerCallbackQuery, sendForceReply } from "@/lib/telegram";
import { logContribution } from "@/lib/contributions";
import { sendOTPEmail } from "@/lib/mail";
import { logError } from "@/lib/error-logger";

const OTP_PURPOSE_TELEGRAM_LINK = "telegram_link";

// Accepts "ET022", "ET-022", "et022", "ET-022-01" and returns the canonical "ET-022-01" form.
function normalizeEventId(raw: string): string {
  const upper = raw.toUpperCase();
  return upper.startsWith("ET-") ? upper : upper.replace(/^ET/, "ET-");
}

/**
 * Look up an Event ID from the linked member's actual portal tasks so the help/examples
 * use a real, copy-pasteable ID. Falls back to "ET-XXX" for unlinked users or those
 * with no active tasks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExampleEventId(supabase: any, chatId: number): Promise<string> {
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_chat_id", String(chatId))
    .single();
  if (!user) return "ET-XXX";

  // Prefer an active task assigned to or committed by this member.
  const { data: own } = await supabase
    .from("todos")
    .select("event_id")
    .in("status", ["approved", "in_progress"])
    .is("parent_id", null)
    .or(`assigned_to.eq.${user.id},committed_by.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (own && own.length > 0 && own[0].event_id) return own[0].event_id;

  // Fall back to any active top-level task in the portal — still real, copy-pasteable.
  const { data: anyActive } = await supabase
    .from("todos")
    .select("event_id")
    .in("status", ["approved", "in_progress"])
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (anyActive && anyActive.length > 0 && anyActive[0].event_id) return anyActive[0].event_id;

  return "ET-XXX";
}

function commandsHelp(exampleId: string): string {
  return (
    "<b>Commands:</b>\n" +
    "/mytasks — Your active tasks\n" +
    "/commit ET-XXX [hours] — Commit to a task\n" +
    "/done ET-XXX [message] — Submit for review\n" +
    "/blocked ET-XXX reason — Report a blocker\n" +
    "/update ET-XXX message — Add update\n" +
    "/report ET-XXX message — Submit report\n" +
    "/status — Check link status\n" +
    "/help — Detailed guide with examples\n" +
    "/link your@email.com 123456 — Complete account linking\n\n" +
    "<b>Examples (using your actual task " + exampleId + "):</b>\n" +
    "• <code>/mytasks</code>\n" +
    `• <code>/commit ${exampleId} 4</code>  <i>(commit with a 4-hour timebox)</i>\n` +
    `• <code>/done ${exampleId} visited 3 farmers</code>\n` +
    `• <code>/blocked ${exampleId} waiting for vendor quote</code>\n` +
    `• <code>/update ${exampleId} inspection done, report tomorrow</code>\n` +
    "• <code>/status</code>\n\n" +
    "<i>Tip: the hyphen is optional — <code>" +
    exampleId.replace(/-/g, "") +
    "</code> works too.</i>"
  );
}

function helpDetailed(exampleId: string): string {
  const noHyphen = exampleId.replace(/-/g, "");
  return (
  "📘 <b>TANHOWA Bot — Detailed Guide</b>\n\n" +
  "This bot lets you work on your TANHOWA tasks without opening the portal. Daily briefings arrive each morning, and you can mark tasks done, blocked, or add notes — right from chat.\n\n" +
  "━━━━━━━━━━━━━━━\n" +
  "<b>1️⃣ Linking your account (one-time)</b>\n" +
  "━━━━━━━━━━━━━━━\n" +
  "Send your registered TANHOWA email here. The bot will email a 6-digit code.\n" +
  "Reply with: <code>/link your@email.com 123456</code>\n" +
  "Once linked, you'll get task notifications automatically.\n\n" +
  "━━━━━━━━━━━━━━━\n" +
  "<b>2️⃣ Your daily workflow</b>\n" +
  "━━━━━━━━━━━━━━━\n" +
  "<b>Morning:</b> The bot sends a daily briefing at ~05:30 IST with your top 3 active tasks and tap-to-act buttons [✅] [🚧] [📝].\n\n" +
  "<b>During the day:</b>\n" +
  "→ Tap <b>✅ Done</b> on a task to submit it for review.\n" +
  "→ Tap <b>🚧 Blocked</b> and the bot will ask <i>what's blocking?</i> — just reply with the reason.\n" +
  "→ Tap <b>📝 Update</b> and reply with a quick progress note.\n\n" +
  "<b>Evening:</b> Use /mytasks any time to see what's still open.\n\n" +
  "━━━━━━━━━━━━━━━\n" +
  "<b>3️⃣ Commands explained</b>\n" +
  "━━━━━━━━━━━━━━━\n" +
  "<b>/mytasks</b>\n" +
  "Lists your top 10 active tasks (assigned to you, your team, or already committed by you).\n" +
  "Example: <code>/mytasks</code>\n\n" +
  "<b>/commit ET-XXX [hours]</b>\n" +
  "Claim a task as yours. Optionally set a timebox in hours.\n" +
  `Example: <code>/commit ${exampleId} 4</code> — commit with a 4-hour timebox.\n` +
  `Example: <code>/commit ${exampleId}</code> — commit without a timebox.\n\n` +
  "<b>/done ET-XXX [message]</b>\n" +
  "Submit your committed task for completion review. Add a closing note if you like.\n" +
  `Example: <code>/done ${exampleId} visited 3 farmers, photos uploaded</code>\n` +
  "Note: only the committer can mark a task done.\n\n" +
  "<b>/blocked ET-XXX reason</b>\n" +
  "Flag a blocker. Admins are notified immediately.\n" +
  `Example: <code>/blocked ${exampleId} waiting for vendor quote, ETA Friday</code>\n\n` +
  "<b>/update ET-XXX message</b>\n" +
  "Add a quick progress note (visible to assignee/committer/admins).\n" +
  `Example: <code>/update ${exampleId} inspection done, drafting report</code>\n\n` +
  "<b>/report ET-XXX message</b>\n" +
  "Submit a longer formal report. Saved as a Note of type <i>report</i>.\n" +
  `Example: <code>/report ${exampleId} Inspection of 12 nurseries complete. 3 flagged for follow-up...</code>\n\n` +
  "<b>/status</b>\n" +
  "Shows whether this Telegram chat is linked, and to which TANHOWA account.\n\n" +
  "━━━━━━━━━━━━━━━\n" +
  "<b>4️⃣ Tips</b>\n" +
  "━━━━━━━━━━━━━━━\n" +
  `• Event IDs are flexible: <code>${exampleId}</code>, <code>${noHyphen}</code>, <code>${noHyphen.toLowerCase()}</code> all work.\n` +
  `• Sub-task IDs use double hyphens: <code>${exampleId}-01</code>.\n` +
  "• Each note posted from Telegram is tagged <code>[via Telegram]</code> in the portal.\n" +
  "• Forgot your tasks? Just send <code>/mytasks</code> any time.\n" +
  "• Need to relink to a different account? Contact admin.\n\n" +
  "━━━━━━━━━━━━━━━\n" +
  "Questions? Contact your State-Admin via the portal at <b>www.tanhowa.in/dashboard/messages</b>."
  );
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
    reply_to_message?: { text?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    // Verify Telegram webhook secret token
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secretToken) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
    if (headerToken !== secretToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const update: TelegramUpdate = await req.json();
    const supabase = getServiceClient();

    // Inline-keyboard button taps from daily-briefing messages
    if (update.callback_query) {
      return await handleCallbackQuery(supabase, update.callback_query);
    }

    const message = update.message;
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Force-reply follow-ups (user replied to a "what's blocking?" / "your update?" prompt)
    if (message.reply_to_message?.text) {
      const replyTo = message.reply_to_message.text;
      const blockedPrompt = replyTo.match(/blocking\s+(ET-[\d-]+)/i);
      if (blockedPrompt) {
        return await handleBlocked(supabase, chatId, blockedPrompt[1].toUpperCase(), text);
      }
      const updatePrompt = replyTo.match(/update\s+for\s+(ET-[\d-]+)/i);
      if (updatePrompt) {
        return await handleAddNote(supabase, chatId, updatePrompt[1].toUpperCase(), text, "update");
      }
    }

    // /start command — welcome message
    // Supports deeplink: /start <email> from "Connect Telegram" CTA on the portal.
    // Re-dispatches as if the user had typed the email manually so the OTP flow fires automatically.
    const startWithEmail = text.match(/^\/start\s+([^\s]+@[^\s]+)$/i);
    if (startWithEmail) {
      const email = startWithEmail[1].toLowerCase().trim();
      // Falls through to the email-OTP handler below
      return await handleEmailOtp(supabase, chatId, email);
    }
    if (text === "/start") {
      const exampleId = await getExampleEventId(supabase, chatId);
      await sendTelegramMessageReplace(
        chatId,
        "🌿 <b>Welcome to TANHOWA Tasks Bot!</b>\n\n" +
          "Link your TANHOWA account to receive task notifications and send updates.\n\n" +
          "Send your registered <b>email address</b> to receive a verification code, then use <b>/link your@email.com 123456</b>.\n\n" +
          commandsHelp(exampleId) +
          "\n\nFor a full walk-through, send <code>/help</code>."
      );
      return NextResponse.json({ ok: true });
    }

    // /help — detailed bot guide
    if (text === "/help") {
      const exampleId = await getExampleEventId(supabase, chatId);
      await sendTelegramMessageReplace(chatId, helpDetailed(exampleId));
      return NextResponse.json({ ok: true });
    }

    // /status command
    if (text === "/status") {
      const { data: user } = await supabase
        .from("users")
        .select("name, email")
        .eq("telegram_chat_id", String(chatId))
        .single();

      if (user) {
        await sendTelegramMessageReplace(chatId, `✅ Linked to <b>${user.name}</b> (${user.email})`);
      } else {
        await sendTelegramMessageReplace(chatId, "❌ Not linked. Send your registered email to receive a verification code, then use /link your@email.com 123456.");
      }
      return NextResponse.json({ ok: true });
    }

    // /mytasks command — strictly the linked member's own tasks (assigned to them OR committed by them).
    // Team-assigned tasks are intentionally excluded so admins/super_admins on many teams don't see
    // every member's work in their personal task list.
    if (text === "/mytasks") {
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_chat_id", String(chatId))
        .single();

      if (!user) {
        await sendTelegramMessageReplace(chatId, "❌ Account not linked. Send your email first to receive a verification code.");
        return NextResponse.json({ ok: true });
      }

      const { data: todos } = await supabase
        .from("todos")
        .select("event_id, title, status, due_date, committed_by")
        .in("status", ["approved", "in_progress"])
        .is("parent_id", null)
        .or(`assigned_to.eq.${user.id},committed_by.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!todos || todos.length === 0) {
        await sendTelegramMessageReplace(chatId, "📋 No active tasks assigned to you.");
        return NextResponse.json({ ok: true });
      }

      let msg = "📋 <b>Your Active Tasks</b>\n\n";
      for (const t of todos) {
        const statusEmoji = t.status === "in_progress" ? "🔄" : "✅";
        const committed = t.committed_by === user.id ? " 🔒" : "";
        const due = t.due_date ? ` | Due: ${new Date(t.due_date).toLocaleDateString("en-IN")}` : "";
        msg += `${statusEmoji} <b>${t.event_id}</b> — ${t.title}${committed}${due}\n`;
      }
      msg += `\nUse /update ${todos[0].event_id} message to add a note.`;
      await sendTelegramMessageReplace(chatId, msg);
      return NextResponse.json({ ok: true });
    }

    // /update ET-XXX message — add note to task
    const updateMatch = text.match(/^\/update\s+(ET-?\d+(?:-\d+)*)\s+(.+)$/i);
    if (updateMatch) {
      const eventId = normalizeEventId(updateMatch[1]);
      const noteContent = updateMatch[2].trim();
      return await handleAddNote(supabase, chatId, eventId, noteContent, "update");
    }

    // /report ET-XXX message — add report to task
    const reportMatch = text.match(/^\/report\s+(ET-?\d+(?:-\d+)*)\s+(.+)$/i);
    if (reportMatch) {
      const eventId = normalizeEventId(reportMatch[1]);
      const noteContent = reportMatch[2].trim();
      return await handleAddNote(supabase, chatId, eventId, noteContent, "report");
    }

    // /commit ET-XXX [hours] — commit to a task with optional timebox
    const commitMatch = text.match(/^\/commit\s+(ET-?\d+(?:-\d+)*)(?:\s+(\d+(?:\.\d+)?))?\s*$/i);
    if (commitMatch) {
      const eventId = normalizeEventId(commitMatch[1]);
      const hours = commitMatch[2] ? parseFloat(commitMatch[2]) : null;
      return await handleCommit(supabase, chatId, eventId, hours);
    }

    // /done ET-XXX [message] — submit task for completion review
    const doneMatch = text.match(/^\/done\s+(ET-?\d+(?:-\d+)*)(?:\s+(.+))?$/i);
    if (doneMatch) {
      const eventId = normalizeEventId(doneMatch[1]);
      const summary = doneMatch[2]?.trim() || "";
      return await handleDone(supabase, chatId, eventId, summary);
    }

    // /blocked ET-XXX reason — report a blocker
    const blockedMatch = text.match(/^\/blocked\s+(ET-?\d+(?:-\d+)*)\s+(.+)$/i);
    if (blockedMatch) {
      const eventId = normalizeEventId(blockedMatch[1]);
      const reason = blockedMatch[2].trim();
      return await handleBlocked(supabase, chatId, eventId, reason);
    }

    const linkMatch = text.match(/^\/link\s+([^\s]+@[^\s]+)\s+(\d{6})$/i);
    if (linkMatch) {
      const email = linkMatch[1].toLowerCase().trim();
      const code = linkMatch[2];
      const { data: user, error } = await supabase
        .from("users")
        .select("id, name, telegram_chat_id")
        .eq("email", email)
        .single();

      if (error || !user) {
        await sendTelegramMessageReplace(chatId, "❌ Email not found. Make sure you use your registered TANHOWA email.");
        return NextResponse.json({ ok: true });
      }

      if (user.telegram_chat_id && user.telegram_chat_id !== String(chatId)) {
        await sendTelegramMessageReplace(chatId, "⚠️ This TANHOWA account is already linked to another Telegram chat. Please contact admin if you need to relink it.");
        return NextResponse.json({ ok: true });
      }

      const { data: otpRecord } = await supabase
        .from("otp_codes")
        .select("id")
        .eq("email", email)
        .eq("code", code)
        .eq("purpose", OTP_PURPOSE_TELEGRAM_LINK)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!otpRecord) {
        await sendTelegramMessageReplace(chatId, "❌ Invalid or expired verification code. Send your email again to request a new code.");
        return NextResponse.json({ ok: true });
      }

      const { data: existing } = await supabase.from("users").select("id").eq("telegram_chat_id", String(chatId)).single();
      if (existing && existing.id !== user.id) {
        await sendTelegramMessageReplace(chatId, "⚠️ This Telegram account is already linked to a different TANHOWA account.");
        return NextResponse.json({ ok: true });
      }

      await supabase.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);
      await supabase.from("users").update({ telegram_chat_id: String(chatId) }).eq("id", user.id);
      await sendTelegramMessage(
        chatId,
        `✅ <b>Linked successfully!</b>\n\nWelcome, ${user.name}! You'll now receive task notifications here.\n\nUse /mytasks to see your active tasks.`
      );
      return NextResponse.json({ ok: true });
    }

    // Email linking request — send OTP instead of linking directly
    if (text.includes("@") && !text.startsWith("/")) {
      return await handleEmailOtp(supabase, chatId, text.toLowerCase().trim());
    }

    // Unrecognized command
    {
      const exampleId = await getExampleEventId(supabase, chatId);
      await sendTelegramMessageReplace(
        chatId,
        "🤔 I didn't understand that.\n\n" +
          commandsHelp(exampleId) +
          "\n\nOr send your email to receive a verification code."
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/telegram/webhook",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddNote(supabase: any, chatId: number, eventId: string, content: string, type: "update" | "report") {
  // Find user by chat ID
  const { data: user } = await supabase
    .from("users")
    .select("id, name")
    .eq("telegram_chat_id", String(chatId))
    .single();

  if (!user) {
    await sendTelegramMessageReplace(chatId, "❌ Account not linked. Send your email first.");
    return NextResponse.json({ ok: true });
  }

  // Find task by event_id
  const { data: todo } = await supabase
    .from("todos")
    .select("id, title, assigned_to, committed_by, assigned_team_id")
    .eq("event_id", eventId)
    .single();

  if (!todo) {
    await sendTelegramMessageReplace(chatId, `❌ Task <b>${eventId}</b> not found.`);
    return NextResponse.json({ ok: true });
  }

  const { data: userTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id);
  const teamIds = new Set((userTeams || []).map((row: { team_id: string }) => row.team_id));
  const canAccessTask =
    todo.assigned_to === user.id ||
    todo.committed_by === user.id ||
    (todo.assigned_team_id && teamIds.has(todo.assigned_team_id));

  if (!canAccessTask) {
    await sendTelegramMessageReplace(chatId, `❌ You do not have access to update <b>${eventId}</b>.`);
    return NextResponse.json({ ok: true });
  }

  // Add the note
  const { error } = await supabase.from("todo_notes").insert({
    todo_id: todo.id,
    user_id: user.id,
    content: `[via Telegram] ${content}`,
    type,
  });

  if (error) {
    await sendTelegramMessageReplace(chatId, "❌ Failed to add note. Try again.");
    return NextResponse.json({ ok: true });
  }

  const typeLabel = type === "report" ? "Report" : "Update";
  await sendTelegramMessage(
    chatId,
    `✅ <b>${typeLabel} added</b> to <b>${eventId}</b> — ${todo.title}`
  );
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCommit(supabase: any, chatId: number, eventId: string, hours: number | null) {
  const { data: user } = await supabase
    .from("users")
    .select("id, name")
    .eq("telegram_chat_id", String(chatId))
    .single();
  if (!user) {
    await sendTelegramMessageReplace(chatId, "❌ Account not linked. Send your email first.");
    return NextResponse.json({ ok: true });
  }

  const { data: todo } = await supabase
    .from("todos")
    .select("id, title, event_id, status, committed_by, submitted_by, assigned_to, assigned_team_id")
    .eq("event_id", eventId)
    .single();
  if (!todo) {
    await sendTelegramMessageReplace(chatId, `❌ Task <b>${eventId}</b> not found.`);
    return NextResponse.json({ ok: true });
  }

  if (todo.committed_by && todo.committed_by !== user.id) {
    await sendTelegramMessageReplace(chatId, `⚠️ <b>${eventId}</b> is already committed by another member.`);
    return NextResponse.json({ ok: true });
  }
  if (!["approved", "in_progress"].includes(todo.status)) {
    await sendTelegramMessageReplace(chatId, `⚠️ <b>${eventId}</b> cannot be committed (status: ${todo.status}). Only approved or in-progress tasks can be committed.`);
    return NextResponse.json({ ok: true });
  }

  // Authorization: must be the assignee, or member of assigned team, or already committed
  const { data: userTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id);
  const teamIds = new Set((userTeams || []).map((row: { team_id: string }) => row.team_id));
  const canCommit =
    todo.assigned_to === user.id ||
    todo.committed_by === user.id ||
    (todo.assigned_team_id && teamIds.has(todo.assigned_team_id)) ||
    (!todo.assigned_to && !todo.assigned_team_id); // unassigned tasks open to anyone
  if (!canCommit) {
    await sendTelegramMessageReplace(chatId, `❌ You are not assigned to <b>${eventId}</b>.`);
    return NextResponse.json({ ok: true });
  }

  const updates: Record<string, unknown> = {
    committed_by: user.id,
    committed_at: new Date().toISOString(),
    status: "in_progress",
    updated_at: new Date().toISOString(),
  };
  if (hours && hours > 0) updates.timebox_hours = hours;

  const { error } = await supabase.from("todos").update(updates).eq("id", todo.id);
  if (error) {
    await sendTelegramMessageReplace(chatId, "❌ Failed to commit. Try again.");
    return NextResponse.json({ ok: true });
  }

  logContribution(user.id, "task_committed", `Committed to ${eventId} via Telegram`);

  // Notify submitter & admins (mirrors PUT commit-action behavior)
  (async () => {
    try {
      if (todo.submitted_by && todo.submitted_by !== user.id) {
        const { data: submitter } = await supabase
          .from("users")
          .select("telegram_chat_id")
          .eq("id", todo.submitted_by)
          .single();
        if (submitter?.telegram_chat_id) {
          notifyTaskCommitted(submitter.telegram_chat_id, todo.title, todo.event_id, user.name || "A member", "", 0, hours).catch(() => {});
        }
      }
      const { data: admins } = await supabase
        .from("users")
        .select("telegram_chat_id")
        .in("role", ["admin", "super_admin"])
        .not("telegram_chat_id", "is", null);
      for (const a of admins || []) {
        notifyTaskCommitted(a.telegram_chat_id, todo.title, todo.event_id, user.name || "A member", "", 0, hours).catch(() => {});
      }
    } catch { /* silent */ }
  })();

  const timeboxLine = hours ? ` (timebox: ${hours}h)` : "";
  await sendTelegramMessageReplace(chatId, `🤝 <b>Committed to ${eventId}</b>${timeboxLine}\n${todo.title}\n\nGood luck! Use /done ${eventId} when finished, or /blocked ${eventId} reason if stuck.`);
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDone(supabase: any, chatId: number, eventId: string, summary: string) {
  const { data: user } = await supabase
    .from("users")
    .select("id, name")
    .eq("telegram_chat_id", String(chatId))
    .single();
  if (!user) {
    await sendTelegramMessageReplace(chatId, "❌ Account not linked. Send your email first.");
    return NextResponse.json({ ok: true });
  }

  const { data: todo } = await supabase
    .from("todos")
    .select("id, title, event_id, status, committed_by, submitted_by")
    .eq("event_id", eventId)
    .single();
  if (!todo) {
    await sendTelegramMessageReplace(chatId, `❌ Task <b>${eventId}</b> not found.`);
    return NextResponse.json({ ok: true });
  }

  if (todo.status !== "in_progress") {
    await sendTelegramMessageReplace(chatId, `⚠️ <b>${eventId}</b> is not in-progress (status: ${todo.status}).`);
    return NextResponse.json({ ok: true });
  }
  if (todo.committed_by !== user.id) {
    await sendTelegramMessageReplace(chatId, `❌ Only the committer can submit <b>${eventId}</b> for review.`);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("todos").update({
    status: "review",
    updated_at: new Date().toISOString(),
  }).eq("id", todo.id);
  if (error) {
    await sendTelegramMessageReplace(chatId, "❌ Failed to submit. Try again.");
    return NextResponse.json({ ok: true });
  }

  // Add a closing report note (with whatever summary the member typed)
  await supabase.from("todo_notes").insert({
    todo_id: todo.id,
    user_id: user.id,
    content: `[via Telegram] ${summary || "Marked done — ready for review."}`,
    type: "report",
  });

  logContribution(user.id, "task_updated", `Submitted ${eventId} for review via Telegram`);

  // Notify admins
  (async () => {
    try {
      const { data: admins } = await supabase
        .from("users")
        .select("telegram_chat_id")
        .in("role", ["admin", "super_admin"])
        .not("telegram_chat_id", "is", null);
      for (const a of admins || []) {
        notifyTaskStatusChanged(a.telegram_chat_id, todo.title, todo.event_id, "review").catch(() => {});
      }
    } catch { /* silent */ }
  })();

  await sendTelegramMessageReplace(chatId, `🎉 <b>${eventId} submitted for review</b>\n${todo.title}\n\nThanks! An admin will review and mark it completed.`);
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBlocked(supabase: any, chatId: number, eventId: string, reason: string) {
  const { data: user } = await supabase
    .from("users")
    .select("id, name")
    .eq("telegram_chat_id", String(chatId))
    .single();
  if (!user) {
    await sendTelegramMessageReplace(chatId, "❌ Account not linked. Send your email first.");
    return NextResponse.json({ ok: true });
  }

  const { data: todo } = await supabase
    .from("todos")
    .select("id, title, event_id, assigned_to, committed_by, assigned_team_id, submitted_by")
    .eq("event_id", eventId)
    .single();
  if (!todo) {
    await sendTelegramMessageReplace(chatId, `❌ Task <b>${eventId}</b> not found.`);
    return NextResponse.json({ ok: true });
  }

  // Authorization: must have access to the task
  const { data: userTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id);
  const teamIds = new Set((userTeams || []).map((row: { team_id: string }) => row.team_id));
  const canAccess =
    todo.assigned_to === user.id ||
    todo.committed_by === user.id ||
    todo.submitted_by === user.id ||
    (todo.assigned_team_id && teamIds.has(todo.assigned_team_id));
  if (!canAccess) {
    await sendTelegramMessageReplace(chatId, `❌ You do not have access to <b>${eventId}</b>.`);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("todo_notes").insert({
    todo_id: todo.id,
    user_id: user.id,
    content: `[BLOCKED via Telegram] ${reason}`,
    type: "update",
  });
  if (error) {
    await sendTelegramMessageReplace(chatId, "❌ Failed to record blocker. Try again.");
    return NextResponse.json({ ok: true });
  }

  // Ping admins so they know it's stuck
  (async () => {
    try {
      const { data: admins } = await supabase
        .from("users")
        .select("telegram_chat_id")
        .in("role", ["admin", "super_admin"])
        .not("telegram_chat_id", "is", null);
      const memberName = user.name || "A member";
      const escapedReason = reason.length > 200 ? reason.slice(0, 200) + "…" : reason;
      const safeReason = escapedReason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeTitle = (todo.title || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeName = memberName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const msg = `🚧 <b>Task Blocked</b>\n\n<b>${todo.event_id}</b> — ${safeTitle}\nReported by: ${safeName}\n\n<i>${safeReason}</i>\n\n<a href="https://www.tanhowa.in/admin/todos">View in Admin</a>`;
      for (const a of admins || []) {
        if (a.telegram_chat_id) sendTelegramMessage(a.telegram_chat_id, msg).catch(() => {});
      }
    } catch { /* silent */ }
  })();

  await sendTelegramMessageReplace(chatId, `🚧 <b>Blocker recorded on ${eventId}</b>\nAdmins have been notified. Use /update ${eventId} message to add more context.`);
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEmailOtp(supabase: any, chatId: number, email: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, telegram_chat_id")
    .eq("email", email)
    .single();

  if (error || !user) {
    await sendTelegramMessageReplace(chatId, "❌ Email not found. Make sure you use your registered TANHOWA email.");
    return NextResponse.json({ ok: true });
  }

  if (user.telegram_chat_id && user.telegram_chat_id === String(chatId)) {
    await sendTelegramMessageReplace(chatId, `✅ Already linked to <b>${user.name}</b>. Use /mytasks to see your active tasks.`);
    return NextResponse.json({ ok: true });
  }

  if (user.telegram_chat_id && user.telegram_chat_id !== String(chatId)) {
    await sendTelegramMessageReplace(chatId, "⚠️ This TANHOWA account is already linked to another Telegram chat. Please contact admin if you need to relink it.");
    return NextResponse.json({ ok: true });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await supabase
    .from("otp_codes")
    .update({ used: true })
    .eq("email", email)
    .eq("purpose", OTP_PURPOSE_TELEGRAM_LINK)
    .eq("used", false);

  const { error: otpInsertError } = await supabase.from("otp_codes").insert({
    email,
    code: otp,
    purpose: OTP_PURPOSE_TELEGRAM_LINK,
    expires_at: expiresAt,
  });

  if (otpInsertError) {
    await sendTelegramMessageReplace(chatId, "❌ Failed to generate a verification code right now. Please try again.");
    return NextResponse.json({ ok: true });
  }

  await sendOTPEmail(email, otp);
  await sendTelegramMessage(
    chatId,
    `📨 Verification code sent to <b>${email}</b>.\n\nCheck your email and reply here with:\n<code>/link ${email} 123456</code>\n\nReplace <code>123456</code> with the 6-digit code from your email.`
  );
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCallbackQuery(supabase: any, query: NonNullable<TelegramUpdate["callback_query"]>) {
  const data = (query.data || "").trim();
  const chatId = query.message?.chat?.id;
  if (!chatId) {
    await answerCallbackQuery(query.id);
    return NextResponse.json({ ok: true });
  }

  // Acknowledge tap immediately so the spinner clears even if downstream is slow
  await answerCallbackQuery(query.id);

  // Expected formats: "done:ET-001", "blocked:ET-001", "update:ET-001"
  const [action, rawEventId] = data.split(":");
  const eventId = (rawEventId || "").toUpperCase();
  if (!eventId.match(/^ET-[\d-]+$/)) {
    return NextResponse.json({ ok: true });
  }

  if (action === "done") {
    return await handleDone(supabase, chatId, eventId, "");
  }
  if (action === "blocked") {
    await sendForceReply(chatId, `🚧 Reply with what's blocking <b>${eventId}</b>:`);
    return NextResponse.json({ ok: true });
  }
  if (action === "update") {
    await sendForceReply(chatId, `📝 Reply with your update for <b>${eventId}</b>:`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
