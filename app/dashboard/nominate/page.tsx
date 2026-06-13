"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import { ClipboardCheck, MapPin, Vote, CheckCircle2, Clock, XCircle } from "lucide-react";

interface NominatePost {
  id: string;
  title: string;
  description: string | null;
  district: string | null;
  status: string;
}

interface MyNomination {
  id: string;
  post_id: string;
  status: string;
  statement: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  nominated: { label: "Nomination submitted", cls: "bg-amber-50 text-amber-700 border-amber-300", icon: Clock },
  approved: { label: "Approved", cls: "bg-green-50 text-green-700 border-green-300", icon: CheckCircle2 },
  withdrawn: { label: "Withdrawn", cls: "bg-gray-100 text-gray-500 border-gray-300", icon: XCircle },
};

export default function NominatePage() {
  const [posts, setPosts] = useState<NominatePost[]>([]);
  const [nominations, setNominations] = useState<MyNomination[]>([]);
  const [memberName, setMemberName] = useState("");
  const [memberDistrict, setMemberDistrict] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dialogPost, setDialogPost] = useState<NominatePost | null>(null);
  const [statement, setStatement] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/elections/nominate");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load");
      setPosts(d.posts || []);
      setNominations(d.nominations || []);
      setMemberName(d.memberName || "");
      setMemberDistrict(d.memberDistrict || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load nominations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const nominationFor = (postId: string) =>
    nominations.find((n) => n.post_id === postId && n.status !== "withdrawn");

  const submitNomination = async () => {
    if (!dialogPost) return;
    setSaving(true);
    try {
      const res = await fetch("/api/elections/nominate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: dialogPost.id, statement }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to submit");
      toast.success("Nomination submitted — pending official approval");
      setDialogPost(null);
      setStatement("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit nomination");
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (nom: MyNomination, postTitle: string) => {
    if (!confirm(`Withdraw your nomination for "${postTitle}"?`)) return;
    try {
      const res = await fetch(`/api/elections/nominate?id=${nom.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to withdraw");
      toast.success("Nomination withdrawn");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to withdraw");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="text-primary" size={24} /> Election Nomination
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nominate yourself for positions currently open for nomination. Your name and district are taken from your
          profile, and your nomination goes to the State officials for approval.
        </p>
      </div>

      {!loading && (
        <Card className="rounded-2xl bg-muted/30">
          <CardContent className="py-3 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground">Nominating as</span>
            <span className="font-medium">{memberName || "—"}</span>
            {memberDistrict && (
              <Badge variant="outline" className="text-xs bg-secondary/10 text-secondary-foreground border-secondary/30">
                <MapPin size={11} className="mr-0.5" /> {memberDistrict}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-24 animate-pulse bg-muted rounded-xl" /></CardContent></Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Vote}
          title="No positions open for nomination"
          description="There are no posts open for nomination right now. Please check back when the nomination window is open."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((post) => {
            const nom = nominationFor(post.id);
            const meta = nom ? STATUS_META[nom.status] : null;
            const StatusIcon = meta?.icon;
            return (
              <Card key={post.id} className="rounded-2xl">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{post.title}</h3>
                    {post.district && (
                      <Badge variant="outline" className="text-xs bg-secondary/10 text-secondary-foreground border-secondary/30">
                        <MapPin size={11} className="mr-0.5" /> {post.district}
                      </Badge>
                    )}
                  </div>
                  {post.description && <p className="text-sm text-muted-foreground mt-1">{post.description}</p>}

                  {nom && meta ? (
                    <div className="mt-4 space-y-2">
                      <Badge variant="outline" className={`text-xs ${meta.cls}`}>
                        {StatusIcon && <StatusIcon size={12} className="mr-1" />} {meta.label}
                      </Badge>
                      {nom.statement && <p className="text-xs text-muted-foreground italic">“{nom.statement}”</p>}
                      {nom.status === "nominated" && (
                        <div>
                          <Button variant="outline" size="sm" className="rounded-xl text-destructive" onClick={() => withdraw(nom, post.title)}>
                            Withdraw nomination
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <Button size="sm" className="rounded-xl" onClick={() => { setStatement(""); setDialogPost(post); }}>
                        <ClipboardCheck size={14} className="mr-1" /> Nominate Myself
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Nomination dialog */}
      <Dialog open={!!dialogPost} onOpenChange={(o) => { if (!o) { setDialogPost(null); setStatement(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nominate for {dialogPost?.title}{dialogPost?.district ? ` — ${dialogPost.district}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are nominating <span className="font-medium text-foreground">{memberName}</span>
              {memberDistrict ? ` (${memberDistrict})` : ""}. This will be sent to the State officials for approval.
            </p>
            <div className="space-y-2">
              <Label>Statement (optional)</Label>
              <Textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="Why you're standing for this position, your vision, experience…"
                rows={4}
              />
            </div>
            <Button onClick={submitNomination} disabled={saving} className="w-full rounded-xl">
              {saving ? "Submitting…" : "Submit Nomination"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
