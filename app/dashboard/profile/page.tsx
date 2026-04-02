"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Camera, Plus, X, AlertCircle, User, Briefcase, MapPin,
  GraduationCap, Globe, Save, Building2, ChevronDown, ChevronUp, Navigation,
} from "lucide-react";
import { DISTRICT_NAMES, getBlocks, TN_HORTICULTURE_FARMS } from "@/lib/tn-districts";

const titleOptions = ["", "Mr.", "Mrs.", "Miss.", "Dr."];

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

function SectionHeader({ icon: Icon, title, subtitle, color = "text-primary" }: { icon: React.ElementType; title: string; subtitle?: string; color?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`flex items-center justify-center w-9 h-9 rounded-lg bg-primary/5 ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function getProfileCompletion(p: Profile): { percent: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!p.first_name, "First Name"],
    [!!p.last_name, "Last Name / Initial"],
    [!!p.phone, "Phone"],
    [!!p.occupation, "Designation"],
    [!!p.posting_details.regular_district, "District"],
    [!!p.posting_details.regular_block, "Block"],
    [!!p.photo_url, "Profile Photo"],
    [!!p.dob, "Date of Birth"],
    [!!p.gender, "Gender"],
    [!!p.qualification, "Qualification"],
    [!!p.date_of_joining, "Date of Joining"],
    [!!p.address || !!p.office_address, "Address"],
  ];
  const filled = checks.filter(([ok]) => ok).length;
  const missing = checks.filter(([ok]) => !ok).map(([, name]) => name);
  return { percent: Math.round((filled / checks.length) * 100), missing };
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationToggling, setLocationToggling] = useState(false);
  const [showPhotoZoom, setShowPhotoZoom] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [nudge, setNudge] = useState<{ fields: string[]; message: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    personal: true, qualification: true, posting: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { minDate, maxDate } = getDobLimits();

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    fetch("/api/users/me").then((r) => r.json()).then((d) => {
      if (d.user) {
        const occ = d.user.occupation || "";
        const isPreset = occupationOptions.includes(occ);
        const sl = d.user.social_links || {};
        const parsed = parseTitleFromName(d.user.name || "");
        // Default "Mr." for members without a title (unless female)
        const gender = sl.gender || "";
        const effectiveTitle = parsed.title || (gender === "Female" ? "" : "Mr.");
        setProfile({
          ...d.user,
          title: effectiveTitle,
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
        if (d.user.location_sharing) setLocationSharing(true);
      }
    }).catch(() => toast.error("Failed to load profile"));
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
    if (!profile.title) { toast.error("Title is required (Mr., Mrs., Miss., Dr.)"); return; }
    if (!profile.gender) { toast.error("Gender is required"); return; }
    if (!profile.dob) { toast.error("Date of Birth is required"); return; }
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

  if (!profile) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const regularBlocks = getBlocks(profile.posting_details.regular_district);
  const specialBlocks = getBlocks(profile.posting_details.special_duty_district);
  const deputedBlocks = getBlocks(profile.posting_details.deputed_district);

  const displayName = profile.title
    ? `${profile.title} ${profile.first_name} ${profile.last_name}`
    : `${profile.first_name} ${profile.last_name}`;

  const designation = profile.occupation === "Others" ? profile.occupation_other : profile.occupation;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">My Profile</h1>

      {nudge && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">Admin has requested you to update your profile</p>
            {nudge.message && <p className="text-sm text-amber-700 mt-1">{nudge.message}</p>}
            <p className="text-sm text-amber-600 mt-1">
              Please update: <span className="font-medium">{nudge.fields.join(", ")}</span>
            </p>
          </div>
        </div>
      )}

      {/* Title-Gender mismatch warning */}
      {profile.gender === "Female" && profile.title === "Mr." && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-900">Please correct your Title</p>
            <p className="text-sm text-red-700 mt-1">
              Your title is set to <span className="font-medium">Mr.</span> but your gender is <span className="font-medium">Female</span>. Please update your title to Mrs., Miss., or Dr. and save your profile.
            </p>
          </div>
        </div>
      )}
      {profile.gender === "Male" && (profile.title === "Mrs." || profile.title === "Miss.") && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-900">Please correct your Title</p>
            <p className="text-sm text-red-700 mt-1">
              Your title is set to <span className="font-medium">{profile.title}</span> but your gender is <span className="font-medium">Male</span>. Please update your title to Mr. or Dr. and save your profile.
            </p>
          </div>
        </div>
      )}

      {/* Profile Hero Card */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/10" />
        <CardContent className="relative pt-0 pb-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 -mt-10">
            <div
              className="relative w-24 h-24 rounded-full bg-background border-4 border-background shadow-lg flex items-center justify-center cursor-pointer overflow-hidden group"
              onClick={() => photoPreview ? setShowPhotoZoom(true) : fileInputRef.current?.click()}
            >
              {photoPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                </>
              ) : (
                <User className="w-8 h-8 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {uploadingPhoto && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="text-center sm:text-left flex-1 pb-1">
              <h2 className="text-xl font-bold uppercase tracking-wide">{displayName || "Your Name"}</h2>
              {designation && (
                <p className="text-sm text-muted-foreground mt-0.5">{designation}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-1.5 justify-center sm:justify-start">
                {profile.posting_details.regular_district && (
                  <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                    <MapPin size={10} className="mr-1" /> {profile.posting_details.regular_district}
                  </Badge>
                )}
                {profile.email && (
                  <Badge variant="outline" className="text-xs">{profile.email}</Badge>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="shrink-0"
            >
              <Camera size={14} className="mr-1.5" />
              {photoPreview ? "Change" : "Upload"}
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
          <p className="text-[10px] text-muted-foreground mt-2 text-center sm:text-right">JPEG, PNG or WebP. Max 2MB.</p>
        </CardContent>
      </Card>

      {/* Profile Completion */}
      {profile && (() => {
        const { percent, missing } = getProfileCompletion(profile);
        return (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Profile Completion</span>
                <span className={`text-sm font-bold ${percent === 100 ? "text-green-600" : percent >= 75 ? "text-primary" : "text-amber-600"}`}>{percent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${percent === 100 ? "bg-green-500" : percent >= 75 ? "bg-primary" : "bg-amber-500"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              {missing.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Missing: {missing.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Personal Information */}
        <Card>
          <CardContent className="pt-5">
            <button type="button" className="w-full flex items-center justify-between" onClick={() => toggleSection("personal")}>
              <SectionHeader icon={User} title="Personal Information" subtitle="Basic details and contact" />
              {expandedSections.personal ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.personal && (
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input value={profile.email} disabled className="bg-muted/50 mt-1" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Title *</Label>
                    <Select value={profile.title || "none"} onValueChange={(val) => setProfile({ ...profile, title: val === "none" ? "" : val })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {titleOptions.filter(Boolean).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">First Name *</Label>
                    <Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase() })} placeholder="SIVAKUMAR" required className="uppercase mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Name / Initial *</Label>
                    <Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase() })} placeholder="K" required className="uppercase mt-1" />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone *</Label>
                    <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") })} required className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">WhatsApp (if different)</Label>
                    <Input value={profile.social_links.whatsapp} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, whatsapp: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") } })} placeholder="+91 9876543210" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Date of Birth *</Label>
                    <Input type="date" value={profile.dob} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} min={minDate} max={maxDate} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Gender *</Label>
                    <Select value={profile.gender || "none"} onValueChange={(val) => setProfile({ ...profile, gender: val === "none" ? "" : val })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select</SelectItem>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Date of Joining (Service)</Label>
                    <Input type="date" value={profile.date_of_joining} onChange={(e) => setProfile({ ...profile, date_of_joining: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Designation *</Label>
                    <Select value={profile.occupation} onValueChange={(val) => setProfile({ ...profile, occupation: val, occupation_other: val !== "Others" ? "" : profile.occupation_other })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>{occupationOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {profile.occupation === "Others" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Specify Designation *</Label>
                    <Input value={profile.occupation_other} onChange={(e) => setProfile({ ...profile, occupation_other: e.target.value })} placeholder="Enter your designation" required className="mt-1" />
                  </div>
                )}
                <Separator />
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Home Address</Label>
                    <Textarea value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Your home address" rows={2} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Office Address</Label>
                    <Textarea value={profile.office_address} onChange={(e) => setProfile({ ...profile, office_address: e.target.value })} placeholder="Your office address" rows={2} className="mt-1" />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Qualification & Skills */}
        <Card>
          <CardContent className="pt-5">
            <button type="button" className="w-full flex items-center justify-between" onClick={() => toggleSection("qualification")}>
              <SectionHeader icon={GraduationCap} title="Qualification & Skills" subtitle="Education, skills, and expertise" color="text-blue-600" />
              {expandedSections.qualification ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.qualification && (
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Qualification</Label>
                    <Input value={profile.qualification} onChange={(e) => setProfile({ ...profile, qualification: e.target.value })} placeholder="e.g., M.Sc. (Horticulture), Ph.D." className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Specialisation</Label>
                    <Input value={profile.specialisation} onChange={(e) => setProfile({ ...profile, specialisation: e.target.value })} placeholder="e.g., Fruit Crops, Floriculture" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Current Interest Area</Label>
                  <Input value={profile.current_interest_area} onChange={(e) => setProfile({ ...profile, current_interest_area: e.target.value })} placeholder="e.g., Organic Farming, Precision Agriculture" className="mt-1" />
                </div>

                <Separator />

                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Skill Sets</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
                    {([
                      ["typing_tamil", "Typing - Tamil"],
                      ["typing_english", "Typing - English"],
                      ["ms_word", "MS Word"],
                      ["ms_excel", "MS Excel"],
                      ["ms_powerpoint", "MS PowerPoint"],
                      ["computer_operation", "Computer Operation"],
                      ["mobile_operation", "Smart Phone"],
                      ["zoom_app", "Zoom App"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-2 py-1.5 border-b border-dashed last:border-0">
                        <span className="text-sm">{label}</span>
                        <Select value={profile.skill_sets[key] || ""} onValueChange={(v) => setProfile({ ...profile, skill_sets: { ...profile.skill_sets, [key]: v } })}>
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Level" /></SelectTrigger>
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
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground">Other apps you are well versed in</Label>
                    <Input value={profile.skill_sets.other_apps || ""} onChange={(e) => setProfile({ ...profile, skill_sets: { ...profile.skill_sets, other_apps: e.target.value } })} placeholder="e.g., Google Sheets, Canva, WhatsApp Business" className="mt-1" />
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Languages</Label>
                  <div className="mt-2 space-y-3">
                    {([
                      ["Tamil", "tamil"],
                      ["English", "english"],
                    ] as const).map(([lang, prefix]) => (
                      <div key={prefix} className="flex items-center gap-6 py-1.5">
                        <span className="text-sm font-medium min-w-[60px]">{lang}</span>
                        <div className="flex items-center gap-4">
                          {(["Read", "Write", "Speak"] as const).map((ability) => {
                            const key = `${prefix}_${ability.toLowerCase()}` as keyof typeof profile.languages;
                            return (
                              <label key={ability} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!profile.languages[key]}
                                  onChange={(e) => setProfile({ ...profile, languages: { ...profile.languages, [key]: e.target.checked } })}
                                  className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                                />
                                {ability}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div>
                      <Label className="text-xs text-muted-foreground">Other languages & abilities</Label>
                      <Input value={profile.languages.other || ""} onChange={(e) => setProfile({ ...profile, languages: { ...profile.languages, other: e.target.value } })} placeholder="e.g., Hindi - Read, Write, Speak; Telugu - Speak" className="mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Experience */}
        <Card>
          <CardContent className="pt-5">
            <button type="button" className="w-full flex items-center justify-between" onClick={() => toggleSection("experience")}>
              <SectionHeader icon={Briefcase} title="Experience" subtitle="Work history and career" color="text-amber-600" />
              {expandedSections.experience ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.experience && (
              <div className="space-y-3 mt-2">
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setProfile({ ...profile, experience: [...profile.experience, { institution: "", from: "", to: "", designation: "" }] })}>
                    <Plus size={14} className="mr-1.5" /> Add Experience
                  </Button>
                </div>
                {profile.experience.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No experience added yet</p>
                )}
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
                    <div key={i} className="rounded-xl border bg-muted/20 p-4 space-y-3 relative">
                      <div className="flex justify-between items-center">
                        <Badge variant="outline" className="text-xs font-medium">#{i + 1}</Badge>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setProfile({ ...profile, experience: profile.experience.filter((_, j) => j !== i) })}>
                          <X size={14} />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Institution</Label>
                          <Input value={exp.institution} onChange={(e) => updateExp("institution", e.target.value)} placeholder="Department of Horticulture, TN" className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Designation</Label>
                          <Input value={exp.designation} onChange={(e) => updateExp("designation", e.target.value)} placeholder="Horticultural Officer" className="mt-1" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">From</Label>
                          <Input type="month" value={exp.from} onChange={(e) => updateExp("from", e.target.value)} className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">To</Label>
                          <Input type="month" value={exp.to} onChange={(e) => updateExp("to", e.target.value)} className="mt-1" />
                        </div>
                        {duration && (
                          <div className="flex items-end">
                            <Badge className="mb-1.5 bg-primary/10 text-primary border-0">{duration}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Posting Details */}
        <Card>
          <CardContent className="pt-5">
            <button type="button" className="w-full flex items-center justify-between" onClick={() => toggleSection("posting")}>
              <SectionHeader icon={Building2} title="Posting Details" subtitle="Current and special duty postings" color="text-green-700" />
              {expandedSections.posting ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.posting && (
              <div className="space-y-5 mt-2">
                {/* Regular Posting */}
                <div className="rounded-xl border-l-4 border-l-primary bg-primary/[0.02] p-4 space-y-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">Regular Posting</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">District</Label>
                      <Select value={profile.posting_details.regular_district || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_district: val === "none" ? "" : val, regular_block: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select district" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— None —</SelectItem>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Block</Label>
                      <Select value={profile.posting_details.regular_block || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_block: val === "none" ? "" : val } })} disabled={!profile.posting_details.regular_district}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select block" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— None —</SelectItem>{regularBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Special Duty */}
                <div className="rounded-xl border-l-4 border-l-accent bg-accent/[0.02] p-4 space-y-3">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Special Duty (if applicable)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">District</Label>
                      <Select value={profile.posting_details.special_duty_district || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_district: val === "none" ? "" : val, special_duty_block: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select district" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— None —</SelectItem>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Block</Label>
                      <Select value={profile.posting_details.special_duty_block || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_block: val === "none" ? "" : val } })} disabled={!profile.posting_details.special_duty_district}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select block" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— None —</SelectItem>{specialBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Place (other than above)</Label>
                      <Input value={profile.posting_details.special_duty_place} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_place: e.target.value } })} placeholder="Place name" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Special Designation</Label>
                      <Select value={profile.posting_details.special_designation || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_designation: val === "none" ? "" : val, special_farm: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select designation" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          <SelectItem value="HO Tech (State Scheme)">HO Tech (State Scheme)</SelectItem>
                          <SelectItem value="HO Tech (GOI)">HO Tech (GOI)</SelectItem>
                          <SelectItem value="Farm Manager">Farm Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {profile.posting_details.special_designation === "Farm Manager" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Farm</Label>
                        <Select value={profile.posting_details.special_farm || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_farm: val === "none" ? "" : val } })}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Select farm" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">— None —</SelectItem>{TN_HORTICULTURE_FARMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deputed */}
                <div className="rounded-xl border-l-4 border-l-secondary bg-secondary/[0.02] p-4 space-y-3">
                  <p className="text-xs font-semibold text-secondary uppercase tracking-wider">Deputed (if applicable)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">District</Label>
                      <Select value={profile.posting_details.deputed_district || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_district: val === "none" ? "" : val, deputed_block: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select district" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— None —</SelectItem>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Block</Label>
                      <Select value={profile.posting_details.deputed_block || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_block: val === "none" ? "" : val } })} disabled={!profile.posting_details.deputed_district}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select block" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— None —</SelectItem>{deputedBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Social Links */}
        <Card>
          <CardContent className="pt-5">
            <button type="button" className="w-full flex items-center justify-between" onClick={() => toggleSection("social")}>
              <SectionHeader icon={Globe} title="Social Links" subtitle="Connect your social profiles" color="text-purple-600" />
              {expandedSections.social ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.social && (
              <div className="grid grid-cols-1 gap-3 mt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Instagram</Label>
                  <Input value={profile.social_links.instagram} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, instagram: e.target.value } })} placeholder="https://instagram.com/username" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Twitter / X</Label>
                  <Input value={profile.social_links.twitter} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, twitter: e.target.value } })} placeholder="https://x.com/username" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                  <Input value={profile.social_links.linkedin} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, linkedin: e.target.value } })} placeholder="https://linkedin.com/in/username" className="mt-1" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="sticky bottom-4 z-10">
          <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 shadow-lg h-11 text-sm font-medium">
            <Save size={16} className="mr-2" />
            {loading ? "Saving Changes..." : "Save Changes"}
          </Button>
        </div>
      </form>

      {/* Location Sharing (outside form — independent toggle) */}
      <Card className="mt-4">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Navigation size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Location Sharing</p>
                <p className="text-xs text-muted-foreground">
                  {locationSharing ? "Your location is shared when you open the app" : "Enable to get alerts for nearby meetings & events"}
                </p>
              </div>
            </div>
            <Button
              variant={locationSharing ? "default" : "outline"}
              size="sm"
              disabled={locationToggling}
              className={locationSharing ? "bg-blue-600 hover:bg-blue-700" : ""}
              onClick={async () => {
                setLocationToggling(true);
                if (!locationSharing) {
                  // Request permission first
                  if (!navigator.geolocation) {
                    toast.error("Geolocation not supported on this device");
                    setLocationToggling(false);
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                      // Enable sharing + send initial location
                      await fetch("/api/location", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sharing: true }),
                      });
                      await fetch("/api/location", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                      });
                      setLocationSharing(true);
                      toast.success("Location sharing enabled");
                      setLocationToggling(false);
                    },
                    () => {
                      toast.error("Location permission denied. Please allow location access in your browser settings.");
                      setLocationToggling(false);
                    },
                    { enableHighAccuracy: true, timeout: 15000 }
                  );
                } else {
                  // Disable sharing
                  await fetch("/api/location", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sharing: false }),
                  });
                  setLocationSharing(false);
                  toast.success("Location sharing disabled");
                  setLocationToggling(false);
                }
              }}
            >
              {locationToggling ? "..." : locationSharing ? "Enabled" : "Enable"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Photo Zoom Overlay */}
      {showPhotoZoom && photoPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setShowPhotoZoom(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoPreview}
            alt="Profile"
            className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
