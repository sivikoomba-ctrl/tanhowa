import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      JWT_SECRET: "test-secret-key-at-least-32-chars-long!!",
    },
    // Keep vitest off the Playwright E2E specs — they import
    // `@playwright/test` which vitest can't run. `npm run test:e2e`
    // handles those.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
