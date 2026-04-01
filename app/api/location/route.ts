import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * PUT /api/location — Update current user's location (opt-in)
 * Body: { lat, lng, sharing }
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    // Toggle sharing on/off
    if (body.sharing !== undefined) {
      const updates: Record<string, unknown> = { location_sharing: body.sharing };
      if (!body.sharing) {
        // Clear location when opting out
        updates.last_lat = null;
        updates.last_lng = null;
        updates.location_updated_at = null;
      }
      await supabase.from("users").update(updates).eq("id", session.userId);
      return NextResponse.json({ message: body.sharing ? "Location sharing enabled" : "Location sharing disabled" });
    }

    // Update location
    if (body.lat !== undefined && body.lng !== undefined) {
      await supabase.from("users").update({
        last_lat: body.lat,
        last_lng: body.lng,
        location_updated_at: new Date().toISOString(),
      }).eq("id", session.userId);
      return NextResponse.json({ message: "Location updated" });
    }

    return NextResponse.json({ error: "lat/lng or sharing required" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/location", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
  }
}

/**
 * GET /api/location?lat=X&lng=Y&radius=Z — Find nearby members
 * radius in km (default 25)
 * Admin/official only
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat") || "0");
    const lng = parseFloat(url.searchParams.get("lng") || "0");
    const radius = parseFloat(url.searchParams.get("radius") || "25");

    if (!lat || !lng) {
      return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch all members with location sharing enabled and recent location
    const { data: members, error } = await supabase
      .from("users")
      .select("id, name, email, phone, last_lat, last_lng, location_updated_at, posting_details")
      .eq("status", "approved")
      .eq("location_sharing", true)
      .not("last_lat", "is", null)
      .not("last_lng", "is", null);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/location", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Haversine formula to calculate distance in km
    function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const nearby = (members || [])
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        district: (m.posting_details as { regular_district?: string } | null)?.regular_district || "",
        distance: Math.round(haversine(lat, lng, m.last_lat, m.last_lng) * 10) / 10,
        location_updated_at: m.location_updated_at,
      }))
      .filter((m) => m.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    return NextResponse.json({ nearby, total: nearby.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/location", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch nearby members" }, { status: 500 });
  }
}
