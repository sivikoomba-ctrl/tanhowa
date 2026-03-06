"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { DISTRICT_NAMES, getBlocks } from "@/lib/tn-districts";

const occupationOptions = [
  "Horticultural Officer",
  "Assistant Director of Horticulture",
  "Deputy Director of Horticulture",
  "Joint Director of Horticulture",
  "Additional Director of Horticulture",
  "Retd. Horticultural Officer",
  "Retd. Assistant Director of Horticulture",
  "Retd. Deputy Director of Horticulture",
  "Retd. Joint Director of Horticulture",
  "Retd. Additional Director of Horticulture",
  "System Admin",
  "Others",
];

interface PostingDetails {
  regular_district: string;
  regular_block: string;
  special_duty_district: string;
  special_duty_block: string;
  special_duty_place: string;
  deputed_district: string;
  deputed_block: string;
}

interface Profile {
  name: string;
  email: string;
  phone: string;
  address: string;
  dob: string;
  occupation: string;
  occupation_other: string;
  posting_details: PostingDetails;
  social_links: { instagram: string; twitter: string; linkedin: string; whatsapp: string };
  photo_url: string;
}

const emptyPosting: PostingDetails = {
  regular_district: "", regular_block: "",
  special_duty_district: "", special_duty_block: "", special_duty_place: "",
  deputed_district: "", deputed_block: "",
};

function getDobLimits() {
  const now = new Date();
  return {
    minDate: new Date(now.getFullYear() - 100, now.getMonth(), now.getDate()).toISOString().split("T")[0],
    maxDate: new Date(now.getFullYear() - 18, now.getMonth(), now.getDate()).toISOString().split("T")[0],
  };
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { minDate, maxDate } = getDobLimits();

  useEffect(() => {
    fetch("/api/users/me").then((r) => r.json()).then((d) => {
      if (d.user) {
        const occ = d.user.occupation || "";
        const isPreset = occupationOptions.includes(occ);
        const sl = d.user.social_links || {};
        setProfile({
          ...d.user,
          dob: d.user.dob || "",
          occupation: isPreset ? occ : (occ ? "Others" : ""),
          occupation_other: isPreset ? "" : occ,
          posting_details: d.user.posting_details || emptyPosting,
          social_links: { instagram: sl.instagram || "", twitter: sl.twitter || "", linkedin: sl.linkedin || "", whatsapp: sl.whatsapp || "" },
          photo_url: d.user.photo_url || "",
        });
        if (d.user.photo_url) setPhotoPreview(d.user.photo_url);
      }
    }).catch(() => {});
  }, []);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && profile) { setProfile({ ...profile, photo_url: data.photo_url }); toast.success("Photo updated"); }
      else { toast.error(data.error || "Upload failed"); setPhotoPreview(profile?.photo_url || ""); }
    } catch { toast.error("Upload failed"); setPhotoPreview(profile?.photo_url || ""); }
    finally { setUploadingPhoto(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    try {
      const payload = { ...profile, occupation: profile.occupation === "Others" ? profile.occupation_other : profile.occupation };
      const res = await fetch("/api/users/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok) toast.success("Profile updated");
      else toast.error(data.error || "Failed to update profile");
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  }

  if (!profile) return <p className="text-muted-foreground">Loading...</p>;

  const regularBlocks = getBlocks(profile.posting_details.regular_district);
  const specialBlocks = getBlocks(profile.posting_details.special_duty_district);
  const deputedBlocks = getBlocks(profile.posting_details.deputed_district);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">My Profile</h1>

      {/* Photo Section */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 rounded-full bg-muted border-2 border-primary/20 flex items-center justify-center cursor-pointer overflow-hidden hover:border-primary/40 transition-colors" onClick={() => fileInputRef.current?.click()}>
          {photoPreview ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-muted-foreground" />}
          {uploadingPhoto && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>{photoPreview ? "Change Photo" : "Upload Photo"}</Button>
          <p className="text-xs text-muted-foreground mt-1">JPEG, PNG or WebP. Max 2MB.</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
      </div>

      <Card>
        <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div><Label>Email</Label><Input value={profile.email} disabled className="bg-muted" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Full Name *</Label><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value.toUpperCase() })} placeholder="FIRST NAME, LAST NAME (e.g., SIVAKUMAR K)" required className="uppercase" /></div>
              <div><Label>Phone *</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") })} required /></div>
              <div><Label>WhatsApp (if different)</Label><Input value={profile.social_links.whatsapp} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, whatsapp: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") } })} placeholder="+91 9876543210" /></div>
              <div><Label>Date of Birth</Label><Input type="date" value={profile.dob} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} min={minDate} max={maxDate} /></div>
              <div>
                <Label>Designation *</Label>
                <Select value={profile.occupation} onValueChange={(val) => setProfile({ ...profile, occupation: val, occupation_other: val !== "Others" ? "" : profile.occupation_other })}>
                  <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                  <SelectContent>{occupationOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {profile.occupation === "Others" && (
              <div><Label>Specify Designation *</Label><Input value={profile.occupation_other} onChange={(e) => setProfile({ ...profile, occupation_other: e.target.value })} placeholder="Enter your designation" required /></div>
            )}
            <div><Label>Address</Label><Textarea value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} rows={2} /></div>

            <h3 className="text-sm font-medium pt-2">Posting Details</h3>
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="text-xs font-semibold text-primary mb-2">Regular Posting</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>District</Label>
                    <Select value={profile.posting_details.regular_district} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_district: val, regular_block: "" } })}>
                      <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                      <SelectContent>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Block</Label>
                    <Select value={profile.posting_details.regular_block} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_block: val } })} disabled={!profile.posting_details.regular_district}>
                      <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                      <SelectContent>{regularBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-accent mb-2">Special Duty (if applicable)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>District</Label>
                    <Select value={profile.posting_details.special_duty_district} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_district: val, special_duty_block: "" } })}>
                      <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                      <SelectContent>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Block</Label>
                    <Select value={profile.posting_details.special_duty_block} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_block: val } })} disabled={!profile.posting_details.special_duty_district}>
                      <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                      <SelectContent>{specialBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label>Place (other than above)</Label><Input value={profile.posting_details.special_duty_place} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_place: e.target.value } })} placeholder="Place name" /></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-secondary mb-2">Deputed (if applicable)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>District</Label>
                    <Select value={profile.posting_details.deputed_district} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_district: val, deputed_block: "" } })}>
                      <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                      <SelectContent>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Block</Label>
                    <Select value={profile.posting_details.deputed_block} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_block: val } })} disabled={!profile.posting_details.deputed_district}>
                      <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                      <SelectContent>{deputedBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-medium pt-2">Social Links</h3>
            <div className="grid grid-cols-1 gap-3">
              <div><Label>Instagram</Label><Input value={profile.social_links.instagram} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, instagram: e.target.value } })} /></div>
              <div><Label>Twitter / X</Label><Input value={profile.social_links.twitter} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, twitter: e.target.value } })} /></div>
              <div><Label>LinkedIn</Label><Input value={profile.social_links.linkedin} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, linkedin: e.target.value } })} /></div>
            </div>

            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">{loading ? "Saving..." : "Save Changes"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
