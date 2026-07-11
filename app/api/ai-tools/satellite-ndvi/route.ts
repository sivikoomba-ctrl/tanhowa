/**
 * Satellite field vegetation analysis (AI Space, super-admin only).
 * Fetches a Sentinel-2 NDVI or Sentinel-1 RVI time series for a field boundary (KML)
 * from the Copernicus Data Space Ecosystem and detects rise-peak-fall crop cycles.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { createRateLimiter } from "@/lib/rate-limit";
import { parseKmlPolygon, fetchNdviTimeSeries, fetchRviTimeSeries, findCropCycles, findDataGaps, fetchRadarGapFills, computePolygonAreaHectares, detectCropCycles } from "@/lib/sentinel-hub";

const limiter = createRateLimiter(10);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!limiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }

    const clientId = process.env.SH_CLIENT_ID;
    const clientSecret = process.env.SH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Copernicus credentials not configured (SH_CLIENT_ID / SH_CLIENT_SECRET)" }, { status: 500 });
    }

    const body = await req.json();
    const { kml, dateFrom, dateTo, mode } = body;
    const intervalDaysRaw = body.intervalDays;

    if (!kml || typeof kml !== "string") {
      return NextResponse.json({ error: "KML content is required" }, { status: 400 });
    }
    if (!dateFrom || !dateTo || typeof dateFrom !== "string" || typeof dateTo !== "string") {
      return NextResponse.json({ error: "dateFrom and dateTo (YYYY-MM-DD) are required" }, { status: 400 });
    }

    let geometry;
    try {
      geometry = parseKmlPolygon(kml);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid KML" }, { status: 400 });
    }

    const isRvi = mode === "rvi";
    const isCombined = mode === "combined";
    const intervalDays = Math.min(Math.max(parseInt(intervalDaysRaw, 10) || (isRvi ? 6 : 5), 1), 30);
    const fieldArea = computePolygonAreaHectares(geometry.coordinates[0]);

    if (isCombined) {
      const ndviSeries = await fetchNdviTimeSeries(clientId, clientSecret, geometry, dateFrom, dateTo, intervalDays);
      if (ndviSeries.length === 0) {
        return NextResponse.json(
          { error: "No valid NDVI data returned (field may be too small, or all scenes cloudy for this range)." },
          { status: 422 }
        );
      }

      const peaks = findCropCycles(ndviSeries);
      const gaps = findDataGaps(ndviSeries);
      const { fills, skipped } = await fetchRadarGapFills(clientId, clientSecret, geometry, gaps);
      const radarConfirmedCycles = fills.reduce((n, f) => n + f.peaks.length, 0);
      const cropCycles = detectCropCycles(ndviSeries, peaks);

      logContribution(session.userId, "used_ai_satellite_ndvi");

      return NextResponse.json({
        series: ndviSeries,
        peaks,
        gaps,
        radarGapFills: fills,
        radarGapsSkipped: skipped,
        mode: "combined",
        vertices: geometry.coordinates[0].length,
        majorCycles: peaks.filter((p) => p.tier === "major").length,
        minorBumps: peaks.filter((p) => p.tier === "minor").length,
        radarConfirmedCycles,
        fieldArea,
        cropCycles,
      });
    }

    const series = isRvi
      ? await fetchRviTimeSeries(clientId, clientSecret, geometry, dateFrom, dateTo, intervalDays)
      : await fetchNdviTimeSeries(clientId, clientSecret, geometry, dateFrom, dateTo, intervalDays);

    if (series.length === 0) {
      return NextResponse.json(
        { error: "No valid data returned (field may be too small, or all scenes cloudy for this range)." },
        { status: 422 }
      );
    }

    const peaks = findCropCycles(series);
    const cropCycles = isRvi ? [] : detectCropCycles(series, peaks);

    logContribution(session.userId, "used_ai_satellite_ndvi");

    return NextResponse.json({
      series,
      peaks,
      mode: isRvi ? "rvi" : "ndvi",
      vertices: geometry.coordinates[0].length,
      majorCycles: peaks.filter((p) => p.tier === "major").length,
      minorBumps: peaks.filter((p) => p.tier === "minor").length,
      fieldArea,
      cropCycles,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/satellite-ndvi", method: "POST", status_code: 500 });
    return NextResponse.json({ error: msg || "Failed to fetch satellite data" }, { status: 500 });
  }
}
