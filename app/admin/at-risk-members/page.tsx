"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MetricCard } from "@/components/metric-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Lock,
  Loader2,
  RefreshCw,
  UserX,
  Clock,
  MapPin,
  Send,
  Users,
  Mail,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

type Band = "never_activated" | "lapsing" | "incomplete";

interface AtRiskMember {
  id: string;
  name: string;
  email: string | null;
  band: Band;
  lastActive: string | null;
  daysInactive: number | null;
  loginCount: number;
  district: string | null;
  hasTelegram: boolean;
  hasEmail: boolean;
  lastNudgedAt: string | null;
  onCooldown: boolean;
}

interface Counts {
  never_activated: number;
  lapsing: number;
  incomplete: number;
  total: number;
  onCooldown: number;
}

const BANDS: { key: Band; label: string; desc: string; icon: typeof UserX; tone: string; border: string }[] = [
  {
    key: "never_activated",
    label: "Never activated",
    desc: "Signed up but never actually used the portal",
    icon: UserX,
    tone: "text-red-600",
    border: "border-l-red-500",
  },
  {
    key: "lapsing",
    label: "Lapsing",
    desc: "Was active before, now quiet for 30+ days",
    icon: Clock,
    tone: "text-amber-600",
    border: "border-l-amber-500",
  },
  {
    key: "incomplete",
    label: "Incomplete profile",
    desc: "Recently active but no district set — unrouteable",
    icon: MapPin,
    tone: "text-yellow-600",
    border: "border-l-yellow-500",
  },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AtRiskMembersPage() {
  const [members, setMembers] = useState<AtRiskMember[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/at-risk");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setMembers(data.members || []);
      setCounts(data.counts || null);
      setSelected(new Set());
    } catch {
      toast.error("Failed to load at-risk members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const byBand = useMemo(() => {
    const m: Record<Band, AtRiskMember[]> = { never_activated: [], lapsing: [], incomplete: [] };
    for (const u of members) m[u.band].push(u);
    return m;
  }, [members]);

  // A member is nudgeable now if they have a channel and aren't on cooldown.
  function nudgeableNow(u: AtRiskMember) {
    return !u.onCooldown && (u.hasEmail || u.hasTelegram);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleBand(band: Band) {
    const ids = byBand[band].map((u) => u.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedMembers = useMemo(
    () => members.filter((m) => selected.has(m.id)),
    [members, selected]
  );
  const willSend = selectedMembers.filter(nudgeableNow).length;
  const willSkipCooldown = selectedMembers.filter((m) => m.onCooldown).length;
  const willSkipNoChannel = selectedMembers.filter((m) => !m.onCooldown && !m.hasEmail && !m.hasTelegram).length;

  async function doSend() {
    setSending(true);
    try {
      const res = await fetch("/api/admin/at-risk/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send");
        return;
      }
      toast.success(
        `Nudged ${data.sent}. Skipped ${data.skippedCooldown} on cooldown` +
          (data.skippedNoChannel ? `, ${data.skippedNoChannel} no contact` : "") +
          (data.failed ? `, ${data.failed} failed` : "") +
          "."
      );
      setConfirmOpen(false);
      await load();
    } catch {
      toast.error("Failed to send nudges");
    } finally {
      setSending(false);
    }
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
              At-Risk Members is reserved for the State-Admin only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 pb-28">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            At-Risk Members
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Approved members who need re-engagement, grouped by risk. Select members and send a
            personal nudge (email + Telegram with a &ldquo;what would bring you back&rdquo; link).
            Anyone nudged in the last 15 days is skipped automatically.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total at-risk" value={String(counts.total)} icon={Users} borderColor="border-l-primary" />
          <MetricCard label="Never activated" value={String(counts.never_activated)} icon={UserX} borderColor="border-l-red-500" />
          <MetricCard label="Lapsing" value={String(counts.lapsing)} icon={Clock} borderColor="border-l-amber-500" />
          <MetricCard label="Incomplete" value={String(counts.incomplete)} icon={MapPin} borderColor="border-l-yellow-500" />
        </div>
      )}

      {members.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No at-risk members right now — everyone is active with a complete profile. 🎉
          </CardContent>
        </Card>
      ) : (
        BANDS.map((b) => {
          const list = byBand[b.key];
          if (list.length === 0) return null;
          const allSelected = list.every((u) => selected.has(u.id));
          const Icon = b.icon;
          return (
            <Card key={b.key} className={`border-l-4 ${b.border}`}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className={`text-base flex items-center gap-2 ${b.tone}`}>
                      <Icon className="w-4 h-4" />
                      {b.label}
                      <Badge variant="secondary">{list.length}</Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{b.desc}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggleBand(b.key)}>
                    {allSelected ? "Clear all" : "Select all"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {list.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{u.name || "(no name)"}</span>
                          {u.onCooldown && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              nudged {fmtDate(u.lastNudgedAt)}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {u.email || "no email"}
                          {u.district ? ` · ${u.district}` : ""}
                          {u.band !== "never_activated" && u.daysInactive != null
                            ? ` · ${u.daysInactive}d inactive`
                            : ""}
                          {u.band === "never_activated" ? " · never logged in" : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                        {u.hasEmail && <Mail className="w-3.5 h-3.5" />}
                        {u.hasTelegram && <MessageCircle className="w-3.5 h-3.5 text-sky-500" />}
                      </div>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Sticky action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-background/95 backdrop-blur border-t z-20 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <span className="text-sm">
              <strong>{selected.size}</strong> selected
              {willSkipCooldown > 0 && (
                <span className="text-muted-foreground"> · {willSkipCooldown} on cooldown</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button size="sm" disabled={willSend === 0} onClick={() => setConfirmOpen(true)}>
                <Send className="w-4 h-4 mr-2" />
                Nudge selected
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send re-engagement nudge?</DialogTitle>
            <DialogDescription>
              This sends a personal email + Telegram message to the selected members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Will be nudged now</span>
              <strong className="text-primary">{willSend}</strong>
            </div>
            {willSkipCooldown > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Skipped — nudged in last 15 days</span>
                <span>{willSkipCooldown}</span>
              </div>
            )}
            {willSkipNoChannel > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Skipped — no email or Telegram</span>
                <span>{willSkipNoChannel}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={doSend} disabled={sending || willSend === 0}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send {willSend} nudge{willSend === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
