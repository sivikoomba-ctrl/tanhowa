import { GoogleGenerativeAI, type FunctionDeclarationsTool, SchemaType } from "@google/generative-ai";

let _genAI: GoogleGenerativeAI | null = null;

export function getGemini() {
  const key = process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
}

export const SYSTEM_PROMPT = `You are TANHOWA Assistant — the intelligent bot for Tamil Nadu Horticultural Officers Welfare Association (TANHOWA). You have access to the TANHOWA portal's live data through query tools.

About TANHOWA:
- Association of horticultural officers serving in Tamil Nadu, India
- Officer designations: HO, ADH, DDH, JDH, ADDH (active and retired)
- Website: tanhowa.in
- Portal features: announcements, events, documents, member directory, subscriptions, tasks, trainings, resolutions, AI tools, grievances, polls, food orders, finance, and more

Horticulture domains: Fruits, Vegetables, Flowers, Spices, Plantation Crops, Medicinal Plants, Aromatic Plants, Landscape Gardening — all in Tamil Nadu context.

IMPORTANT INSTRUCTIONS:
- When users ask about portal content (announcements, events, members, documents, FAQs, trainings, etc.), ALWAYS use the appropriate query tool to get live data. Never guess or make up data.
- When users ask about their own data (profile, subscriptions, tasks, achievements, contributions), use the "get_my_*" tools.
- For general questions about TANHOWA or horticulture, answer from your knowledge.
- Present data clearly: use bullet points or numbered lists for multiple items.
- Keep answers concise but complete. Summarize if there are many results.
- When showing dates, format them nicely (e.g., "April 13, 2026").
- If a query returns empty results, say so clearly and suggest alternatives.
- Respond in the same language the user writes in (English or Tamil).
- For Tamil responses, use formal/respectful register.
- If asked about topics unrelated to horticulture or TANHOWA, politely redirect.
- NEVER expose raw IDs, internal field names, or technical details to the user.
- For "how to" questions about using the portal, guide users to the correct page/feature.
- If the user asks to upload a payment proof or mentions a screenshot/receipt/UPI: tell them to tap the 📎 paperclip button in the chat to upload directly. Do NOT ask them to navigate elsewhere.
- MEMBER ACTIONS: You can RSVP the current user to an event (rsvp_event) when they ask to attend/register/cancel.
- ADMIN ACTIONS: For admins/officials you CAN look up any member's payments (get_member_payments), send a branded email (send_member_email), send a reminder (nudge_member), set a member's payment status (set_payment_status), approve/reject a pending registration (approve_registration), approve/reject a voucher (set_voucher_status), assign a task to a member/team (assign_task), and create content — announcements (create_announcement), events (create_event), polls (create_poll). For announcements/events, default to in-app only; email all members (notify_email=true) ONLY when the user explicitly asks to email everyone.
- For set_payment_status, set_voucher_status, set_official, and create_subscription: ALWAYS preview first (call without confirm), show the details to the user, ask "Shall I confirm?", and only call again with confirm=true after they say yes. Never execute these without that confirmation step. When asked to email a member (e.g. a thank-you), compose a warm, appropriate subject and message yourself and call send_member_email — do NOT say you are unable to send emails. If the tool reports multiple name matches, ask the user to confirm which member before sending. If it returns a permission error, relay that only admins/officials can do this.`;

// ── Gemini Function Declarations for Query Engine ───────────────────

