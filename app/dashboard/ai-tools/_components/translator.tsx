"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRightLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

type Direction = "en-ta" | "ta-en";

export function Translator() {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<Direction>("en-ta");
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();

  function toggleDirection() {
    setDirection((d) => d === "en-ta" ? "ta-en" : "en-ta");
    if (translation) {
      setText(translation);
      setTranslation(null);
    }
  }

  async function handleTranslate() {
    if (!text.trim()) return;
    setLoading(true);
    setTranslation(null);
    try {
      const res = await fetch("/api/ai-tools/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), direction }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Translation failed");
        return;
      }
      setTranslation(data.translation);
    } catch {
      toast.error("Translation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!translation) return;
    navigator.clipboard.writeText(translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sourceLang = direction === "en-ta" ? t("ai.english") : t("ai.tamil");
  const targetLang = direction === "en-ta" ? t("ai.tamil") : t("ai.english");

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-center gap-3">
        <span className="text-sm font-medium px-3 py-1 rounded-lg bg-blue-50 text-blue-700">{sourceLang}</span>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={toggleDirection}>
          <ArrowRightLeft size={14} />
        </Button>
        <span className="text-sm font-medium px-3 py-1 rounded-lg bg-green-50 text-green-700">{targetLang}</span>
      </div>

      <Textarea
        placeholder={direction === "en-ta" ? t("ai.enter_english") : t("ai.enter_tamil")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
      />

      <Button onClick={handleTranslate} disabled={loading || !text.trim()} className="w-full">
        {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> {t("ai.translating")}</> : t("ai.translate")}
      </Button>

      {translation && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-700">{targetLang}</span>
              <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
                {copied ? <><Check size={14} className="mr-1" /> {t("ai.copied")}</> : <><Copy size={14} className="mr-1" /> {t("common.copy")}</>}
              </Button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{translation}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
