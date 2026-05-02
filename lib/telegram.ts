import { getServiceClient } from "./supabase";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Send a command-response message AND delete the bot's previous command reply
 * for this chat. Keeps the chat tidy as the member iterates through commands.
 * Falls through to a plain send if the user isn't linked yet.
 *
 * Use this for: /start, /help, /status, /mytasks, /done|commit|blocked confirmations,
 * error responses, the unknown-command fallback.
 *
 * Do NOT use for: notifications (task assigned, status changed, payment rejected) —
 * those are informational and should remain in the history.
 * Also do NOT use for sendForceReply — the user must reply to that specific message.
 */
export async function sendTelegramMessageReplace(
  chatId: string | number,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
) {
  if (!BOT_TOKEN) return null;

  const supabase = getServiceClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, telegram_last_cmd_msg_id")
    .eq("telegram_chat_id", String(chatId))
    .single();

  // Best-effort delete of the prior bot reply. Telegram disallows deletion past 48h
  // and on already-deleted messages — both yield 400, which we silently ignore.
  if (user?.telegram_last_cmd_msg_id) {
    try {
      await fetch(`${API_BASE}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: user.telegram_last_cmd_msg_id,
        }),
      });
    } catch {
      // Network failure — proceed with the send anyway.
    }
  }

  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  const data = await res.json();

  // Persist the new message id so the next command can clear it.
  if (user?.id && data?.result?.message_id) {
    await supabase
      .from("users")
      .update({ telegram_last_cmd_msg_id: data.result.message_id })
      .eq("id", user.id);
  }

  return data;
}

export async function sendTelegramMessage(chatId: string | number, text: string, parseMode: "HTML" | "Markdown" = "HTML") {
  if (!BOT_TOKEN) return null;

  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });

  return res.json();
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export type InlineKeyboard = InlineButton[][];

export async function sendTelegramMessageWithKeyboard(
  chatId: string | number,
  text: string,
  keyboard: InlineKeyboard,
  parseMode: "HTML" | "Markdown" = "HTML"
) {
  if (!BOT_TOKEN) return null;

  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      reply_markup: { inline_keyboard: keyboard },
    }),
  });

  return res.json();
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!BOT_TOKEN) return null;

  const res = await fetch(`${API_BASE}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    }),
  });

  return res.json();
}

export async function sendForceReply(chatId: string | number, text: string, parseMode: "HTML" | "Markdown" = "HTML") {
  if (!BOT_TOKEN) return null;

  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      reply_markup: { force_reply: true, selective: false },
    }),
  });

  return res.json();
}

export async function setWebhook(url: string) {
  if (!BOT_TOKEN) return null;

  const res = await fetch(`${API_BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  return res.json();
}

// Notification helpers for task events
export async function notifyTaskAssigned(chatId: string | number, taskTitle: string, eventId: string, assignedBy: string) {
  const msg = `📋 <b>Task Assigned to You</b>\n\n<b>${eventId}</b> — ${escapeHtml(taskTitle)}\nAssigned by: ${escapeHtml(assignedBy)}\n\n<a href="https://tanhowa.in/dashboard/todos">View in Dashboard</a>`;
  return sendTelegramMessage(chatId, msg);
}

export async function notifyTaskCommitted(chatId: string | number, taskTitle: string, eventId: string, memberName: string, estTime: string, estAmount: number, timeboxHours?: number | null) {
  let msg = `🤝 <b>Task Committed</b>\n\n<b>${eventId}</b> — ${escapeHtml(taskTitle)}\nCommitted by: ${escapeHtml(memberName)}`;
  if (estTime) msg += `\nEst. Time: ${escapeHtml(estTime)}`;
  if (timeboxHours) msg += `\nTimebox: ${timeboxHours}h`;
  if (estAmount > 0) msg += `\nEst. Amount: ₹${estAmount.toLocaleString("en-IN")}`;
  msg += `\n\n<a href="https://tanhowa.in/dashboard/todos">View in Dashboard</a>`;
  return sendTelegramMessage(chatId, msg);
}

export async function notifyTaskStatusChanged(chatId: string | number, taskTitle: string, eventId: string, newStatus: string) {
  const statusEmoji: Record<string, string> = {
    approved: "✅",
    in_progress: "🔄",
    completed: "🎉",
    rejected: "❌",
    pending: "⏳",
  };
  const emoji = statusEmoji[newStatus] || "📋";
  const msg = `${emoji} <b>Task ${newStatus.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</b>\n\n<b>${eventId}</b> — ${escapeHtml(taskTitle)}\n\n<a href="https://tanhowa.in/dashboard/todos">View in Dashboard</a>`;
  return sendTelegramMessage(chatId, msg);
}

export async function notifyVoucherAction(chatId: string | number, voucherTitle: string, eventId: string, status: string, remarks: string) {
  const emoji = status === "approved" ? "✅" : "❌";
  let msg = `${emoji} <b>Voucher ${status.charAt(0).toUpperCase() + status.slice(1)}</b>\n\n<b>${eventId}</b> — ${escapeHtml(voucherTitle)}`;
  if (remarks) msg += `\nRemarks: ${escapeHtml(remarks)}`;
  msg += `\n\n<a href="https://tanhowa.in/dashboard/todos">View in Dashboard</a>`;
  return sendTelegramMessage(chatId, msg);
}

export async function notifyNewNote(chatId: string | number, taskTitle: string, eventId: string, noteType: string, authorName: string, preview: string) {
  const typeLabel = noteType === "report" ? "Report" : noteType === "update" ? "Update" : "Note";
  const msg = `💬 <b>New ${typeLabel}</b> on <b>${eventId}</b>\n\n${escapeHtml(taskTitle)}\nBy: ${escapeHtml(authorName)}\n\n<i>${escapeHtml(preview.slice(0, 200))}</i>\n\n<a href="https://tanhowa.in/dashboard/todos">View in Dashboard</a>`;
  return sendTelegramMessage(chatId, msg);
}

export async function notifyPaymentRejected(chatId: string | number, memberName: string, period: string, amount: number, rejectedBy: string, remarks?: string) {
  let msg = `❌ <b>Payment Rejection Alert</b>\n\nA payment you verified has been rejected.\n\n<b>Member:</b> ${escapeHtml(memberName)}\n<b>Period:</b> ${escapeHtml(period)}\n<b>Amount:</b> ₹${amount.toLocaleString("en-IN")}\n<b>Rejected by:</b> ${escapeHtml(rejectedBy)}`;
  if (remarks) msg += `\n<b>Reason:</b> ${escapeHtml(remarks.slice(0, 300))}`;
  msg += `\n\n<a href="https://www.tanhowa.in/admin/verify-payments">View Payments</a>`;
  return sendTelegramMessage(chatId, msg);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
