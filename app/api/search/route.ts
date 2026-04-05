import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(20);

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!limiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const supabase = getServiceClient();
    const search = `%${q}%`;

    // Search across multiple tables in parallel
    const [announcements, events, documents, members, faqs] = await Promise.all([
      supabase.from("announcements").select("id, title, created_at").eq("published", true).ilike("title", search).limit(5),
      supabase.from("events").select("id, title, date").ilike("title", search).limit(5),
      supabase.from("documents").select("id, title, category").eq("approved", true).ilike("title", search).limit(5),
      supabase.from("users").select("id, name, occupation, posting_details").eq("status", "approved").ilike("name", search).limit(5),
      supabase.from("faqs").select("id, question").eq("published", true).ilike("question", search).limit(5),
    ]);

    const results = [
      ...(announcements.data || []).map((a) => ({ type: "announcement" as const, id: a.id, title: a.title, subtitle: new Date(a.created_at).toLocaleDateString("en-IN"), href: "/dashboard/announcements" })),
      ...(events.data || []).map((e) => ({ type: "event" as const, id: e.id, title: e.title, subtitle: e.date ? new Date(e.date).toLocaleDateString("en-IN") : "", href: "/dashboard/events" })),
      ...(documents.data || []).map((d) => ({ type: "document" as const, id: d.id, title: d.title, subtitle: d.category || "", href: "/dashboard/documents" })),
      ...(members.data || []).map((m) => {
        const pd = m.posting_details as { regular_district?: string } | null;
        return { type: "member" as const, id: m.id, title: m.name, subtitle: `${m.occupation || ""} ${pd?.regular_district ? "- " + pd.regular_district : ""}`.trim(), href: "/dashboard/members" };
      }),
      ...(faqs.data || []).map((f) => ({ type: "faq" as const, id: f.id, title: f.question, subtitle: "", href: "/dashboard/faq" })),
    ];

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
