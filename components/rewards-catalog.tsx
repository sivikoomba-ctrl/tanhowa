"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Gift, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Reward {
  id: string;
  title: string;
  description: string;
  points_cost: number;
  image_url: string | null;
}

interface Redemption {
  id: string;
  reward_title: string;
  points_cost: number;
  status: "pending" | "approved" | "rejected";
  remarks: string;
  created_at: string;
}

export function RewardsCatalog() {
  const t = useT();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<Reward | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/rewards").then((r) => r.json()),
      fetch("/api/reward-redemptions").then((r) => r.json()),
    ])
      .then(([rewardsRes, redemptionsRes]) => {
        if (!rewardsRes.error) setRewards(rewardsRes.rewards || []);
        if (!redemptionsRes.error) {
          setRedemptions(redemptionsRes.redemptions || []);
          setAvailable(redemptionsRes.available_points || 0);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmRedeem() {
    if (!confirming) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reward-redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward_id: confirming.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("rewards.redeem_failed"));
      } else {
        toast.success(t("rewards.redeem_requested"));
        setConfirming(null);
        load();
      }
    } catch {
      toast.error(t("rewards.redeem_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Gift className="text-primary" size={22} /> {t("rewards.catalog_title")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("rewards.available_points")}: <b className="text-foreground">{available.toLocaleString("en-IN")}</b>
        </p>
      </div>

      {loading ? (
        <div className="h-32 animate-pulse bg-muted/40 rounded-xl" />
      ) : rewards.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("rewards.no_rewards")} description={t("rewards.no_rewards_desc")} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((r) => {
            const affordable = available >= r.points_cost;
            return (
              <Card key={r.id} className={!affordable ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{r.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {r.description && <p className="text-sm text-muted-foreground mb-3">{r.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-primary">{r.points_cost.toLocaleString("en-IN")} {t("rewards.points_unit")}</span>
                    <Button size="sm" disabled={!affordable} onClick={() => setConfirming(r)}>
                      {affordable ? t("rewards.redeem") : t("rewards.not_enough")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {redemptions.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">{t("rewards.my_redemptions")}</h3>
          <div className="space-y-2">
            {redemptions.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.reward_title}</p>
                  <p className="text-muted-foreground text-xs">{r.points_cost.toLocaleString("en-IN")} {t("rewards.points_unit")} · {new Date(r.created_at).toLocaleDateString("en-IN")}</p>
                  {r.status === "rejected" && r.remarks && <p className="text-red-600 text-xs mt-1">{r.remarks}</p>}
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rewards.confirm_title")}</DialogTitle>
          </DialogHeader>
          {confirming && (
            <div className="space-y-4">
              <p className="text-sm">
                {t("rewards.confirm_body")} <b>{confirming.title}</b> {t("rewards.confirm_for")} <b>{confirming.points_cost.toLocaleString("en-IN")} {t("rewards.points_unit")}</b>?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirming(null)} disabled={submitting}>{t("common.cancel")}</Button>
                <Button onClick={confirmRedeem} disabled={submitting}>{submitting ? t("common.submitting") : t("rewards.confirm_submit")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
