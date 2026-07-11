"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Satellite, Loader2, Upload, TrendingUp, AlertTriangle, FileCheck, Radar, Sprout, Scissors, Clock, Maximize, Download, Activity } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceDot, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CHART_COLORS } from "@/lib/chart-config";
import { useT } from "@/lib/i18n";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TimeSeriesPoint { date: string; mean: number; min: number; max: number; stdev: number; validPixels: number }
interface Peak { index: number; date: string; value: number; prominence: number; tier: "major" | "minor" }
interface DataGap { start: string; end: string; days: number }
interface RadarGapFill { gapStart: string; gapEnd: string; days: number; series: TimeSeriesPoint[]; peaks: { date: string; value: number }[] }
interface FieldArea { hectares: number; acres: number; selfIntersectionWarning: boolean }
interface StressWindow { start: string; end: string; magnitude: number }
interface CropCycle {
  peakDate: string; peakValue: number;
  sowingDate: string | null; sowingConfidence: "observed" | "edge-truncated";
  harvestDate: string | null; harvestConfidence: "observed" | "edge-truncated" | "ongoing";
  cropDurationDays: number | null;
  dateUncertaintyDays: number;
  estimatedHarvestDate: string | null;
  estimatedHarvestConfidence: "same-season-analog" | "insufficient-history" | null;
  isPerennialPattern: boolean;
  stressWindows: StressWindow[];
}
interface Result {
  series: TimeSeriesPoint[];
  peaks: Peak[];
  mode: "ndvi" | "rvi" | "combined";
  vertices: number;
  majorCycles: number;
  minorBumps: number;
  gaps?: DataGap[];
  radarGapFills?: RadarGapFill[];
  radarGapsSkipped?: number;
  radarConfirmedCycles?: number;
  fieldArea?: FieldArea;
  cropCycles?: CropCycle[];
}

const NDVI_RANGES = [
  { range: "-1 to 0", meaning: "Water, snow, cloud" },
  { range: "0 – 0.1", meaning: "Bare soil / rock" },
  { range: "0.1 – 0.2", meaning: "Sparse/stressed vegetation, fallow" },
  { range: "0.2 – 0.4", meaning: "Early-stage / low-density growth" },
  { range: "0.4 – 0.6", meaning: "Moderate active growth" },
  { range: "0.6 – 0.8", meaning: "Dense, healthy vegetation (typical crop peak)" },
  { range: "0.8 – 1.0", meaning: "Very dense vegetation (rare)" },
];

function todayMinus(days: number) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

