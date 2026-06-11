import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { translateContent, getTranslations } from "@/lib/translate-content";
import { validate, grievanceCreateSchema, grievanceUpdateSchema } from "@/lib/validation";
import { writeLimiter } from "@/lib/rate-limit";

const SERVICE_REQUEST_CATEGORIES = ["Transfer", "Training", "Legal Help", "Certificate", "Letter/Recommendation", "Welfare", "IT Support", "Other Service"];

// Grievances (everything that isn't a suggestion or service request) are
// visible and workable only to state officials and the super admin.
function isGrievanceCategory(category: string | null): boolean {
  return category !== "Suggestion" && !SERVICE_REQUEST_CATEGORIES.includes(category || "");
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

    const supabase = getServiceClient();

    const info = await getOfficialInfo(session.userId);
    const grievanceAccess = info.role === "super_admin" || info.official_type === "state";
    const adminRole = info.role === "admin" || info.role === "super_admin";
    // District admins see their own district's grievances (inner join needed
    // so the submitter-district filter can apply)
    const districtScope = type === "grievance" && !grievanceAccess && info.official_type === "district" && !!info.district;

    let query = supabase
      .from("grievances")
      .select(districtScope ? "*, users!inner(name, posting_details)" : "*, users(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by type
    if (type === "suggestion") {
      query = query.eq("category", "Suggestion");
    } else if (type === "service-request") {
      query = query.in("category", SERVICE_REQUEST_CATEGORIES);
    } else if (type === "grievance") {
      query = query.neq("category", "Suggestion").not("category", "in", `(${SERVICE_REQUEST_CATEGORIES.join(",")})`);
    }

    if (type === "grievance") {
      // State officials + super admin: all; district admins: own district;
      // members: own submissions only
      if (districtScope) {
        query = query.eq("users.posting_details->>regular_district", info.district!);
      } else if (!grievanceAccess) {
        query = query.eq("submitted_by", session.userId);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
    } else if (adminRole) {
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      // Untyped admin queries: district admins don't see others' grievances
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
      : SERVICE_REQUEST_CATEGORIES.includes(v.data.category) ? "service_request_submitted"
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

    // Grievance rows: state officials + super admin, or district admins for
    // their own district's submitters. Other rows: any admin.
    const { data: target } = await supabase
      .from("grievances")
      .select("category, users:submitted_by(posting_details)")
      .eq("id", v.data.id)
      .single();
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const info = await getOfficialInfo(session.userId);
    let allowed: boolean;
    if (isGrievanceCategory(target.category)) {
      allowed = info.role === "super_admin" || info.official_type === "state";
      if (!allowed && info.official_type === "district" && info.district) {
        const pd = (target.users as unknown as { posting_details?: { regular_district?: string } } | null)?.posting_details;
        allowed = pd?.regular_district === info.district;
      }
    } else {
      allowed = info.role === "admin" || info.role === "super_admin";
    }
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // Grievance rows: state officials + super admin. Other rows: any admin.
    const { data: target } = await supabase.from("grievances").select("category").eq("id", id).single();
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const info = await getOfficialInfo(session.userId);
    const allowed = isGrievanceCategory(target.category)
      ? info.role === "super_admin" || info.official_type === "state"
      : info.role === "admin" || info.role === "super_admin";
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
