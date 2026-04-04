"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

const SUGGESTIONS = [
  "Fertilizer schedule for mango trees",
  "Best tomato variety for Coimbatore district",
  "Soil preparation for turmeric cultivation",
  "Organic pest control for brinjal",
  "Jasmine flowering tips for Tamil Nadu climate",
  "Coconut palm nutrient deficiency symptoms",
];

export function CropAdviser() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();

  async function handleAsk(q?: string) {
    const text = q || question;
    if (!text.trim()) return;
    setLoading(true);
    setAdvice(null);
    try {
      const res = await fetch("/api/ai-tools/crop-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to get advice");
        return;
      }
      setAdvice(data.advice);
      if (q) setQuestion(q);
    } catch {
      toast.error("Failed to get advice");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!advice) return;
    navigator.clipboard.writeText(advice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Textarea
          placeholder={t("ai.ask_crop_placeholder")}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
        />
        <Button onClick={() => handleAsk()} disabled={loading || !question.trim()} className="w-full">
          {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> {t("ai.getting_advice")}</> : <><Send size={16} className="mr-2" /> {t("ai.ask")}</>}
        </Button>
      </div>

      {!advice && !loading && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">{t("ai.quick_suggestions")}</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleAsk(s)}
                className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {advice && (
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
                {copied ? <><Check size={14} className="mr-1" /> {t("ai.copied")}</> : <><Copy size={14} className="mr-1" /> {t("common.copy")}</>}
              </Button>
            </div>
            <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap">
              {advice}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
