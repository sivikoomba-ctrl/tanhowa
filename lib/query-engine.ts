/**
 * Query Engine — 13 data-retrieval functions for the TANHOWA chatbot.
 * Each function queries Supabase and returns structured data that
 * Gemini can use to generate grounded, factual answers.
 */

import { getServiceClient } from "@/lib/supabase";
import { isFlexibleAmount } from "@/lib/subscriptions";

// ── Types ───────────────────────────────────────────────────────────

interface QueryContext {
  userId: string;
  email: string;
  role: string;
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
    .limit(10);

  const subs = (data || []).map((s) => ({
    period: s.period,
    amount: s.amount,
    paid_amount: s.paid_amount,
    status: s.status,
    payment_method: s.payment_method || "",
    paid_at: s.paid_at,
    due_date: s.due_date,
    flexible: isFlexibleAmount(s),
  }));

  // Voluntary/flexible funds (e.g. Emergency Fund) are opt-in contributions, not dues —
  // exclude them from pending/overdue so the chatbot doesn't report a fake outstanding due.
  const paid = subs.filter((s) => s.status === "paid").length;
  const pending = subs.filter((s) => s.status === "pending" && !s.flexible).length;
  const overdue = subs.filter((s) => s.status === "overdue" && !s.flexible).length;

  return { subscriptions: subs, summary: { total: subs.length, paid, pending, overdue } };
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
