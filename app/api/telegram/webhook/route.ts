import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendOTPEmail } from "@/lib/mail";
import { logError } from "@/lib/error-logger";

const OTP_PURPOSE_TELEGRAM_LINK = "telegram_link";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
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
    const message = update.message;
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const supabase = getServiceClient();

    // /start command — welcome message
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "🌿 <b>Welcome to TANHOWA Tasks Bot!</b>\n\n" +
          "Link your TANHOWA account to receive task notifications and send updates.\n\n" +
          "Send your registered <b>email address</b> to receive a verification code, then use <b>/link your@email.com 123456</b>.\n\n" +
          "<b>Commands:</b>\n" +
          "/mytasks — View your active tasks\n" +
          "/update ET-XXX Your message — Add a note to a task\n" +
          "/report ET-XXX Your report — Submit a report\n" +
          "/status — Check link status"
      );
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
        await sendTelegramMessage(chatId, `✅ Linked to <b>${user.name}</b> (${user.email})`);
      } else {
        await sendTelegramMessage(chatId, "❌ Not linked. Send your registered email to receive a verification code, then use /link your@email.com 123456.");
      }
      return NextResponse.json({ ok: true });
    }

    // /mytasks command
    if (text === "/mytasks") {
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_chat_id", String(chatId))
        .single();

      if (!user) {
        await sendTelegramMessage(chatId, "❌ Account not linked. Send your email first to receive a verification code.");
        return NextResponse.json({ ok: true });
      }

      // Get user's teams
      const { data: userTeams } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      const teamIds = (userTeams || []).map((t) => t.team_id);

      let query = supabase
        .from("todos")
        .select("event_id, title, status, due_date, committed_by")
        .in("status", ["approved", "in_progress"])
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(10);

      if (teamIds.length > 0) {
        query = query.or(
          `assigned_to.eq.${user.id},committed_by.eq.${user.id},assigned_team_id.in.(${teamIds.join(",")})`
        );
      } else {
        query = query.or(`assigned_to.eq.${user.id},committed_by.eq.${user.id}`);
      }

      const { data: todos } = await query;

      if (!todos || todos.length === 0) {
        await sendTelegramMessage(chatId, "📋 No active tasks assigned to you.");
        return NextResponse.json({ ok: true });
      }

      let msg = "📋 <b>Your Active Tasks</b>\n\n";
      for (const t of todos) {
        const statusEmoji = t.status === "in_progress" ? "🔄" : "✅";
        const committed = t.committed_by === user.id ? " 🔒" : "";
        const due = t.due_date ? ` | Due: ${new Date(t.due_date).toLocaleDateString("en-IN")}` : "";
        msg += `${statusEmoji} <b>${t.event_id}</b> — ${t.title}${committed}${due}\n`;
      }
      msg += "\nUse /update ET-XXX message to add a note.";
      await sendTelegramMessage(chatId, msg);
      return NextResponse.json({ ok: true });
    }

    // /update ET-XXX message — add note to task
    const updateMatch = text.match(/^\/update\s+(ET-[\d-]+)\s+(.+)$/i);
    if (updateMatch) {
      const eventId = updateMatch[1].toUpperCase();
      const noteContent = updateMatch[2].trim();
      return await handleAddNote(supabase, chatId, eventId, noteContent, "update");
    }

    // /report ET-XXX message — add report to task
    const reportMatch = text.match(/^\/report\s+(ET-[\d-]+)\s+(.+)$/i);
    if (reportMatch) {
      const eventId = reportMatch[1].toUpperCase();
      const noteContent = reportMatch[2].trim();
      return await handleAddNote(supabase, chatId, eventId, noteContent, "report");
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
        await sendTelegramMessage(chatId, "❌ Email not found. Make sure you use your registered TANHOWA email.");
        return NextResponse.json({ ok: true });
      }

      if (user.telegram_chat_id && user.telegram_chat_id !== String(chatId)) {
        await sendTelegramMessage(chatId, "⚠️ This TANHOWA account is already linked to another Telegram chat. Please contact admin if you need to relink it.");
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
        await sendTelegramMessage(chatId, "❌ Invalid or expired verification code. Send your email again to request a new code.");
        return NextResponse.json({ ok: true });
      }

      const { data: existing } = await supabase.from("users").select("id").eq("telegram_chat_id", String(chatId)).single();
      if (existing && existing.id !== user.id) {
        await sendTelegramMessage(chatId, "⚠️ This Telegram account is already linked to a different TANHOWA account.");
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
      const email = text.toLowerCase().trim();
      const { data: user, error } = await supabase
        .from("users")
        .select("id, name, telegram_chat_id")
        .eq("email", email)
        .single();

      if (error || !user) {
        await sendTelegramMessage(chatId, "❌ Email not found. Make sure you use your registered TANHOWA email.");
        return NextResponse.json({ ok: true });
      }

      if (user.telegram_chat_id && user.telegram_chat_id !== String(chatId)) {
        await sendTelegramMessage(chatId, "⚠️ This TANHOWA account is already linked to another Telegram chat. Please contact admin if you need to relink it.");
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
        await sendTelegramMessage(chatId, "❌ Failed to generate a verification code right now. Please try again.");
        return NextResponse.json({ ok: true });
      }

      await sendOTPEmail(email, otp);
      await sendTelegramMessage(
        chatId,
        `📨 Verification code sent to <b>${email}</b>.\n\nReply with:\n<link>${`/link ${email} 123456`}</link>\n\nReplace 123456 with the code from your email.`
          .replace("<link>", "")
          .replace("</link>", "")
      );
      return NextResponse.json({ ok: true });
    }

    // Unrecognized command
    await sendTelegramMessage(
      chatId,
      "🤔 I didn't understand that.\n\n<b>Available commands:</b>\n/mytasks — Your active tasks\n/update ET-XXX message — Add update\n/report ET-XXX message — Submit report\n/status — Check link status\n/link your@email.com 123456 — Complete account linking\n\nOr send your email to receive a verification code."
    );

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
    await sendTelegramMessage(chatId, "❌ Account not linked. Send your email first.");
    return NextResponse.json({ ok: true });
  }

  // Find task by event_id
  const { data: todo } = await supabase
    .from("todos")
    .select("id, title, assigned_to, committed_by, assigned_team_id")
    .eq("event_id", eventId)
    .single();

  if (!todo) {
    await sendTelegramMessage(chatId, `❌ Task <b>${eventId}</b> not found.`);
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
    await sendTelegramMessage(chatId, `❌ You do not have access to update <b>${eventId}</b>.`);
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
    await sendTelegramMessage(chatId, "❌ Failed to add note. Try again.");
    return NextResponse.json({ ok: true });
  }

  const typeLabel = type === "report" ? "Report" : "Update";
  await sendTelegramMessage(
    chatId,
    `✅ <b>${typeLabel} added</b> to <b>${eventId}</b> — ${todo.title}`
  );
  return NextResponse.json({ ok: true });
}
