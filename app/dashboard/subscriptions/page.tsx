"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet, CheckCircle2, Clock, AlertTriangle, Upload, QrCode, ImageIcon, Eye, Edit2 } from "lucide-react";
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
  payment_proof_url: string | null;
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
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

  // Payment details dialog
  const [detailsSub, setDetailsSub] = useState<Subscription | null>(null);
  const [detailsForm, setDetailsForm] = useState({ transaction_id: "", payment_method: "", remarks: "" });
  const [detailsSaving, setDetailsSaving] = useState(false);

  function load() {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((d) => setSubscriptions(d.subscriptions || []))
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        if (s.payment_qr_url) setQrUrl(s.payment_qr_url);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const paid = subscriptions.filter((s) => s.status === "paid").length;
  const pending = subscriptions.filter((s) => s.status === "pending" || s.status === "overdue").length;
  const totalPaid = subscriptions
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  function triggerUpload(subId: string) {
    setUploadTargetId(subId);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId) return;

    setUploading(uploadTargetId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subscription_id", uploadTargetId);

    try {
      const res = await fetch("/api/upload/payment-proof", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Payment proof uploaded! Please fill in payment details.");
        load();
        // Open details dialog for this subscription
        const sub = subscriptions.find((s) => s.id === uploadTargetId);
        if (sub) {
          setDetailsSub({ ...sub, payment_proof_url: data.payment_proof_url });
          setDetailsForm({
            transaction_id: sub.transaction_id || "",
            payment_method: sub.payment_method || "UPI",
            remarks: sub.remarks || "",
          });
        }
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    }
    setUploading(null);
    setUploadTargetId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!detailsSub) return;
    setDetailsSaving(true);

    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: detailsSub.id,
        transaction_id: detailsForm.transaction_id,
        payment_method: detailsForm.payment_method,
        remarks: detailsForm.remarks,
      }),
    });

    if (res.ok) {
      toast.success("Payment details saved. Admin will verify your payment.");
      setDetailsSub(null);
      load();
    } else {
      toast.error("Failed to save details");
    }
    setDetailsSaving(false);
  }

  function openEditDetails(sub: Subscription) {
    setDetailsSub(sub);
    setDetailsForm({
      transaction_id: sub.transaction_id || "",
      payment_method: sub.payment_method || "UPI",
      remarks: sub.remarks || "",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">My Subscriptions</h1>
          <p className="text-sm text-muted-foreground">Yearly membership subscription payments</p>
        </div>
      </div>

      {/* QR Code Payment Section */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="w-48 h-48 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center shrink-0 overflow-hidden">
              {qrUrl ? (
                <img src={qrUrl} alt="Payment QR Code" className="w-full h-full object-contain" />
              ) : (
                <>
                  <QrCode className="w-16 h-16 text-primary/40" />
                  <p className="text-xs text-muted-foreground mt-2 text-center px-2">QR Code will be updated soon</p>
                </>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-lg font-semibold mb-1">Pay via UPI / Bank Transfer</h2>
              <p className="text-sm text-muted-foreground mb-3">
                Scan the QR code to make your subscription payment. After payment, upload the payment screenshot and fill in the transaction details.
              </p>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 1:</span> Scan QR code or transfer to the account</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 2:</span> Take a screenshot of the payment confirmation</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 3:</span> Upload the screenshot and enter transaction details</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 4:</span> Admin will verify and confirm your payment</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Subscription List */}
      {subscriptions.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No subscriptions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const config = statusConfig[sub.status] || statusConfig.pending;
            const Icon = config.icon;
            const isUploading = uploading === sub.id;
            const hasProof = !!sub.payment_proof_url;
            return (
              <Card key={sub.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className={`w-5 h-5 ${sub.status === "paid" ? "text-green-600" : sub.status === "overdue" ? "text-red-600" : "text-amber-600"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{sub.period}</h3>
                          <Badge variant="outline" className={config.color}>
                            {config.label}
                          </Badge>
                          {hasProof && sub.status !== "paid" && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-[10px]">
                              Proof Uploaded
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm font-medium">&#8377;{sub.amount?.toLocaleString("en-IN") || 0}</span>
                          {sub.due_date && (
                            <span className="text-xs text-muted-foreground">Due: {formatDate(sub.due_date)}</span>
                          )}
                        </div>
                        {sub.transaction_id && (
                          <p className="text-xs text-muted-foreground mt-0.5">Transaction ID: {sub.transaction_id}</p>
                        )}
                        {sub.payment_method && (
                          <p className="text-xs text-muted-foreground mt-0.5">Payment Method: {sub.payment_method}</p>
                        )}
                        {sub.paid_at && (
                          <p className="text-xs text-green-600 mt-0.5">
                            Verified on {formatDate(sub.paid_at)}
                          </p>
                        )}
                        {hasProof && (
                          <button
                            onClick={() => setPreviewUrl(sub.payment_proof_url)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            <ImageIcon size={12} />
                            View payment proof
                          </button>
                        )}
                        {sub.remarks && (
                          <p className="text-xs text-muted-foreground mt-0.5">Note: {sub.remarks}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {(sub.status === "pending" || sub.status === "overdue") && (
                        <>
                          <Button
                            size="sm"
                            className={`h-8 text-xs ${!hasProof ? "bg-primary hover:bg-primary/90" : ""}`}
                            variant={hasProof ? "outline" : "default"}
                            onClick={() => triggerUpload(sub.id)}
                            disabled={isUploading}
                          >
                            {isUploading ? "Uploading..." : (
                              <>
                                <Upload size={12} className="mr-1" />
                                {hasProof ? "Re-upload" : "Upload Proof"}
                              </>
                            )}
                          </Button>
                          {hasProof && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-primary"
                              onClick={() => openEditDetails(sub)}
                            >
                              <Edit2 size={12} className="mr-1" />
                              Edit Details
                            </Button>
                          )}
                        </>
                      )}
                      {sub.status === "paid" && hasProof && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => setPreviewUrl(sub.payment_proof_url)}
                        >
                          <Eye size={12} className="mr-1" />
                          View Proof
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment Proof Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border">
              <img src={previewUrl} alt="Payment proof" className="w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Details Dialog */}
      <Dialog open={!!detailsSub} onOpenChange={(open) => !open && setDetailsSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          {detailsSub && (
            <>
              <p className="text-sm text-muted-foreground">
                Fill in or update your payment details for <span className="font-medium text-foreground">{detailsSub.period}</span> (&#8377;{detailsSub.amount?.toLocaleString("en-IN")}).
                Admin will verify based on these details and your uploaded proof.
              </p>
              {detailsSub.payment_proof_url && (
                <div className="rounded-lg overflow-hidden border max-h-40">
                  <img src={detailsSub.payment_proof_url} alt="Proof" className="w-full object-contain max-h-40" />
                </div>
              )}
              <form onSubmit={handleSaveDetails} className="space-y-4">
                <div>
                  <Label>Transaction / Reference ID *</Label>
                  <Input
                    value={detailsForm.transaction_id}
                    onChange={(e) => setDetailsForm({ ...detailsForm, transaction_id: e.target.value })}
                    placeholder="e.g. UPI ref number, bank ref ID"
                    required
                  />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Input
                    value={detailsForm.payment_method}
                    onChange={(e) => setDetailsForm({ ...detailsForm, payment_method: e.target.value })}
                    placeholder="e.g. UPI, Google Pay, Bank Transfer"
                  />
                </div>
                <div>
                  <Label>Remarks (optional)</Label>
                  <Input
                    value={detailsForm.remarks}
                    onChange={(e) => setDetailsForm({ ...detailsForm, remarks: e.target.value })}
                    placeholder="Any additional notes"
                  />
                </div>
                <Button type="submit" disabled={detailsSaving} className="w-full bg-primary hover:bg-primary/90">
                  {detailsSaving ? "Saving..." : "Save Payment Details"}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
