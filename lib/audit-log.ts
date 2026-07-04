import { getServiceClient } from "@/lib/supabase";

/** Fire-and-forget audit log. Never throws. */
export function logAudit(
  userId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>,
) {
  try {
    const supabase = getServiceClient();
    void supabase
      .from("audit_logs")
      .insert({
        user_id: userId,
        action,
        target_type: targetType || null,
        target_id: targetId || null,
        details: details || {},
      });
  } catch {
    // Silent
  }
}

/**
 * Records a phone-number change (old -> new) for a member — no-ops when the
 * number didn't actually change, so routine profile saves don't spam the log.
 * Also stamps users.phone_changed_at for a fast "last changed" glance on the
 * admin member card; the full old/new history lives in this audit_logs row.
 */
export function logPhoneChange(
  actorUserId: string,
  targetUserId: string,
  oldPhone: string | null | undefined,
  newPhone: string | null | undefined,
  changedBy: "self" | "admin",
) {
  const oldP = (oldPhone || "").trim();
  const newP = (newPhone || "").trim();
  if (!newP || oldP === newP) return;
  try {
    const supabase = getServiceClient();
    const now = new Date().toISOString();
    void supabase.from("users").update({ phone_changed_at: now }).eq("id", targetUserId);
    void supabase.from("audit_logs").insert({
      user_id: actorUserId,
      action: "phone_number_changed",
      target_type: "user",
      target_id: targetUserId,
      details: { old_phone: oldP || null, new_phone: newP, changed_by: changedBy },
    });
  } catch {
    // Silent
  }
}
