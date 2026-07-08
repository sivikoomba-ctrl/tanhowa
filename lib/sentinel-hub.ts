/**
 * Copernicus Data Space Ecosystem (Sentinel Hub Statistical API) client.
 * TypeScript port of the field-ndvi-analysis skill's Python fetch scripts
 * (tools/fetch_ndvi.py, tools/fetch_s1_rvi.py) for use inside the Next.js app.
 */

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";

const NDVI_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1, sampleType: "UINT8" }
    ]
  };
}

function evaluatePixel(s) {
  let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-6);
  let valid = s.dataMask;
  // mask cloud shadow(3), cloud medium/high prob(8,9), cirrus(10), snow(11)
  if ([3, 8, 9, 10, 11].includes(s.SCL)) valid = 0;
  return { ndvi: [ndvi], dataMask: [valid] };
}
`;

const RVI_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"] }],
    output: [
      { id: "rvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1, sampleType: "UINT8" }
    ]
  };
}

function evaluatePixel(s) {
  let rvi = (4 * s.VH) / (s.VV + s.VH + 1e-6);
  return { rvi: [rvi], dataMask: [s.dataMask] };
}
`;

export interface GeoPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface TimeSeriesPoint {
  date: string;
  mean: number;
  min: number;
  max: number;
  stdev: number;
  validPixels: number;
}

export interface Peak {
  index: number;
  date: string;
  value: number;
  prominence: number;
  tier: "major" | "minor";
}

/** Parses the first <coordinates> block of a KML Polygon into GeoJSON. */
export function parseKmlPolygon(kmlText: string): GeoPolygon {
  const match = kmlText.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
  if (!match) throw new Error("No <coordinates> found in KML");
  const raw = match[1].trim();
  const coords = raw
    .split(/\s+/)
    .filter(Boolean)
    .map((triplet) => {
      const [lon, lat] = triplet.split(",").map(Number);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new Error(`Invalid coordinate in KML: "${triplet}"`);
      }
      return [lon, lat];
    });
  if (coords.length < 3) throw new Error("KML polygon needs at least 3 vertices");
  return { type: "Polygon", coordinates: [coords] };
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Copernicus authentication failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

interface StatsResponse {
  data?: Array<{
    interval: { from: string };
    outputs?: Record<string, { bands?: { B0?: { stats?: {
      mean: number; min: number; max: number; stDev: number; sampleCount: number; noDataCount: number;
    } } } }>;
  }>;
}

