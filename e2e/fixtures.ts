import { test as base, type Page, type BrowserContext, type Route } from "@playwright/test";
import { SignJWT } from "jose";

// Must match playwright.config.ts → webServer.env.JWT_SECRET so the
// forged cookie verifies successfully on the server side.
const JWT_SECRET = "e2e-playwright-test-jwt-secret-minimum-32-characters-long";
const SECRET_BYTES = new TextEncoder().encode(JWT_SECRET);

export const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "e2e-member@example.com",
  // "Mr." prefix bypasses the layout's title-picker / auto-prefix branch.
  name: "Mr. Test Member",
  // admin role exempts us from the mandatory 12-field profile-completion
  // dialog that otherwise blocks navigation for unseeded users.
  role: "admin" as const,
  status: "approved" as const,
  photo_url: null,
  phone: "9000000000",
  occupation: "HO",
};

export const TEST_MEMBERS = [
  { id: TEST_USER.id, name: TEST_USER.name, photo_url: null as string | null, occupation: "HO" },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Second Member",
    photo_url: null as string | null,
    occupation: "ADH",
  },
];

export const TEST_CHANNEL = {
  id: "channel-general",
  name: "General",
  description: "TANHOWA main chat",
  icon: "MessageCircle",
  is_default: true,
  archived: false,
  created_by: TEST_USER.id,
  member_count: TEST_MEMBERS.length,
  unread_count: 0,
  muted: false,
  is_member: true,
  last_message: {
    id: "msg-initial",
    content: "Welcome to the channel!",
    file_name: null,
    created_at: "2026-04-20T08:00:00.000Z",
    sender_name: "Second Member",
  },
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-20T08:00:00.000Z",
};

export interface SeedMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  reply_to: string | null;
  reply_snippet: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at?: string | null;
  sender: { id: string; name: string; photo_url: string | null };
  reactions: unknown[];
}

export const SEED_MESSAGES: SeedMessage[] = [
  {
    id: "msg-1",
    channel_id: TEST_CHANNEL.id,
    sender_id: TEST_MEMBERS[1].id,
    content: "Welcome to the channel!",
    file_url: null,
    file_name: null,
    file_type: null,
    file_size: null,
    reply_to: null,
    reply_snippet: null,
    created_at: "2026-04-20T08:00:00.000Z",
    edited_at: null,
    sender: { id: TEST_MEMBERS[1].id, name: TEST_MEMBERS[1].name, photo_url: null },
    reactions: [],
  },
];

async function signSessionJWT(
  payload: typeof TEST_USER
): Promise<string> {
  const { photo_url, phone, occupation, name, ...sessionFields } = payload;
  void photo_url;
  void phone;
  void occupation;
  void name;
  return await new SignJWT(sessionFields as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET_BYTES);
}

/**
 * Seed a valid `session` cookie so middleware.ts and getSession() treat the
 * test user as authenticated. The cookie's value is a real JWT signed with
 * the same secret the server boots with.
 */
export async function setSessionCookie(context: BrowserContext): Promise<void> {
  const token = await signSessionJWT(TEST_USER);
  await context.addCookies([
    {
      name: "session",
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
  ]);
}

type JSONHandler = (route: Route) => Promise<void>;

function json(body: unknown, status = 200): JSONHandler {
  return async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };
}

/**
 * Register mock handlers for every backend call the dashboard makes during
 * E2E runs. The Next.js server itself never executes the route handlers —
 * `page.route()` intercepts the fetch before it leaves the browser.
 */
