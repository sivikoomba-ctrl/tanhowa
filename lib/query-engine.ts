/**
 * Query Engine — 13 data-retrieval functions for the TANHOWA chatbot.
 * Each function queries Supabase and returns structured data that
 * Gemini can use to generate grounded, factual answers.
 */

import { getServiceClient } from "@/lib/supabase";
import { isFlexibleAmount, displayPeriod } from "@/lib/subscriptions";
import { sendMemberMessageEmail, sendVoucherStatusEmail, notifyNewAnnouncement, notifyNewEvent, sendSuspensionEmail, sendReinstatementEmail } from "@/lib/mail";
import { translateContent } from "@/lib/translate-content";
import { logAudit } from "@/lib/audit-log";
import { isFinanceTeamMember } from "@/lib/auth";
import { sendTelegramMessage, notifyTaskAssigned } from "@/lib/telegram";
import { approveMember, rejectMember } from "@/lib/member-approval";
import { logContribution } from "@/lib/contributions";
import { GRIEVANCE_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/grievances";
import { awardTaskPoints } from "@/lib/task-points";

// ── Types ───────────────────────────────────────────────────────────

interface QueryContext {
  userId: string;
  email: string;
  role: string;
}

// ── Action-tool foundation ──────────────────────────────────────────
// Shared scaffolding for chatbot ACTION tools (side effects). Every action
// re-checks authority from the DB (the JWT role can be stale) and resolves a
// target member with district scoping + disambiguation.

interface Actor {
  userId: string;
  email: string;
  name: string;
  role: string;
  officialType: string | null;
  district: string | null;
  isAdmin: boolean;       // admin or super_admin
  isState: boolean;       // state official
  isDistrict: boolean;    // district official
  canAdminAct: boolean;   // any of the above — may act on other members
}

async function resolveActor(ctx: QueryContext): Promise<Actor> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("role, official_type, posting_details, name")
    .eq("id", ctx.userId)
    .single();
  const role = data?.role || "";
  const officialType = (data?.official_type as string | null) || null;
  const district = (data?.posting_details as Record<string, string> | null)?.regular_district || null;
  const isAdmin = role === "admin" || role === "super_admin";
  const isState = officialType === "state";
  const isDistrict = officialType === "district";
  return {
    userId: ctx.userId, email: ctx.email, name: (data?.name as string) || "",
    role, officialType, district, isAdmin, isState, isDistrict,
    canAdminAct: isAdmin || isState || isDistrict,
  };
}

interface MemberRow {
  id: string; name: string | null; email: string;
  occupation: string | null; posting_details: Record<string, string> | null;
}

// Returns the single matched member, or a `fail` payload (not found / disambiguate)
// that the action tool should return verbatim to the assistant.
async function resolveMember(name: string, actor: Actor): Promise<{ member: MemberRow } | { fail: Record<string, unknown> }> {
  const n = (name || "").trim();
  if (!n) return { fail: { error: "Tell me which member — give a name." } };
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("id, name, email, occupation, posting_details, status")
    .eq("status", "approved")
    .ilike("name", `%${n}%`)
    .limit(6);
  let people = (data || []) as (MemberRow & { status: string })[];
  // District officials (without higher rights) only see their own district
  if (actor.isDistrict && !actor.isAdmin && !actor.isState) {
    people = people.filter((p) => (p.posting_details?.regular_district || "") === actor.district);
  }
  if (people.length === 0) return { fail: { found: 0, message: `No approved member found matching "${n}".` } };
  if (people.length > 1) {
    return {
      fail: {
        found: people.length,
        disambiguate: people.map((p) => ({ name: p.name, district: p.posting_details?.regular_district || "", designation: p.occupation || "" })),
        message: "Multiple members match — ask the user which one (by district/designation) before acting.",
      },
    };
  }
  return { member: people[0] };
}

// ── 1. Search Announcements ─────────────────────────────────────────