async function fetchStats(
  token: string,
  geometry: GeoPolygon,
  dateFrom: string,
  dateTo: string,
  intervalDays: number,
  dataType: "sentinel-2-l2a" | "sentinel-1-grd",
  evalscript: string,
  outputId: string
): Promise<StatsResponse> {
  const payload = {
    input: {
      bounds: {
        geometry,
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      data: [{ type: dataType }],
    },
    aggregation: {
      timeRange: { from: `${dateFrom}T00:00:00Z`, to: `${dateTo}T23:59:59Z` },
      aggregationInterval: { of: `P${intervalDays}D` },
      evalscript,
      resx: 10,
      resy: 10,
    },
    calculations: { [outputId]: {} },
  };

  const res = await fetch(STATS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Statistics API failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function toTimeSeries(statsJson: StatsResponse, outputId: string): TimeSeriesPoint[] {
  const rows: TimeSeriesPoint[] = [];
  for (const interval of statsJson.data ?? []) {
    const date = interval.interval.from.slice(0, 10);
    const stats = interval.outputs?.[outputId]?.bands?.B0?.stats;
    if (!stats || stats.sampleCount === stats.noDataCount) continue;
    rows.push({
      date,
      mean: stats.mean,
      min: stats.min,
      max: stats.max,
      stdev: stats.stDev,
      validPixels: stats.sampleCount - stats.noDataCount,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Sentinel-2 optical NDVI time series (default 5-day interval). */
export async function fetchNdviTimeSeries(
  clientId: string,
  clientSecret: string,
  geometry: GeoPolygon,
  dateFrom: string,
  dateTo: string,
  intervalDays = 5
): Promise<TimeSeriesPoint[]> {
  const token = await getAccessToken(clientId, clientSecret);
  const json = await fetchStats(token, geometry, dateFrom, dateTo, intervalDays, "sentinel-2-l2a", NDVI_EVALSCRIPT, "ndvi");
  return toTimeSeries(json, "ndvi");
}

/** Sentinel-1 radar RVI time series (default 6-day interval) — penetrates cloud cover. */
export async function fetchRviTimeSeries(
  clientId: string,
  clientSecret: string,
  geometry: GeoPolygon,
  dateFrom: string,
  dateTo: string,
  intervalDays = 6
): Promise<TimeSeriesPoint[]> {
  const token = await getAccessToken(clientId, clientSecret);
  const json = await fetchStats(token, geometry, dateFrom, dateTo, intervalDays, "sentinel-1-grd", RVI_EVALSCRIPT, "rvi");
  return toTimeSeries(json, "rvi");
}

export interface DataGap {
  start: string;
  end: string;
  days: number;
}

export interface RadarGapFill {
  gapStart: string;
  gapEnd: string;
  days: number;
  series: TimeSeriesPoint[];
  peaks: { date: string; value: number }[];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Finds stretches between consecutive data points wider than minGapDays — e.g. monsoon cloud cover. */
export function findDataGaps(series: TimeSeriesPoint[], minGapDays = 21): DataGap[] {
  const gaps: DataGap[] = [];
  for (let i = 1; i < series.length; i++) {
    const days = Math.round(
      (new Date(`${series[i].date}T00:00:00Z`).getTime() - new Date(`${series[i - 1].date}T00:00:00Z`).getTime()) / 86400000
    );
    if (days >= minGapDays) gaps.push({ start: series[i - 1].date, end: series[i].date, days });
  }
  return gaps;
}

/**
 * Radar has no established absolute "major/minor" scale like NDVI does, so peaks are found
 * using a prominence relative to the segment's own value range rather than an absolute cutoff.
 */
export function findRadarPeaks(series: TimeSeriesPoint[]): { date: string; value: number }[] {
  const values = series.map((p) => p.mean);
  if (values.length < 3) return [];
  const range = Math.max(...values) - Math.min(...values);
  if (range <= 0) return [];
  return findCropCycles(series, range * 0.2, Infinity).map((p) => ({ date: p.date, value: p.value }));
}

/**
 * Fills the largest optical NDVI gaps with a Sentinel-1 radar check (cloud-penetrating) to confirm
 * whether a crop cycle plausibly occurred during the gap, and roughly when. Mirrors the
 * field-ndvi-analysis skill's step 4 — radar trend shape only confirms whether/when, never a
 * direct NDVI-comparable value. Small gaps (< minGapDaysToFill) aren't worth a radar round-trip;
 * only the largest `maxGaps` gaps are checked to bound request cost on long date ranges.
 */
export async function fetchRadarGapFills(
  clientId: string,
  clientSecret: string,
  geometry: GeoPolygon,
  gaps: DataGap[],
  opts: { minGapDaysToFill?: number; maxGaps?: number; padDays?: number; intervalDays?: number } = {}
): Promise<{ fills: RadarGapFill[]; skipped: number }> {
  const minGapDaysToFill = opts.minGapDaysToFill ?? 40;
  const maxGaps = opts.maxGaps ?? 6;
  const padDays = opts.padDays ?? 5;
  const intervalDays = opts.intervalDays ?? 6;

  const candidates = gaps.filter((g) => g.days >= minGapDaysToFill).sort((a, b) => b.days - a.days);
  const toFill = candidates.slice(0, maxGaps);
  const skipped = candidates.length - toFill.length;

  const fills: RadarGapFill[] = [];
  for (const gap of toFill) {
    const from = addDays(gap.start, -padDays);
    const to = addDays(gap.end, padDays);
    try {
      const series = await fetchRviTimeSeries(clientId, clientSecret, geometry, from, to, intervalDays);
      fills.push({ gapStart: gap.start, gapEnd: gap.end, days: gap.days, series, peaks: findRadarPeaks(series) });
    } catch {
      fills.push({ gapStart: gap.start, gapEnd: gap.end, days: gap.days, series: [], peaks: [] });
    }
  }
  return { fills, skipped };
}

/**
 * Local-maxima peak detection with a minimum-prominence filter — a JS approximation of
 * scipy.signal.find_peaks(prominence=...). Classifies each surviving peak as major
 * (value comfortably above 0.6, a typical crop peak) or minor (smaller bump/noise).
 */
export function findCropCycles(series: TimeSeriesPoint[], minProminence = 0.15, majorThreshold = 0.6): Peak[] {
  const values = series.map((p) => p.mean);
  const peaks: Peak[] = [];

  for (let i = 1; i < values.length - 1; i++) {
    if (!(values[i] > values[i - 1] && values[i] > values[i + 1])) continue;

    let leftMin = values[i];
    for (let j = i - 1; j >= 0; j--) {
      if (values[j] > values[i]) break;
      leftMin = Math.min(leftMin, values[j]);
    }
    let rightMin = values[i];
    for (let j = i + 1; j < values.length; j++) {
      if (values[j] > values[i]) break;
      rightMin = Math.min(rightMin, values[j]);
    }

    const prominence = values[i] - Math.max(leftMin, rightMin);
    if (prominence >= minProminence) {
      peaks.push({
        index: i,
        date: series[i].date,
        value: values[i],
        prominence,
        tier: values[i] >= majorThreshold ? "major" : "minor",
      });
    }
  }
  return peaks;
}
