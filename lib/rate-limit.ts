/**
 * Shared in-memory rate limiter for API routes.
 * Usage: const limiter = createRateLimiter(20, 60000);
 *        if (!limiter.check(ip)) return 429;
 */

const store = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(maxRequests: number, windowMs: number = 60000) {
  return {
    check(ip: string): boolean {
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
