import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { translateContent, getTranslations } from "@/lib/translate-content";

// GET: List FAQs (all approved members)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("faqs")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const items = data || [];
    const url = new URL(req.url);
    const lang = url.searchParams.get("lang");
    if (lang === "ta" && items.length > 0) {
      const ids = items.map((f: { id: string }) => f.id);
      const translations = await getTranslations("faqs", ids, "ta");
      for (const f of items) {
        const t = translations[f.id];
        if (t) {
          if (t.question) f.question = t.question;
          if (t.answer) f.answer = t.answer;
        }
      }
    }

    return NextResponse.json({ faqs: items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/faq", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch FAQs" }, { status: 500 });
  }
}

// POST: Create FAQ (admin/official)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminOrOfficial(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { question, answer, category, sort_order } = body;

    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: "Question and answer are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("faqs")
      .insert({
        question: question.trim(),
        answer: answer.trim(),
        category: category?.trim() || "General",
        sort_order: sort_order || 0,
        published: true,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/faq", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create FAQ" }, { status: 500 });
    }

    translateContent("faqs", data.id, { question: data.question, answer: data.answer });

    return NextResponse.json({ faq: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/faq", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create FAQ" }, { status: 500 });
  }
}

// PUT: Update FAQ (admin/official)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminOrOfficial(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, question, answer, category, sort_order, published } = body;

    if (!id) return NextResponse.json({ error: "FAQ ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const updateData: Record<string, unknown> = {};
    if (question !== undefined) updateData.question = question.trim();
    if (answer !== undefined) updateData.answer = answer.trim();
    if (category !== undefined) updateData.category = category.trim();
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (published !== undefined) updateData.published = published;

    const { error } = await supabase.from("faqs").update(updateData).eq("id", id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/faq", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update FAQ" }, { status: 500 });
    }

    // Re-translate if question or answer changed
    const fieldsToTranslate: Record<string, string> = {};
    if (question) fieldsToTranslate.question = question.trim();
    if (answer) fieldsToTranslate.answer = answer.trim();
    if (Object.keys(fieldsToTranslate).length > 0) {
      translateContent("faqs", id, fieldsToTranslate);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/faq", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update FAQ" }, { status: 500 });
  }
}

// DELETE: Remove FAQ (admin/official)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminOrOfficial(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "FAQ ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase.from("faqs").delete().eq("id", id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/faq", method: "DELETE", status_code: 500 });
      return NextResponse.json({ error: "Failed to delete FAQ" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/faq", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete FAQ" }, { status: 500 });
  }
}
