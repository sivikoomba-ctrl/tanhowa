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
- For "how to" questions about using the portal, guide users to the correct page/feature.`;

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
        description: "Get the current user's subscription/payment status. Use when the user asks about their dues, payments, subscription status, or fees.",
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
