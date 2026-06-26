// Shared member registration approve/reject logic — used by both the admin
// users route (PUT) and the chatbot's approve_registration action so the two
// never diverge (auto-assigns yearly subscription periods, welcome email, etc.).
import { getServiceClient } from "@/lib/supabase";
import { notifyNewMemberRegistered, sendMemberWelcomeEmail } from "@/lib/mail";
import { logContribution } from "@/lib/contributions";

export async function approveMember(userId: string, approverId: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  const supabase = getServiceClient();
  const { data: userData } = await supabase.from("users").select("name, email, occupation").eq("id", userId).single();
  if (!userData) return { ok: false, error: "Member not found" };
  if (!userData.name?.trim()) return { ok: false, error: "Cannot approve: member has not filled their name" };

  await supabase.from("users").update({ status: "approved" }).eq("id", userId);

  // Auto-assign existing yearly subscription periods to the new member
  try {
    const { data: existingPeriods } = await supabase
      .from("subscriptions")
      .select("period, amount, due_date")
      .order("created_at", { ascending: false });
    if (existingPeriods && existingPeriods.length > 0) {
      const seen = new Set<string>();
      const uniquePeriods = existingPeriods.filter((p: { period: string }) => {
        if (seen.has(p.period)) return false;
        seen.add(p.period);
        return true;
      });
      const { data: userSubs } = await supabase.from("subscriptions").select("period").eq("user_id", userId);
      const userPeriods = new Set((userSubs || []).map((s: { period: string }) => s.period));
      const newRows = uniquePeriods
        .filter((p: { period: string }) => !userPeriods.has(p.period) && /^\d{4}$/.test(p.period))
        .map((p: { period: string; amount: number; due_date: string | null }) => ({
          user_id: userId, period: p.period, amount: p.amount || 0, due_date: p.due_date || null, status: "pending",
        }));
      if (newRows.length > 0) await supabase.from("subscriptions").insert(newRows);
    }
  } catch { /* don't fail approval if subscription seeding fails */ }

  if (userData.email) sendMemberWelcomeEmail(userData.email, userData.name || "Member").catch(() => {});
  notifyNewMemberRegistered(userData.name || userData.email || "New Member");
  logContribution(approverId, "member_approved", "Approved member: " + (userData.name || userData.email || "Unknown"));
  return { ok: true, name: userData.name };
}

export async function rejectMember(userId: string, approverId: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  const supabase = getServiceClient();
  const { data } = await supabase.from("users").select("name").eq("id", userId).single();
  if (!data) return { ok: false, error: "Member not found" };
  await supabase.from("users").update({ status: "rejected" }).eq("id", userId);
  logContribution(approverId, "member_rejected", "Rejected member");
  return { ok: true, name: data.name };
}
