"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Plus, X, AlertCircle } from "lucide-react";
import { DISTRICT_NAMES, getBlocks, TN_HORTICULTURE_FARMS } from "@/lib/tn-districts";

const titleOptions = ["", "Dr."];

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

function parseTitleFromName(name: string): { title: string; firstName: string; lastName: string } {
  const upper = name.trim().toUpperCase();
  for (const t of titleOptions) {
    if (t && upper.startsWith(t.toUpperCase())) {
      const rest = name.trim().substring(t.length).trim();
      const parts = rest.split(/\s+/);
      return { title: t, firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
    }
  }
  const parts = name.trim().split(/\s+/);
  return { title: "", firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
}

interface PostingDetails {
  regular_district: string;
  regular_block: string;
  special_duty_district: string;
  special_duty_block: string;
  special_duty_place: string;
  special_designation: string;
  special_farm: string;
  deputed_district: string;
  deputed_block: string;
}

interface Profile {
  title: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  office_address: string;
  dob: string;
  occupation: string;
  occupation_other: string;
  posting_details: PostingDetails;
  social_links: { instagram: string; twitter: string; linkedin: string; whatsapp: string };
  gender: string;
  qualification: string;
  specialisation: string;
  skill_sets: { typing_tamil: string; typing_english: string; ms_word: string; ms_excel: string; ms_powerpoint: string; computer_operation: string; mobile_operation: string; zoom_app: string; other_apps: string };
  languages: { tamil_read: boolean; tamil_write: boolean; tamil_speak: boolean; english_read: boolean; english_write: boolean; english_speak: boolean; other: string };
  current_interest_area: string;
  experience: { institution: string; from: string; to: string; designation: string }[];
  date_of_joining: string;
  photo_url: string;
}

const emptyPosting: PostingDetails = {
  regular_district: "", regular_block: "",
  special_duty_district: "", special_duty_block: "", special_duty_place: "",
  special_designation: "", special_farm: "",
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
  const [nudge, setNudge] = useState<{ fields: string[]; message: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { minDate, maxDate } = getDobLimits();

  useEffect(() => {
    fetch("/api/users/me").then((r) => r.json()).then((d) => {
      if (d.user) {
        const occ = d.user.occupation || "";
        const isPreset = occupationOptions.includes(occ);
        const sl = d.user.social_links || {};
        const parsed = parseTitleFromName(d.user.name || "");
        setProfile({
          ...d.user,
          title: parsed.title,
          first_name: parsed.firstName,
          last_name: parsed.lastName,
          dob: d.user.dob || "",
          office_address: d.user.office_address || "",
          occupation: isPreset ? occ : (occ ? "Others" : ""),
          occupation_other: isPreset ? "" : occ,
          posting_details: d.user.posting_details || emptyPosting,
          social_links: { instagram: sl.instagram || "", twitter: sl.twitter || "", linkedin: sl.linkedin || "", whatsapp: sl.whatsapp || "" },
          gender: sl.gender || "",
          qualification: sl.qualification || "",
          specialisation: sl.specialisation || "",
          skill_sets: (typeof sl.skill_sets === "object" && sl.skill_sets) ? sl.skill_sets : { typing_tamil: "", typing_english: "", ms_word: "", ms_excel: "", ms_powerpoint: "", computer_operation: "", mobile_operation: "", zoom_app: "", other_apps: "" },
          languages: (typeof sl.languages === "object" && sl.languages) ? sl.languages : { tamil_read: false, tamil_write: false, tamil_speak: false, english_read: false, english_write: false, english_speak: false, other: "" },
          current_interest_area: sl.current_interest_area || "",
          experience: Array.isArray(sl.experience) ? sl.experience : [],
          date_of_joining: sl.date_of_joining || "",
          photo_url: d.user.photo_url || "",
        });
        if (d.user.photo_url) setPhotoPreview(d.user.photo_url);
        if (d.user.profile_nudge) setNudge(d.user.profile_nudge);
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
      const nameWithoutTitle = `${profile.first_name.trim()} ${profile.last_name.trim()}`.toUpperCase();
      const fullName = profile.title ? `${profile.title} ${nameWithoutTitle}` : nameWithoutTitle;
      const socialLinksWithExtras = {
        ...profile.social_links,
        gender: profile.gender || "",
        qualification: profile.qualification || "",
        specialisation: profile.specialisation || "",
        skill_sets: profile.skill_sets || "",
        languages: profile.languages || {},
        current_interest_area: profile.current_interest_area || "",
        experience: profile.experience || [],
        date_of_joining: profile.date_of_joining || "",
      };
      const payload = { ...profile, name: fullName, occupation: profile.occupation === "Others" ? profile.occupation_other : profile.occupation, social_links: socialLinksWithExtras };
      const res = await fetch("/api/users/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok) { toast.success("Profile updated"); setNudge(null); }
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

      {nudge && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Admin has requested you to update your profile</p>
            {nudge.message && <p className="text-sm text-amber-700 mt-1">{nudge.message}</p>}
            <p className="text-sm text-amber-600 mt-1">
              Please update: <span className="font-medium">{nudge.fields.join(", ")}</span>
            </p>
          </div>
        </div>
      )}

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
            <div>
              <Label>Title (if applicable)</Label>
              <Select value={profile.title || "none"} onValueChange={(val) => setProfile({ ...profile, title: val === "none" ? "" : val })}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {titleOptions.filter(Boolean).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Select Dr. or Prof. if you hold a PhD or equivalent</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>First Name *</Label><Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value.toUpperCase() })} placeholder="e.g., SIVAKUMAR" required className="uppercase" /></div>
              <div><Label>Last Name / Initial *</Label><Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value.toUpperCase() })} placeholder="e.g., K" required className="uppercase" /></div>
              <div><Label>Phone *</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") })} required /></div>
              <div><Label>WhatsApp (if different)</Label><Input value={profile.social_links.whatsapp} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, whatsapp: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") } })} placeholder="+91 9876543210" /></div>
              <div><Label>Date of Birth</Label><Input type="date" value={profile.dob} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} min={minDate} max={maxDate} /></div>
              <div>
                <Label>Gender</Label>
                <Select value={profile.gender || "none"} onValueChange={(val) => setProfile({ ...profile, gender: val === "none" ? "" : val })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date of Joining (Service)</Label><Input type="date" value={profile.date_of_joining} onChange={(e) => setProfile({ ...profile, date_of_joining: e.target.value })} /></div>
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
            <h3 className="text-sm font-medium pt-2">Qualification & Skills (optional)</h3>
            <div className="grid grid-cols-1 gap-3">
              <div><Label>Qualification</Label><Input value={profile.qualification} onChange={(e) => setProfile({ ...profile, qualification: e.target.value })} placeholder="e.g., M.Sc. (Horticulture), Ph.D." /></div>
              <div><Label>Specialisation</Label><Input value={profile.specialisation} onChange={(e) => setProfile({ ...profile, specialisation: e.target.value })} placeholder="e.g., Fruit Crops, Floriculture" /></div>
              <div>
                <Label>Skill Sets</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {([
                    ["typing_tamil", "Typing - Tamil"],
                    ["typing_english", "Typing - English"],
                    ["ms_word", "MS Word"],
                    ["ms_excel", "MS Excel"],
                    ["ms_powerpoint", "MS PowerPoint"],
                    ["computer_operation", "Computer Operation"],
                    ["mobile_operation", "Mobile Operation (Smart Phone)"],
                    ["zoom_app", "Zoom App"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-sm min-w-[120px]">{label}</span>
                      <Select value={profile.skill_sets[key] || ""} onValueChange={(v) => setProfile({ ...profile, skill_sets: { ...profile.skill_sets, [key]: v } })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select level" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="Beginner">Beginner</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Expert">Expert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Label>Other Apps you are well versed in</Label>
                  <Input value={profile.skill_sets.other_apps || ""} onChange={(e) => setProfile({ ...profile, skill_sets: { ...profile.skill_sets, other_apps: e.target.value } })} placeholder="e.g., Google Sheets, Canva, WhatsApp Business" />
                </div>
              </div>
            </div>
            <div>
              <Label>Language Skills</Label>
              <div className="mt-1 space-y-2">
                {([
                  ["Tamil", "tamil"],
                  ["English", "english"],
                ] as const).map(([lang, prefix]) => (
                  <div key={prefix} className="flex items-center gap-4">
                    <span className="text-sm min-w-[70px] font-medium">{lang}</span>
                    {(["Read", "Write", "Speak"] as const).map((ability) => {
                      const key = `${prefix}_${ability.toLowerCase()}` as keyof typeof profile.languages;
                      return (
                        <label key={ability} className="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="checkbox" checked={!!profile.languages[key]} onChange={(e) => setProfile({ ...profile, languages: { ...profile.languages, [key]: e.target.checked } })} className="rounded border-gray-300 text-primary focus:ring-primary" />
                          {ability}
                        </label>
                      );
                    })}
                  </div>
                ))}
                <div className="mt-1">
                  <Label className="text-xs">Other languages &amp; abilities</Label>
                  <Input value={profile.languages.other || ""} onChange={(e) => setProfile({ ...profile, languages: { ...profile.languages, other: e.target.value } })} placeholder="e.g., Hindi - Read, Write, Speak; Telugu - Speak" />
                </div>
              </div>
            </div>
            <div><Label>Current Interest Area</Label><Input value={profile.current_interest_area} onChange={(e) => setProfile({ ...profile, current_interest_area: e.target.value })} placeholder="e.g., Organic Farming, Precision Agriculture, Seed Technology" /></div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Experience</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setProfile({ ...profile, experience: [...profile.experience, { institution: "", from: "", to: "", designation: "" }] })}>
                  <Plus size={14} className="mr-1" /> Add
                </Button>
              </div>
              {profile.experience.map((exp, i) => {
                let duration = "";
                if (exp.from && exp.to) {
                  const f = new Date(exp.from);
                  const t = new Date(exp.to);
                  const months = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
                  const yrs = Math.floor(months / 12);
                  const mos = months % 12;
                  duration = yrs > 0 ? `${yrs} yr${yrs > 1 ? "s" : ""}${mos > 0 ? ` ${mos} mo${mos > 1 ? "s" : ""}` : ""}` : `${mos} mo${mos > 1 ? "s" : ""}`;
                }
                const updateExp = (field: string, value: string) => {
                  const updated = [...profile.experience];
                  updated[i] = { ...updated[i], [field]: value };
                  setProfile({ ...profile, experience: updated });
                };
                return (
                  <div key={i} className="mt-2 rounded-lg border p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold text-muted-foreground">#{i + 1}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setProfile({ ...profile, experience: profile.experience.filter((_, j) => j !== i) })}>
                        <X size={14} />
                      </Button>
                    </div>
                    <div><Label className="text-xs">Company / Institution</Label><Input value={exp.institution} onChange={(e) => updateExp("institution", e.target.value)} placeholder="e.g., Department of Horticulture, TN" /></div>
                    <div><Label className="text-xs">Designation</Label><Input value={exp.designation} onChange={(e) => updateExp("designation", e.target.value)} placeholder="e.g., Horticultural Officer" /></div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div><Label className="text-xs">From</Label><Input type="month" value={exp.from} onChange={(e) => updateExp("from", e.target.value)} /></div>
                      <div><Label className="text-xs">To</Label><Input type="month" value={exp.to} onChange={(e) => updateExp("to", e.target.value)} /></div>
                      {duration && <div className="flex items-end"><span className="text-sm font-medium text-primary pb-2">{duration}</span></div>}
                    </div>
                  </div>
                );
              })}
              {profile.experience.length === 0 && <p className="text-xs text-muted-foreground mt-1">No experience added yet. Click &quot;Add&quot; to add your work experience.</p>}
            </div>

            <div><Label>Home Address</Label><Textarea value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Your home address" rows={2} /></div>
            <div><Label>Office Address</Label><Textarea value={profile.office_address} onChange={(e) => setProfile({ ...profile, office_address: e.target.value })} placeholder="Your office address" rows={2} /></div>

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
                  <div>
                    <Label>Special Designation</Label>
                    <Select value={profile.posting_details.special_designation || ""} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_designation: val, special_farm: "" } })}>
                      <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HO Tech (State Scheme)">HO Tech (State Scheme)</SelectItem>
                        <SelectItem value="HO Tech (GOI)">HO Tech (GOI)</SelectItem>
                        <SelectItem value="Farm Manager">Farm Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {profile.posting_details.special_designation === "Farm Manager" && (
                    <div>
                      <Label>Farm</Label>
                      <Select value={profile.posting_details.special_farm || ""} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_farm: val } })}>
                        <SelectTrigger><SelectValue placeholder="Select farm" /></SelectTrigger>
                        <SelectContent>{TN_HORTICULTURE_FARMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
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
