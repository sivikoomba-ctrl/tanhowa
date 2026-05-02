"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings, Building2, QrCode, Upload, Wallet, Users, Globe, Phone, Shield, Save, Loader2 } from "lucide-react";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings || {}))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  function set(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) toast.success("Settings saved!");
    else toast.error("Failed to save");
    setSaving(false);
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/qr-code", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        set("payment_qr_url", data.url);
        toast.success("QR code uploaded! Click Save to keep it.");
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setQrUploading(false);
      if (qrRef.current) qrRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings size={22} className="text-primary" />
          <h1 className="text-2xl font-bold">Site Settings</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={16} className="animate-spin mr-2" /> Saving...</> : <><Save size={16} className="mr-2" /> Save All Settings</>}
        </Button>
      </div>

      {/* Association Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 size={16} className="text-primary" />
            Association Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Association Name</Label>
              <Input value={settings.community_name || ""} onChange={(e) => set("community_name", e.target.value)} placeholder="TANHOWA" />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={settings.full_name || ""} onChange={(e) => set("full_name", e.target.value)} placeholder="Tamil Nadu Horticultural Officers Welfare Association" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tagline</Label>
              <Input value={settings.tagline || ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Horticulture Community" />
            </div>
            <div>
              <Label>Founded Year</Label>
              <Input value={settings.founded_year || ""} onChange={(e) => set("founded_year", e.target.value)} placeholder="e.g., 2019" />
            </div>
          </div>
          <div>
            <Label>About</Label>
            <Textarea value={settings.about || ""} onChange={(e) => set("about", e.target.value)} rows={3} placeholder="Brief description of the association..." />
          </div>
        </CardContent>
      </Card>

      {/* Contact Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone size={16} className="text-primary" />
            Contact Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Contact Email</Label>
              <Input value={settings.contact_email || ""} onChange={(e) => set("contact_email", e.target.value)} placeholder="tanhowaadmin@tanhowa.in" type="email" />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={settings.contact_phone || ""} onChange={(e) => set("contact_phone", e.target.value)} placeholder="9876543210" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Website</Label>
              <Input value={settings.website || ""} onChange={(e) => set("website", e.target.value)} placeholder="https://tanhowa.in" />
            </div>
            <div>
              <Label>WhatsApp Group Link</Label>
              <Input value={settings.whatsapp_link || ""} onChange={(e) => set("whatsapp_link", e.target.value)} placeholder="https://chat.whatsapp.com/..." />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Textarea value={settings.address || ""} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="Office address..." />
          </div>
        </CardContent>
      </Card>

      {/* Membership */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={16} className="text-primary" />
            Membership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Total Target Members</Label>
              <Input value={settings.total_target_members || ""} onChange={(e) => set("total_target_members", e.target.value)} placeholder="797" type="number" />
              <p className="text-[10px] text-muted-foreground mt-1">Used in the members count display on dashboard</p>
            </div>
            <div>
              <Label>Annual Subscription Amount (₹)</Label>
              <Input value={settings.annual_subscription || ""} onChange={(e) => set("annual_subscription", e.target.value)} placeholder="3000" type="number" />
            </div>
            <div>
              <Label>UATT Contribution Amount (₹)</Label>
              <Input value={settings.uatt_contribution || ""} onChange={(e) => set("uatt_contribution", e.target.value)} placeholder="3000" type="number" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment QR Code */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet size={16} className="text-primary" />
            Payment QR Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {settings.payment_qr_url ? (
              <div className="w-40 h-40 rounded-xl border overflow-hidden bg-white shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={settings.payment_qr_url} alt="Payment QR" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-40 h-40 rounded-xl border-2 border-dashed flex items-center justify-center text-muted-foreground shrink-0">
                <QrCode size={32} />
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                This QR code is shown to members on the Subscriptions page for making payments.
              </p>
              <input ref={qrRef} type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
              <Button variant="outline" size="sm" onClick={() => qrRef.current?.click()} disabled={qrUploading}>
                {qrUploading ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Uploading...</> : <><Upload size={14} className="mr-1.5" /> {settings.payment_qr_url ? "Change QR Code" : "Upload QR Code"}</>}
              </Button>
              <div>
                <Label className="text-xs">Bank Account Name</Label>
                <Input value={settings.bank_account_name || ""} onChange={(e) => set("bank_account_name", e.target.value)} placeholder="TANHOWA" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Bank Account Number</Label>
                <Input value={settings.bank_account_number || ""} onChange={(e) => set("bank_account_number", e.target.value)} placeholder="****2486" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">UPI ID</Label>
                <Input value={settings.upi_id || ""} onChange={(e) => set("upi_id", e.target.value)} placeholder="tanhowa@upi" className="mt-1" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photo Upload Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield size={16} className="text-primary" />
            Member Photo Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Photo Upload Guidelines (shown to members)</Label>
            <Textarea
              value={settings.photo_guidelines || ""}
              onChange={(e) => set("photo_guidelines", e.target.value)}
              rows={3}
              placeholder="Please upload a clear passport-size photo of yourself. No group photos, landscapes, or blurry images."
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm">AI Photo Validation</Label>
            <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe size={16} className="text-primary" />
            Social Links
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Telegram Group</Label>
              <Input value={settings.telegram_link || ""} onChange={(e) => set("telegram_link", e.target.value)} placeholder="https://t.me/tanhowa" />
            </div>
            <div>
              <Label>YouTube Channel</Label>
              <Input value={settings.youtube_link || ""} onChange={(e) => set("youtube_link", e.target.value)} placeholder="https://youtube.com/@tanhowa" />
            </div>
            <div>
              <Label>Facebook Page</Label>
              <Input value={settings.facebook_link || ""} onChange={(e) => set("facebook_link", e.target.value)} placeholder="https://facebook.com/tanhowa" />
            </div>
            <div>
              <Label>Instagram</Label>
              <Input value={settings.instagram_link || ""} onChange={(e) => set("instagram_link", e.target.value)} placeholder="https://instagram.com/tanhowa" />
            </div>
            <div>
              <Label>X (Twitter)</Label>
              <Input value={settings.x_link || ""} onChange={(e) => set("x_link", e.target.value)} placeholder="https://x.com/TANHOWA_1979" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button at bottom */}
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <><Loader2 size={16} className="animate-spin mr-2" /> Saving...</> : <><Save size={16} className="mr-2" /> Save All Settings</>}
        </Button>
      </div>
    </div>
  );
}
