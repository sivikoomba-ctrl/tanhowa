"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  Printer,
  Sparkles,
  Lock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface Section {
  id: string;
  order: number;
  title_en: string;
  title_ta: string;
  body_en: string;
  body_ta: string;
  title_ta_manual: boolean;
  body_ta_manual: boolean;
}

interface Doc {
  title_en: string;
  title_ta: string;
  intro_en: string;
  intro_ta: string;
  title_ta_manual: boolean;
  intro_ta_manual: boolean;
  sections: Section[];
  updated_at: string;
}

function newSection(order: number): Section {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    order,
    title_en: "",
    title_ta: "",
    body_en: "",
    body_ta: "",
    title_ta_manual: false,
    body_ta_manual: false,
  };
}

export default function WhyMinistryPage() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/why-ministry");
        if (res.status === 403) {
          setForbidden(true);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setDoc(data.doc);
      } catch {
        toast.error("Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (!doc) return;
    setSaving(true);
    try {
      const res = await fetch("/api/why-ministry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      });
      if (!res.ok) {
        toast.error("Save failed");
        return;
      }
      const data = await res.json();
      setDoc(data.doc);
      toast.success("Saved — Tamil auto-translated for non-manual fields");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateDoc(patch: Partial<Doc>) {
    setDoc((d) => (d ? { ...d, ...patch } : d));
  }

  function updateSection(id: string, patch: Partial<Section>) {
    setDoc((d) =>
      d
        ? { ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
        : d,
    );
  }

  function addSection() {
    setDoc((d) => (d ? { ...d, sections: [...d.sections, newSection(d.sections.length)] } : d));
  }

  function removeSection(id: string) {
    if (!confirm("Delete this section? This cannot be undone.")) return;
    setDoc((d) => (d ? { ...d, sections: d.sections.filter((s) => s.id !== id) } : d));
  }

  function moveSection(id: string, dir: -1 | 1) {
    setDoc((d) => {
      if (!d) return d;
      const idx = d.sections.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= d.sections.length) return d;
      const next = [...d.sections];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...d, sections: next.map((s, i) => ({ ...s, order: i })) };
    });
  }

  function resetSectionTitleTa(id: string) {
    updateSection(id, { title_ta: "", title_ta_manual: false });
  }

  function resetSectionBodyTa(id: string) {
    updateSection(id, { body_ta: "", body_ta_manual: false });
  }

  function printDoc() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Restricted</h2>
            <p className="text-sm text-muted-foreground">
              This section is reserved for the State-Admin only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <>
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-page {
            padding: 24px !important;
          }
        }
        .print-only {
          display: none;
        }
      `}</style>

      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header — edit controls (hidden on print) */}
        <div className="no-print flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Why Farmers Need a Ministry of Horticulture
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Private workspace — visible only to the State-Admin. Bilingual (EN/TA). Tamil
              auto-translates on save unless you mark a field as manual.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={printDoc}>
              <Printer className="w-4 h-4 mr-2" />
              Print / Save PDF
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* Title + intro */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle className="text-base">Title & Introduction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BilingualField
              labelEn="Title (English)"
              labelTa="Title (Tamil)"
              valueEn={doc.title_en}
              valueTa={doc.title_ta}
              manual={doc.title_ta_manual}
              onChangeEn={(v) => updateDoc({ title_en: v })}
              onChangeTa={(v) => updateDoc({ title_ta: v, title_ta_manual: true })}
              onResetTa={() => updateDoc({ title_ta: "", title_ta_manual: false })}
            />
            <BilingualField
              labelEn="Introduction (English)"
              labelTa="Introduction (Tamil)"
              valueEn={doc.intro_en}
              valueTa={doc.intro_ta}
              manual={doc.intro_ta_manual}
              onChangeEn={(v) => updateDoc({ intro_en: v })}
              onChangeTa={(v) => updateDoc({ intro_ta: v, intro_ta_manual: true })}
              onResetTa={() => updateDoc({ intro_ta: "", intro_ta_manual: false })}
              multiline
            />
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="no-print space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Reasons ({doc.sections.length})
            </h2>
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="w-4 h-4 mr-2" />
              Add Reason
            </Button>
          </div>

          {doc.sections.map((s, i) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="secondary">#{i + 1}</Badge>
                  {s.title_en || <span className="text-muted-foreground italic">Untitled</span>}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveSection(s.id, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveSection(s.id, 1)}
                    disabled={i === doc.sections.length - 1}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSection(s.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <BilingualField
                  labelEn="Reason title (English)"
                  labelTa="Reason title (Tamil)"
                  valueEn={s.title_en}
                  valueTa={s.title_ta}
                  manual={s.title_ta_manual}
                  onChangeEn={(v) => updateSection(s.id, { title_en: v })}
                  onChangeTa={(v) => updateSection(s.id, { title_ta: v, title_ta_manual: true })}
                  onResetTa={() => resetSectionTitleTa(s.id)}
                />
                <BilingualField
                  labelEn="Detail (English)"
                  labelTa="Detail (Tamil)"
                  valueEn={s.body_en}
                  valueTa={s.body_ta}
                  manual={s.body_ta_manual}
                  onChangeEn={(v) => updateSection(s.id, { body_en: v })}
                  onChangeTa={(v) => updateSection(s.id, { body_ta: v, body_ta_manual: true })}
                  onResetTa={() => resetSectionBodyTa(s.id)}
                  multiline
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Print-only rendering — bilingual, side-by-side */}
        <div className="print-only print-page">
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, margin: 0 }}>{doc.title_en}</h1>
            {doc.title_ta && (
              <h2 style={{ fontSize: 18, marginTop: 6, color: "#444" }}>{doc.title_ta}</h2>
            )}
          </div>
          {(doc.intro_en || doc.intro_ta) && (
            <div style={{ marginBottom: 20 }}>
              {doc.intro_en && <p style={{ marginBottom: 8 }}>{doc.intro_en}</p>}
              {doc.intro_ta && <p style={{ color: "#444" }}>{doc.intro_ta}</p>}
            </div>
          )}
          <ol style={{ paddingLeft: 20 }}>
            {doc.sections.map((s) => (
              <li key={s.id} style={{ marginBottom: 16 }}>
                <strong style={{ fontSize: 14 }}>{s.title_en}</strong>
                {s.title_ta && (
                  <div style={{ fontSize: 13, color: "#555" }}>{s.title_ta}</div>
                )}
                {s.body_en && (
                  <p style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>{s.body_en}</p>
                )}
                {s.body_ta && (
                  <p style={{ margin: "6px 0", whiteSpace: "pre-wrap", color: "#444" }}>
                    {s.body_ta}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p style={{ fontSize: 11, color: "#777", textAlign: "center", marginTop: 32 }}>
            TANHOWA — Tamil Nadu Horticultural Officers Welfare Association
          </p>
        </div>
      </div>
    </>
  );
}

interface BilingualFieldProps {
  labelEn: string;
  labelTa: string;
  valueEn: string;
  valueTa: string;
  manual: boolean;
  onChangeEn: (v: string) => void;
  onChangeTa: (v: string) => void;
  onResetTa: () => void;
  multiline?: boolean;
}

function BilingualField({
  labelEn,
  labelTa,
  valueEn,
  valueTa,
  manual,
  onChangeEn,
  onChangeTa,
  onResetTa,
  multiline,
}: BilingualFieldProps) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          {labelEn}
        </label>
        {multiline ? (
          <Textarea
            value={valueEn}
            onChange={(e) => onChangeEn(e.target.value)}
            rows={4}
            placeholder="Write in English…"
          />
        ) : (
          <Input
            value={valueEn}
            onChange={(e) => onChangeEn(e.target.value)}
            placeholder="Write in English…"
          />
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">{labelTa}</label>
          <div className="flex items-center gap-2">
            <Badge variant={manual ? "default" : "secondary"} className="text-[10px] py-0 px-1.5">
              {manual ? "Manual" : "Auto"}
            </Badge>
            {manual && (
              <button
                type="button"
                onClick={onResetTa}
                className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                title="Reset — Tamil will be auto-translated on next save"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
        </div>
        {multiline ? (
          <Textarea
            value={valueTa}
            onChange={(e) => onChangeTa(e.target.value)}
            rows={4}
            placeholder={manual ? "" : "Auto-translated on save"}
          />
        ) : (
          <Input
            value={valueTa}
            onChange={(e) => onChangeTa(e.target.value)}
            placeholder={manual ? "" : "Auto-translated on save"}
          />
        )}
      </div>
    </div>
  );
}
