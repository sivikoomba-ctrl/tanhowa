"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileText, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function DocSummarizer() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10MB.");
      return;
    }
    setFile(f);
    setSummary(null);
  }

  function clearFile() {
    setFile(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSummarize() {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-tools/doc-summarize", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to summarize");
        return;
      }
      setSummary(data.summary);
    } catch {
      toast.error("Failed to summarize document");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {!file ? (
        <Card
          className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <CardContent className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <FileText size={24} />
            </div>
            <p className="text-sm font-medium">Click to upload a document</p>
            <p className="text-xs">PDF, images, or document photos (max 10MB)</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium truncate max-w-[250px]">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <Button variant="destructive" size="icon" className="h-7 w-7" onClick={clearFile}>
              <X size={14} />
            </Button>
          </CardContent>
        </Card>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {file && !summary && (
        <Button onClick={handleSummarize} disabled={loading} className="w-full">
          {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Summarizing...</> : <><Upload size={16} className="mr-2" />Summarize Document</>}
        </Button>
      )}

      {summary && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Summary</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
              {copied ? <><Check size={14} className="mr-1" />{t("ai.copied")}</> : <><Copy size={14} className="mr-1" />{t("common.copy")}</>}
            </Button>
          </div>
          <Card>
            <CardContent className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {summary}
            </CardContent>
          </Card>
          <Button variant="outline" className="w-full" onClick={clearFile}>
            {t("ai.try_another")}
          </Button>
        </div>
      )}
    </div>
  );
}