/** dd-mm, for compact chart axis ticks */
function ddmm(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${d}-${m}`;
}

/** dd-mm-yyyy, for unambiguous list/card display */
function ddmmyyyy(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

function formatHa(hectares: number) {
  return `${hectares.toFixed(2)} ha (${(hectares * 2.47105).toFixed(2)} acres)`;
}

function formatDuration(days: number) {
  return `${days} days`;
}

export default function SatelliteNdviPage() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kml, setKml] = useState("");
  const [kmlName, setKmlName] = useState("");
  const [showRawKml, setShowRawKml] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayMinus(365));
  const [dateTo, setDateTo] = useState(todayMinus(0));
  const [intervalDays, setIntervalDays] = useState(5);
  const [mode, setMode] = useState<"ndvi" | "rvi" | "combined">("combined");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [cropAreaOverride, setCropAreaOverride] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKmlName(file.name);
    const reader = new FileReader();
    reader.onload = () => { setKml(String(reader.result || "")); setShowRawKml(false); };
    reader.readAsText(file);
  }

  async function analyze() {
    if (!kml.trim()) {
      toast.error("Upload or paste a field boundary KML first");
      return;
    }
    setLoading(true);
    setResult(null);
    setCropAreaOverride("");
    try {
      const res = await fetch("/api/ai-tools/satellite-ndvi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kml, dateFrom, dateTo, intervalDays, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to analyze field");
        return;
      }
      setResult(data);
    } catch {
      toast.error("Failed to analyze field");
    } finally {
      setLoading(false);
    }
  }

  const isCombined = mode === "combined";
  const seriesLabel = mode === "rvi" ? "RVI" : "NDVI";
  const chartData = (result?.series || []).map((p) => ({ ...p, label: ddmm(p.date) }));
  const chartConfig = { mean: { label: seriesLabel, color: CHART_COLORS.primary } };
  const majorPeaks = (result?.peaks || []).filter((p) => p.tier === "major");
  const minorPeaks = (result?.peaks || []).filter((p) => p.tier === "minor");
  const gaps = result?.gaps || [];
  const radarGapFills = result?.radarGapFills || [];
  const cropCycles = result?.cropCycles || [];
  const fieldArea = result?.fieldArea || null;
  const cropAreaHectares = cropAreaOverride ? Number(cropAreaOverride) || 0 : fieldArea?.hectares || 0;

  function downloadReport() {
    if (!result || !fieldArea) return;
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString("en-GB");
    doc.setFontSize(14);
    doc.text("TANHOWA - Field Analysis Report", 14, 15);
    doc.setFontSize(9);
    doc.text(`${kmlName || "Field boundary"} | Generated: ${today}`, 14, 21);
    doc.text(`Field Area: ${formatHa(fieldArea.hectares)}   Crop Area: ${formatHa(cropAreaHectares)}`, 14, 27);
    if (fieldArea.selfIntersectionWarning) doc.text("Warning: boundary edges appear self-intersecting - area may be unreliable.", 14, 32);

    let startY = fieldArea.selfIntersectionWarning ? 38 : 34;
    if (cropCycles.length === 0) {
      doc.text("No completed or in-progress crop cycle detected in this date range.", 14, startY);
    }
    cropCycles.forEach((c, i) => {
      doc.setFontSize(11);
      doc.text(`Cycle ${i + 1} - Peak ${ddmmyyyy(c.peakDate)} (${seriesLabel} ${c.peakValue.toFixed(2)})`, 14, startY);
      const rows: string[][] = c.isPerennialPattern
        ? [["Note", "Perennial/orchard canopy pattern - sowing/harvest dates not meaningful"]]
        : [
            ["Sowing / Planting Date", c.sowingDate ? `${ddmmyyyy(c.sowingDate)}${c.sowingConfidence === "edge-truncated" ? " (may extend before range)" : ""}` : "Unknown"],
            ["Harvest / Plant-Removal Date", c.harvestDate ? `${ddmmyyyy(c.harvestDate)}${c.harvestConfidence === "edge-truncated" ? " (may extend beyond range)" : ""}` : "Ongoing"],
            ["Crop Duration", c.cropDurationDays != null ? formatDuration(c.cropDurationDays) : "-"],
            ["Estimated Harvest", c.estimatedHarvestDate ? `${ddmmyyyy(c.estimatedHarvestDate)} (same-season estimate)` : c.estimatedHarvestConfidence === "insufficient-history" ? "Insufficient history to estimate" : "-"],
            ["Growth-Stress Window(s)", c.stressWindows.length ? c.stressWindows.map((w) => `${ddmmyyyy(w.start)} to ${ddmmyyyy(w.end)}`).join("; ") : "None detected"],
          ];
      autoTable(doc, {
        startY: startY + 2,
        body: rows,
        theme: "plain",
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
        margin: { left: 14, right: 14 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startY = ((doc as any).lastAutoTable?.finalY || startY + 30) + 8;
    });

    doc.setFontSize(8);
    const pageH = doc.internal.pageSize.getHeight();
    if (startY > pageH - 20) { doc.addPage(); startY = 20; }
    doc.text(
      "Satellite-derived estimates from NDVI/RVI time series - not ground truth. Verify sowing/harvest dates and any",
      14, startY + 6
    );
    doc.text(
      "flagged growth-stress windows with a field visit. Cause of a stress window (pest, disease, water stress, etc.)",
      14, startY + 11
    );
    doc.text("cannot be determined from satellite data alone.", 14, startY + 16);

    doc.save(`TANHOWA_Field_Analysis_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/ai-space">
          <Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button>
        </Link>
        <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
          <Satellite size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("aispace.ndvi")}</h1>
          <p className="text-sm text-muted-foreground">{t("aispace.ndvi_desc")}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t("ndvi.field_boundary")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} className="mr-1.5" /> {t("ndvi.upload_kml")}
            </Button>
            <input ref={fileInputRef} type="file" accept=".kml" className="hidden" onChange={handleFile} />
            {kmlName && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1">
                <FileCheck size={12} /> {kmlName}
              </span>
            )}
            <button type="button" onClick={() => setShowRawKml((v) => !v)} className="text-xs text-muted-foreground underline underline-offset-2">
              {showRawKml ? "Hide raw KML" : kml ? "Edit raw KML" : "Or paste KML instead"}
            </button>
          </div>
          {showRawKml && (
            <Textarea
              value={kml}
              onChange={(e) => setKml(e.target.value)}
              placeholder="<Polygon><outerBoundaryIs><LinearRing><coordinates>...</coordinates>...</Polygon> — paste KML content here, or upload a file above"
              className="font-mono text-xs h-28"
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">{t("ndvi.date_from")}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("ndvi.date_to")}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("ndvi.interval_days")}</Label>
              <Input type="number" min={1} max={30} value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value) || 5)} />
            </div>
            <div>
              <Label className="text-xs">{t("ndvi.mode")}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "ndvi" | "rvi" | "combined")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">{t("ndvi.mode_combined")}</SelectItem>
                  <SelectItem value="ndvi">{t("ndvi.mode_ndvi")}</SelectItem>
                  <SelectItem value="rvi">{t("ndvi.mode_rvi")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={analyze} disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Satellite size={16} className="mr-2" />}
            {t("ndvi.analyze")}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className={`grid grid-cols-3 ${isCombined ? "sm:grid-cols-4" : ""} gap-4`}>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{result.majorCycles}</p><p className="text-xs text-muted-foreground">{t("ndvi.major_cycles")}</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{result.minorBumps}</p><p className="text-xs text-muted-foreground">{t("ndvi.minor_bumps")}</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{result.series.length}</p><p className="text-xs text-muted-foreground">{t("ndvi.data_points")}</p></CardContent></Card>
            {isCombined && (
              <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{result.radarConfirmedCycles ?? 0}</p><p className="text-xs text-muted-foreground">{t("ndvi.radar_confirmed_cycles")}</p></CardContent></Card>
            )}
          </div>

          {fieldArea && mode !== "rvi" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm flex items-center gap-2"><Maximize size={14} /> {t("ndvi.report_title")}</CardTitle>
                <Button size="sm" variant="outline" onClick={downloadReport}>
                  <Download size={14} className="mr-1.5" /> {t("ndvi.download_report")}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("ndvi.field_area")}</Label>
                    <p className="text-sm font-medium">{formatHa(fieldArea.hectares)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("ndvi.crop_area")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={fieldArea.hectares.toFixed(2)}
                      value={cropAreaOverride}
                      onChange={(e) => setCropAreaOverride(e.target.value)}
                      className="h-8"
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {cropAreaOverride ? formatHa(cropAreaHectares) : t("ndvi.crop_area_hint")}
                    </p>
                  </div>
                </div>
                {fieldArea.selfIntersectionWarning && (
                  <p className="text-xs text-amber-700 flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t("ndvi.area_self_intersection_warning")}</p>
                )}
                <p className="text-[11px] text-muted-foreground">{t("ndvi.area_outer_only")}</p>

                {cropCycles.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("ndvi.report_none")}</p>
                )}

                {cropCycles.map((c, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Cycle {i + 1} — Peak {ddmmyyyy(c.peakDate)} ({seriesLabel} {c.peakValue.toFixed(2)})
                    </p>
                    {c.isPerennialPattern ? (
                      <p className="text-xs text-muted-foreground">{t("ndvi.perennial_note")}</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Sprout size={14} className="text-green-600 shrink-0" />
                            <div>
                              <p className="text-[11px] text-muted-foreground">{t("ndvi.sowing_date")}</p>
                              <p className="font-medium">
                                {c.sowingDate ? ddmmyyyy(c.sowingDate) : "—"}
                                {c.sowingConfidence === "edge-truncated" && <span className="text-amber-600 text-[11px] ml-1">({t("ndvi.edge_truncated")})</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Scissors size={14} className="text-orange-600 shrink-0" />
                            <div>
                              <p className="text-[11px] text-muted-foreground">{t("ndvi.harvest_date")}</p>
                              <p className="font-medium">
                                {c.harvestDate ? ddmmyyyy(c.harvestDate) : t("ndvi.ongoing")}
                                {c.harvestConfidence === "edge-truncated" && <span className="text-amber-600 text-[11px] ml-1">({t("ndvi.edge_truncated")})</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-blue-600 shrink-0" />
                            <div>
                              <p className="text-[11px] text-muted-foreground">{t("ndvi.crop_duration")}</p>
                              <p className="font-medium">{c.cropDurationDays != null ? formatDuration(c.cropDurationDays) : "—"}</p>
                            </div>
                          </div>
                          {c.harvestConfidence === "ongoing" && (
                            <div className="flex items-center gap-2">
                              <TrendingUp size={14} className="text-purple-600 shrink-0" />
                              <div>
                                <p className="text-[11px] text-muted-foreground">{t("ndvi.estimated_harvest")}</p>
                                <p className="font-medium">
                                  {c.estimatedHarvestDate
                                    ? <>{ddmmyyyy(c.estimatedHarvestDate)} <span className="text-[11px] text-muted-foreground">({t("ndvi.same_season_estimate")})</span></>
                                    : <span className="text-muted-foreground">{t("ndvi.insufficient_history")}</span>}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        {c.dateUncertaintyDays > 7 && (
                          <p className="text-[11px] text-muted-foreground">± {c.dateUncertaintyDays} days uncertainty (nearest satellite passes were that far apart around this date).</p>
                        )}
                        <div className="pt-1 border-t">
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Activity size={12} /> {t("ndvi.stress_window")}</p>
                          {c.stressWindows.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("ndvi.stress_window_none")}</p>
                          ) : (
                            <div className="space-y-1 mt-1">
                              {c.stressWindows.map((w, wi) => (
                                <p key={wi} className="text-sm text-amber-700">{ddmmyyyy(w.start)} → {ddmmyyyy(w.end)}</p>
                              ))}
                              <p className="text-[11px] text-muted-foreground">{t("ndvi.stress_disclaimer")}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp size={14} /> {seriesLabel} Time Series</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[320px] w-full">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={mode === "rvi" ? undefined : [-0.2, 1]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {isCombined && gaps.map((g, i) => (
                    <ReferenceArea key={i} x1={ddmm(g.start)} x2={ddmm(g.end)} fill={CHART_COLORS.hold} fillOpacity={0.12} strokeOpacity={0} />
                  ))}
                  <Area type="monotone" dataKey="mean" name={seriesLabel} stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.15} strokeWidth={2} />
                  {majorPeaks.map((p) => (
                    <ReferenceDot key={p.index} x={ddmm(p.date)} y={p.value} r={5} fill={CHART_COLORS.accent} stroke="#fff" />
                  ))}
                </AreaChart>
              </ChartContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Orange dots mark detected major peaks{isCombined ? "; shaded bands mark data gaps (see below for radar confirmation)" : ` (comfortably above 0.6 ${seriesLabel})`}.
              </p>
            </CardContent>
          </Card>

          {(majorPeaks.length > 0 || minorPeaks.length > 0) && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Detected Cycles</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {majorPeaks.map((p) => (
                  <div key={p.index} className="flex items-center justify-between text-sm p-2 rounded-lg bg-green-50">
                    <span className="font-medium">Major peak — {ddmmyyyy(p.date)}</span>
                    <span className="text-muted-foreground">{seriesLabel} {p.value.toFixed(2)}</span>
                  </div>
                ))}
                {minorPeaks.map((p) => (
                  <div key={p.index} className="flex items-center justify-between text-sm p-2 rounded-lg bg-amber-50">
                    <span className="font-medium">Minor bump — {ddmmyyyy(p.date)}</span>
                    <span className="text-muted-foreground">{seriesLabel} {p.value.toFixed(2)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isCombined && gaps.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Radar size={14} /> {t("ndvi.gaps_title")}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {gaps.map((g, i) => {
                  const fill = radarGapFills.find((f) => f.gapStart === g.start && f.gapEnd === g.end);
                  return (
                    <div key={i} className="p-2 rounded-lg border text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{ddmmyyyy(g.start)} → {ddmmyyyy(g.end)}</span>
                        <span className="text-xs text-muted-foreground">{g.days} days</span>
                      </div>
                      {!fill && (
                        <p className="text-xs text-muted-foreground mt-1">{t("ndvi.gap_not_checked")}</p>
                      )}
                      {fill && fill.peaks.length > 0 && (
                        <p className="text-xs text-green-700 mt-1">
                          {t("ndvi.gap_radar_confirmed")} {fill.peaks.map((p) => ddmmyyyy(p.date)).join(", ")}
                        </p>
                      )}
                      {fill && fill.peaks.length === 0 && (
                        <p className="text-xs text-amber-700 mt-1">{t("ndvi.gap_no_radar_signal")}</p>
                      )}
                    </div>
                  );
                })}
                {!!result?.radarGapsSkipped && result.radarGapsSkipped > 0 && (
                  <p className="text-xs text-muted-foreground pt-1">{result.radarGapsSkipped} {t("ndvi.gaps_skipped")}</p>
                )}
              </CardContent>
            </Card>
          )}

          {mode !== "rvi" && (
            <Card className="border-dashed">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Never compare RVI values directly against NDVI values — different physical quantities (radar backscatter ratio vs.
                    optical reflectance ratio), no fixed conversion. Radar gap-fill only confirms whether/roughly-when a cycle occurred.
                  </p>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {NDVI_RANGES.map((r) => (
                      <tr key={r.range} className="border-t">
                        <td className="py-1 pr-3 font-mono whitespace-nowrap">{r.range}</td>
                        <td className="py-1 text-muted-foreground">{r.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