export async function searchAnnouncements(args: { query?: string; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("announcements")
    .select("id, title, content, created_at, scheduled_at, published")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(args.limit || 5);

  if (args.query) {
    q = q.or(`title.ilike.%${args.query}%,content.ilike.%${args.query}%`);
  }

  const { data } = await q;
  return (data || []).map((a) => ({
    title: a.title,
    content: a.content?.slice(0, 300) + (a.content && a.content.length > 300 ? "..." : ""),
    date: a.created_at,
  }));
}

// ── 2. Search Events ────────────────────────────────────────────────

export async function searchEvents(args: { query?: string; upcoming?: boolean; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("events")
    .select("id, title, description, date, location, image_url")
    .order("date", { ascending: true })
    .limit(args.limit || 5);

  if (args.upcoming) {
    q = q.gte("date", new Date().toISOString().slice(0, 10));
  }
  if (args.query) {
    q = q.or(`title.ilike.%${args.query}%,description.ilike.%${args.query}%`);
  }

  const { data } = await q;
  return (data || []).map((e) => ({
    title: e.title,
    date: e.date,
    location: e.location || "TBD",
    description: e.description?.slice(0, 200) || "",
  }));
}

// ── 3. Search FAQs ──────────────────────────────────────────────────

export async function searchFAQs(args: { query?: string; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("faqs")
    .select("id, question, answer, category")
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .limit(args.limit || 5);

  if (args.query) {
    q = q.or(`question.ilike.%${args.query}%,answer.ilike.%${args.query}%`);
  }

  const { data } = await q;
  return (data || []).map((f) => ({
    question: f.question,
    answer: f.answer,
    category: f.category || "",
  }));
}

// ── 4. Search Members ───────────────────────────────────────────────

export async function searchMembers(args: { query?: string; district?: string; designation?: string; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("users")
    .select("id, name, occupation, phone, posting_details, official_type")
    .eq("status", "approved")
    .limit(args.limit || 10);

  if (args.query) {
    q = q.ilike("name", `%${args.query}%`);
  }
  if (args.designation) {
    q = q.ilike("occupation", `%${args.designation}%`);
  }

  const { data } = await q;
  let results = (data || []).map((m) => {
    const pd = m.posting_details as Record<string, string> | null;
    return {
      name: m.name,
      designation: m.occupation || "",
      district: pd?.regular_district || "",
      block: pd?.regular_block || "",
      official_type: m.official_type || null,
    };
  });

  if (args.district) {
    const d = args.district.toLowerCase();
    results = results.filter((r) => r.district.toLowerCase().includes(d));
  }

  return results;
}

// ── 5. Search Documents ─────────────────────────────────────────────

export async function searchDocuments(args: { query?: string; category?: string; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("documents")
    .select("id, title, description, category, file_type, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(args.limit || 5);

  if (args.query) {
    q = q.or(`title.ilike.%${args.query}%,description.ilike.%${args.query}%`);
  }
  if (args.category) {
    q = q.ilike("category", `%${args.category}%`);
  }

  const { data } = await q;
  return (data || []).map((d) => ({
    title: d.title,
    category: d.category || "",
    type: d.file_type || "",
    date: d.created_at,
    description: d.description?.slice(0, 150) || "",
  }));
}

// ── 6. Get My Profile ───────────────────────────────────────────────

export async function getMyProfile(ctx: QueryContext) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("name, email, phone, occupation, posting_details, social_links, photo_url, role, status, official_type, created_at, login_count, last_active_at")
    .eq("id", ctx.userId)
    .single();

  if (!data) return { error: "Profile not found" };

  const pd = data.posting_details as Record<string, string> | null;
  const sl = data.social_links as Record<string, string> | null;
  return {
    name: data.name,
    email: data.email,
    phone: data.phone,
    designation: data.occupation,
    district: pd?.regular_district || "",
    block: pd?.regular_block || "",
    role: data.role,
    status: data.status,
    official_type: data.official_type,
    member_since: data.created_at,
    qualification: sl?.qualification || "",
    gender: sl?.gender || "",
    date_of_joining: sl?.date_of_joining || "",
    login_count: data.login_count,
    has_photo: !!data.photo_url,
  };
}

// ── 7. Get My Subscriptions ─────────────────────────────────────────

export async function getMySubscriptions(ctx: QueryContext) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("id, period, amount, paid_amount, status, payment_method, paid_at, due_date, flexible_amount")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const all = data || [];
  const subs = all.map((s) => ({
    period: s.period,
    amount: s.amount,
    paid_amount: s.paid_amount,
    status: s.status,
    payment_method: s.payment_method || "",
    paid_at: s.paid_at,
    due_date: s.due_date,
    flexible: isFlexibleAmount(s),
  }));

  // Voluntary/flexible funds (e.g. Emergency Fund) — summarise each fund: total amount
  // contributed (sum of paid) + counts. Answers "how much did I contribute to the
  // Refundable / Emergency Fund?".
  const fundMap = new Map<string, { period: string; total_contributed: number; contributions: number; pending: number }>();
  for (const s of all) {
    if (!isFlexibleAmount(s)) continue;
    const g = fundMap.get(s.period) || { period: s.period, total_contributed: 0, contributions: 0, pending: 0 };
    if (s.status === "paid") { g.total_contributed += s.paid_amount ?? s.amount ?? 0; g.contributions += 1; }
    else if (s.status !== "rejected") g.pending += 1;
    fundMap.set(s.period, g);
  }
  const voluntary_funds = Array.from(fundMap.values());

  // Exclude flexible funds from pending/overdue so the chatbot doesn't report a fake due.
  const paid = subs.filter((s) => s.status === "paid").length;
  const pending = subs.filter((s) => s.status === "pending" && !s.flexible).length;
  const overdue = subs.filter((s) => s.status === "overdue" && !s.flexible).length;

  return { subscriptions: subs, voluntary_funds, summary: { total: subs.length, paid, pending, overdue } };
}

// Admin-only: look up ANY member's payment status by name. District officials are
// scoped to their own district; state officials / super_admin see everyone.
export async function getMemberPayments(ctx: QueryContext, args: { name?: string }) {
  const supabase = getServiceClient();

  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) {
    return { error: "Only admins and officials can look up other members' payments." };
  }
  const resolved = await resolveMember(args.name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;

  const { data: subRows } = await supabase
    .from("subscriptions")
    .select("period, amount, paid_amount, status, paid_at, flexible_amount")
    .eq("user_id", member.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = subRows || [];
  const dues = rows.filter((s) => !isFlexibleAmount(s));
  const flex = rows.filter((s) => isFlexibleAmount(s));
  const totalPaid = dues.filter((s) => s.status === "paid").reduce((sum, s) => sum + (s.paid_amount ?? s.amount ?? 0), 0);
  const voluntaryTotal = flex.filter((s) => s.status === "paid").reduce((sum, s) => sum + (s.paid_amount ?? s.amount ?? 0), 0);

  return {
    member: {
      name: member.name,
      designation: member.occupation || "",
      district: (member.posting_details as Record<string, string> | null)?.regular_district || "",
    },
    payments: dues.map((s) => ({
      period: s.period,
      amount: s.amount,
      paid_amount: s.paid_amount,
      status: s.status,
      paid_at: s.paid_at,
    })),
    voluntary_funds: Array.from(
      flex.reduce((m, s) => {
        const g = m.get(s.period) || { period: s.period, total_contributed: 0, contributions: 0 };
        if (s.status === "paid") { g.total_contributed += s.paid_amount ?? s.amount ?? 0; g.contributions += 1; }
        m.set(s.period, g);
        return m;
      }, new Map<string, { period: string; total_contributed: number; contributions: number }>()).values(),
    ),
    summary: {
      total_dues_paid: totalPaid,
      voluntary_contributed: voluntaryTotal,
      pending_dues: dues.filter((s) => s.status === "pending" || s.status === "overdue").length,
    },
  };
}

// Admin/official action: send a branded one-to-one email to a named member
// (e.g. a thank-you). Re-checks authority from DB; district officials scoped to
// their district; disambiguates on multiple matches; audit-logged.
export async function sendMemberEmail(ctx: QueryContext, args: { name?: string; subject?: string; message?: string }) {
  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) {
    return { error: "Only admins and officials can send member emails." };
  }
  const message = (args.message || "").trim();
  if (!message) return { error: "What should the email say? Provide a message." };

  const resolved = await resolveMember(args.name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;
  if (!member.email) return { sent: false, error: `${member.name} has no email on file.` };

  const subject = (args.subject || "").trim() || "A message from TANHOWA";
  const ok = await sendMemberMessageEmail(member.email, member.name || "Member", subject, message);
  if (!ok) return { sent: false, error: "The email failed to send. Please try again." };

  logAudit(ctx.userId, "send_member_email", "user", member.id, { subject, via: "assistant", by: actor.name || ctx.email });

  return { sent: true, to: member.name, email: member.email, subject, message: `Email sent to ${member.name}.` };
}

// Member self-service action: RSVP the current user to an event by name.
// Low risk (acts only on the caller's own RSVP), so no confirmation step.
export async function rsvpEvent(ctx: QueryContext, args: { event_name?: string; status?: string }) {
  const supabase = getServiceClient();
  const eventName = (args.event_name || "").trim();
  if (!eventName) return { error: "Which event? Give me the event name." };

  const status = (args.status || "going").toLowerCase();
  if (!["going", "interested", "cancel"].includes(status)) {
    return { error: "Status must be 'going', 'interested', or 'cancel'." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: events } = await supabase
    .from("events")
    .select("id, title, date, location")
    .ilike("title", `%${eventName}%`)
    .order("date", { ascending: true })
    .limit(8);

  let list = events || [];
  if (list.length === 0) return { found: 0, message: `No event found matching "${eventName}".` };
  // When several match, prefer upcoming ones to narrow down
  const upcoming = list.filter((e) => (e.date || "") >= today);
  if (upcoming.length >= 1) list = upcoming;
  if (list.length > 1) {
    return {
      found: list.length,
      disambiguate: list.map((e) => ({ title: e.title, date: e.date, location: e.location || "TBD" })),
      message: "Multiple events match — ask the user which one (by date) before RSVPing.",
    };
  }

  const event = list[0];
  if (status === "cancel") {
    await supabase.from("event_rsvps").delete().eq("event_id", event.id).eq("user_id", ctx.userId);
    return { ok: true, event: event.title, status: "cancelled", message: `Cancelled your RSVP for "${event.title}".` };
  }
  await supabase
    .from("event_rsvps")
    .upsert({ event_id: event.id, user_id: ctx.userId, status }, { onConflict: "event_id,user_id" });
  return { ok: true, event: event.title, status, date: event.date, location: event.location || "TBD", message: `You're marked as ${status} for "${event.title}".` };
}

// Admin/official action: nudge a member with a reminder (payment / profile / general).
// Sends a branded email + Telegram (if linked). District officials scoped to their district.
export async function nudgeMember(ctx: QueryContext, args: { name?: string; type?: string }) {
  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) return { error: "Only admins and officials can nudge members." };

  const resolved = await resolveMember(args.name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;
  if (!member.email) return { sent: false, error: `${member.name} has no email on file.` };

  const type = (args.type || "general").toLowerCase();
  const supabase = getServiceClient();
  const portal = "https://www.tanhowa.in/dashboard";
  let subject: string;
  let body: string;

  if (type === "payment") {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("amount, status, flexible_amount, period")
      .eq("user_id", member.id)
      .in("status", ["pending", "overdue"]);
    const dues = (subs || []).filter((s) => !isFlexibleAmount(s));
    const total = dues.reduce((sum, s) => sum + (s.amount || 0), 0);
    if (dues.length === 0) return { sent: false, message: `${member.name} has no pending dues to remind about.` };
    subject = "TANHOWA — friendly payment reminder";
    body = `This is a gentle reminder that you have ${dues.length} pending subscription due${dues.length > 1 ? "s" : ""} totalling Rs.${total.toLocaleString("en-IN")}. You can pay and upload your proof here: ${portal}/subscriptions\n\nThank you for supporting TANHOWA.`;
  } else if (type === "profile") {
    subject = "TANHOWA — please complete your profile";
    body = `Your TANHOWA profile is incomplete. Please add your remaining details (designation, district, posting block, photo, etc.) so we can include you fully in the directory and communications: ${portal}/profile`;
  } else {
    subject = "TANHOWA — a quick reminder";
    body = `This is a friendly note from the TANHOWA team. Please log in to the portal to stay up to date: ${portal}`;
  }

  const ok = await sendMemberMessageEmail(member.email, member.name || "Member", subject, body);

  // Telegram too, if linked
  let tg = false;
  const { data: u } = await supabase.from("users").select("telegram_chat_id").eq("id", member.id).single();
  if (u?.telegram_chat_id) {
    try { await sendTelegramMessage(u.telegram_chat_id, `<b>${subject}</b>\n\n${body}`); tg = true; } catch { /* ignore */ }
  }

  if (!ok && !tg) return { sent: false, error: "The reminder failed to send." };
  logAudit(ctx.userId, "nudge_member", "user", member.id, { type, channels: [ok ? "email" : null, tg ? "telegram" : null].filter(Boolean), by: actor.name || ctx.email });
  return { sent: true, to: member.name, channels: { email: ok, telegram: tg }, type, message: `Reminder sent to ${member.name}${tg ? " (email + Telegram)" : " (email)"}.` };
}

// Admin/official action: post an announcement (in-app immediately; email opt-in).
export async function createAnnouncement(ctx: QueryContext, args: { title?: string; content?: string; notify_email?: boolean }) {
  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) return { error: "Only admins and officials can post announcements." };
  const title = (args.title || "").trim();
  const content = (args.content || "").trim();
  if (!title || !content) return { error: "An announcement needs a title and content." };

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ title, content, author_id: ctx.userId, published: true })
    .select()
    .single();
  if (error || !data) return { error: "Failed to post the announcement." };

  translateContent("announcements", data.id, { title, content });
  if (args.notify_email) notifyNewAnnouncement(title, content);
  logAudit(ctx.userId, "announcement_created", "announcement", data.id, { via: "assistant", by: actor.name || ctx.email });
  return { ok: true, title, emailed: !!args.notify_email, message: `Posted announcement "${title}"${args.notify_email ? " and emailed members" : " (in-app only — say 'email members' to also send it)"}.` };
}

// Admin/official action: create a calendar event (email opt-in).
export async function createEvent(ctx: QueryContext, args: { title?: string; date?: string; location?: string; description?: string; notify_email?: boolean }) {
  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) return { error: "Only admins and officials can create events." };
  const title = (args.title || "").trim();
  const date = (args.date || "").trim();
  if (!title || !date) return { error: "An event needs a title and a date (YYYY-MM-DD)." };
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return { error: "Give the date as YYYY-MM-DD." };

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ title, description: args.description || "", date, location: args.location || "", created_by: ctx.userId })
    .select()
    .single();
  if (error || !data) return { error: "Failed to create the event." };

  translateContent("events", data.id, { title, description: args.description || "", location: args.location || "" });
  if (args.notify_email) notifyNewEvent(title, date, args.location || "");
  logAudit(ctx.userId, "event_created", "event", data.id, { via: "assistant", by: actor.name || ctx.email });
  return { ok: true, title, date, emailed: !!args.notify_email, message: `Created event "${title}" on ${date}${args.notify_email ? " and emailed members" : ""}.` };
}

