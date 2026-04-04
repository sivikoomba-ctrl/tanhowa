"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface PestResult {
  pest_name: string;
  tamil_name: string | null;
  crop: string;
  severity: string;
  confidence: string;
  treatment: string;
  prevention: string;
  additional_notes: string | null;
}

export function PestIdentifier() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PestResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error(t("ai.image_too_large"));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleIdentify() {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-tools/pest-identify", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to analyze");
        return;
      }
      setResult(data);
    } catch {
      toast.error("Failed to analyze image");
    } finally {
      setLoading(false);
    }
  }

  const severityColor: Record<string, string> = {
    mild: "bg-yellow-100 text-yellow-700",
    moderate: "bg-orange-100 text-orange-700",
    severe: "bg-red-100 text-red-700",
    none: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {!preview ? (
        <Card
          className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <CardContent className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Camera size={24} />
            </div>
            <p className="text-sm font-medium">{t("ai.click_upload_plant")}</p>
            <p className="text-xs">{t("ai.jpg_png_10mb")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="rounded-xl max-h-64 w-full object-contain bg-muted" />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={clearFile}
          >
            <X size={14} />
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {file && !result && (
        <Button onClick={handleIdentify} disabled={loading} className="w-full">
          {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> {t("ai.analyzing")}</> : <><Upload size={16} className="mr-2" /> {t("ai.identify_pest")}</>}
        </Button>
      )}

      {result && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-lg">{result.pest_name}</h3>
                {result.tamil_name && <p className="text-sm text-muted-foreground">{result.tamil_name}</p>}
              </div>
              <div className="flex gap-2">
                <Badge className={severityColor[result.severity] || "bg-muted"}>{result.severity}</Badge>
                <Badge variant="outline">{result.confidence} {t("ai.confidence")}</Badge>
              </div>
            </div>

            <div className="text-sm space-y-3">
              <div>
                <p className="font-medium text-muted-foreground mb-1">{t("ai.crop_label")}</p>
                <p>{result.crop}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">{t("ai.treatment")}</p>
                <p className="whitespace-pre-wrap">{result.treatment}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">{t("ai.prevention")}</p>
                <p className="whitespace-pre-wrap">{result.prevention}</p>
              </div>
              {result.additional_notes && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">{t("ai.additional_notes")}</p>
                  <p className="whitespace-pre-wrap">{result.additional_notes}</p>
                </div>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={clearFile}>
              {t("ai.try_another")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
