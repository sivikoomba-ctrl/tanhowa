import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { DISTRICT_NAMES } from "@/lib/tn-districts";

const OFFICES = ["District Collector", "DDH", "JDA"] as const;
type Office = (typeof OFFICES)[number];

interface Row {
  id: string;
  district: string;
  office: string;
  status: string;
  date_given: string | null;
  remarks: string | null;
  submitted_by: string | null;
  updated_at?: string;
}

async function ensureDistrictRows(
  supabase: ReturnType<typeof getServiceClient>,
  district: string
): Promise<Row[]> {
  const { data: existing } = await supabase
    .from("dc_representation")
    .select("*")
    .eq("district", district);
  const existingOffices = new Set((existing || []).map((r) => r.office));
  const missing = OFFICES.filter((o) => !existingOffices.has(o));
  if (missing.length) {
    try {
      await supabase.from("dc_representation").insert(missing.map((office) => ({ district, office })));
    } catch {
      // race: another caller may have inserted concurrently
    }
  }
  const { data: rows } = await supabase
    .from("dc_representation")
    .select("*")
    .eq("district", district);
  return rows || [];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const info = await getOfficialInfo(session.userId);
    const isDistrictOfficial = info.official_type === "district";
    const supabase = getServiceClient();

    const url = new URL(req.url);
    let district = url.searchParams.get("district");

    if (isDistrictOfficial) {
      if (!info.district) {
        return NextResponse.json(
          { error: "Set your district in your profile to use DC Representation." },
          { status: 403 }
        );
      }
      district = info.district;
    }

    if (district) {
      const rows = await ensureDistrictRows(supabase, district);
      const officeRows = await Promise.all(
        OFFICES.map(async (office) => {
          const row = rows.find((r) => r.office === office);
          if (!row) return { office, status: "not_given", date_given: null, remarks: null, id: null, media: [] };

          const { data: media } = await supabase
            .from("dc_representation_media")
            .select("*")
            .eq("entry_id", row.id)
            .order("created_at", { ascending: true });

          const enriched = await Promise.all(
            (media || []).map(async (m) => {
              const { data: signed } = await supabase.storage
                .from("dc-representation-media")
                .createSignedUrl(m.file_path, 300);
              return { ...m, signed_url: signed?.signedUrl || "" };
            })
          );

          return {
            office,
            status: row.status,
            date_given: row.date_given,
            remarks: row.remarks,
            id: row.id,
            media: enriched,
          };
        })
      );

      return NextResponse.json({
        scope: isDistrictOfficial ? "own" : "detail",
        district,
        offices: officeRows,
      });
    }

    // Rollup across all districts (state/super-admin view)
    const { data: allRows } = await supabase.from("dc_representation").select("district, office, status, date_given");
    const byDistrict = new Map<string, Map<string, Row>>();
    (allRows || []).forEach((r) => {
      if (!byDistrict.has(r.district)) byDistrict.set(r.district, new Map());
      byDistrict.get(r.district)!.set(r.office, r as Row);
    });

    const officeGivenCount: Record<Office, number> = { "District Collector": 0, DDH: 0, JDA: 0 };
    let fullyComplete = 0;

    const districts = DISTRICT_NAMES.map((d) => {
      const rowsForDistrict = byDistrict.get(d);
      const offices = OFFICES.map((office) => {
        const row = rowsForDistrict?.get(office);
        const status = row?.status || "not_given";
        if (status === "given") officeGivenCount[office]++;
        return { office, status, date_given: row?.date_given || null };
      });
      const complete = offices.every((o) => o.status === "given");
      if (complete) fullyComplete++;
      return { district: d, offices, complete };
    });

    return NextResponse.json({
      scope: "all",
      districts,
      summary: {
        totalDistricts: DISTRICT_NAMES.length,
        fullyComplete,
        officeGivenCount,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/dc-representation", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch DC representation status" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { office, status, date_given, remarks } = body;

    if (!OFFICES.includes(office)) {
      return NextResponse.json({ error: "Invalid office" }, { status: 400 });
    }
    if (status !== "given" && status !== "not_given") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const info = await getOfficialInfo(session.userId);
    const isDistrictOfficial = info.official_type === "district";

    let district: string;
    if (isDistrictOfficial) {
      if (!info.district) {
        return NextResponse.json(
          { error: "Set your district in your profile to use DC Representation." },
          { status: 403 }
        );
      }
      district = info.district;
    } else {
      district = body.district;
      if (!district || !DISTRICT_NAMES.includes(district)) {
        return NextResponse.json({ error: "Invalid district" }, { status: 400 });
      }
    }

    const supabase = getServiceClient();
    await ensureDistrictRows(supabase, district);

    const { data, error } = await supabase
      .from("dc_representation")
      .update({
        status,
        date_given: status === "given" ? date_given || null : null,
        remarks: remarks || null,
        submitted_by: session.userId,
      })
      .eq("district", district)
      .eq("office", office)
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/dc-representation", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/dc-representation", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
