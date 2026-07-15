"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Instagram, Twitter, Linkedin, MessageCircle, Copy, FileDown, Search, Share2, Pencil, Users, Grid3x3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { downloadXlsx } from "@/lib/export-xlsx";
import { formatDateTime } from "@/lib/utils";

type Platform = "instagram" | "twitter" | "linkedin" | "whatsapp";

interface Member {
  id: string;
  name: string;
  district: string;
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
  whatsapp: string | null;
}

interface OfficialMetrics {
  followers: number;
  posts: number;
  updated_at: string;
  updated_by: string;
}

const PLATFORM_META: Record<Platform, { label: string; icon: typeof Instagram; color: string; href: (v: string) => string | null }> = {
  instagram: {
    label: "Instagram",
    icon: Instagram,
    color: "border-l-pink-500",
    href: (v) => (v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`),
  },
  twitter: {
    label: "Twitter / X",
    icon: Twitter,
    color: "border-l-sky-500",
    href: (v) => (v.startsWith("http") ? v : `https://twitter.com/${v.replace(/^@/, "")}`),
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    color: "border-l-blue-700",
    href: (v) => (v.startsWith("http") ? v : null),
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    color: "border-l-green-600",
    href: (v) => (v.startsWith("http") ? v : /^\+?\d{7,}$/.test(v.replace(/[\s-]/g, "")) ? `https://wa.me/${v.replace(/[^\d]/g, "")}` : null),
  },
};

// TANHOWA's own official accounts — pinned separately from member-submitted links.
const OFFICIAL_ACCOUNTS: { platform: Platform; handle: string; url: string }[] = [
  { platform: "instagram", handle: "@tanhowa1979", url: "https://www.instagram.com/tanhowa1979" },
];

function CopyCell({ value, platform }: { value: string | null; platform: Platform }) {
  if (!value) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const href = PLATFORM_META[platform].href(value);
  return (
    <div className="flex items-center gap-1.5 group">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate max-w-[160px]" title={value}>
          {value}
        </a>
      ) : (
        <span className="text-xs truncate max-w-[160px]" title={value}>{value}</span>
      )}
      <button
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary shrink-0"
        title="Copy"
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

export default function AdminSocialMediaPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<Record<Platform, number>>({ instagram: 0, twitter: 0, linkedin: 0, whatsapp: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | Platform>("all");
  const [officialMetrics, setOfficialMetrics] = useState<OfficialMetrics | null>(null);
  const [metricsEditOpen, setMetricsEditOpen] = useState(false);
  const [metricsForm, setMetricsForm] = useState({ followers: "", posts: "" });
  const [savingMetrics, setSavingMetrics] = useState(false);

  useEffect(() => {
    fetch("/api/admin/social-media")
      .then((r) => r.json())
      .then((d) => { if (!d.error) { setMembers(d.members || []); setSummary(d.summary || summary); setOfficialMetrics(d.official_metrics || null); } })
      .catch(() => toast.error("Failed to load social media data"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openMetricsEdit() {
    setMetricsForm({
      followers: officialMetrics ? String(officialMetrics.followers) : "",
      posts: officialMetrics ? String(officialMetrics.posts) : "",
    });
    setMetricsEditOpen(true);
  }

  async function saveMetrics() {
    const followers = Number(metricsForm.followers);
    const posts = Number(metricsForm.posts);
    if (!Number.isFinite(followers) || followers < 0 || !Number.isFinite(posts) || posts < 0) {
      toast.error("Enter valid follower and post counts");
      return;
    }
    setSavingMetrics(true);
    try {
      const res = await fetch("/api/admin/social-media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followers, posts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setOfficialMetrics(data.official_metrics);
      setMetricsEditOpen(false);
      toast.success("Metrics updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save metrics");
    } finally {
      setSavingMetrics(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.district.toLowerCase().includes(q);
      const matchesPlatform = platformFilter === "all" || !!m[platformFilter];
      return matchesSearch && matchesPlatform;
    });
  }, [members, search, platformFilter]);

  function copyList(platform: Platform) {
    const values = filtered.map((m) => m[platform]).filter(Boolean) as string[];
    if (values.length === 0) { toast.error(`No ${PLATFORM_META[platform].label} entries in the current view`); return; }
    navigator.clipboard.writeText(values.join("\n"));
    toast.success(`Copied ${values.length} ${PLATFORM_META[platform].label} handle${values.length === 1 ? "" : "s"}`);
  }

  function exportXlsx() {
    downloadXlsx(
      [{
        name: "Social Media",
        data: filtered.map((m) => ({
          Name: m.name,
          District: m.district,
          Instagram: m.instagram || "",
          "Twitter/X": m.twitter || "",
          LinkedIn: m.linkedin || "",
          WhatsApp: m.whatsapp || "",
        })),
      }],
      `TANHOWA_Social_Media_${new Date().toISOString().slice(0, 10)}`,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Share2 className="text-primary" /> Social Media</h1>
          <p className="text-muted-foreground text-sm mt-1">Member-submitted social links, in one copiable/exportable view.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportXlsx} disabled={filtered.length === 0}>
          <FileDown size={14} className="mr-1.5" /> Export Excel
        </Button>
      </div>

      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Official TANHOWA Accounts</h4>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={openMetricsEdit}>
              <Pencil size={11} className="mr-1" /> Update metrics
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {OFFICIAL_ACCOUNTS.map((acc) => {
              const meta = PLATFORM_META[acc.platform];
              const Icon = meta.icon;
              return (
                <div key={acc.platform + acc.handle} className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-background">
                  <Icon size={16} className="text-primary shrink-0" />
                  <a href={acc.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">
                    {acc.handle}
                  </a>
                  <button
                    onClick={() => { navigator.clipboard.writeText(acc.url); toast.success("Copied"); }}
                    className="text-muted-foreground hover:text-primary"
                    title="Copy link"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              );
            })}
            {officialMetrics ? (
              <>
                <div className="flex items-center gap-1.5 text-sm">
                  <Users size={14} className="text-muted-foreground" />
                  <span className="font-semibold">{officialMetrics.followers.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">followers</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Grid3x3 size={14} className="text-muted-foreground" />
                  <span className="font-semibold">{officialMetrics.posts.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">posts</span>
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No metrics recorded yet — click &ldquo;Update metrics&rdquo;.</span>
            )}
          </div>
          {officialMetrics && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Manually updated {formatDateTime(officialMetrics.updated_at)} by {officialMetrics.updated_by}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={metricsEditOpen} onOpenChange={setMetricsEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Instagram metrics</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            No live API is connected — enter the current counts from the @tanhowa1979 Instagram profile.
          </p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sm-followers">Followers</Label>
              <Input id="sm-followers" type="number" min={0} value={metricsForm.followers} onChange={(e) => setMetricsForm({ ...metricsForm, followers: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="sm-posts">Posts</Label>
              <Input id="sm-posts" type="number" min={0} value={metricsForm.posts} onChange={(e) => setMetricsForm({ ...metricsForm, posts: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetricsEditOpen(false)} disabled={savingMetrics}>Cancel</Button>
            <Button onClick={saveMetrics} disabled={savingMetrics}>{savingMetrics ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
          const meta = PLATFORM_META[p];
          return (
            <MetricCard key={p} label={meta.label} value={loading ? "…" : summary[p]} icon={meta.icon} borderColor={meta.color} loading={loading} />
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name or district…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as "all" | Platform)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
                  <SelectItem key={p} value={p}>{PLATFORM_META[p].label} only</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {platformFilter !== "all" && (
              <Button variant="outline" size="sm" onClick={() => copyList(platformFilter)} className="shrink-0">
                <Copy size={14} className="mr-1.5" /> Copy list ({filtered.length})
              </Button>
            )}
          </div>
          {(search || platformFilter !== "all") && (
            <p className="text-xs text-muted-foreground mt-2">{filtered.length} of {members.length} shown</p>
          )}
        </CardContent>
      </Card>

      {!loading && filtered.length === 0 ? (
        <EmptyState icon={Share2} title="No members found" description={search || platformFilter !== "all" ? "Try a different search or filter." : "No members have added any social links yet."} />
      ) : (
        <Card>
          <CardContent className="pt-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">District</th>
                  <th className="py-2 pr-3">Instagram</th>
                  <th className="py-2 pr-3">Twitter / X</th>
                  <th className="py-2 pr-3">LinkedIn</th>
                  <th className="py-2 pr-3">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : (
                  filtered.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium uppercase">{m.name || "—"}</td>
                      <td className="py-2 pr-3 text-xs">{m.district || "—"}</td>
                      <td className="py-2 pr-3"><CopyCell value={m.instagram} platform="instagram" /></td>
                      <td className="py-2 pr-3"><CopyCell value={m.twitter} platform="twitter" /></td>
                      <td className="py-2 pr-3"><CopyCell value={m.linkedin} platform="linkedin" /></td>
                      <td className="py-2 pr-3"><CopyCell value={m.whatsapp} platform="whatsapp" /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
