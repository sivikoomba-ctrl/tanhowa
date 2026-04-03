import { getServiceClient } from "@/lib/supabase";

interface AuditEntry {
  user_id: string;
  user_name?: string;
  user_email?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  details?: Record<string, unknown>;
}

/**
 * Log an admin action to the audit_logs table (fire-and-forget).
 */
export function logAudit(entry: AuditEntry) {
  const supabase = getServiceClient();
  (async () => {
    try {
      await supabase
        .from("audit_logs")
        .insert({
          user_id: entry.user_id,
          user_name: entry.user_name || null,
          user_email: entry.user_email || null,
          action: entry.action,
          target_type: entry.target_type || null,
          target_id: entry.target_id || null,
          details: entry.details || {},
        });
    } catch { /* silent */ }
  })();
}
