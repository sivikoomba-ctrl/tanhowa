import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — runs against `next start` with a deterministic
 * JWT_SECRET so E2E fixtures can forge valid session cookies without
 * touching the OAuth flow.
 *
 * All backend calls are intercepted at the browser network layer via
 * `page.route()` (see e2e/fixtures.ts). The Next.js server never reaches
 * Supabase during these tests, so no real DB or secrets are required.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Shorter retries in CI to keep feedback fast.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    // Trace on first retry — cheap locally, disabled for fast CI reruns.
    trace: "on-first-retry",
    // Don't auto-dismiss dialogs; tests explicitly handle them.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // Build then start, so we're testing the production bundle (catches
    // optimiser-only bugs unit tests miss). Port 3100 to avoid colliding
    // with a dev server a developer may already be running.
    command: "npm run build && npm run start -- -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      // Must match the secret used by e2e/fixtures.ts to sign cookies.
      JWT_SECRET: "e2e-playwright-test-jwt-secret-minimum-32-characters-long",
      // Placeholders so the server boots without real Supabase access.
      // All API routes are mocked at the browser layer — the server never
      // actually uses these.
      NEXT_PUBLIC_SUPABASE_URL: "https://e2e-placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-placeholder-service-role-key",
    },
  },
});
