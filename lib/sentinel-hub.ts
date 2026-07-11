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

export interface FieldArea {
  hectares: number;
  acres: number;
  /** True when the boundary's edges cross themselves (sloppy digitization) — the area number is unreliable. */
  selfIntersectionWarning: boolean;
}

function segmentsIntersect(p1: number[], p2: number[], p3: number[], p4: number[]): boolean {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(d) < 1e-12) return false; // parallel/collinear — ignore for a cheap sanity check
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
  const u = ((p1[0] - p3[0]) * (p1[1] - p2[1]) - (p1[1] - p3[1]) * (p1[0] - p2[0])) / d;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

/** O(n^2) check for a self-intersecting (bowtie) boundary — cheap for field-sized KMLs (a few dozen vertices). */
function hasSelfIntersection(coords: number[][]): boolean {
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const a1 = coords[i], a2 = coords[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent to the closing edge
      const b1 = coords[j], b2 = coords[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * Field boundary area from the outer ring only — parseKmlPolygon() does not currently extract
 * inner rings (holes), so an excluded pond/structure inside the boundary is not subtracted.
 * Equirectangular projection (mean-latitude cosine correction) + shoelace formula: sub-1% error
 * at Tamil Nadu latitudes (~8-13N) for field-scale extents (up to a few hundred acres) — no need
 * for full geodesic/UTM projection at this scale.
 */
export function computePolygonAreaHectares(coordinates: number[][]): FieldArea {
  const R = 6371000; // meters
  const meanLat = coordinates.reduce((s, c) => s + c[1], 0) / coordinates.length;
  const latRad = (meanLat * Math.PI) / 180;
  const toXY = ([lon, lat]: number[]) => [
    ((lon * Math.PI) / 180) * R * Math.cos(latRad),
    (lat * Math.PI) / 180 * R,
  ];
  const pts = coordinates.map(toXY);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  const squareMeters = Math.abs(area / 2);
  const hectares = squareMeters / 10000;
  return {
    hectares,
    acres: hectares * 2.47105,
    selfIntersectionWarning: hasSelfIntersection(coordinates),
  };
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

// ---------------------------------------------------------------------------
// Field Analysis Report — Start-of-Season / End-of-Season (SOS/EOS) phenology
// ---------------------------------------------------------------------------

export interface StressWindow {
  start: string;
  end: string;
  magnitude: number;
}

export interface CropCycle {
  peakDate: string;
  peakValue: number;
  sowingDate: string | null;
  sowingConfidence: "observed" | "edge-truncated";
  harvestDate: string | null;
  harvestConfidence: "observed" | "edge-truncated" | "ongoing";
  cropDurationDays: number | null;
  /** Width (days) of the sample gap the interpolated boundary date was derived from — 0 for a directly-observed valley sample. */
  dateUncertaintyDays: number;
  estimatedHarvestDate: string | null;
  estimatedHarvestConfidence: "same-season-analog" | "insufficient-history" | null;
  /** Series never returns near baseline (orchard/perennial canopy) — sowing/harvest/duration/stress are not meaningful and are suppressed. */
  isPerennialPattern: boolean;
  stressWindows: StressWindow[];
}

function localMinIndex(series: TimeSeriesPoint[], a: number, b: number): number {
  let minIdx = a;
  for (let k = a + 1; k <= b; k++) {
    if (series[k].mean < series[minIdx].mean) minIdx = k;
  }
  return minIdx;
}

/** First upward crossing of `threshold` walking from index a to b (a < b), linearly interpolated. */
function findUpwardCrossing(series: TimeSeriesPoint[], a: number, b: number, threshold: number) {
  for (let k = a; k < b; k++) {
    const v1 = series[k].mean, v2 = series[k + 1].mean;
    if (v1 < threshold && v2 >= threshold) {
      const frac = (threshold - v1) / (v2 - v1 || 1);
      const t1 = new Date(`${series[k].date}T00:00:00Z`).getTime();
      const t2 = new Date(`${series[k + 1].date}T00:00:00Z`).getTime();
      return { date: new Date(t1 + frac * (t2 - t1)).toISOString().slice(0, 10), bracketDays: Math.round((t2 - t1) / 86400000), atStart: k === a };
    }
  }
  return null;
}

/** First downward crossing of `threshold` walking from index a to b (a < b), linearly interpolated. */
function findDownwardCrossing(series: TimeSeriesPoint[], a: number, b: number, threshold: number) {
  for (let k = a; k < b; k++) {
    const v1 = series[k].mean, v2 = series[k + 1].mean;
    if (v1 >= threshold && v2 < threshold) {
      const frac = (v1 - threshold) / (v1 - v2 || 1);
      const t1 = new Date(`${series[k].date}T00:00:00Z`).getTime();
      const t2 = new Date(`${series[k + 1].date}T00:00:00Z`).getTime();
      return { date: new Date(t1 + frac * (t2 - t1)).toISOString().slice(0, 10), bracketDays: Math.round((t2 - t1) / 86400000), atEnd: k + 1 === b };
    }
  }
  return null;
}

const PERENNIAL_MIN_FLOOR = 0.4; // a real annual cycle should dip meaningfully below this near its boundaries
const PERENNIAL_MIN_AMPLITUDE = 0.15;
const STRESS_DIP_THRESHOLD = 0.08;
const RELATIVE_ONSET_FRACTION = 0.3; // valley + 0.3*(peak-valley) — per-cycle baseline, not a hardcoded absolute

/** Local dips within the rise phase (leftIndex..peakIndex) that drop then recover — flagged, not diagnosed. */
function findStressWindows(series: TimeSeriesPoint[], leftIndex: number, peakIndex: number): StressWindow[] {
  const windows: StressWindow[] = [];
  if (peakIndex - leftIndex < 3) return windows;
  let runningHigh = series[leftIndex].mean;
  let dipStart: number | null = null;
  for (let k = leftIndex + 1; k <= peakIndex; k++) {
    const v = series[k].mean;
    if (dipStart !== null && v >= runningHigh - STRESS_DIP_THRESHOLD * 0.3) {
      // recovered close back to the pre-dip high — close out the window if it persisted >=2 samples
      if (k - 1 - dipStart >= 1) {
        const dipValues = series.slice(dipStart, k).map((p) => p.mean);
        const magnitude = runningHigh - Math.min(...dipValues);
        if (magnitude >= STRESS_DIP_THRESHOLD) windows.push({ start: series[dipStart].date, end: series[k - 1].date, magnitude });
      }
      dipStart = null;
      runningHigh = v;
    } else if (runningHigh - v >= STRESS_DIP_THRESHOLD) {
      if (dipStart === null) dipStart = k;
    } else if (v > runningHigh) {
      runningHigh = v;
    }
  }
  return windows;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

/** How isolated a sample is from its neighbors — a valley bracketed by a big sampling gap is a weaker boundary estimate. */
function sampleIsolation(series: TimeSeriesPoint[], idx: number): number {
  const prevGap = idx > 0 ? daysBetween(series[idx - 1].date, series[idx].date) : 0;
  const nextGap = idx < series.length - 1 ? daysBetween(series[idx].date, series[idx + 1].date) : 0;
  return Math.max(prevGap, nextGap);
}

/**
 * Detects sowing/harvest/duration/stress-window per major crop cycle from an already-computed
 * peak list (see findCropCycles). Boundaries between two major peaks use the valley (local
 * minimum) between them — always a real turnaround regardless of its absolute NDVI value, which
 * is what makes double-cropping (two majors with no dip below any fixed baseline) resolve
 * correctly. Only the two unbounded ends (before the first major, after the last) fall back to a
 * per-cycle relative threshold crossing, since there's no bracketing peak to define a valley there.
 */
export function detectCropCycles(series: TimeSeriesPoint[], peaks: Peak[]): CropCycle[] {
  const majors = peaks.filter((p) => p.tier === "major").sort((a, b) => a.index - b.index);
  if (majors.length === 0) return [];

  const cycles: CropCycle[] = [];

  for (let i = 0; i < majors.length; i++) {
    const peak = majors[i];
    let leftIndex: number;
    let sowingDate: string | null;
    let sowingConfidence: "observed" | "edge-truncated";
    let sowingUncertainty = 0;

    if (i > 0) {
      leftIndex = localMinIndex(series, majors[i - 1].index, peak.index);
      sowingDate = series[leftIndex].date;
      sowingConfidence = "observed";
      sowingUncertainty = sampleIsolation(series, leftIndex);
    } else {
      const valleyIdx = localMinIndex(series, 0, peak.index);
      const threshold = series[valleyIdx].mean + RELATIVE_ONSET_FRACTION * (peak.value - series[valleyIdx].mean);
      const crossing = valleyIdx < peak.index ? findUpwardCrossing(series, valleyIdx, peak.index, threshold) : null;
      if (crossing) {
        leftIndex = valleyIdx;
        sowingDate = crossing.date;
        sowingConfidence = crossing.atStart ? "edge-truncated" : "observed";
        sowingUncertainty = crossing.bracketDays;
      } else {
        // No decline before this peak at all (peak sits at/near series start) — true onset is unknown.
        leftIndex = valleyIdx;
        sowingDate = valleyIdx === 0 ? series[0].date : null;
        sowingConfidence = "edge-truncated";
      }
    }

    let rightIndex: number;
    let harvestDate: string | null;
    let harvestConfidence: "observed" | "edge-truncated" | "ongoing";
    let harvestUncertainty = 0;

    if (i < majors.length - 1) {
      rightIndex = localMinIndex(series, peak.index, majors[i + 1].index);
      harvestDate = series[rightIndex].date;
      harvestConfidence = "observed";
      harvestUncertainty = sampleIsolation(series, rightIndex);
    } else {
      const seriesEndIdx = series.length - 1;
      // IMPORTANT: the threshold must come from the field's own pre-growth baseline (this cycle's
      // sowing-side valley), NOT a valley re-derived from the declining tail itself — a
      // tail-derived valley is, by construction, always below its own threshold, so a crossing
      // would always be "found" and "ongoing" could never actually trigger. Falls back to a
      // tail-local valley only when no sowing baseline exists (perennial/edge-truncated left side).
      const baselineValue = sowingDate !== null && sowingConfidence !== "edge-truncated"
        ? series[leftIndex].mean
        : series[localMinIndex(series, peak.index, seriesEndIdx)].mean;
      const threshold = baselineValue + RELATIVE_ONSET_FRACTION * (peak.value - baselineValue);
      const crossing = peak.index < seriesEndIdx ? findDownwardCrossing(series, peak.index, seriesEndIdx, threshold) : null;
      if (crossing) {
        rightIndex = seriesEndIdx;
        harvestDate = crossing.date;
        harvestConfidence = crossing.atEnd ? "edge-truncated" : "observed";
        harvestUncertainty = crossing.bracketDays;
      } else {
        // Never crosses back down to baseline through the end of the fetched range — season still in progress.
        rightIndex = seriesEndIdx;
        harvestDate = null;
        harvestConfidence = "ongoing";
      }
    }

    const boundaryMin = Math.min(series[leftIndex].mean, series[rightIndex].mean);
    const isPerennialPattern = boundaryMin > PERENNIAL_MIN_FLOOR || peak.value - boundaryMin < PERENNIAL_MIN_AMPLITUDE;

    const cropDurationDays =
      !isPerennialPattern && sowingDate && harvestDate ? daysBetween(sowingDate, harvestDate) : null;

    cycles.push({
      peakDate: peak.date,
      peakValue: peak.value,
      sowingDate: isPerennialPattern ? null : sowingDate,
      sowingConfidence,
      harvestDate: isPerennialPattern ? null : harvestDate,
      harvestConfidence,
      cropDurationDays,
      dateUncertaintyDays: Math.max(sowingUncertainty, harvestUncertainty),
      estimatedHarvestDate: null,
      estimatedHarvestConfidence: null,
      isPerennialPattern,
      stressWindows: !isPerennialPattern ? findStressWindows(series, leftIndex, peak.index) : [],
    });
  }

  // Estimated harvest for an ongoing cycle: borrow duration from the completed cycle whose sowing
  // month is closest (same-season analog) — never an unrelated season, since TN fields commonly
  // rotate crop types/durations across seasons. Disagreement beyond ~35% across completed cycles
  // means the history isn't reliable enough to project from.
  const completed = cycles.filter((c) => !c.isPerennialPattern && c.sowingDate && c.cropDurationDays != null);
  if (completed.length > 0) {
    const durations = completed.map((c) => c.cropDurationDays!);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDevFraction = durations.length > 1 ? Math.max(...durations.map((d) => Math.abs(d - mean) / mean)) : 0;

    for (const cycle of cycles) {
      if (cycle.harvestConfidence !== "ongoing" || !cycle.sowingDate || cycle.isPerennialPattern) continue;
      if (maxDevFraction > 0.35) {
        cycle.estimatedHarvestConfidence = "insufficient-history";
        continue;
      }
      const ongoingMonth = new Date(`${cycle.sowingDate}T00:00:00Z`).getUTCMonth();
      let best = completed[0];
      let bestDist = 13;
      for (const c of completed) {
        const m = new Date(`${c.sowingDate}T00:00:00Z`).getUTCMonth();
        const dist = Math.min(Math.abs(m - ongoingMonth), 12 - Math.abs(m - ongoingMonth));
        if (dist < bestDist) { bestDist = dist; best = c; }
      }
      cycle.estimatedHarvestDate = addDays(cycle.sowingDate, best.cropDurationDays!);
      cycle.estimatedHarvestConfidence = "same-season-analog";
    }
  } else {
    for (const cycle of cycles) {
      if (cycle.harvestConfidence === "ongoing" && !cycle.isPerennialPattern) cycle.estimatedHarvestConfidence = "insufficient-history";
    }
  }

  return cycles;
}