// Admin/official action: create a quick poll (2-6 options).
export async function createPoll(ctx: QueryContext, args: { title?: string; options?: string[]; expires_in_days?: number }) {
  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) return { error: "Only admins and officials can create polls." };
  const title = (args.title || "").trim();
  const options = (args.options || []).map((o) => String(o).trim()).filter(Boolean);
  if (!title) return { error: "What's the poll question?" };
  if (options.length < 2) return { error: "A poll needs at least two options." };
  if (options.length > 6) return { error: "A poll can have at most six options." };

  const supabase = getServiceClient();
  const expires = args.expires_in_days && args.expires_in_days > 0
    ? new Date(Date.now() + args.expires_in_days * 864e5).toISOString()
    : null;
  const { data, error } = await supabase
    .from("polls")
    .insert({ title, options, created_by: ctx.userId, expires_at: expires })
    .select()
    .single();
  if (error || !data) return { error: "Failed to create the poll." };

  translateContent("polls", data.id, { title, options: JSON.stringify(options) });
  logAudit(ctx.userId, "poll_created", "poll", data.id, { via: "assistant", by: actor.name || ctx.email });
  return { ok: true, title, options, message: `Created poll "${title}" with ${options.length} options.` };
}

// Admin/official action: send a Telegram message to a member (if linked).
export async function sendMemberTelegram(ctx: QueryContext, args: { name?: string; message?: string }) {
  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) return { error: "Only admins and officials can message members." };
  const message = (args.message || "").trim();
  if (!message) return { error: "What should the Telegram message say?" };
  const resolved = await resolveMember(args.name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;

  const supabase = getServiceClient();
  const { data: u } = await supabase.from("users").select("telegram_chat_id").eq("id", member.id).single();
  if (!u?.telegram_chat_id) return { sent: false, message: `${member.name} hasn't linked their Telegram, so I can't message them there.` };
  try { await sendTelegramMessage(u.telegram_chat_id, message); } catch { return { sent: false, error: "Telegram send failed." }; }
  logAudit(ctx.userId, "telegram_message", "user", member.id, { via: "assistant", by: actor.name || ctx.email });
  return { ok: true, to: member.name, message: `Telegram sent to ${member.name}.` };
}

