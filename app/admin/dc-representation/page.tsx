"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { FileSignature, MapPin, CheckCircle2, FileText, Camera, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

const OFFICES = ["District Collector", "DDH", "JDA"] as const;

interface OfficeMedia {
  id: string;
  media_type: "letter" | "photo";
  file_name: string;
  signed_url: string;
}

interface OfficeEntry {
  office: string;
  status: string;
  date_given: string | null;
  remarks: string | null;
  id: string | null;
  media: OfficeMedia[];
}

interface DetailData {
  scope: "own" | "detail";
  district: string;
  offices: OfficeEntry[];
}

interface RollupRow {
  district: string;
  offices: { office: string; status: string; date_given: string | null }[];
  complete: boolean;
}

interface RollupData {
  scope: "all";
  districts: RollupRow[];
  summary: { totalDistricts: number; fullyComplete: number; officeGivenCount: Record<string, number> };
}

export default function DcRepresentationPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [rollup, setRollup] = useState<RollupData | null>(null);
  const [ownData, setOwnData] = useState<DetailData | null>(null);
  const [dialogDistrict, setDialogDistrict] = useState<string | null>(null);
  const [dialogData, setDialogData] = useState<DetailData | null>(null);
  const [editingOffice, setEditingOffice] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [draftRemarks, setDraftRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const letterInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/dc-representation")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (d.scope === "all") setRollup(d);
        else setOwnData(d);
      })
      .catch((e) => toast.error(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDistrictDetail = (district: string) => {
    setDialogDistrict(district);
    setDialogData(null);
    fetch(`/api/dc-representation?district=${encodeURIComponent(district)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDialogData(d);
      })
      .catch((e) => toast.error(e.message || "Failed to load district"));
  };

  const refreshCurrent = (district: string) => {
    if (ownData) {
      fetch(`/api/dc-representation?district=${encodeURIComponent(district)}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setOwnData(d); });
    } else {
      openDistrictDetail(district);
      load(); // keep rollup table in sync
    }
  };

  const startEdit = (o: OfficeEntry) => {
    setEditingOffice(o.office);
    setDraftDate(o.date_given || "");
    setDraftRemarks(o.remarks || "");
  };

  const saveStatus = async (district: string, office: string, status: "given" | "not_given") => {
    setSaving(true);
    try {
      const res = await fetch("/api/dc-representation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, office, status, date_given: status === "given" ? draftDate : null, remarks: draftRemarks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("dcrep.save_failed"));
      toast.success(t("dcrep.saved"));
      setEditingOffice(null);
      refreshCurrent(district);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("dcrep.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const uploadMedia = async (district: string, entryId: string, mediaType: "letter" | "photo", file: File) => {
    const key = `${entryId}-${mediaType}`;
    setUploadingKey(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entry_id", entryId);
      formData.append("media_type", mediaType);
      const res = await fetch("/api/dc-representation/media", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("dcrep.upload_failed"));
      refreshCurrent(district);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("dcrep.upload_failed"));
    } finally {
      setUploadingKey(null);
    }
  };

  const deleteMedia = async (district: string, id: string) => {
    await fetch(`/api/dc-representation/media?id=${id}`, { method: "DELETE" });
    refreshCurrent(district);
  };

  const officeCardJsx = (o: OfficeEntry, district: string, editable: boolean) => {
    const letter = o.media.find((m) => m.media_type === "letter");
    const photos = o.media.filter((m) => m.media_type === "photo");
    const isEditing = editingOffice === o.office;
    return (
      <Card key={o.office}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>{o.office}</span>
            <Badge className={o.status === "given" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
              {o.status === "given" ? t("dcrep.given") : t("dcrep.not_given")}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {o.status === "given" && o.date_given && (
            <p className="text-sm text-muted-foreground">{t("dcrep.date_given")}: {o.date_given}</p>
          )}
          {o.remarks && <p className="text-sm text-muted-foreground">{o.remarks}</p>}

          {editable && isEditing && (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <label className="text-xs font-medium text-muted-foreground">{t("dcrep.date_given")}</label>
              <Input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              <label className="text-xs font-medium text-muted-foreground">{t("dcrep.remarks")}</label>
              <Textarea value={draftRemarks} onChange={(e) => setDraftRemarks(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={() => saveStatus(district, o.office, "given")}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.save")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingOffice(null)}>{t("common.cancel")}</Button>
              </div>
            </div>
          )}

          {editable && !isEditing && (
            <div className="flex flex-wrap gap-2">
              {o.status !== "given" ? (
                <Button size="sm" onClick={() => startEdit(o)}>{t("dcrep.mark_given")}</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => startEdit(o)}>{t("common.edit")}</Button>
              )}
              {o.status === "not_given" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => saveStatus(district, o.office, "not_given")}
                >
                  {t("dcrep.not_given")}
                </Button>
              )}
            </div>
          )}

          <div className="border-t pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {t("dcrep.letter")}</span>
              {editable && o.id && !letter && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={uploadingKey === `${o.id}-letter`}
                  onClick={() => {
                    if (!letterInputRef.current) return;
                    letterInputRef.current.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file && o.id) uploadMedia(district, o.id, "letter", file);
                    };
                    letterInputRef.current.click();
                  }}
                >
                  {uploadingKey === `${o.id}-letter` ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-3.5 h-3.5 mr-1" /> {t("dcrep.upload_letter")}</>}
                </Button>
              )}
            </div>
            {letter && (
              <a href={letter.signed_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline block truncate">{letter.file_name}</a>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> {t("dcrep.photos")} ({photos.length}/6)</span>
              {editable && o.id && photos.length < 6 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={uploadingKey === `${o.id}-photo`}
                  onClick={() => {
                    if (!photoInputRef.current) return;
                    photoInputRef.current.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file && o.id) uploadMedia(district, o.id, "photo", file);
                    };
                    photoInputRef.current.click();
                  }}
                >
                  {uploadingKey === `${o.id}-photo` ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-3.5 h-3.5 mr-1" /> {t("dcrep.upload_photo")}</>}
                </Button>
              )}
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative group">
                    <a href={p.signed_url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.signed_url} alt={p.file_name} className="w-full h-16 object-cover rounded-lg border" />
                    </a>
                    {editable && (
                      <button
                        onClick={() => deleteMedia(district, p.id)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <input type="file" ref={letterInputRef} className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" />
      <input type="file" ref={photoInputRef} className="hidden" accept="image/jpeg,image/png,image/webp" />

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <FileSignature className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("dcrep.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dcrep.subtitle")}</p>
        </div>
      </div>

      {ownData && (
        <div className="space-y-4">
          <p className="text-sm font-medium flex items-center gap-1"><MapPin className="w-4 h-4" /> {ownData.district}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ownData.offices.map((o) => officeCardJsx(o, ownData.district, true))}
          </div>
        </div>
      )}

      {rollup && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label={t("dcrep.total_districts")} value={rollup.summary.totalDistricts} icon={MapPin} borderColor="border-l-primary" loading={loading} />
            <MetricCard label={t("dcrep.fully_complete")} value={rollup.summary.fullyComplete} icon={CheckCircle2} borderColor="border-l-emerald-500" loading={loading} />
            {OFFICES.map((office) => (
              <MetricCard key={office} label={office} value={rollup.summary.officeGivenCount[office] ?? 0} icon={FileSignature} borderColor="border-l-blue-500" loading={loading} />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" /> {t("dcrep.by_district")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">District</th>
                      {OFFICES.map((office) => (
                        <th key={office} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{office}</th>
                      ))}
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rollup.districts.map((row) => (
                      <tr key={row.district} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-medium">{row.district}</td>
                        {row.offices.map((o) => (
                          <td key={o.office} className="px-3 py-2.5">
                            <Badge
                              variant="secondary"
                              className={o.status === "given" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}
                            >
                              {o.status === "given" ? t("dcrep.given") : t("dcrep.not_given")}
                            </Badge>
                          </td>
                        ))}
                        <td className="px-3 py-2.5">
                          <Button size="sm" variant="outline" onClick={() => openDistrictDetail(row.district)}>{t("dcrep.manage")}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && !ownData && !rollup && <EmptyState title={t("dcrep.no_district")} />}

      <Dialog open={!!dialogDistrict} onOpenChange={(open) => { if (!open) { setDialogDistrict(null); setDialogData(null); setEditingOffice(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {dialogDistrict}</DialogTitle>
          </DialogHeader>
          {dialogData ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {dialogData.offices.map((o) => officeCardJsx(o, dialogData.district, true))}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
