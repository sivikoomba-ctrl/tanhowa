"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Subscription {
  id: string;
  period: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  remarks: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  paid: { label: "Paid", color: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle2 },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Clock },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700 border-red-300", icon: AlertTriangle },
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  useEffect(() => {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((d) => setSubscriptions(d.subscriptions || []))
      .catch(() => {});
  }, []);

  const paid = subscriptions.filter((s) => s.status === "paid").length;
  const pending = subscriptions.filter((s) => s.status === "pending" || s.status === "overdue").length;
  const totalPaid = subscriptions
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">My Subscriptions</h1>
          <p className="text-sm text-muted-foreground">Track your membership subscription payments</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold text-green-600">{paid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Due</p>
            <p className="text-2xl font-bold text-amber-600">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-2xl font-bold">&#8377;{totalPaid.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription List */}
      {subscriptions.length === 0 ? (
        <div className="text-center py-12">
          <CreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No subscriptions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const config = statusConfig[sub.status] || statusConfig.pending;
            const Icon = config.icon;
            return (
              <Card key={sub.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className={`w-5 h-5 ${sub.status === "paid" ? "text-green-600" : sub.status === "overdue" ? "text-red-600" : "text-amber-600"}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{sub.period}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm font-medium">&#8377;{sub.amount?.toLocaleString("en-IN") || 0}</span>
                          {sub.due_date && (
                            <span className="text-xs text-muted-foreground">Due: {formatDate(sub.due_date)}</span>
                          )}
                        </div>
                        {sub.paid_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Paid on {formatDate(sub.paid_at)}
                            {sub.payment_method && ` via ${sub.payment_method}`}
                          </p>
                        )}
                        {sub.remarks && (
                          <p className="text-xs text-muted-foreground mt-0.5">{sub.remarks}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={config.color}>
                      {config.label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