export async function mockDashboardAPIs(page: Page): Promise<void> {
  // Mutable in-memory state so tests can verify round-trip behavior
  // (sending a message, editing it, pinning it) without real persistence.
  const messages: SeedMessage[] = SEED_MESSAGES.map((m) => ({ ...m }));
  let pinnedMessageId: string | null = null;
  // Expose for test-level assertions if needed in the future.
  (page as unknown as { __e2eState: unknown }).__e2eState = {
    get messages() {
      return messages;
    },
    get pinnedMessageId() {
      return pinnedMessageId;
    },
  };

  // --- User + notifications -------------------------------------------------
  await page.route("**/api/users/me**", json({ user: TEST_USER }));
  await page.route(
    "**/api/notifications**",
    json({
      announcements: 0,
      subscriptions: 0,
      tasks: 0,
      mentions: 0,
      messages: 0,
      total: 0,
    })
  );

  // --- Chat -----------------------------------------------------------------
  await page.route("**/api/chat/channels**", json({ channels: [TEST_CHANNEL] }));
  await page.route("**/api/chat/unread**", json({ unread: 0 }));
  await page.route(
    "**/api/chat/members**",
    json({
      members: TEST_MEMBERS.map((m) => ({
        id: m.id,
        user_id: m.id,
        role: m.id === TEST_USER.id ? "admin" : "member",
        muted: false,
        joined_at: "2026-04-01T00:00:00.000Z",
        last_read_at: "2026-04-20T08:00:00.000Z",
        user: m,
      })),
    })
  );
  await page.route("**/api/chat/mentions**", json({ mentions: [] }));
  await page.route("**/api/chat/typing**", json({ ok: true }));
  await page.route("**/api/chat/read**", json({ ok: true }));
  await page.route("**/api/chat/reactions**", json({ reactions: {} }));

  await page.route(/\/api\/chat\/pin(\?|$)/, async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === "GET") {
      if (!pinnedMessageId) return json({ pinned: null })(route);
      const msg = messages.find((m) => m.id === pinnedMessageId);
      if (!msg) return json({ pinned: null })(route);
      return json({
        pinned: {
          id: msg.id,
          content: msg.content,
          file_name: msg.file_name,
          file_type: msg.file_type,
          created_at: msg.created_at,
          sender_name: msg.sender?.name || "Unknown",
        },
      })(route);
    }
    if (method === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      pinnedMessageId = body.message_id;
      return json({ ok: true, pinned_message_id: pinnedMessageId })(route);
    }
    if (method === "DELETE") {
      pinnedMessageId = null;
      return json({ ok: true })(route);
    }
    return route.continue();
  });

  await page.route(/\/api\/chat\/messages(\?|$)/, async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === "GET") {
      const url = new URL(req.url());
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const list = q
        ? messages.filter((m) =>
            (m.content || "").toLowerCase().includes(q)
          )
        : messages;
      return json({ messages: list, has_more: false })(route);
    }
    if (method === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      const newId = `msg-${messages.length + 1}`;
      const row = {
        id: newId,
        channel_id: body.channel_id,
        sender_id: TEST_USER.id,
        content: body.content || null,
        file_url: null,
        file_name: null,
        file_type: null,
        file_size: null,
        reply_to: body.reply_to || null,
        reply_snippet: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        sender: { id: TEST_USER.id, name: TEST_USER.name, photo_url: null },
        reactions: [],
      };
      messages.push(row);
      return json({ message: row })(route);
    }
    if (method === "PATCH") {
      const body = JSON.parse(req.postData() || "{}");
      const target = messages.find((m) => m.id === body.id);
      if (target) {
        target.content = body.content;
        target.edited_at = new Date().toISOString();
      }
      return json({
        message: {
          id: body.id,
          content: body.content,
          edited_at: target?.edited_at,
        },
      })(route);
    }
    if (method === "DELETE") {
      const url = new URL(req.url());
      const id = url.searchParams.get("id");
      const target = messages.find((m) => m.id === id);
      if (target) target.deleted_at = new Date().toISOString();
      return json({ message: "Message deleted" })(route);
    }
    return route.continue();
  });

  // --- Subscriptions (used by subscriptions.spec.ts) ------------------------
  await page.route("**/api/subscriptions**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return json({
      subscriptions: [
        {
          id: "sub-2026",
          user_id: TEST_USER.id,
          period: "2026",
          amount: 1000,
          paid_amount: null,
          due_date: "2026-03-31",
          status: "pending",
          payment_method: null,
          transaction_id: null,
          payment_proof_url: null,
          remarks: null,
        },
      ],
    })(route);
  });
}

/**
 * `test` fixture that automatically: (1) sets the session cookie, and
 * (2) wires all dashboard API mocks. Specs just `import { test } from
 * "./fixtures"` and get an authed, backend-mocked context for free.
 */
// `base.extend({})` without a generic lets us override the built-in
// `context` and `page` fixtures. Passing `Record<string, never>` would
// otherwise tell TS "there are no new fixtures" and reject the overrides.
export const test = base.extend({
  context: async ({ context }, use) => {
    await setSessionCookie(context);
    await use(context);
  },
  page: async ({ page }, use) => {
    await mockDashboardAPIs(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