// State-Admin action: make a member a district official (DS/DJS) or remove it.
// Two-step (preview -> confirm). Grants/revokes admin access, so heavily gated.
export async function setOfficial(ctx: QueryContext, args: { name?: string; role?: string; confirm?: boolean }) {
  const actor = await resolveActor(ctx);
  if (!(actor.role === "super_admin" || actor.isState)) {
    return { error: "Only the State-Admin or state officials can set district officials." };
  }
  const role = (args.role || "").toUpperCase();
  if (!["DS", "DJS", "REMOVE"].includes(role)) return { error: "Role must be 'DS', 'DJS', or 'remove'." };

  const resolved = await resolveMember(args.name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;
  const designation = role === "DS" ? "District Secretary" : role === "DJS" ? "District Joint Secretary" : "";

  if (!args.confirm) {
    return {
      preview: true,
      member: member.name,
      action: role === "REMOVE" ? "remove district-official role" : `make ${designation} (grants admin access)`,
      message: `Confirm: ${role === "REMOVE" ? `remove ${member.name}'s district-official role` : `make ${member.name} ${designation} — this grants admin-panel access`}? Ask the user to confirm, then call again with confirm=true.`,
    };
  }

  const supabase = getServiceClient();
  if (role === "REMOVE") {
    const { data: cur } = await supabase.from("users").select("posting_details, role, official_type").eq("id", member.id).single();
    const posting = (cur?.posting_details || {}) as Record<string, unknown>;
    delete posting.official_designation;
    const updates: Record<string, unknown> = { official_type: null, posting_details: posting };
    if (cur?.official_type === "district" && cur?.role === "admin") updates.role = "member";
    await supabase.from("users").update(updates).eq("id", member.id);
  } else {
    const { data: cur } = await supabase.from("users").select("posting_details").eq("id", member.id).single();
    const posting = (cur?.posting_details || {}) as Record<string, unknown>;
    posting.official_designation = designation;
    await supabase.from("users").update({ official_type: "district", role: "admin", posting_details: posting }).eq("id", member.id);
  }
  logAudit(ctx.userId, "set_official", "user", member.id, { role, via: "assistant", by: actor.name || ctx.email });
  return { ok: true, member: member.name, role, message: role === "REMOVE" ? `Removed ${member.name}'s district-official role.` : `${member.name} is now ${designation}.` };
}

// Admin action: create a subscription for ONE member (e.g. a special/legal fund).
// Two-step (preview -> confirm). For an all-members run, use the admin Subscriptions page.
export async function createSubscription(ctx: QueryContext, args: { member_name?: string; period?: string; amount?: number; flexible?: boolean; confirm?: boolean }) {
  const actor = await resolveActor(ctx);
  if (!actor.isAdmin) return { error: "Only admins can create subscriptions." };
  const period = (args.period || "").trim();
  const amount = Number(args.amount);
  if (!period) return { error: "What period/name should the subscription have (e.g. '2026' or 'For UATT 2.0 Case 2025')?" };
  if (isNaN(amount) || amount < 0) return { error: "Give a valid amount." };

  const resolved = await resolveMember(args.member_name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;

  const supabase = getServiceClient();
  const { data: ex } = await supabase.from("subscriptions").select("id").eq("user_id", member.id).eq("period", period).maybeSingle();
  if (ex) return { error: `${member.name} already has a "${period}" subscription.` };

  if (!args.confirm) {
    return {
      preview: true,
      member: member.name,
      period,
      amount,
      flexible: !!args.flexible,
      message: `Confirm: create "${period}" (Rs.${amount.toLocaleString("en-IN")}${args.flexible ? ", flexible" : ""}) for ${member.name}? Ask the user to confirm, then call again with confirm=true. (For ALL members, use the admin Subscriptions page.)`,
    };
  }

  const { error } = await supabase.from("subscriptions").insert({ user_id: member.id, period, amount, status: "pending", flexible_amount: !!args.flexible });
  if (error) return { error: "Failed to create the subscription." };
  logAudit(ctx.userId, "subscription_created", "subscription", member.id, { period, amount, via: "assistant", by: actor.name || ctx.email });
  return { ok: true, member: member.name, period, amount, message: `Created "${period}" (Rs.${amount.toLocaleString("en-IN")}) for ${member.name}.` };
}

// Admin action: assign a task (by event ID or title) to a member or a team.
export async function assignTask(ctx: QueryContext, args: { task?: string; assignee_name?: string; team_name?: string }) {
  const actor = await resolveActor(ctx);
  if (!actor.isAdmin) return { error: "Only admins can assign tasks." };

  const taskRef = (args.task || "").trim();
  if (!taskRef) return { error: "Which task? Give an event ID (e.g. ET-022) or title." };
  const assigneeName = (args.assignee_name || "").trim();
  const teamName = (args.team_name || "").trim();
  if (!assigneeName && !teamName) return { error: "Assign to whom? Give a member name or a team name." };
  if (assigneeName && teamName) return { error: "Assign to a member OR a team, not both." };

  const supabase = getServiceClient();

  // Resolve the task — by event_id (hyphen-optional) or title
  const eidMatch = taskRef.match(/ET-?(\d+(?:-\d+)*)/i);
  let tasks: { id: string; title: string; event_id: string; status: string }[] = [];
  if (eidMatch) {
    const eid = `ET-${eidMatch[1]}`;
    const { data } = await supabase.from("todos").select("id, title, event_id, status").eq("event_id", eid).limit(2);
    tasks = data || [];
  }
  if (tasks.length === 0) {
    const { data } = await supabase.from("todos").select("id, title, event_id, status").ilike("title", `%${taskRef}%`).limit(6);
    tasks = data || [];
  }
  if (tasks.length === 0) return { found: 0, message: `No task found matching "${taskRef}".` };
  if (tasks.length > 1) {
    return { found: tasks.length, disambiguate: tasks.map((t) => ({ event_id: t.event_id, title: t.title, status: t.status })), message: "Multiple tasks match — ask which (by event ID)." };
  }
  const task = tasks[0];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let targetLabel = "";
  const recipientChatIds: string[] = [];

  if (assigneeName) {
    const resolved = await resolveMember(assigneeName, actor);
    if ("fail" in resolved) return resolved.fail;
    updates.assigned_to = resolved.member.id;
    updates.assigned_team_id = null;
    targetLabel = resolved.member.name || "member";
    const { data: u } = await supabase.from("users").select("telegram_chat_id").eq("id", resolved.member.id).single();
    if (u?.telegram_chat_id) recipientChatIds.push(u.telegram_chat_id);
  } else {
    const { data: teams } = await supabase.from("teams").select("id, name").ilike("name", `%${teamName}%`).limit(6);
    const list = teams || [];
    if (list.length === 0) return { found: 0, message: `No team found matching "${teamName}".` };
    if (list.length > 1) return { found: list.length, disambiguate: list.map((t) => ({ team: t.name })), message: "Multiple teams match — ask which one." };
    updates.assigned_team_id = list[0].id;
    updates.assigned_to = null;
    targetLabel = `${list[0].name} (team)`;
    const { data: members } = await supabase.from("team_members").select("user_id").eq("team_id", list[0].id);
    const ids = (members || []).map((m) => m.user_id).filter((id) => id !== ctx.userId);
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("telegram_chat_id").in("id", ids).not("telegram_chat_id", "is", null);
      for (const u of us || []) recipientChatIds.push(u.telegram_chat_id);
    }
  }

  // Move a pending task to approved so the assignee can commit to it
  if (task.status === "pending") {
    updates.status = "approved";
    updates.approved_by = ctx.userId;
    updates.approved_at = new Date().toISOString();
  }

  const { error } = await supabase.from("todos").update(updates).eq("id", task.id);
  if (error) return { error: "Failed to assign the task. Please try again." };

  for (const cid of recipientChatIds) notifyTaskAssigned(cid, task.title, task.event_id, actor.name || "Admin").catch(() => {});
  logAudit(ctx.userId, "task_assigned", "task", task.id, { to: targetLabel, via: "assistant", by: actor.name || ctx.email });
  return { ok: true, task: task.event_id, title: task.title, assigned_to: targetLabel, message: `Assigned ${task.event_id} "${task.title}" to ${targetLabel}.` };
}

// Admin action: approve or reject a PENDING member registration by name.
// Reuses the shared approveMember/rejectMember so it matches the admin UI exactly.
export async function approveRegistration(ctx: QueryContext, args: { name?: string; action?: string }) {
  const actor = await resolveActor(ctx);
  if (!actor.isAdmin) return { error: "Only admins can approve or reject registrations." };

  const action = (args.action || "approve").toLowerCase();
  if (!["approve", "reject"].includes(action)) return { error: "Action must be 'approve' or 'reject'." };

  const name = (args.name || "").trim();
  if (!name) return { error: "Tell me which pending member (a name)." };

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("id, name, email, occupation, posting_details")
    .eq("status", "pending")
    .ilike("name", `%${name}%`)
    .limit(6);
  const people = data || [];

  if (people.length === 0) return { found: 0, message: `No pending registration found matching "${name}".` };
  if (people.length > 1) {
    return {
      found: people.length,
      disambiguate: people.map((p) => ({ name: p.name, email: p.email, designation: p.occupation || "", district: (p.posting_details as Record<string, string> | null)?.regular_district || "" })),
      message: "Multiple pending members match — ask the user which one.",
    };
  }

  const member = people[0];
  const r = action === "approve" ? await approveMember(member.id, ctx.userId) : await rejectMember(member.id, ctx.userId);
  if (!r.ok) return { error: r.error };

  logAudit(ctx.userId, action === "approve" ? "member_approved" : "member_rejected", "user", member.id, { via: "assistant", by: actor.name || ctx.email });
  return { ok: true, action, member: member.name, message: `${action === "approve" ? "Approved" : "Rejected"} ${member.name}'s registration.` };
}

// Finance action: approve or reject a pending expense voucher. Two-step
// (preview -> confirm=true). Finance-team / super_admin only; emails the submitter.
export async function setVoucherStatus(ctx: QueryContext, args: { submitter_name?: string; title?: string; status?: string; confirm?: boolean; remarks?: string }) {
  const actor = await resolveActor(ctx);
  const financeAccess = actor.role === "super_admin" || (await isFinanceTeamMember(ctx.userId));
  if (!financeAccess) return { error: "Only Finance Team members or the State-Admin can approve or reject vouchers." };

  const status = (args.status || "").toLowerCase();
  if (!["approved", "rejected"].includes(status)) return { error: "Status must be 'approved' or 'rejected'." };

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("expense_vouchers")
    .select("id, title, amount, status, remarks, submitter:submitted_by(name, email)")
    .eq("status", "pending")
    .limit(50);

  let vouchers = data || [];
  const subName = (args.submitter_name || "").trim().toLowerCase();
  const title = (args.title || "").trim().toLowerCase();
  const subOf = (v: { submitter?: unknown }) => (v.submitter as { name?: string; email?: string } | null) || {};
  if (subName) vouchers = vouchers.filter((v) => (subOf(v).name || "").toLowerCase().includes(subName));
  if (title) vouchers = vouchers.filter((v) => (v.title || "").toLowerCase().includes(title));

  if (vouchers.length === 0) return { found: 0, message: "No pending voucher found matching that." };
  if (vouchers.length > 1) {
    return {
      found: vouchers.length,
      disambiguate: vouchers.map((v) => ({ title: v.title, amount: v.amount, submitter: subOf(v).name || "" })),
      message: "Multiple pending vouchers match — ask which (by title or submitter).",
    };
  }

  const voucher = vouchers[0];
  const submitter = subOf(voucher);
  if (!args.confirm) {
    return {
      preview: true,
      title: voucher.title,
      amount: voucher.amount,
      submitter: submitter.name || "",
      action: status,
      message: `Confirm: ${status === "approved" ? "approve" : "reject"} the voucher "${voucher.title}" (Rs.${(voucher.amount || 0).toLocaleString("en-IN")}) from ${submitter.name || "the submitter"}? Ask the user to confirm, then call again with confirm=true.`,
    };
  }

  const updates: Record<string, unknown> = { status, approved_by: ctx.userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (args.remarks) updates.remarks = args.remarks;
  const { error } = await supabase.from("expense_vouchers").update(updates).eq("id", voucher.id);
  if (error) return { error: "Failed to update the voucher. Please try again." };

  awardTaskPoints(ctx.userId, "finance_voucher_reviewed", null, undefined, { type: "expense_voucher", id: voucher.id });

  if (submitter.email) {
    sendVoucherStatusEmail(submitter.email, submitter.name || "Official", voucher.title, voucher.amount || 0, status as "approved" | "rejected", args.remarks || voucher.remarks || "").catch(() => {});
  }
  logAudit(ctx.userId, "voucher_" + status, "voucher", voucher.id, { via: "assistant", by: actor.name || ctx.email });
  return { ok: true, title: voucher.title, status, submitter: submitter.name, message: `Voucher "${voucher.title}" ${status}.` };
}

// Admin/finance action: set a member's subscription status (paid / rejected / hold).
// Two-step: without confirm=true it returns a preview to confirm. Approving as PAID is
// restricted to finance-team/super_admin and requires an uploaded proof.
export async function setPaymentStatus(ctx: QueryContext, args: { name?: string; period?: string; status?: string; amount?: number; confirm?: boolean }) {
  const actor = await resolveActor(ctx);
  if (!actor.canAdminAct) return { error: "Only admins and officials can change payment status." };

  const status = (args.status || "").toLowerCase();
  if (!["paid", "rejected", "hold"].includes(status)) {
    return { error: "Status must be 'paid', 'rejected', or 'hold'." };
  }
  if (status === "paid") {
    const allowed = actor.role === "super_admin" || (await isFinanceTeamMember(ctx.userId));
    if (!allowed) return { error: "Only Finance Team members or the State-Admin can give final payment approval." };
  }

  const resolved = await resolveMember(args.name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;

  const supabase = getServiceClient();
  let q = supabase
    .from("subscriptions")
    .select("id, period, amount, paid_amount, status, payment_proof_url, flexible_amount, remarks")
    .eq("user_id", member.id)
    .in("status", ["pending", "overdue", "hold"]);
  if (args.period) q = q.ilike("period", `%${args.period}%`);
  const { data: subs } = await q;
  const candidates = subs || [];

  if (candidates.length === 0) return { found: 0, message: `No open subscription found for ${member.name}${args.period ? ` matching "${args.period}"` : ""}.` };
  if (candidates.length > 1) {
    return {
      found: candidates.length,
      disambiguate: candidates.map((s) => ({ period: s.period, amount: s.amount, status: s.status, has_proof: !!s.payment_proof_url })),
      message: `${member.name} has multiple open subscriptions — ask which period (by name).`,
    };
  }

  const sub = candidates[0];

  // Preview unless confirmed
  if (!args.confirm) {
    return {
      preview: true,
      member: member.name,
      period: sub.period,
      amount: sub.amount,
      current_status: sub.status,
      action: status,
      has_proof: !!sub.payment_proof_url,
      message: `Confirm: mark ${member.name}'s "${displayPeriod(sub.period)}" (Rs.${(sub.amount || 0).toLocaleString("en-IN")}) as ${status}? Ask the user to confirm, then call again with confirm=true.`,
    };
  }

  // Execute
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "paid") {
    if (!sub.payment_proof_url) return { error: `Cannot approve — no payment proof is uploaded for ${member.name}'s "${displayPeriod(sub.period)}". Ask them to upload it first.` };
    const paidAmount = args.amount != null ? Number(args.amount) : (sub.paid_amount ?? sub.amount ?? 0);
    updates.paid_at = new Date().toISOString();
    updates.approved_by = ctx.userId;
    updates.approved_at = new Date().toISOString();
    updates.paid_amount = paidAmount;
    if (isFlexibleAmount(sub) && paidAmount > 0) updates.amount = paidAmount;
    const financeRemark = `Final approval by ${actor.name || "Finance"}, Finance Team, TANHOWA.`;
    const db = (sub.remarks || "").trim();
    updates.remarks = db ? `${db}\n${financeRemark}` : financeRemark;
  } else {
    updates.approved_by = null;
    updates.approved_at = null;
  }

  const { error } = await supabase.from("subscriptions").update(updates).eq("id", sub.id);
  if (error) return { error: "Failed to update the payment. Please try again." };

  if (status === "paid") {
    awardTaskPoints(ctx.userId, "finance_payment_verified", null, undefined, { type: "subscription", id: sub.id });
  } else if (status === "rejected") {
    awardTaskPoints(ctx.userId, "finance_payment_rejected", null, undefined, { type: "subscription", id: sub.id });
  }

  logAudit(ctx.userId, "payment_" + status, "subscription", sub.id, { member: member.name, period: sub.period, via: "assistant", by: actor.name || ctx.email });
  return { ok: true, member: member.name, period: sub.period, status, message: `Marked ${member.name}'s "${displayPeriod(sub.period)}" as ${status}.` };
}

export async function getMyAdhPmStatus(ctx: QueryContext) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("occupation, social_links")
    .eq("id", ctx.userId)
    .single();

  const occupation = data?.occupation || "";
  const isAdhPm = occupation === "Assistant Director of Horticulture (PM)";
  const optedOut = !!(data?.social_links as { adh_pm_optout?: boolean } | null)?.adh_pm_optout;
  const responded = isAdhPm || optedOut;

  let response_recorded: string;
  if (isAdhPm) response_recorded = "Yes — recorded as Assistant Director of Horticulture (PM).";
  else if (optedOut) response_recorded = "Recorded — you answered No (not ADH(PM)); you won't be asked again.";
  else response_recorded = "No response recorded yet. If you received the 'Are you an ADH (PM)?' email, tap Yes or No in it.";

  return {
    current_designation: occupation || "(not set)",
    is_adh_pm: isAdhPm,
    opted_out: optedOut,
    responded,
    response_recorded,
  };
}

// Admin/official aggregate for the "Are you an ADH (PM)?" campaign — mirrors
// the /admin/adh-pm tracker. now_pm = clicked Yes, said_no = opted out,
// no_reply = plain ADH with no response yet. Super-admin / state officials only.
export async function getAdhPmStats(ctx: QueryContext) {
  const actor = await resolveActor(ctx);
  if (!(actor.role === "super_admin" || actor.isState)) {
    return { error: "Only the State-Admin or state officials can see the ADH(PM) campaign totals." };
  }
  const ADH = "Assistant Director of Horticulture";
  const ADH_PM = "Assistant Director of Horticulture (PM)";
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("occupation, social_links")
    .eq("status", "approved")
    .limit(2000);
  const rows = data || [];
  let now_pm = 0, said_no = 0, no_reply = 0;
  for (const u of rows) {
    const occ = (u.occupation || "").trim();
    const optout = !!(u.social_links as { adh_pm_optout?: boolean } | null)?.adh_pm_optout;
    if (occ === ADH_PM) now_pm++;
    else if (optout) said_no++;
    else if (occ === ADH) no_reply++;
  }
  const responded = now_pm + said_no;
  return {
    now_pm,
    said_no,
    no_reply,
    total_responded: responded,
    audience: responded + no_reply,
    message: `ADH(PM) campaign: ${now_pm} confirmed PM, ${said_no} said No, ${no_reply} no reply yet (${responded} of ${responded + no_reply} responded).`,
  };
}

// ── 8. Get My Tasks ─────────────────────────────────────────────────

export async function getMyTasks(ctx: QueryContext, args: { status?: string; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("todos")
    .select("id, event_id, title, status, urgent, important, due_date, assigned_to, committed_by, timebox_hours")
    .or(`submitted_by.eq.${ctx.userId},assigned_to.eq.${ctx.userId},committed_by.eq.${ctx.userId}`)
    .order("created_at", { ascending: false })
    .limit(args.limit || 10);

  if (args.status) {
    q = q.eq("status", args.status);
  }

  const { data } = await q;
  return (data || []).map((t) => ({
    event_id: t.event_id,
    title: t.title,
    status: t.status,
    urgent: t.urgent,
    important: t.important,
    due_date: t.due_date,
    timebox_hours: t.timebox_hours,
  }));
}

// ── 9. Get My Achievements ──────────────────────────────────────────

export async function getMyAchievements(ctx: QueryContext) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("achievements")
    .select("badge, earned_at")
    .eq("user_id", ctx.userId)
    .order("earned_at", { ascending: false });

  return (data || []).map((a) => ({
    badge: a.badge,
    earned_at: a.earned_at,
  }));
}

// ── 10. Get Portal Stats ────────────────────────────────────────────

export async function getPortalStats() {
  const supabase = getServiceClient();

  const [members, announcements, events, tasks, trainings] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("announcements").select("id", { count: "exact", head: true }).eq("published", true),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase.from("todos").select("id", { count: "exact", head: true }),
    supabase.from("trainings").select("id", { count: "exact", head: true }),
  ]);

  return {
    total_members: members.count || 0,
    total_announcements: announcements.count || 0,
    total_events: events.count || 0,
    total_tasks: tasks.count || 0,
    total_trainings: trainings.count || 0,
  };
}

