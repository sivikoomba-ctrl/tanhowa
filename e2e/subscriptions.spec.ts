import { test, expect } from "./fixtures";

test.describe("Subscriptions — member view", () => {
  test("renders the pending subscription row and the summary metric cards", async ({ page }) => {
    await page.goto("/dashboard/subscriptions");

    // "Paid" / "Due" / "Total Paid" MetricCards from the responsive pass.
    // They stack vertically on mobile but the labels are always visible.
    await expect(page.getByText(/Paid/i).first()).toBeVisible();

    // The seeded 2026 pending sub should render; the row shows the period
    // and the amount.
    await expect(page.getByText("2026", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/1,000/).first()).toBeVisible();
  });
});
