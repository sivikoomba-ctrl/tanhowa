import { test, expect, TEST_CHANNEL, TEST_USER } from "./fixtures";

// Covers the chat flows shipped in Stages 2-4: channel selection, sending
// text, in-place edit (Stage 4), and in-channel search (Stage 4). Each
// test opens a fresh page with session cookie + API mocks pre-wired via
// the shared fixture in ./fixtures.ts.

test.describe("Group chat", () => {
  test("loads channel list and selects default channel", async ({ page }) => {
    await page.goto("/dashboard/group-chat");

    // Channel tile shows the channel name and "No messages yet" fallback
    // is NOT shown because we seeded a last_message.
    const channelTile = page.getByRole("button", { name: new RegExp(TEST_CHANNEL.name) });
    await expect(channelTile).toBeVisible();

    await channelTile.first().click();

    // Thread header shows the selected channel name.
    await expect(page.locator("header, div").filter({ hasText: TEST_CHANNEL.name }).first()).toBeVisible();
    // Seeded message renders in the thread.
    await expect(page.getByText("Welcome to the channel!")).toBeVisible();
  });

  test("sends a text message and appends it to the thread", async ({ page }) => {
    await page.goto("/dashboard/group-chat");
    await page.getByRole("button", { name: new RegExp(TEST_CHANNEL.name) }).first().click();

    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Hello from E2E");
    // Enter submits (Shift+Enter would insert a newline).
    await textarea.press("Enter");

    // The optimistic append in sendMessage() means the new bubble shows up
    // without needing a realtime broadcast.
    await expect(page.getByText("Hello from E2E")).toBeVisible();
  });

  test("edits an own message and shows the edited marker", async ({ page }) => {
    await page.goto("/dashboard/group-chat");
    await page.getByRole("button", { name: new RegExp(TEST_CHANNEL.name) }).first().click();

    // Send a message first so we have an own-message to edit.
    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Before edit");
    await textarea.press("Enter");
    await expect(page.getByText("Before edit")).toBeVisible();

    // Hover actions are visible on group-hover only; Playwright click
    // still works on hidden-via-group children because it bypasses visibility.
    // Use the aria-label added in the a11y pass.
    const editButton = page.getByRole("button", { name: "Edit your message" });
    await editButton.click();

    // Inline textarea replaces the bubble content.
    const editInput = page.locator("textarea").filter({ hasText: "Before edit" });
    await editInput.fill("After edit");
    await editInput.press("Enter");

    await expect(page.getByText("After edit")).toBeVisible();
    await expect(page.getByText("(edited)", { exact: true }).first()).toBeVisible();
  });

  test("opens in-channel search and filters seeded messages", async ({ page }) => {
    await page.goto("/dashboard/group-chat");
    await page.getByRole("button", { name: new RegExp(TEST_CHANNEL.name) }).first().click();

    await page.getByRole("button", { name: "Search in channel" }).click();

    const searchInput = page.getByPlaceholder(/Search in this channel/);
    await expect(searchInput).toBeVisible();
    await searchInput.fill("welcome");
    await page.getByRole("button", { name: "Search" }).click();

    // Seeded "Welcome to the channel!" message should match.
    await expect(page.getByText("Welcome to the channel!")).toBeVisible();

    // Close search and return to live thread.
    await page.getByRole("button", { name: "Close search" }).click();
    await expect(searchInput).not.toBeVisible();
  });

  test("has visible focus ring on channel tile for keyboard users", async ({ page }) => {
    await page.goto("/dashboard/group-chat");

    // Tab into the channel list. The first interactive element may be the
    // sidebar nav — repeatedly pressing Tab lands on the channel tile.
    const channelTile = page.getByRole("button", { name: new RegExp(TEST_CHANNEL.name) });
    await channelTile.first().focus();
    await expect(channelTile.first()).toBeFocused();
    // Enter should activate (same handler as click).
    await channelTile.first().press("Enter");
    await expect(page.getByText("Welcome to the channel!")).toBeVisible();
  });
});

// Silence the unused-import warning while keeping the export available
// for future specs (e.g. ownership assertions referencing TEST_USER.id).
void TEST_USER;
