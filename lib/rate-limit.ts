/**
 * Shared in-memory rate limiter for API routes.
 * Includes automatic cleanup of expired entries to prevent memory leaks in serverless.
 * Usage: const limiter = createRateLimiter(20, 60000);
 *        if (!limiter.check(ip)) return 429;
 */

const store = new Map<string, { count: number; resetAt: number }>();
const MAX_STORE_SIZE = 10000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  // Only clean up every 30 seconds
  if (now - lastCleanup < 30000) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }

  // If still too large, remove oldest entries
  if (store.size > MAX_STORE_SIZE) {
    const entries = Array.from(store.entries()).sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toRemove = entries.slice(0, store.size - MAX_STORE_SIZE + 1000);
    for (const [key] of toRemove) store.delete(key);
  }
}

export function createRateLimiter(maxRequests: number, windowMs: number = 60000) {
  return {
    check(ip: string): boolean {
      cleanup();
      const now = Date.now();
      const entry = store.get(ip);

      if (!entry || now > entry.resetAt) {
        store.set(ip, { count: 1, resetAt: now + windowMs });
        return true;
      }

      if (entry.count >= maxRequests) return false;
      entry.count++;
      return true;
    },
  };
}

/** Shared rate limiters for common API patterns */
export const apiLimiter = createRateLimiter(60, 60000);     // 60 req/min — general APIs
export const writeLimiter = createRateLimiter(30, 60000);    // 30 req/min — POST/PUT/DELETE
export const uploadLimiter = createRateLimiter(10, 60000);   // 10 req/min — file uploads
