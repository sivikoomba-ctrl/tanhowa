import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { translateContent, getTranslations } from "@/lib/translate-content";
import { validate, grievanceCreateSchema, grievanceUpdateSchema } from "@/lib/validation";
import { writeLimiter } from "@/lib/rate-limit";

import { SERVICE_REQUEST_CATEGORIES, isGrievanceCategory, hasGrievanceAccess } from "@/lib/grievances";

// Authorization for mutating a single row. Grievance rows: state officials +
// super admin, or district admins when the row's district snapshot matches
// theirs. Suggestion/service-request rows: any admin.
async function canActOnGrievance(
  supabase: ReturnType<typeof getServiceClient>,
  id: string,
  userId: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const [{ data: target }, info] = await Promise.all([
    supabase.from("grievances").select("category, district").eq("id", id).single(),
    getOfficialInfo(userId),
  ]);
  if (!target) return { ok: false, status: 404, error: "Not found" };
  const allowed = isGrievanceCategory(target.category)
    ? hasGrievanceAccess(info) ||
      (info.official_type === "district" && !!info.district && target.district === info.district)
    : info.role === "admin" || info.role === "super_admin";
  return allowed ? { ok: true, status: 200 } : { ok: false, status: 403, error: "Forbidden" };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // mine=1: caller explicitly wants only their own submissions (dashboard
    // personal trackers), regardless of any admin/official scope they hold
    const mine = url.searchParams.get("mine") === "1";

    const supabase = getServiceClient();

    const info = await getOfficialInfo(session.userId);
    const grievanceAccess = hasGrievanceAccess(info);
    const adminRole = info.role === "admin" || info.role === "super_admin";

    let query = supabase
      .from("grievances")
      .select("*, users(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by type
    if (type === "suggestion") {
      query = query.eq("category", "Suggestion");
    } else if (type === "service-request") {
      query = query.in("category", [...SERVICE_REQUEST_CATEGORIES]);
    } else if (type === "grievance") {
      query = query.neq("category", "Suggestion").not("category", "in", `(${SERVICE_REQUEST_CATEGORIES.join(",")})`);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (mine) {
      query = query.eq("submitted_by", session.userId);
    } else if (type === "grievance") {
      // State officials + super admin: all; district admins: their district
      // (snapshot column); everyone else: own submissions only
      if (!grievanceAccess) {
        if (info.official_type === "district") {
          if (!info.district) {
            return NextResponse.json(
              { error: "Set your district in your profile to view district grievances" },
              { status: 403 }
            );
          }
          query = query.eq("district", info.district);
        } else {
          query = query.eq("submitted_by", session.userId);
        }
      }
    } else if (adminRole) {
      // Untyped admin queries: non-state admins don't see others' grievances
      if (!type && !grievanceAccess) {
        query = query.or(`submitted_by.eq.${session.userId},category.eq.Suggestion,category.in.(${SERVICE_REQUEST_CATEGORIES.join(",")})`);
      }
    } else {
      query = query.eq("submitted_by", session.userId);
    }

    const { data: grievances, count } = await query;
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
    return NextResponse.json({ grievances: items, total: count ?? items.length });
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

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();

    const v = validate(grievanceCreateSchema, body);
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 });

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("grievances")
      .insert({
        subject: v.data.subject,
        description: v.data.description,
        category: v.data.category,
        ...(v.data.priority ? { priority: v.data.priority } : {}),
        submitted_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/grievances", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to submit grievance" }, { status: 500 });
    }

    const actionType = v.data.category === "Suggestion" ? "suggestion_submitted"
      : !isGrievanceCategory(v.data.category) ? "service_request_submitted"
      : "grievance_submitted";
    logContribution(session.userId, actionType, "Submitted: " + v.data.subject);

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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();

    const v = validate(grievanceUpdateSchema, body);
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 });

    const supabase = getServiceClient();

    const auth = await canActOnGrievance(supabase, v.data.id, session.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const updates: Record<string, string> = { updated_at: new Date().toISOString() };
    if (v.data.status) updates.status = v.data.status;
    if (v.data.admin_remarks !== undefined) updates.admin_remarks = v.data.admin_remarks;
    if (v.data.priority) updates.priority = v.data.priority;

    const { error } = await supabase
      .from("grievances")
      .update(updates)
      .eq("id", v.data.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/grievances", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    if (v.data.status || v.data.admin_remarks !== undefined) {
      logContribution(session.userId, "grievance_responded", "Responded to grievance");
    }
    logAudit(session.userId, "grievance_updated", "grievance", v.data.id, { status: v.data.status, priority: v.data.priority });
    if (v.data.admin_remarks) {
      translateContent("grievances", v.data.id, { admin_remarks: v.data.admin_remarks });
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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();

    const auth = await canActOnGrievance(supabase, id, session.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await supabase.from("grievances").delete().eq("id", id);
    logAudit(session.userId, "grievance_deleted", "grievance", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/grievances", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