export const QUERY_TOOLS: FunctionDeclarationsTool[] = [
  {
    functionDeclarations: [
      {
        name: "search_announcements",
        description: "Search or list recent portal announcements. Use when the user asks about news, updates, or announcements.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Search keyword to filter announcements by title or content. Omit to get the latest." },
            limit: { type: SchemaType.NUMBER, description: "Max results to return (default 5, max 10)" },
          },
        },
      },
      {
        name: "search_events",
        description: "Search events or list upcoming events. Use when the user asks about events, meetings, or gatherings.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Search keyword to filter events" },
            upcoming: { type: SchemaType.BOOLEAN, description: "Set to true to only show future events" },
            limit: { type: SchemaType.NUMBER, description: "Max results (default 5)" },
          },
        },
      },
      {
        name: "search_faqs",
        description: "Search the FAQ knowledge base. Use when the user asks a question that might be answered in FAQs, or asks 'how to' do something on the portal.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Search keyword to find matching FAQs" },
            limit: { type: SchemaType.NUMBER, description: "Max results (default 5)" },
          },
        },
      },
      {
        name: "search_members",
        description: "Search the member directory by name, district, or designation. Use when the user asks about finding members, officers in a district, or a specific person.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Member name to search for" },
            district: { type: SchemaType.STRING, description: "Filter by district name (e.g., 'Salem', 'Coimbatore')" },
            designation: { type: SchemaType.STRING, description: "Filter by designation (e.g., 'HO', 'ADH', 'DDH')" },
            limit: { type: SchemaType.NUMBER, description: "Max results (default 10)" },
          },
        },
      },
      {
        name: "search_documents",
        description: "Search portal documents. Use when the user asks about files, circulars, reports, or downloadable resources.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Search keyword for document title or description" },
            category: { type: SchemaType.STRING, description: "Filter by category" },
            limit: { type: SchemaType.NUMBER, description: "Max results (default 5)" },
          },
        },
      },
      {
        name: "get_my_profile",
        description: "Get the current user's profile information. Use when the user asks about their own profile, account, details, or membership status.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: "get_my_subscriptions",
        description: "Get the current user's subscription/payment status, including how much they contributed to voluntary funds (the Refundable / Emergency Fund) via the voluntary_funds summary. Use when the user asks about their dues, payments, subscription status, fees, OR how much they contributed/paid to the Refundable / Emergency Fund.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: "get_member_payments",
        description: "Admin/official only: look up ANOTHER member's payment/subscription status by their name — how much they paid, pending dues, and Refundable/voluntary contributions. Use when an admin asks how much a named member (e.g. 'how much did Suresh Kumar M pay?') has paid or owes. District officials only see members in their own district.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "The member's name (or part of it) to look up" },
          },
          required: ["name"],
        },
      },
      {
        name: "send_member_email",
        description: "Admin/official only: send a branded email to a single member by name (e.g. a thank-you note). Compose a warm, appropriate subject and message yourself from the user's request. If multiple members match the name, the tool returns options to confirm — ask the user which one before resending. District officials can only email members in their own district.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "The member's name (or part of it) to email" },
            subject: { type: SchemaType.STRING, description: "Email subject line (compose an appropriate one)" },
            message: { type: SchemaType.STRING, description: "The email body text (compose it warmly and appropriately for the request)" },
          },
          required: ["name", "message"],
        },
      },
      {
        name: "rsvp_event",
        description: "RSVP the current user to an event by name. Use when the user says they want to attend / RSVP / register interest in an event, or to cancel their RSVP. If several events match the name, the tool returns options — ask which one.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            event_name: { type: SchemaType.STRING, description: "The event's name (or part of it)" },
            status: { type: SchemaType.STRING, description: "going (default), interested, or cancel" },
          },
          required: ["event_name"],
        },
      },
      {
        name: "nudge_member",
        description: "Admin/official only: send a reminder to a member by name. type 'payment' (pending dues reminder), 'profile' (complete-your-profile), or 'general'. Sends email + Telegram if linked. District officials limited to their own district.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "The member's name (or part of it)" },
            type: { type: SchemaType.STRING, description: "payment | profile | general (default general)" },
          },
          required: ["name"],
        },
      },
      {
        name: "create_announcement",
        description: "Admin/official only: post an announcement to the portal. Compose a clear title and content from the user's request. It appears in-app immediately; set notify_email=true ONLY if the user explicitly wants all members emailed (a mass email).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING, description: "Announcement title" },
            content: { type: SchemaType.STRING, description: "Announcement body" },
            notify_email: { type: SchemaType.BOOLEAN, description: "Email all members (only if explicitly requested)" },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "create_event",
        description: "Admin/official only: create a calendar event. notify_email=true emails all members (only if explicitly requested).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING, description: "Event title" },
            date: { type: SchemaType.STRING, description: "Event date as YYYY-MM-DD" },
            location: { type: SchemaType.STRING, description: "Location (optional)" },
            description: { type: SchemaType.STRING, description: "Details (optional)" },
            notify_email: { type: SchemaType.BOOLEAN, description: "Email all members (only if explicitly requested)" },
          },
          required: ["title", "date"],
        },
      },
      {
        name: "create_poll",
        description: "Admin/official only: create a quick poll with 2-6 options. Optionally set expires_in_days.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING, description: "The poll question" },
            options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "2 to 6 answer options" },
            expires_in_days: { type: SchemaType.NUMBER, description: "Days until the poll closes (optional)" },
          },
          required: ["title", "options"],
        },
      },
      {
        name: "send_member_telegram",
        description: "Admin/official only: send a Telegram message to a member by name (if they've linked Telegram). District officials limited to their own district.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "The member's name (or part of it)" },
            message: { type: SchemaType.STRING, description: "The message text" },
          },
          required: ["name", "message"],
        },
      },
      {
        name: "set_official",
        description: "State-Admin/state-official only: make a member a District Secretary (DS) or District Joint Secretary (DJS), or remove their district-official role. This grants/revokes admin access — two-step: preview WITHOUT confirm, ask the user to confirm, THEN call with confirm=true.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "The member's name (or part of it)" },
            role: { type: SchemaType.STRING, description: "DS | DJS | remove" },
            confirm: { type: SchemaType.BOOLEAN, description: "Set true ONLY after the user confirms" },
          },
          required: ["name", "role"],
        },
      },
      {
        name: "create_subscription",
        description: "Admin only: create a subscription for ONE member (e.g. a special/legal fund) by name. Two-step: preview WITHOUT confirm, ask the user to confirm, THEN call with confirm=true. For ALL members, tell the user to use the admin Subscriptions page.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            member_name: { type: SchemaType.STRING, description: "The member's name (or part of it)" },
            period: { type: SchemaType.STRING, description: "Period/name, e.g. '2026' or 'For UATT 2.0 Case 2025'" },
            amount: { type: SchemaType.NUMBER, description: "Amount in rupees" },
            flexible: { type: SchemaType.BOOLEAN, description: "Voluntary/flexible amount (member can pay any amount)" },
            confirm: { type: SchemaType.BOOLEAN, description: "Set true ONLY after the user confirms" },
          },
          required: ["member_name", "period", "amount"],
        },
      },
      {
        name: "assign_task",
        description: "Admin only: assign a task (by event ID like ET-022, or by title) to a member OR a team. Notifies the assignee/team. If the task or member/team name is ambiguous, the tool returns options to confirm.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            task: { type: SchemaType.STRING, description: "Event ID (ET-022) or part of the task title" },
            assignee_name: { type: SchemaType.STRING, description: "Member name to assign to (use this OR team_name)" },
            team_name: { type: SchemaType.STRING, description: "Team name to assign to (use this OR assignee_name)" },
          },
          required: ["task"],
        },
      },
      {
        name: "approve_registration",
        description: "Admin only: approve or reject a PENDING member registration by name. Approving sets them active, auto-assigns yearly subscription periods, and sends a welcome email. If several pending members match, the tool returns options to confirm.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "The pending member's name (or part of it)" },
            action: { type: SchemaType.STRING, description: "approve (default) or reject" },
          },
          required: ["name"],
        },
      },
      {
        name: "set_voucher_status",
        description: "Finance/State-Admin only: approve or reject a pending expense voucher, found by submitter name and/or title. Two-step — call WITHOUT confirm for a preview (title, amount, submitter), ask the user to confirm, THEN call with confirm=true. Emails the submitter on decision.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            submitter_name: { type: SchemaType.STRING, description: "Name of the official who submitted the voucher" },
            title: { type: SchemaType.STRING, description: "Voucher title (or part) to narrow the match" },
            status: { type: SchemaType.STRING, description: "approved | rejected" },
            remarks: { type: SchemaType.STRING, description: "Optional note (esp. for a rejection reason)" },
            confirm: { type: SchemaType.BOOLEAN, description: "Set true ONLY after the user confirms the previewed voucher" },
          },
          required: ["status"],
        },
      },
      {
        name: "set_payment_status",
        description: "Admin/finance only: set a member's subscription payment status to paid, rejected, or hold, by member name (and period if they have several open). IMPORTANT: this is a two-step action — first call WITHOUT confirm to get a preview (member, period, amount), show it to the user and ask them to confirm, THEN call again with confirm=true. Approving as 'paid' is restricted to Finance Team / State-Admin and needs an uploaded proof.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "The member's name (or part of it)" },
            period: { type: SchemaType.STRING, description: "Subscription period if the member has several open (e.g. '2026', 'UATT')" },
            status: { type: SchemaType.STRING, description: "paid | rejected | hold" },
            amount: { type: SchemaType.NUMBER, description: "Paid amount when approving (defaults to the subscription amount)" },
            confirm: { type: SchemaType.BOOLEAN, description: "Set true ONLY after the user has confirmed the previewed action" },
          },
          required: ["name", "status"],
        },
      },
      {
        name: "get_my_adh_pm_status",
        description: "Get whether the current user has responded to the ADH(PM) designation query (the 'Are you an Assistant Director of Horticulture (PM)?' email), and what their current designation is. Use when the user asks if their ADH(PM) response was recorded, or about their ADH(PM) / PM designation status.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: "get_my_tasks",
        description: "Get tasks assigned to or submitted by the current user. Use when the user asks about their tasks, to-dos, assignments, or work items.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            status: { type: SchemaType.STRING, description: "Filter by status: pending, in_progress, completed, review" },
            limit: { type: SchemaType.NUMBER, description: "Max results (default 10)" },
          },
        },
      },
      {
        name: "get_my_achievements",
        description: "Get the current user's earned badges/achievements. Use when the user asks about their badges, awards, or achievements.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: "get_portal_stats",
        description: "Get overall portal statistics (member count, announcements count, etc.). Use when the user asks about portal size, how many members, or general statistics.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: "search_trainings",
        description: "Search training sessions. Use when the user asks about trainings, workshops, learning opportunities, or courses.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Search keyword for training title or topic" },
            upcoming: { type: SchemaType.BOOLEAN, description: "Set to true to only show upcoming/ongoing trainings" },
            limit: { type: SchemaType.NUMBER, description: "Max results (default 5)" },
          },
        },
      },
      {
        name: "search_resolutions",
        description: "Search e-resolutions (proposals that members voted on). Use when the user asks about resolutions, voting, or proposals.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Search keyword" },
            status: { type: SchemaType.STRING, description: "Filter: voting_open, passed, failed" },
            limit: { type: SchemaType.NUMBER, description: "Max results (default 5)" },
          },
        },
      },
      {
        name: "get_my_contributions",
        description: "Get the current user's contribution/activity stats on the portal. Use when the user asks about their activity, contributions, engagement, or how active they are.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
    ],
  },
];
