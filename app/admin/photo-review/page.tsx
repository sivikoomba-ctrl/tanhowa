"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import {
  ImageIcon,
  Check,
  X,
  Lock,
  Unlock,
  Search,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

interface PhotoQuality {
  score?: number;
  verdict?: string;
  issues?: string[];
  reason?: string;
  auto_rejected?: boolean;
  scored_at?: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  photo_url: string;
  occupation?: string;
  posting_details?: { regular_district?: string; regular_block?: string } | null;
  photo_status: string;
  photo_locked: boolean;
  photo_reviewed_at?: string | null;
  photo_review_note?: string | null;
  photo_quality?: PhotoQuality | null;
  reviewer?: { name?: string } | null;
}

type Counts = { pending: number; approved: number; rejected: number; all: number };

const TABS: { key: keyof Counts; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All" },
];

function verdictColor(v?: string) {
  if (v === "poor") return "bg-red-100 text-red-700 border-red-200";
  if (v === "borderline") return "bg-amber-100 text-amber-700 border-amber-200";
  if (v === "good") return "bg-green-100 text-green-700 border-green-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function statusBadge(s: string, locked: boolean) {
  if (s === "approved")
    return (
      <Badge className="bg-green-600 text-white gap-1">
        {locked ? <Lock className="h-3 w-3" /> : <Check className="h-3 w-3" />} Approved
      </Badge>
    );
  if (s === "rejected") return <Badge className="bg-red-600 text-white">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export default function PhotoReviewPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, all: 0 });
  const [tab, setTab] = useState<keyof Counts>("pending");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<Member | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Lightbox / zoom state
  const [zoomFor, setZoomFor] = useState<Member | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  const openZoom = (m: Member) => {
    setZoomFor(m);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const closeZoom = () => setZoomFor(null);

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100));
      if (next === 1) setPan({ x: 0, y: 0 }); // recenter when fully zoomed out
      return next;
    });
  }, []);

  const onWheel = (e: React.WheelEvent) => zoomBy(e.deltaY < 0 ? 0.3 : -0.3);

  const onDoubleClick = () =>
    setZoom((z) => {
      const next = z > 1 ? 1 : 2;
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return; // panning only matters when zoomed in
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    setPan({
      x: drag.current.baseX + (e.clientX - drag.current.startX),
      y: drag.current.baseY + (e.clientY - drag.current.startY),
    });
  };
  const onPointerUp = () => {
    drag.current.active = false;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/photo-review?status=${tab}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setMembers(json.members || []);
      setCounts(json.counts || { pending: 0, approved: 0, rejected: 0, all: 0 });
    } catch {
      toast.error("Failed to load photos");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(m: Member, action: string, note?: string) {
    setBusy(m.id);
    try {
      const res = await fetch("/api/admin/photo-review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, action, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      if (action === "approve") toast.success(`${m.name}'s photo approved & locked`);
      else if (action === "reject")
        toast.success(json.emailed ? `Rejected — re-upload email sent to ${m.name}` : `${m.name}'s photo rejected`);
      else if (action === "unlock") toast.success(`${m.name}'s photo unlocked`);
      else toast.success("Done");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  function submitReject() {
    if (!rejectFor) return;
    const m = rejectFor;
    const note = rejectNote.trim() || undefined;
    setRejectFor(null);
    setRejectNote("");
    act(m, "reject", note);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? members.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          m.posting_details?.regular_district?.toLowerCase().includes(q)
      )
    : members;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2">
          <ImageIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Photo Review &amp; Lock</h1>
          <p className="text-sm text-muted-foreground">
            Approve clear photos (locks them) or reject blurry ones to ask members for a passport-size photo.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <Badge variant="secondary" className="ml-2">
              {counts[t.key]}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search name, email or district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-72 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No photos here"
          description={q ? "No photos match your search." : "Nothing in this list right now."}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((m) => {
            const qa = m.photo_quality;
            return (
              <Card key={m.id} className="overflow-hidden flex flex-col p-0">
                <button
                  type="button"
                  onClick={() => openZoom(m)}
                  aria-label={`Zoom into ${m.name}'s photo`}
                  className="group relative block aspect-square w-full bg-muted cursor-zoom-in"
                >
                  <Image
                    src={m.photo_url}
                    alt={m.name}
                    fill
                    sizes="(max-width:768px) 50vw, 25vw"
                    className="object-cover"
                    unoptimized
                  />
                  {/* hover hint that the photo is clickable */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <span className="rounded-full bg-black/60 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="absolute top-2 left-2">{statusBadge(m.photo_status, m.photo_locked)}</div>
                  {qa?.verdict && (
                    <div className="absolute bottom-2 left-2 right-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${verdictColor(
                          qa.verdict
                        )}`}
                      >
                        <Sparkles className="h-3 w-3" />
                        {qa.verdict}
                        {typeof qa.score === "number" ? ` · ${qa.score}` : ""}
                      </span>
                    </div>
                  )}
                </button>

                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.occupation || "—"}
                      {m.posting_details?.regular_district ? ` · ${m.posting_details.regular_district}` : ""}
                    </p>
                  </div>

                  {qa?.issues && qa.issues.length > 0 && (
                    <p className="text-[11px] text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{qa.issues.join(", ")}</span>
                    </p>
                  )}

                  {m.photo_review_note && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">“{m.photo_review_note}”</p>
                  )}
                  {m.reviewer?.name && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> {m.reviewer.name}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                    {m.photo_status !== "approved" && (
                      <Button
                        size="sm"
                        className="h-8 bg-green-600 hover:bg-green-700"
                        disabled={busy === m.id}
                        onClick={() => act(m, "approve")}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                    )}
                    {m.photo_status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={busy === m.id}
                        onClick={() => {
                          setRejectFor(m);
                          setRejectNote("");
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                    )}
                    {m.photo_locked && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={busy === m.id}
                        onClick={() => act(m, "unlock")}
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectFor?.name}&apos;s photo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The member keeps their current photo but is emailed a polite request to upload a clear,
            high-resolution passport-size photo. Add an optional reason (included in the email).
          </p>
          <Textarea
            placeholder="e.g. Photo is blurry / face not clearly visible (optional)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submitReject}>
              <X className="h-4 w-4 mr-1" /> Reject &amp; Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zoom / lightbox */}
      <Dialog open={!!zoomFor} onOpenChange={(o) => !o && closeZoom()}>
        <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
          {zoomFor && (
            <>
              <DialogHeader className="border-b px-4 py-3">
                <DialogTitle className="flex items-center justify-between gap-2 pr-8">
                  <span className="truncate">{zoomFor.name}</span>
                  {zoomFor.photo_quality?.verdict && (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${verdictColor(
                        zoomFor.photo_quality.verdict
                      )}`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {zoomFor.photo_quality.verdict}
                      {typeof zoomFor.photo_quality.score === "number"
                        ? ` · ${zoomFor.photo_quality.score}`
                        : ""}
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div
                className="relative select-none touch-none overflow-hidden bg-black"
                style={{ height: "70vh" }}
                onWheel={onWheel}
                onDoubleClick={onDoubleClick}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transition: drag.current.active ? "none" : "transform 0.15s ease-out",
                    cursor: zoom > 1 ? "grab" : "zoom-in",
                  }}
                >
                  <Image
                    src={zoomFor.photo_url}
                    alt={zoomFor.name}
                    fill
                    sizes="(max-width:768px) 100vw, 768px"
                    className="object-contain"
                    unoptimized
                  />
                </div>

                {/* zoom controls */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-black/60 p-1 backdrop-blur">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => zoomBy(-0.5)}
                    disabled={zoom <= MIN_ZOOM}
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center text-xs tabular-nums text-white">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => zoomBy(0.5)}
                    disabled={zoom >= MAX_ZOOM}
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t px-4 py-3">
                {zoomFor.photo_quality?.issues && zoomFor.photo_quality.issues.length > 0 && (
                  <p className="flex items-start gap-1 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{zoomFor.photo_quality.issues.join(", ")}</span>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {zoomFor.photo_status !== "approved" && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      disabled={busy === zoomFor.id}
                      onClick={() => {
                        const m = zoomFor;
                        closeZoom();
                        act(m, "approve");
                      }}
                    >
                      <Check className="mr-1 h-4 w-4" /> Approve
                    </Button>
                  )}
                  {zoomFor.photo_status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      disabled={busy === zoomFor.id}
                      onClick={() => {
                        const m = zoomFor;
                        closeZoom();
                        setRejectFor(m);
                        setRejectNote("");
                      }}
                    >
                      <X className="mr-1 h-4 w-4" /> Reject
                    </Button>
                  )}
                  <a
                    href={zoomFor.photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Open original
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
