"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2, Camera, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function OcrTool() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error(t("ai.image_too_large"));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setText(null);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setText(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleExtract() {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-tools/ocr", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to extract text");
        return;
      }
      setText(data.text);
    } catch {
      toast.error("Failed to extract text");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
            <p className="text-sm font-medium">{t("ai.click_upload_image")}</p>
            <p className="text-xs">{t("ai.jpg_png_10mb")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="rounded-xl max-h-48 w-full object-contain bg-muted" />
          <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={clearFile}>
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

      {file && !text && (
        <Button onClick={handleExtract} disabled={loading} className="w-full">
          {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> {t("ai.extracting")}</> : <><Upload size={16} className="mr-2" /> {t("ai.extract_text")}</>}
        </Button>
      )}

      {text && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t("ai.extracted_text")}</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
              {copied ? <><Check size={14} className="mr-1" /> {t("ai.copied")}</> : <><Copy size={14} className="mr-1" /> {t("common.copy")}</>}
            </Button>
          </div>
          <Textarea value={text} readOnly rows={10} className="font-mono text-sm" />
          <Button variant="outline" className="w-full" onClick={clearFile}>
            {t("ai.try_another")}
          </Button>
        </div>
      )}
    </div>
  );
}