// ── 11. Search Trainings ────────────────────────────────────────────

export async function searchTrainings(args: { query?: string; upcoming?: boolean; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("trainings")
    .select("id, title, description, topic, trainer_name, date, duration_hours, location, mode, status, max_participants")
    .order("date", { ascending: true })
    .limit(args.limit || 5);

  if (args.upcoming) {
    q = q.in("status", ["upcoming", "ongoing"]);
  }
  if (args.query) {
    q = q.or(`title.ilike.%${args.query}%,topic.ilike.%${args.query}%,description.ilike.%${args.query}%`);
  }

  const { data } = await q;
  return (data || []).map((t) => ({
    title: t.title,
    topic: t.topic || "",
    trainer: t.trainer_name || "TBD",
    date: t.date,
    duration_hours: t.duration_hours,
    location: t.location || "",
    mode: t.mode,
    status: t.status,
  }));
}

// ── 12. Search Resolutions ──────────────────────────────────────────

export async function searchResolutions(args: { query?: string; status?: string; limit?: number }) {
  const supabase = getServiceClient();
  let q = supabase
    .from("resolutions")
    .select("id, title, description, category, status, votes_required, total_members, created_at")
    .in("status", ["voting_open", "passed", "failed"])
    .order("created_at", { ascending: false })
    .limit(args.limit || 5);

  if (args.query) {
    q = q.or(`title.ilike.%${args.query}%,description.ilike.%${args.query}%`);
  }
  if (args.status) {
    q = q.eq("status", args.status);
  }

  const { data } = await q;
  return (data || []).map((r) => ({
    title: r.title,
    category: r.category || "",
    status: r.status,
    votes_required: r.votes_required,
    date: r.created_at,
  }));
}

// ── 13. Get My Contributions ────────────────────────────────────────

export async function getMyContributions(ctx: QueryContext) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("contributions")
    .select("action, description, estimated_minutes, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(15);

  const total_minutes = (data || []).reduce((sum, c) => sum + (c.estimated_minutes || 0), 0);
  const action_counts: Record<string, number> = {};
  for (const c of data || []) {
    action_counts[c.action] = (action_counts[c.action] || 0) + 1;
  }

  return {
    total_minutes,
    total_actions: (data || []).length,
    action_breakdown: action_counts,
    recent: (data || []).slice(0, 5).map((c) => ({
      action: c.action,
      description: c.description,
      date: c.created_at,
    })),
  };
}

// ── Wave A: member self-service actions ─────────────────────────────
// Low-risk — act only on the caller's OWN data, so no resolveActor/confirm.

const WISHLIST_CATEGORIES = ["Training", "Infrastructure", "Events", "Digital Tools", "Policy", "Welfare", "Communication", "Other"];

// Cast/replace the caller's vote in an active poll (matched by title + option).
export async function votePoll(ctx: QueryContext, args: { poll_title?: string; option?: string }) {
  const supabase = getServiceClient();
  const title = (args.poll_title || "").trim();
  const optionRaw = (args.option || "").trim();
  if (!title) return { error: "Which poll? Give the poll's title." };
  if (!optionRaw) return { error: "Which option do you want to vote for?" };

  const { data: polls } = await supabase
    .from("polls")
    .select("id, title, options, status, expires_at")
    .eq("status", "active")
    .ilike("title", `%${title}%`)
    .limit(6);
  const nowIso = new Date().toISOString();
  const list = (polls || []).filter((p) => !p.expires_at || p.expires_at > nowIso);
  if (list.length === 0) return { found: 0, message: `No open poll found matching "${title}".` };
  if (list.length > 1) {
    return { found: list.length, disambiguate: list.map((p) => ({ title: p.title })), message: "Multiple open polls match — ask which one." };
  }
  const poll = list[0];
  const options: string[] = Array.isArray(poll.options) ? poll.options : [];
  let idx = -1;
  const asNum = parseInt(optionRaw, 10);
  if (!isNaN(asNum) && asNum >= 1 && asNum <= options.length) idx = asNum - 1;
  else idx = options.findIndex((o) => String(o).toLowerCase().includes(optionRaw.toLowerCase()));
  if (idx < 0) {
    return { found_poll: poll.title, options, message: `That option isn't on "${poll.title}". Options: ${options.map((o, i) => `${i + 1}. ${o}`).join("; ")}. Ask the user to pick one.` };
  }
  await supabase.from("poll_votes").upsert({ poll_id: poll.id, user_id: ctx.userId, option_index: idx }, { onConflict: "poll_id,user_id" });
  logContribution(ctx.userId, "poll_voted", `Voted in poll: ${poll.title}`);
  return { ok: true, poll: poll.title, choice: options[idx], message: `Your vote for "${options[idx]}" in "${poll.title}" is recorded.` };
}

// Submit an idea to the wishlist/ideas board.
export async function addWishlistIdea(ctx: QueryContext, args: { title?: string; description?: string; category?: string }) {
  const supabase = getServiceClient();
  const title = (args.title || "").trim();
  const description = (args.description || "").trim();
  if (!title) return { error: "What's the idea? Give a short title." };
  if (!description) return { error: "Add a sentence or two describing the idea." };
  const match = WISHLIST_CATEGORIES.find((c) => c.toLowerCase() === (args.category || "").trim().toLowerCase());
  const category = match || "Other";
  const { data, error } = await supabase.from("wishlist_ideas").insert({ title, description, category, submitted_by: ctx.userId }).select("id").single();
  if (error) return { error: "Couldn't submit the idea. Please try again." };
  logContribution(ctx.userId, "idea_submitted", "Submitted idea: " + title);
  translateContent("wishlist_ideas", data.id, { title, description });
  return { ok: true, title, category, message: `Your idea "${title}" was added to the wishlist board (category: ${category}).` };
}

// File a grievance, suggestion, or service request (one shared table; ticket # by trigger).
export async function submitGrievance(ctx: QueryContext, args: { kind?: string; subject?: string; description?: string; category?: string; priority?: string }) {
  const supabase = getServiceClient();
  const subject = (args.subject || "").trim();
  const description = (args.description || "").trim();
  if (!subject) return { error: "What's the subject/title?" };
  if (!description) return { error: "Describe it in a sentence or two." };

  const kind = (args.kind || "").toLowerCase();
  const allCats = [...GRIEVANCE_CATEGORIES, "Suggestion", ...SERVICE_REQUEST_CATEGORIES] as string[];
  const matched = allCats.find((c) => c.toLowerCase() === (args.category || "").trim().toLowerCase());
  let category: string;
  if (matched) category = matched;
  else if (kind.includes("suggest")) category = "Suggestion";
  else if (kind.includes("service") || kind.includes("request")) category = "Other Service";
  else category = "Personal";
  const priority = ["low", "medium", "high"].includes((args.priority || "").toLowerCase()) ? (args.priority as string).toLowerCase() : undefined;

  const { data, error } = await supabase
    .from("grievances")
    .insert({ subject, description, category, submitted_by: ctx.userId, ...(priority ? { priority } : {}) })
    .select("id, ticket_number, category")
    .single();
  if (error) return { error: "Couldn't submit it. Please try again." };
  const isService = (SERVICE_REQUEST_CATEGORIES as readonly string[]).includes(category);
  const label = category === "Suggestion" ? "suggestion" : isService ? "service request" : "grievance";
  logContribution(ctx.userId, label === "suggestion" ? "suggestion_submitted" : label === "service request" ? "service_request_submitted" : "grievance_submitted", "Submitted: " + subject);
  return { ok: true, ticket: data.ticket_number || null, kind: label, subject, message: `Your ${label} "${subject}" was submitted${data.ticket_number ? ` (ticket ${data.ticket_number})` : ""}. Track it on the portal.` };
}

// Enroll the caller in a training (matched by title).
export async function enrollTraining(ctx: QueryContext, args: { training_title?: string }) {
  const supabase = getServiceClient();
  const title = (args.training_title || "").trim();
  if (!title) return { error: "Which training? Give its title." };
  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, title, date, status")
    .ilike("title", `%${title}%`)
    .order("date", { ascending: false })
    .limit(6);
  const list = (trainings || []).filter((t) => t.status !== "cancelled");
  if (list.length === 0) return { found: 0, message: `No training found matching "${title}".` };
  if (list.length > 1) {
    return { found: list.length, disambiguate: list.map((t) => ({ title: t.title, date: t.date })), message: "Multiple trainings match — ask which one (by date)." };
  }
  const training = list[0];
  const { error } = await supabase.from("training_enrollments").upsert({ training_id: training.id, user_id: ctx.userId, status: "enrolled" }, { onConflict: "training_id,user_id" });
  if (error) return { error: "Couldn't enroll you. Please try again." };
  logContribution(ctx.userId, "training_enrolled", "Enrolled in training: " + training.title);
  return { ok: true, training: training.title, date: training.date, message: `You're enrolled in "${training.title}"${training.date ? ` (${training.date})` : ""}.` };
}

// Toggle one of the caller's notification channels.
export async function setNotificationPref(ctx: QueryContext, args: { channel?: string; enabled?: boolean }) {
  const supabase = getServiceClient();
  const raw = (args.channel || "").toLowerCase().replace(/[\s-]/g, "_");
  const MAP: Record<string, string> = { email: "email", telegram: "telegram", in_app: "in_app", inapp: "in_app", app: "in_app", weekly_digest: "weekly_digest", digest: "weekly_digest", whatsapp: "whatsapp" };
  const key = MAP[raw];
  if (!key) return { error: "Which channel? One of: email, telegram, in-app, weekly digest, whatsapp." };
  if (typeof args.enabled !== "boolean") return { error: "Should I enable or disable it?" };
  const { data } = await supabase.from("users").select("notification_prefs").eq("id", ctx.userId).single();
  const prefs: Record<string, boolean> = { email: true, telegram: true, in_app: true, weekly_digest: true, whatsapp: false, ...((data?.notification_prefs as Record<string, boolean>) || {}) };
  prefs[key] = args.enabled;
  await supabase.from("users").update({ notification_prefs: prefs }).eq("id", ctx.userId);
  return { ok: true, channel: key, enabled: args.enabled, message: `${key.replace(/_/g, " ")} notifications ${args.enabled ? "enabled" : "disabled"}.` };
}

// Add a voluntary contribution to a flexible fund the caller participates in.
// Creates a NEW pending row (a ledger); the member still uploads proof to complete it.
export async function addContribution(ctx: QueryContext, args: { fund?: string; amount?: number }) {
  const supabase = getServiceClient();
  const fundQ = (args.fund || "").trim();
  const amount = Number(args.amount);
  if (!fundQ) return { error: "Which fund do you want to contribute to (e.g. the Emergency Fund)?" };
  if (isNaN(amount) || amount <= 0) return { error: "How much would you like to contribute? Give a positive amount." };

  const { data: rows } = await supabase
    .from("subscriptions")
    .select("period, flexible_amount")
    .eq("user_id", ctx.userId);
  const flexPeriods = [...new Set((rows || [])
    .filter((r) => isFlexibleAmount({ period: r.period, flexible_amount: r.flexible_amount }))
    .map((r) => r.period))];
  if (flexPeriods.length === 0) return { error: "You don't have any voluntary funds to contribute to." };

  const matches = flexPeriods.filter((p) => p.toLowerCase().includes(fundQ.toLowerCase()));
  let period: string;
  if (matches.length === 1) period = matches[0];
  else if (matches.length > 1) return { found: matches.length, disambiguate: matches.map((p) => ({ fund: p })), message: "Multiple funds match — ask which one." };
  else if (flexPeriods.length === 1) period = flexPeriods[0];
  else return { found: 0, options: flexPeriods, message: `No fund matches "${fundQ}". Your voluntary funds: ${flexPeriods.join("; ")}. Ask which one.` };

  const { error } = await supabase.from("subscriptions").insert({ user_id: ctx.userId, period, amount, status: "pending", flexible_amount: true });
  if (error) return { error: "Couldn't add the contribution. Please try again." };
  return { ok: true, fund: period, amount, message: `Added a pending contribution of Rs.${amount.toLocaleString("en-IN")} to "${period}". To complete it, upload the payment proof — tap 📎 → Payment proof, or use the Subscriptions page.` };
}

// Commit to a task, or submit it for review ("done") — caller's own task.
export async function updateMyTask(ctx: QueryContext, args: { task?: string; action?: string }) {
  const supabase = getServiceClient();
  const ref = (args.task || "").trim();
  const a = (args.action || "").toLowerCase();
  if (!ref) return { error: "Which task? Give its event ID (e.g. ET-022) or title." };
  const act = a.includes("commit") ? "commit"
    : (a.includes("review") || a.includes("done") || a.includes("complet") || a.includes("finish")) ? "review" : "";
  if (!act) return { error: "What do you want to do — 'commit' to the task, or mark it 'done' (submit for review)?" };

  const eid = ref.match(/ET-?(\d+(?:-\d+)*)/i);
  const cols = "id, title, event_id, status, committed_by, assigned_to, submitted_by";
  let tasks: { id: string; title: string; event_id: string; status: string; committed_by: string | null; assigned_to: string | null; submitted_by: string | null }[] = [];
  if (eid) {
    const { data } = await supabase.from("todos").select(cols).eq("event_id", `ET-${eid[1]}`).limit(2);
    tasks = data || [];
  }
  if (tasks.length === 0) {
    const { data } = await supabase.from("todos").select(cols).ilike("title", `%${ref}%`).limit(6);
    tasks = data || [];
  }
  if (tasks.length === 0) return { found: 0, message: `No task found matching "${ref}".` };
  if (tasks.length > 1) return { found: tasks.length, disambiguate: tasks.map((t) => ({ event_id: t.event_id, title: t.title, status: t.status })), message: "Multiple tasks match — ask which (by event ID)." };
  const task = tasks[0];

  if (act === "commit") {
    if (task.committed_by && task.committed_by !== ctx.userId) return { error: "That task is already committed by another member." };
    if (!["approved", "in_progress"].includes(task.status)) return { error: "Only an approved or in-progress task can be committed." };
    await supabase.from("todos").update({ committed_by: ctx.userId, committed_at: new Date().toISOString(), status: "in_progress", updated_at: new Date().toISOString() }).eq("id", task.id);
    logContribution(ctx.userId, "task_committed", "Committed to task: " + task.title);
    awardTaskPoints(ctx.userId, "commit", task.id);
    return { ok: true, task: task.title, event_id: task.event_id, action: "committed", message: `You've committed to "${task.title}" (${task.event_id}) — it's now in progress.` };
  }
  // review
  if (task.status !== "in_progress") return { error: "Only an in-progress task can be submitted for review." };
  if (task.committed_by && task.committed_by !== ctx.userId) return { error: "Only the member who committed to the task can submit it for review." };
  await supabase.from("todos").update({ status: "review", updated_at: new Date().toISOString() }).eq("id", task.id);
  logContribution(ctx.userId, "task_updated", "Submitted task for review: " + task.title);
  return { ok: true, task: task.title, event_id: task.event_id, action: "review", message: `"${task.title}" (${task.event_id}) is submitted for review — an admin will verify and mark it complete.` };
}

// Return the caller's Telegram connect deep link (or say it's already linked).
export async function getTelegramConnect(ctx: QueryContext) {
  const supabase = getServiceClient();
  const { data } = await supabase.from("users").select("telegram_chat_id").eq("id", ctx.userId).single();
  if (data?.telegram_chat_id) {
    return { already_connected: true, message: "Your Telegram is already connected ✅ — you'll get task and payment alerts there." };
  }
  const link = `https://t.me/tanhowa_task_bot?start=${encodeURIComponent(ctx.email)}`;
  return { connect_url: link, message: `To connect Telegram, open this link and tap **Start** (it pre-fills your email and links your account): ${link}` };
}

// Update one safe personal field (phone / home address / office address) on the caller.
// Name/designation/district/DOB go through the Profile page (full-replace logic there).
export async function updateMyProfileField(ctx: QueryContext, args: { field?: string; value?: string }) {
  const supabase = getServiceClient();
  const raw = (args.field || "").toLowerCase().replace(/[\s-]/g, "_");
  const value = (args.value || "").trim();
  const MAP: Record<string, string> = { phone: "phone", mobile: "phone", phone_number: "phone", contact: "phone", address: "address", home_address: "address", office_address: "office_address", office: "office_address" };
  const col = MAP[raw];
  if (!col) return { error: "I can update your phone, home address, or office address here. For name, designation, district or date of birth, use the Profile page." };
  if (!value) return { error: `What should I set your ${col.replace(/_/g, " ")} to?` };
  if (col === "phone" && !/^\+?[\d\s-]{7,15}$/.test(value)) return { error: "That doesn't look like a valid phone number." };
  await supabase.from("users").update({ [col]: value }).eq("id", ctx.userId);
  logContribution(ctx.userId, "profile_updated", `Updated ${col} via assistant`);
  return { ok: true, field: col, value, message: `Your ${col.replace(/_/g, " ")} is updated to ${value}.` };
}

// ── Wave D: owner-only actions ──────────────────────────────────────
// Restricted to the association owner (tanhowa19791@gmail.com) — the same gate
// the admin Users route enforces for suspend/reinstate.
const OWNER_EMAIL = "tanhowa19791@gmail.com";

// Owner action: suspend or reinstate a member. Two-step (preview -> confirm=true).
// Mirrors PUT /api/admin/users (action suspend|reinstate): emails + Telegram notice.
export async function suspendMember(ctx: QueryContext, args: { name?: string; action?: string; reason?: string; remarks?: string; confirm?: boolean }) {
  if ((ctx.email || "").toLowerCase() !== OWNER_EMAIL) {
    return { error: "Only the association owner can suspend or reinstate members." };
  }
  const actor = await resolveActor(ctx);
  const action = (args.action || "suspend").toLowerCase();
  if (!["suspend", "reinstate"].includes(action)) return { error: "Action must be 'suspend' or 'reinstate'." };

  const resolved = await resolveMember(args.name || "", actor);
  if ("fail" in resolved) return resolved.fail;
  const member = resolved.member;

  const supabase = getServiceClient();
  const { data: target } = await supabase.from("users").select("name, email, role, status, telegram_chat_id").eq("id", member.id).single();
  if (!target) return { error: "Member not found." };
  if (target.role === "super_admin") return { error: "Cannot suspend or reinstate a super admin." };

  const REASON_LABELS: Record<string, string> = {
    non_payment: "Non-payment of subscriptions",
    disciplinary: "Disciplinary action",
    voluntary: "Voluntary withdrawal",
    transfer: "Transfer out of TN Horticulture",
    retirement: "Retirement",
    other: "Administrative decision",
  };

  if (action === "suspend") {
    if (target.status === "suspended") return { error: `${member.name} is already suspended.` };
    const reason = (args.reason || "").toLowerCase();
    if (!REASON_LABELS[reason]) {
      return { error: `Suspension needs a reason — one of: ${Object.keys(REASON_LABELS).join(", ")}.` };
    }
    if (!args.confirm) {
      return {
        preview: true,
        member: member.name,
        action: "suspend",
        reason: REASON_LABELS[reason],
        message: `Confirm: suspend ${member.name} (reason: ${REASON_LABELS[reason]})? They will be blocked from the portal and emailed/notified. Ask the user to confirm, then call again with confirm=true.`,
      };
    }
    await supabase.from("users").update({
      status: "suspended",
      suspension_details: { reason, remarks: args.remarks || "", suspended_by: ctx.userId, suspended_at: new Date().toISOString() },
    }).eq("id", member.id);
    if (target.email) sendSuspensionEmail(target.email, target.name || "Member", REASON_LABELS[reason], args.remarks || "").catch(() => {});
    if (target.telegram_chat_id) {
      sendTelegramMessage(target.telegram_chat_id, `⚠️ <b>Membership Suspended</b>\n\nYour TANHOWA membership has been suspended.\n<b>Reason:</b> ${REASON_LABELS[reason]}${args.remarks ? `\n<b>Remarks:</b> ${args.remarks}` : ""}\n\nPlease contact admin for queries.`).catch(() => {});
    }
    logAudit(ctx.userId, "suspend", "user", member.id, { reason, via: "assistant", by: actor.name || ctx.email });
    return { ok: true, member: member.name, action: "suspended", message: `${member.name} has been suspended (${REASON_LABELS[reason]}).` };
  }

  // reinstate
  if (target.status !== "suspended") return { error: `${member.name} is not suspended.` };
  if (!args.confirm) {
    return {
      preview: true,
      member: member.name,
      action: "reinstate",
      message: `Confirm: reinstate ${member.name}? They will regain portal access and be notified. Ask the user to confirm, then call again with confirm=true.`,
    };
  }
  await supabase.from("users").update({ status: "approved", suspension_details: null }).eq("id", member.id);
  if (target.email) sendReinstatementEmail(target.email, target.name || "Member").catch(() => {});
  if (target.telegram_chat_id) {
    sendTelegramMessage(target.telegram_chat_id, `✅ <b>Membership Reinstated</b>\n\nYour TANHOWA membership has been reinstated. You can now access the portal.\n\n🌐 <a href="https://www.tanhowa.in">tanhowa.in</a>`).catch(() => {});
  }
  logAudit(ctx.userId, "reinstate", "user", member.id, { via: "assistant", by: actor.name || ctx.email });
  return { ok: true, member: member.name, action: "reinstated", message: `${member.name} has been reinstated.` };
}

// Finance action: record a manual debit entry (cheque issued). Two-step
// (preview -> confirm=true). Finance-team / super_admin only. Mirrors POST /api/finance.
export async function createFinanceEntry(ctx: QueryContext, args: { payee?: string; amount?: number; cheque_no?: string; entry_date?: string; remarks?: string; confirm?: boolean }) {
  const actor = await resolveActor(ctx);
  const financeAccess = actor.role === "super_admin" || (await isFinanceTeamMember(ctx.userId));
  if (!financeAccess) return { error: "Only Finance Team members or the State-Admin can record finance entries." };

  const payee = (args.payee || "").trim();
  const amount = Number(args.amount);
  if (!payee) return { error: "Who is the cheque payable to? Give a payee name." };
  if (isNaN(amount) || amount <= 0) return { error: "Give a positive cheque amount." };
  const chequeNo = (args.cheque_no || "").trim();
  // Date must be ISO yyyy-mm-dd; if not supplied, ask (we can't call Date.now reliably here).
  const entryDate = (args.entry_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return { error: "What date was the cheque issued? Give it as YYYY-MM-DD." };
  }

  const supabase = getServiceClient();
  // Skip a cheque number already on record
  if (chequeNo) {
    const { data: dup } = await supabase.from("finance_entries").select("id").eq("cheque_no", chequeNo).limit(1).maybeSingle();
    if (dup) return { error: `Cheque #${chequeNo} is already recorded.` };
  }

  if (!args.confirm) {
    return {
      preview: true,
      payee,
      amount,
      cheque_no: chequeNo || "(none)",
      entry_date: entryDate,
      message: `Confirm: record a cheque debit of Rs.${amount.toLocaleString("en-IN")} to ${payee}${chequeNo ? ` (cheque #${chequeNo})` : ""} dated ${entryDate}? Ask the user to confirm, then call again with confirm=true.`,
    };
  }

  const { data, error } = await supabase.from("finance_entries").insert({
    entry_date: entryDate,
    entry_type: "cheque_issued",
    amount,
    cheque_no: chequeNo || null,
    payee,
    remarks: (args.remarks || "").trim() || null,
    created_by: ctx.userId,
  }).select("id").single();
  if (error) return { error: "Failed to record the finance entry." };
  logAudit(ctx.userId, "finance_entry_created", "finance_entry", data?.id || "", { amount, payee, cheque_no: chequeNo, via: "assistant", by: actor.name || ctx.email });
  return { ok: true, payee, amount, cheque_no: chequeNo || null, message: `Recorded a cheque debit of Rs.${amount.toLocaleString("en-IN")} to ${payee}${chequeNo ? ` (cheque #${chequeNo})` : ""}.` };
}

// ── Dispatcher ──────────────────────────────────────────────────────

const QUERY_MAP: Record<string, (ctx: QueryContext, args: Record<string, unknown>) => Promise<unknown>> = {
  search_announcements: (_ctx, args) => searchAnnouncements(args as { query?: string; limit?: number }),
  search_events: (_ctx, args) => searchEvents(args as { query?: string; upcoming?: boolean; limit?: number }),
  search_faqs: (_ctx, args) => searchFAQs(args as { query?: string; limit?: number }),
  search_members: (_ctx, args) => searchMembers(args as { query?: string; district?: string; designation?: string; limit?: number }),
  search_documents: (_ctx, args) => searchDocuments(args as { query?: string; category?: string; limit?: number }),
  get_my_profile: (ctx) => getMyProfile(ctx),
  get_my_subscriptions: (ctx) => getMySubscriptions(ctx),
  get_my_adh_pm_status: (ctx) => getMyAdhPmStatus(ctx),
  get_adh_pm_stats: (ctx) => getAdhPmStats(ctx),
  get_member_payments: (ctx, args) => getMemberPayments(ctx, args as { name?: string }),
  send_member_email: (ctx, args) => sendMemberEmail(ctx, args as { name?: string; subject?: string; message?: string }),
  rsvp_event: (ctx, args) => rsvpEvent(ctx, args as { event_name?: string; status?: string }),
  vote_poll: (ctx, args) => votePoll(ctx, args as { poll_title?: string; option?: string }),
  add_wishlist_idea: (ctx, args) => addWishlistIdea(ctx, args as { title?: string; description?: string; category?: string }),
  submit_grievance: (ctx, args) => submitGrievance(ctx, args as { kind?: string; subject?: string; description?: string; category?: string; priority?: string }),
  enroll_training: (ctx, args) => enrollTraining(ctx, args as { training_title?: string }),
  set_notification_pref: (ctx, args) => setNotificationPref(ctx, args as { channel?: string; enabled?: boolean }),
  add_contribution: (ctx, args) => addContribution(ctx, args as { fund?: string; amount?: number }),
  update_my_task: (ctx, args) => updateMyTask(ctx, args as { task?: string; action?: string }),
  get_telegram_connect: (ctx) => getTelegramConnect(ctx),
  update_my_profile: (ctx, args) => updateMyProfileField(ctx, args as { field?: string; value?: string }),
  nudge_member: (ctx, args) => nudgeMember(ctx, args as { name?: string; type?: string }),
  approve_registration: (ctx, args) => approveRegistration(ctx, args as { name?: string; action?: string }),
  assign_task: (ctx, args) => assignTask(ctx, args as { task?: string; assignee_name?: string; team_name?: string }),
  create_announcement: (ctx, args) => createAnnouncement(ctx, args as { title?: string; content?: string; notify_email?: boolean }),
  create_event: (ctx, args) => createEvent(ctx, args as { title?: string; date?: string; location?: string; description?: string; notify_email?: boolean }),
  create_poll: (ctx, args) => createPoll(ctx, args as { title?: string; options?: string[]; expires_in_days?: number }),
  send_member_telegram: (ctx, args) => sendMemberTelegram(ctx, args as { name?: string; message?: string }),
  set_official: (ctx, args) => setOfficial(ctx, args as { name?: string; role?: string; confirm?: boolean }),
  create_subscription: (ctx, args) => createSubscription(ctx, args as { member_name?: string; period?: string; amount?: number; flexible?: boolean; confirm?: boolean }),
  set_voucher_status: (ctx, args) => setVoucherStatus(ctx, args as { submitter_name?: string; title?: string; status?: string; confirm?: boolean; remarks?: string }),
  set_payment_status: (ctx, args) => setPaymentStatus(ctx, args as { name?: string; period?: string; status?: string; amount?: number; confirm?: boolean }),
  suspend_member: (ctx, args) => suspendMember(ctx, args as { name?: string; action?: string; reason?: string; remarks?: string; confirm?: boolean }),
  create_finance_entry: (ctx, args) => createFinanceEntry(ctx, args as { payee?: string; amount?: number; cheque_no?: string; entry_date?: string; remarks?: string; confirm?: boolean }),
  get_my_tasks: (ctx, args) => getMyTasks(ctx, args as { status?: string; limit?: number }),
  get_my_achievements: (ctx) => getMyAchievements(ctx),
  get_portal_stats: () => getPortalStats(),
  search_trainings: (_ctx, args) => searchTrainings(args as { query?: string; upcoming?: boolean; limit?: number }),
  search_resolutions: (_ctx, args) => searchResolutions(args as { query?: string; status?: string; limit?: number }),
  get_my_contributions: (ctx) => getMyContributions(ctx),
};

export async function executeQuery(
  functionName: string,
  args: Record<string, unknown>,
  ctx: QueryContext
): Promise<unknown> {
  const fn = QUERY_MAP[functionName];
  if (!fn) return { error: `Unknown function: ${functionName}` };
  try {
    return await fn(ctx, args);
  } catch (err) {
    return { error: `Query failed: ${err instanceof Error ? err.message : "unknown"}` };
  }
}
