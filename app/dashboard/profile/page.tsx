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
import { PhotoCropDialog } from "@/components/photo-crop-dialog";
import {
  Camera, Plus, X, AlertCircle, User, Briefcase, MapPin,
  GraduationCap, Globe, Save, Building2, ChevronDown, ChevronUp, Navigation, Bell,
} from "lucide-react";
import { DISTRICT_NAMES, getBlocks, TN_HORTICULTURE_FARMS } from "@/lib/tn-districts";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/translations";

const titleOptions = ["", "Mr.", "Mrs.", "Miss.", "Dr."];

const occupationOptions: { value: string; key: TranslationKey }[] = [
  { value: "Horticultural Officer", key: "opt.ho" },
  { value: "Assistant Director of Horticulture", key: "opt.adh" },
  { value: "Deputy Director of Horticulture", key: "opt.ddh" },
  { value: "Joint Director of Horticulture", key: "opt.jdh" },
  { value: "Additional Director of Horticulture", key: "opt.addh" },
  { value: "Retd. Horticultural Officer", key: "opt.retd_ho" },
  { value: "Retd. Assistant Director of Horticulture", key: "opt.retd_adh" },
  { value: "Retd. Deputy Director of Horticulture", key: "opt.retd_ddh" },
  { value: "Retd. Joint Director of Horticulture", key: "opt.retd_jdh" },
  { value: "Retd. Additional Director of Horticulture", key: "opt.retd_addh" },
  { value: "System Admin", key: "opt.system_admin" },
  { value: "Others", key: "opt.others" },
];

