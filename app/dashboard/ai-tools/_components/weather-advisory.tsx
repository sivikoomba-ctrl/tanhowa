"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CloudSun, Droplets, Wind, Thermometer, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { DISTRICT_NAMES } from "@/lib/tn-districts";

export function WeatherAdvisory() {
  const [district, setDistrict] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ weather: string; advisory: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();

  async function handleGetAdvisory() {
    if (!district) { toast.error("Select a district"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/ai-tools/weather-advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to get advisory");
        return;
      }
      setResult(data);
    } catch {
      toast.error("Failed to get weather advisory");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(`Weather:\n${result.weather}\n\nAdvisory:\n${result.advisory}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Select District</label>
            <Select value={district} onValueChange={setDistrict}>
              <SelectTrigger>
                <SelectValue placeholder="Choose your district..." />
              </SelectTrigger>
              <SelectContent>
                {DISTRICT_NAMES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGetAdvisory} disabled={loading || !district} className="w-full">
            {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Getting advisory...</> : <><CloudSun size={16} className="mr-2" />Get Weather Advisory</>}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Weather & Advisory for {district}</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
              {copied ? <><Check size={14} className="mr-1" />{t("ai.copied")}</> : <><Copy size={14} className="mr-1" />{t("common.copy")}</>}
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Thermometer size={16} className="text-orange-500" />
                <Droplets size={16} className="text-blue-500" />
                <Wind size={16} className="text-gray-500" />
                <span className="text-sm font-semibold">Current Weather</span>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{result.weather}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CloudSun size={16} className="text-primary" />
                <span className="text-sm font-semibold">Agriculture Advisory</span>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{result.advisory}</p>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={() => setResult(null)}>
            Check Another District
          </Button>
        </div>
      )}
    </div>
  );
}
