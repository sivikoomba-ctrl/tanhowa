"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CloudSun, Droplets, Wind, Thermometer, Copy, Check, MapPin, Leaf } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { DISTRICT_NAMES, getBlocks, getSHFsByDistrict, type SHFarm } from "@/lib/tn-districts";

export function WeatherAdvisory() {
  const [district, setDistrict] = useState("");
  const [block, setBlock] = useState("");
  const [place, setPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [shf, setShf] = useState("");
  const [result, setResult] = useState<{ weather: string; advisory: string; farms: SHFarm[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();

  const blocks = district ? getBlocks(district) : [];
  const districtSHFs = district ? getSHFsByDistrict(district) : [];

  function handleDistrictChange(d: string) {
    setDistrict(d);
    setBlock("");
    setShf("");
    setResult(null);
  }

  async function handleGetAdvisory() {
    if (!district) { toast.error("Select a district"); return; }
    setLoading(true);
    try {
      const selectedSHF = districtSHFs.find(f => f.name === shf);
      const res = await fetch("/api/ai-tools/weather-advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district,
          block: block || undefined,
          place: place.trim() || undefined,
          shf: selectedSHF && selectedSHF.lat != null && selectedSHF.lng != null
            ? { name: selectedSHF.name, lat: selectedSHF.lat, lng: selectedSHF.lng }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to get advisory");
        return;
      }
      setResult({ ...data, farms: districtSHFs });
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">District *</label>
              <Select value={district} onValueChange={handleDistrictChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose district..." />
                </SelectTrigger>
                <SelectContent>
                  {DISTRICT_NAMES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Block</label>
              <Select value={block} onValueChange={setBlock} disabled={blocks.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={blocks.length > 0 ? "Choose block..." : "Select district first"} />
                </SelectTrigger>
                <SelectContent>
                  {blocks.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">State Horticulture Farm</label>
              <Select value={shf} onValueChange={setShf} disabled={districtSHFs.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={districtSHFs.length > 0 ? "Choose SHF..." : district ? "No SHF in this district" : "Select district first"} />
                </SelectTrigger>
                <SelectContent>
                  {districtSHFs.map((f) => (
                    <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Other Place (optional)</label>
              <Input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="e.g., Mango orchard, Market yard..."
              />
            </div>
          </div>
          <Button onClick={handleGetAdvisory} disabled={loading || !district} className="w-full">
            {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Getting advisory...</> : <><CloudSun size={16} className="mr-2" />Get Weather Advisory</>}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Weather & Advisory for {shf ? `${shf}, ` : ""}{block ? `${block}, ` : ""}{district}{place ? ` (${place})` : ""}
            </span>
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

          {result.farms.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Leaf size={16} className="text-green-600" />
                  <span className="text-sm font-semibold">Horticulture Farms in {district}</span>
                </div>
                <div className="space-y-1">
                  {result.farms.map((f) => (
                    <div key={f.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin size={12} className="text-green-500 shrink-0" />{f.name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" className="w-full" onClick={() => setResult(null)}>
            Check Another Location
          </Button>
        </div>
      )}
    </div>
  );
}
