import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { translateContent, getTranslations } from "@/lib/translate-content";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");

    const supabase = getServiceClient();

    let query = supabase
      .from("grievances")
      .select("*, users(name)")
      .order("created_at", { ascending: false });

    // Filter by type: "suggestion" shows only Suggestion category, "grievance" excludes it
    if (type === "suggestion") {
      query = query.eq("category", "Suggestion");
    } else if (type === "grievance") {
      query = query.neq("category", "Suggestion");
    }

    const dbRole = await getDbRole(session.userId);
    if (dbRole === "admin" || dbRole === "super_admin") {
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
    } else {
      query = query.eq("submitted_by", session.userId);
    }

    const { data: grievances } = await query;
    const items = grievances || [];
    const lang = url.searchParams.get("lang");
    if (lang === "ta" && items.length > 0) {
      const ids = items.map((g: { id: string }) => g.id);
      const translations = await getTranslations("grievances", ids, "ta");
      for (const g of items) {
        const t = translations[g.id];
        if (t?.admin_remarks) g.admin_remarks = t.admin_remarks;
      }
    }
    return NextResponse.json({ grievances: items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/grievances", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch grievances" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const subject = (body.subject || "").trim();
    const description = (body.description || "").trim();
    if (!subject || !description) {
      return NextResponse.json({ error: "Subject and description are required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("grievances")
      .insert({
        subject,
        description,
        category: (body.category || "").trim(),
        submitted_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/grievances", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to submit grievance" }, { status: 500 });
    }

    logContribution(session.userId, body.category === "Suggestion" ? "suggestion_submitted" : "grievance_submitted", "Submitted: " + body.subject);

    return NextResponse.json({ grievance: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/grievances", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to submit grievance" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    const updates: Record<string, string> = { updated_at: new Date().toISOString() };
    if (body.status) updates.status = body.status;
    if (body.admin_remarks !== undefined) updates.admin_remarks = body.admin_remarks;
    if (body.priority) updates.priority = body.priority;

    const { error } = await supabase
      .from("grievances")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/grievances", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    if (body.status || body.admin_remarks !== undefined) {
      logContribution(session.userId, "grievance_responded", "Responded to grievance");
    }
    logAudit(session.userId, "grievance_updated", "grievance", body.id, { status: body.status, priority: body.priority });
    if (body.admin_remarks) {
      translateContent("grievances", body.id, { admin_remarks: body.admin_remarks });
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/grievances", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("grievances").delete().eq("id", id);
    logAudit(session.userId, "grievance_deleted", "grievance", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/grievances", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
