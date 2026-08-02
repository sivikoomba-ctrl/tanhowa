"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Gift, Plus, Pencil, Trash2, Loader2, ClipboardList } from "lucide-react";

interface Reward {
  id: string;
  title: string;
  description: string;
  points_cost: number;
  active: boolean;
}

interface Redemption {
  id: string;
  reward_title: string;
  points_cost: number;
  status: "pending" | "approved" | "rejected";
  remarks: string;
  created_at: string;
  users?: { name: string; email: string };
}

const emptyForm = { id: "", title: "", description: "", points_cost: "", active: true };

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [remarksFor, setRemarksFor] = useState<Redemption | null>(null);
  const [remarksText, setRemarksText] = useState("");
  const [decideAction, setDecideAction] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/rewards?all=1").then((r) => r.json()),
      fetch("/api/reward-redemptions").then((r) => r.json()),
    ])
      .then(([rewardsRes, redemptionsRes]) => {
        setRewards(rewardsRes.rewards || []);
        setRedemptions(redemptionsRes.redemptions || []);
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form) return;
    if (!form.title.trim()) return toast.error("Title is required");
    const cost = parseInt(form.points_cost, 10);
    if (!Number.isFinite(cost) || cost <= 0) return toast.error("Points cost must be a positive number");

    setSaving(true);
    const isEdit = !!form.id;
    const res = await fetch("/api/rewards", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEdit ? { id: form.id } : {}),
        title: form.title.trim(),
        description: form.description.trim(),
        points_cost: cost,
        active: form.active,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(isEdit ? "Reward updated" : "Reward created");
      setForm(null);
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Failed to save reward");
    }
  }

  async function handleToggleActive(r: Reward) {
    setActionLoading(r.id);
    const res = await fetch("/api/rewards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    setActionLoading(null);
    if (res.ok) { toast.success(r.active ? "Reward hidden" : "Reward activated"); load(); }
    else toast.error("Failed to update reward");
  }

  async function handleDelete(r: Reward) {
    if (!confirm(`Delete "${r.title}" from the catalog? This cannot be undone.`)) return;
    setActionLoading(r.id);
    const res = await fetch(`/api/rewards?id=${r.id}`, { method: "DELETE" });
    setActionLoading(null);
    if (res.ok) { toast.success("Reward deleted"); load(); }
    else toast.error("Failed to delete reward");
  }

  function openDecide(r: Redemption, action: "approve" | "reject") {
    setRemarksFor(r);
    setDecideAction(action);
    setRemarksText("");
  }

  async function submitDecision() {
    if (!remarksFor || !decideAction) return;
    setSaving(true);
    const res = await fetch("/api/reward-redemptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: remarksFor.id, action: decideAction, remarks: remarksText.trim() }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(decideAction === "approve" ? "Redemption approved" : "Redemption rejected");
      setRemarksFor(null);
      setDecideAction(null);
      load();
    } else {
      toast.error(d.error || "Failed to update redemption");
    }
  }

  const pending = redemptions.filter((r) => r.status === "pending");
  const decided = redemptions.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="text-primary" /> Rewards Catalog</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage redeemable rewards and approve member redemption requests.</p>
        </div>
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">
            Redemption Requests {pending.length > 0 && <Badge className="ml-1.5 bg-amber-500">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-6 mt-4">
          {loading ? (
            <div className="h-32 animate-pulse bg-muted/40 rounded-xl" />
          ) : pending.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No pending requests" description="Member redemption requests will show up here." />
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4 flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{r.reward_title} <span className="text-sm text-muted-foreground">— {r.points_cost.toLocaleString("en-IN")} pts</span></p>
                      <p className="text-sm text-muted-foreground">{r.users?.name || "Member"} · {r.users?.email} · {new Date(r.created_at).toLocaleDateString("en-IN")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openDecide(r, "reject")}>Reject</Button>
                      <Button size="sm" onClick={() => openDecide(r, "approve")}>Approve</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {decided.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 text-sm text-muted-foreground">Decided</h3>
              <div className="space-y-2">
                {decided.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border p-3 text-sm">
                    <div>
                      <p className="font-medium">{r.reward_title} <span className="text-muted-foreground">— {r.points_cost.toLocaleString("en-IN")} pts</span></p>
                      <p className="text-muted-foreground text-xs">{r.users?.name || "Member"} · {new Date(r.created_at).toLocaleDateString("en-IN")}</p>
                      {r.remarks && <p className="text-xs mt-1">{r.remarks}</p>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setForm({ ...emptyForm })}><Plus size={16} className="mr-1.5" /> Add Reward</Button>
          </div>

          {loading ? (
            <div className="h-32 animate-pulse bg-muted/40 rounded-xl" />
          ) : rewards.length === 0 ? (
            <EmptyState icon={Gift} title="No rewards yet" description="Add your first reward for members to redeem." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rewards.map((r) => (
                <Card key={r.id} className={!r.active ? "opacity-60" : ""}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    <Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Active" : "Hidden"}</Badge>
                  </CardHeader>
                  <CardContent>
                    {r.description && <p className="text-sm text-muted-foreground mb-3">{r.description}</p>}
                    <p className="text-sm font-semibold text-primary mb-3">{r.points_cost.toLocaleString("en-IN")} pts</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => setForm({ id: r.id, title: r.title, description: r.description, points_cost: String(r.points_cost), active: r.active })}>
                        <Pencil size={14} className="mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleToggleActive(r)} disabled={actionLoading === r.id}>
                        {actionLoading === r.id ? <Loader2 size={14} className="animate-spin" /> : r.active ? "Hide" : "Activate"}
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDelete(r)} disabled={actionLoading === r.id}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit reward dialog */}
      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit Reward" : "Add Reward"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. TANHOWA Branded Cap" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional details" rows={3} />
              </div>
              <div>
                <Label>Points Cost</Label>
                <Input type="number" min={1} value={form.points_cost} onChange={(e) => setForm({ ...form, points_cost: e.target.value })} placeholder="e.g. 200" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve/reject remarks dialog */}
      <Dialog open={!!remarksFor} onOpenChange={(open) => { if (!open) { setRemarksFor(null); setDecideAction(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decideAction === "approve" ? "Approve" : "Reject"} Redemption</DialogTitle>
          </DialogHeader>
          {remarksFor && (
            <div className="space-y-4">
              <p className="text-sm">
                {remarksFor.users?.name || "This member"} — <b>{remarksFor.reward_title}</b> ({remarksFor.points_cost.toLocaleString("en-IN")} pts)
              </p>
              <div>
                <Label>Remarks {decideAction === "reject" && "(shown to the member)"}</Label>
                <Textarea value={remarksText} onChange={(e) => setRemarksText(e.target.value)} rows={3} placeholder={decideAction === "reject" ? "Why this couldn't be fulfilled..." : "Optional note"} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setRemarksFor(null); setDecideAction(null); }} disabled={saving}>Cancel</Button>
                <Button onClick={submitDecision} disabled={saving}>{saving ? "Saving..." : decideAction === "approve" ? "Confirm Approval" : "Confirm Rejection"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
