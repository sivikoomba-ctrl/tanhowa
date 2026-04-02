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
