import { getServiceClient } from "@/lib/supabase";

interface ErrorLogEntry {
  type: "api" | "client" | "auth";
  message: string;
  stack?: string;
  path?: string;
  method?: string;
  status_code?: number;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export async function logError(entry: ErrorLogEntry) {
  try {
    const supabase = getServiceClient();
    await supabase.from("error_logs").insert({
      type: entry.type,
      message: entry.message,
      stack: entry.stack || "",
      path: entry.path || "",
      method: entry.method || "",
      status_code: entry.status_code || 0,
      user_id: entry.user_id || null,
      metadata: entry.metadata || {},
    });
  } catch {
    // Silently fail — don't let error logging break the app
    console.error("Failed to log error:", entry.message);
  }
}
