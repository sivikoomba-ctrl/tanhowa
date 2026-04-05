import { getServiceClient } from "@/lib/supabase";

/**
 * Log API performance metrics (fire-and-forget).
 * Call at the end of API route handlers.
 */
export function logApiPerf(path: string, method: string, statusCode: number, startTime: number) {
  const duration = Date.now() - startTime;
  // Only log requests that take > 100ms (skip fast ones to reduce noise)
  if (duration < 100) return;

  try {
    const supabase = getServiceClient();
    supabase
      .from("api_perf")
      .insert({ path, method, status_code: statusCode, duration_ms: duration })
      .then(() => {});
  } catch {
    // Silent
  }
}

/**
 * Higher-order wrapper to auto-log perf for API handlers.
 */
export function withPerf(
  path: string,
  handler: (req: Request) => Promise<Response>,
) {
  return async (req: Request) => {
    const start = Date.now();
    const res = await handler(req);
    logApiPerf(path, req.method, res.status, start);
    return res;
  };
}
