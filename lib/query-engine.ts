/**
 * Query Engine — 13 data-retrieval functions for the TANHOWA chatbot.
 * Each function queries Supabase and returns structured data that
 * Gemini can use to generate grounded, factual answers.
 */

import { getServiceClient } from "@/lib/supabase";
import { isFlexibleAmount } from "@/lib/subscriptions";
import { sendMemberMessageEmail, sendVoucherStatusEmail } from "@/lib/mail";
import { logAudit } from "@/lib/audit-log";
import { isFinanceTeamMember } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/telegram";
import { approveMember, rejectMember } from "@/lib/member-approval";

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
      message: `Confirm: mark ${member.name}'s "${sub.period}" (Rs.${(sub.amount || 0).toLocaleString("en-IN")}) as ${status}? Ask the user to confirm, then call again with confirm=true.`,
    };
  }

  // Execute
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "paid") {
    if (!sub.payment_proof_url) return { error: `Cannot approve — no payment proof is uploaded for ${member.name}'s "${sub.period}". Ask them to upload it first.` };
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

  logAudit(ctx.userId, "payment_" + status, "subscription", sub.id, { member: member.name, period: sub.period, via: "assistant", by: actor.name || ctx.email });
  return { ok: true, member: member.name, period: sub.period, status, message: `Marked ${member.name}'s "${sub.period}" as ${status}.` };
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
  get_member_payments: (ctx, args) => getMemberPayments(ctx, args as { name?: string }),
  send_member_email: (ctx, args) => sendMemberEmail(ctx, args as { name?: string; subject?: string; message?: string }),
  rsvp_event: (ctx, args) => rsvpEvent(ctx, args as { event_name?: string; status?: string }),
  nudge_member: (ctx, args) => nudgeMember(ctx, args as { name?: string; type?: string }),
  approve_registration: (ctx, args) => approveRegistration(ctx, args as { name?: string; action?: string }),
  set_voucher_status: (ctx, args) => setVoucherStatus(ctx, args as { submitter_name?: string; title?: string; status?: string; confirm?: boolean; remarks?: string }),
  set_payment_status: (ctx, args) => setPaymentStatus(ctx, args as { name?: string; period?: string; status?: string; amount?: number; confirm?: boolean }),
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