const occupationValues = occupationOptions.map((o) => o.value);

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
  const [notifPrefs, setNotifPrefs] = useState({ email: true, telegram: true, in_app: true });
  const [notifSaving, setNotifSaving] = useState(false);
  const [locationToggling, setLocationToggling] = useState(false);
  const [showPhotoZoom, setShowPhotoZoom] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [nudge, setNudge] = useState<{ fields: string[]; message: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    personal: true, qualification: true, posting: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { minDate, maxDate } = getDobLimits();
  const t = useT();

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    fetch("/api/users/me").then((r) => r.json()).then((d) => {
      if (d.user) {
        const occ = d.user.occupation || "";
        const isPreset = occupationValues.includes(occ);
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
    // Load notification preferences
    fetch("/api/notification-prefs").then((r) => r.json()).then((d) => {
      if (d.prefs) setNotifPrefs(d.prefs);
    }).catch(() => {});
  }, []);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setCropSrc(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCroppedUpload(blob: Blob) {
    setCropSrc(null);
    setPhotoPreview(URL.createObjectURL(blob));
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && profile) { setProfile({ ...profile, photo_url: data.photo_url }); toast.success(t("profile.photo_updated")); }
      else { toast.error(data.error || "Upload failed"); setPhotoPreview(profile?.photo_url || ""); }
    } catch { toast.error("Upload failed"); setPhotoPreview(profile?.photo_url || ""); }
    finally { setUploadingPhoto(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!profile.title) { toast.error(t("profile.err_title_required")); return; }
    if (!profile.gender) { toast.error(t("profile.err_gender_required")); return; }
    if (!profile.dob) { toast.error(t("profile.err_dob_required")); return; }
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
      if (res.ok) { toast.success(t("profile.updated")); setNudge(null); }
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
      <h1 className="text-2xl font-bold">{t("profile.my_profile")}</h1>

      {nudge && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">{t("profile.admin_nudge")}</p>
            {nudge.message && <p className="text-sm text-amber-700 mt-1">{nudge.message}</p>}
            <p className="text-sm text-amber-600 mt-1">
              {t("profile.please_update")}: <span className="font-medium">{nudge.fields.join(", ")}</span>
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
            <p className="font-semibold text-red-900">{t("profile.title_gender_mismatch")}</p>
            <p className="text-sm text-red-700 mt-1">{t("profile.title_mr_female")}</p>
          </div>
        </div>
      )}
      {profile.gender === "Male" && (profile.title === "Mrs." || profile.title === "Miss.") && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-900">{t("profile.title_gender_mismatch")}</p>
            <p className="text-sm text-red-700 mt-1">{t("profile.title_mrs_male", { title: profile.title })}</p>
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
              <h2 className="text-xl font-bold uppercase tracking-wide">{displayName || t("form.your_name")}</h2>
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
              {photoPreview ? t("profile.change") : t("common.upload")}
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoSelect} />
          <p className="text-[10px] text-muted-foreground mt-2 text-center sm:text-right">{t("profile.photo_hint")}</p>
        </CardContent>
      </Card>

      {/* Profile Completion */}
      {profile && (() => {
        const { percent, missing } = getProfileCompletion(profile);
        return (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{t("profile.completion")}</span>
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
                  {t("profile.missing")}: {missing.join(", ")}
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
              <SectionHeader icon={User} title={t("profile.personal_info")} subtitle={t("profile.personal_subtitle")} />
              {expandedSections.personal ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.personal && (
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("form.email")}</Label>
                  <Input value={profile.email} disabled className="bg-muted/50 mt-1" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("onboard.title")} *</Label>
                    <Select value={profile.title || "none"} onValueChange={(val) => setProfile({ ...profile, title: val === "none" ? "" : val })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={t("opt.none")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("opt.none")}</SelectItem>
                        <SelectItem value="Mr.">{t("opt.mr")}</SelectItem>
                        <SelectItem value="Mrs.">{t("opt.mrs")}</SelectItem>
                        <SelectItem value="Miss.">{t("opt.miss")}</SelectItem>
                        <SelectItem value="Dr.">{t("opt.dr")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("onboard.first_name")} *</Label>
                    <Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase() })} placeholder={t("ph.first_name")} required className="uppercase mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("onboard.last_name")} *</Label>
                    <Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase() })} placeholder={t("ph.last_name")} required className="uppercase mt-1" />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.phone")} *</Label>
                    <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") })} required className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("profile.whatsapp")}</Label>
                    <Input value={profile.social_links.whatsapp} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, whatsapp: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") } })} placeholder={t("ph.whatsapp")} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.dob")} *</Label>
                    <Input type="date" value={profile.dob} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} min={minDate} max={maxDate} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.gender")} *</Label>
                    <Select value={profile.gender || "none"} onValueChange={(val) => setProfile({ ...profile, gender: val === "none" ? "" : val })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={t("opt.select")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("opt.select")}</SelectItem>
                        <SelectItem value="Male">{t("opt.male")}</SelectItem>
                        <SelectItem value="Female">{t("opt.female")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("profile.date_of_joining")}</Label>
                    <Input type="date" value={profile.date_of_joining} onChange={(e) => setProfile({ ...profile, date_of_joining: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.designation")} *</Label>
                    <Select value={profile.occupation} onValueChange={(val) => setProfile({ ...profile, occupation: val, occupation_other: val !== "Others" ? "" : profile.occupation_other })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={t("ph.designation")} /></SelectTrigger>
                      <SelectContent>{occupationOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{t(opt.key)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {profile.occupation === "Others" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.specify_designation")} *</Label>
                    <Input value={profile.occupation_other} onChange={(e) => setProfile({ ...profile, occupation_other: e.target.value })} placeholder={t("ph.enter_designation")} required className="mt-1" />
                  </div>
                )}
                <Separator />
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("profile.home_address")}</Label>
                    <Textarea value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder={t("ph.home_address")} rows={2} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.office_address")}</Label>
                    <Textarea value={profile.office_address} onChange={(e) => setProfile({ ...profile, office_address: e.target.value })} placeholder={t("ph.office_address")} rows={2} className="mt-1" />
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
              <SectionHeader icon={GraduationCap} title={t("profile.qualification_skills")} subtitle={t("profile.qualification_subtitle")} color="text-blue-600" />
              {expandedSections.qualification ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.qualification && (
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.qualification")}</Label>
                    <Input value={profile.qualification} onChange={(e) => setProfile({ ...profile, qualification: e.target.value })} placeholder={t("ph.qualification")} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("form.specialisation")}</Label>
                    <Input value={profile.specialisation} onChange={(e) => setProfile({ ...profile, specialisation: e.target.value })} placeholder={t("ph.specialisation")} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("form.current_interest")}</Label>
                  <Input value={profile.current_interest_area} onChange={(e) => setProfile({ ...profile, current_interest_area: e.target.value })} placeholder={t("ph.interest_area")} className="mt-1" />
                </div>

                <Separator />

                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("skill.skill_sets")}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
                    {([
                      ["typing_tamil", "skill.typing_tamil"],
                      ["typing_english", "skill.typing_english"],
                      ["ms_word", "skill.ms_word"],
                      ["ms_excel", "skill.ms_excel"],
                      ["ms_powerpoint", "skill.ms_powerpoint"],
                      ["computer_operation", "skill.computer_operation"],
                      ["mobile_operation", "skill.mobile_operation"],
                      ["zoom_app", "skill.zoom_app"],
                    ] as [string, TranslationKey][]).map(([key, labelKey]) => (
                      <div key={key} className="flex items-center justify-between gap-2 py-1.5 border-b border-dashed last:border-0">
                        <span className="text-sm">{t(labelKey)}</span>
                        <Select value={profile.skill_sets[key as keyof typeof profile.skill_sets] || ""} onValueChange={(v) => setProfile({ ...profile, skill_sets: { ...profile.skill_sets, [key]: v } })}>
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder={t("opt.level")} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("opt.skill_none")}</SelectItem>
                            <SelectItem value="Beginner">{t("opt.beginner")}</SelectItem>
                            <SelectItem value="Medium">{t("opt.medium")}</SelectItem>
                            <SelectItem value="Expert">{t("opt.expert")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground">{t("skill.other_apps")}</Label>
                    <Input value={profile.skill_sets.other_apps || ""} onChange={(e) => setProfile({ ...profile, skill_sets: { ...profile.skill_sets, other_apps: e.target.value } })} placeholder={t("ph.other_apps")} className="mt-1" />
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("lang.languages")}</Label>
                  <div className="mt-2 space-y-3">
                    {([
                      ["lang.tamil", "tamil"],
                      ["lang.english", "english"],
                    ] as [TranslationKey, string][]).map(([langKey, prefix]) => (
                      <div key={prefix} className="flex items-center gap-6 py-1.5">
                        <span className="text-sm font-medium min-w-[60px]">{t(langKey)}</span>
                        <div className="flex items-center gap-4">
                          {([["Read", "lang.read"], ["Write", "lang.write"], ["Speak", "lang.speak"]] as [string, TranslationKey][]).map(([ability, abilityKey]) => {
                            const key = `${prefix}_${ability.toLowerCase()}` as keyof typeof profile.languages;
                            return (
                              <label key={ability} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!profile.languages[key]}
                                  onChange={(e) => setProfile({ ...profile, languages: { ...profile.languages, [key]: e.target.checked } })}
                                  className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                                />
                                {t(abilityKey)}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("lang.other")}</Label>
                      <Input value={profile.languages.other || ""} onChange={(e) => setProfile({ ...profile, languages: { ...profile.languages, other: e.target.value } })} placeholder={t("ph.other_lang")} className="mt-1" />
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
              <SectionHeader icon={Briefcase} title={t("profile.experience")} subtitle={t("profile.experience_subtitle")} color="text-amber-600" />
              {expandedSections.experience ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.experience && (
              <div className="space-y-3 mt-2">
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setProfile({ ...profile, experience: [...profile.experience, { institution: "", from: "", to: "", designation: "" }] })}>
                    <Plus size={14} className="mr-1.5" /> {t("exp.add")}
                  </Button>
                </div>
                {profile.experience.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">{t("exp.none")}</p>
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
                          <Label className="text-xs text-muted-foreground">{t("exp.institution")}</Label>
                          <Input value={exp.institution} onChange={(e) => updateExp("institution", e.target.value)} placeholder={t("ph.institution")} className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("exp.designation")}</Label>
                          <Input value={exp.designation} onChange={(e) => updateExp("designation", e.target.value)} placeholder={t("opt.ho")} className="mt-1" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("exp.from")}</Label>
                          <Input type="month" value={exp.from} onChange={(e) => updateExp("from", e.target.value)} className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("exp.to")}</Label>
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
              <SectionHeader icon={Building2} title={t("profile.posting_details")} subtitle={t("profile.posting_subtitle")} color="text-green-700" />
              {expandedSections.posting ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.posting && (
              <div className="space-y-5 mt-2">
                {/* Regular Posting */}
                <div className="rounded-xl border-l-4 border-l-primary bg-primary/[0.02] p-4 space-y-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">{t("posting.regular")}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("posting.district")}</Label>
                      <Select value={profile.posting_details.regular_district || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_district: val === "none" ? "" : val, regular_block: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t("posting.select_district")} /></SelectTrigger>
                        <SelectContent><SelectItem value="none">{t("opt.none")}</SelectItem>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("posting.block")}</Label>
                      <Select value={profile.posting_details.regular_block || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_block: val === "none" ? "" : val } })} disabled={!profile.posting_details.regular_district}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t("posting.select_block")} /></SelectTrigger>
                        <SelectContent><SelectItem value="none">{t("opt.none")}</SelectItem>{regularBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Special Duty */}
                <div className="rounded-xl border-l-4 border-l-accent bg-accent/[0.02] p-4 space-y-3">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">{t("posting.special")}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("posting.district")}</Label>
                      <Select value={profile.posting_details.special_duty_district || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_district: val === "none" ? "" : val, special_duty_block: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t("posting.select_district")} /></SelectTrigger>
                        <SelectContent><SelectItem value="none">{t("opt.none")}</SelectItem>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("posting.block")}</Label>
                      <Select value={profile.posting_details.special_duty_block || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_block: val === "none" ? "" : val } })} disabled={!profile.posting_details.special_duty_district}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t("posting.select_block")} /></SelectTrigger>
                        <SelectContent><SelectItem value="none">{t("opt.none")}</SelectItem>{specialBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">{t("posting.place")}</Label>
                      <Input value={profile.posting_details.special_duty_place} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_place: e.target.value } })} placeholder={t("ph.place_name")} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("posting.special_designation")}</Label>
                      <Select value={profile.posting_details.special_designation || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_designation: val === "none" ? "" : val, special_farm: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t("ph.designation")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("opt.none")}</SelectItem>
                          <SelectItem value="HO Tech (State Scheme)">{t("opt.ho_tech_state")}</SelectItem>
                          <SelectItem value="HO Tech (GOI)">{t("opt.ho_tech_goi")}</SelectItem>
                          <SelectItem value="Farm Manager">{t("opt.farm_manager")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {profile.posting_details.special_designation === "Farm Manager" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("posting.farm")}</Label>
                        <Select value={profile.posting_details.special_farm || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_farm: val === "none" ? "" : val } })}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder={t("posting.select_farm")} /></SelectTrigger>
                          <SelectContent><SelectItem value="none">{t("opt.none")}</SelectItem>{TN_HORTICULTURE_FARMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deputed */}
                <div className="rounded-xl border-l-4 border-l-secondary bg-secondary/[0.02] p-4 space-y-3">
                  <p className="text-xs font-semibold text-secondary uppercase tracking-wider">{t("posting.deputed")}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("posting.district")}</Label>
                      <Select value={profile.posting_details.deputed_district || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_district: val === "none" ? "" : val, deputed_block: "" } })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t("posting.select_district")} /></SelectTrigger>
                        <SelectContent><SelectItem value="none">{t("opt.none")}</SelectItem>{DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("posting.block")}</Label>
                      <Select value={profile.posting_details.deputed_block || "none"} onValueChange={(val) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_block: val === "none" ? "" : val } })} disabled={!profile.posting_details.deputed_district}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t("posting.select_block")} /></SelectTrigger>
                        <SelectContent><SelectItem value="none">{t("opt.none")}</SelectItem>{deputedBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
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
              <SectionHeader icon={Globe} title={t("profile.social_links")} subtitle={t("profile.social_subtitle")} color="text-purple-600" />
              {expandedSections.social ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {expandedSections.social && (
              <div className="grid grid-cols-1 gap-3 mt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Instagram</Label>
                  <Input value={profile.social_links.instagram} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, instagram: e.target.value } })} placeholder="https://instagram.com/username" className="mt-1" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t("social.instagram_hint")}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Twitter / X</Label>
                  <Input value={profile.social_links.twitter} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, twitter: e.target.value } })} placeholder="https://x.com/username" className="mt-1" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t("social.twitter_hint")}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                  <Input value={profile.social_links.linkedin} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, linkedin: e.target.value } })} placeholder="https://linkedin.com/in/username" className="mt-1" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t("social.linkedin_hint")}</p>
                </div>
                <Separator className="my-1" />
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <p className="text-xs font-semibold text-blue-800 mb-1">{t("social.telegram_title")}</p>
                  <p className="text-[11px] text-blue-700">{t("social.telegram_info")}</p>
                  <ol className="text-[11px] text-blue-700 mt-1 list-decimal list-inside space-y-0.5">
                    <li>{t("social.telegram_step1")}</li>
                    <li>{t("social.telegram_step2")}</li>
                    <li>{t("social.telegram_step3")}</li>
                  </ol>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="sticky bottom-4 z-10">
          <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 shadow-lg h-11 text-sm font-medium">
            <Save size={16} className="mr-2" />
            {loading ? t("profile.saving") : t("profile.save_profile")}
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
                <p className="text-sm font-medium">{t("profile.location")}</p>
                <p className="text-xs text-muted-foreground">
                  {locationSharing ? t("location.enabled_desc") : t("location.disabled_desc")}
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
              {locationToggling ? "..." : locationSharing ? t("location.enabled") : t("location.enable")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="mt-4">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <Bell size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("profile.notifications")}</p>
              <p className="text-xs text-muted-foreground">{t("notif.choose")}</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { key: "email" as const, labelKey: "notif.email_label" as const, descKey: "notif.email_desc" as const },
              { key: "telegram" as const, labelKey: "notif.telegram_label" as const, descKey: "notif.telegram_desc" as const },
              { key: "in_app" as const, labelKey: "notif.in_app_label" as const, descKey: "notif.in_app_desc" as const },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{t(item.labelKey)}</p>
                  <p className="text-[11px] text-muted-foreground">{t(item.descKey)}</p>
                </div>
                <Button
                  variant={notifPrefs[item.key] ? "default" : "outline"}
                  size="sm"
                  disabled={notifSaving}
                  className={notifPrefs[item.key] ? "bg-primary hover:bg-primary/90" : ""}
                  onClick={async () => {
                    setNotifSaving(true);
                    const updated = { ...notifPrefs, [item.key]: !notifPrefs[item.key] };
                    const res = await fetch("/api/notification-prefs", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(updated),
                    });
                    if (res.ok) {
                      setNotifPrefs(updated);
                      toast.success(`${t(item.labelKey)} ${updated[item.key] ? t("notif.on") : t("notif.off")}`);
                    } else {
                      toast.error("Failed to update");
                    }
                    setNotifSaving(false);
                  }}
                >
                  {notifPrefs[item.key] ? t("notif.on") : t("notif.off")}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Photo Crop Dialog */}
      {cropSrc && (
        <PhotoCropDialog
          open={!!cropSrc}
          imageSrc={cropSrc}
          onCrop={handleCroppedUpload}
          onCancel={() => setCropSrc(null)}
        />
      )}

      {/* Photo Zoom Overlay */}
      {showPhotoZoom && photoPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 cursor-pointer"
          onClick={() => setShowPhotoZoom(false)}
        >
          {displayName && (
            <p className="text-white font-bold text-lg mb-2 tracking-wide text-center uppercase" onClick={(e) => e.stopPropagation()}>
              {displayName}
            </p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoPreview}
            alt="Profile"
            className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl font-bold"
            onClick={() => setShowPhotoZoom(false)}
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
