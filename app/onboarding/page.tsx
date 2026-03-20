"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flower2, Clock, ArrowLeft, ArrowRight, User, MapPin, Share2, Camera, AlertTriangle, CheckCircle2 } from "lucide-react";
import Image from "next/image";
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

const emptyPosting: PostingDetails = {
  regular_district: "",
  regular_block: "",
  special_duty_district: "",
  special_duty_block: "",
  special_duty_place: "",
  special_designation: "",
  special_farm: "",
  deputed_district: "",
  deputed_block: "",
};

interface UserProfile {
  title: string;
  first_name: string;
  last_name: string;
  gender: string;
  phone: string;
  address: string;
  office_address: string;
  dob: string;
  occupation: string;
  occupation_other: string;
  posting_details: PostingDetails;
  social_links: { instagram: string; twitter: string; linkedin: string; whatsapp: string };
  photo_url: string;
  status: string;
}

const steps = [
  { label: "Personal Info", icon: User },
  { label: "Posting Details", icon: MapPin },
  { label: "Social & Photo", icon: Share2 },
];

function getDobLimits() {
  const now = new Date();
  return {
    minDate: new Date(now.getFullYear() - 100, now.getMonth(), now.getDate()).toISOString().split("T")[0],
    maxDate: new Date(now.getFullYear() - 18, now.getMonth(), now.getDate()).toISOString().split("T")[0],
  };
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[\s\-\+\(\)]/g, "");
  return /^(91)?[6-9]\d{9}$/.test(digits);
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<UserProfile>({
    title: "", first_name: "", last_name: "", gender: "", phone: "", address: "", office_address: "", dob: "",
    occupation: "Horticultural Officer", occupation_other: "",
    posting_details: emptyPosting,
    social_links: { instagram: "", twitter: "", linkedin: "", whatsapp: "" },
    photo_url: "", status: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loginCount, setLoginCount] = useState(0);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneSessionId, setPhoneSessionId] = useState("");
  const [phoneVerifyLoading, setPhoneVerifyLoading] = useState(false);
  const [phoneVerifyError, setPhoneVerifyError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { minDate, maxDate } = getDobLimits();

  useEffect(() => {
    fetch("/api/users/me").then((r) => r.json()).then((data) => {
      if (!data.user) return;
      if (data.user.status === "approved" && data.user.name) { router.push("/dashboard"); return; }
      setLoginCount(data.user.login_count || 0);
      const sl = data.user.social_links || {};
      const parsed = parseTitleFromName(data.user.name || "");
      setProfile((prev) => ({
        ...prev, title: parsed.title, first_name: parsed.firstName, last_name: parsed.lastName, gender: sl.gender || "", phone: data.user.phone || "",
        address: data.user.address || "", office_address: data.user.office_address || "", dob: data.user.dob || "",
        occupation: data.user.occupation || "Horticultural Officer",
        posting_details: data.user.posting_details || emptyPosting,
        social_links: { instagram: sl.instagram || "", twitter: sl.twitter || "", linkedin: sl.linkedin || "", whatsapp: sl.whatsapp || "" },
        photo_url: data.user.photo_url || "", status: data.user.status || "",
      }));
      if (data.user.photo_url) setPhotoPreview(data.user.photo_url);
      if (data.user.phone_verified) setPhoneVerified(true);
      if (data.user.name && data.user.status === "pending") setSubmitted(true);
    }).catch(() => {});
  }, [router]);

  function validateStep(): boolean {
    setError("");
    if (step === 0) {
      if (!profile.first_name.trim()) { setError("First name is required"); return false; }
      if (!profile.last_name.trim()) { setError("Last name / Initial is required"); return false; }
      if (!profile.phone.trim()) { setError("Phone number is required"); return false; }
      if (!isValidPhone(profile.phone)) { setError("Enter a valid Indian mobile number (10 digits starting with 6-9)"); return false; }
      // Phone OTP verification disabled — pending DLT registration
      // if (!phoneVerified) { setError("Please verify your phone number with OTP"); return false; }
      if (!profile.occupation || (profile.occupation === "Others" && !profile.occupation_other.trim())) { setError("Designation is required"); return false; }
    }
    return true;
  }

  async function handleSendPhoneOtp() {
    if (!isValidPhone(profile.phone)) {
      setPhoneVerifyError("Enter a valid Indian mobile number first");
      return;
    }
    setPhoneVerifyLoading(true);
    setPhoneVerifyError("");
    try {
      const res = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone: profile.phone }),
      });
      const data = await res.json();
      if (!res.ok) { setPhoneVerifyError(data.error || "Failed to send OTP"); return; }
      setPhoneSessionId(data.sessionId);
      setPhoneOtpSent(true);
    } catch { setPhoneVerifyError("Failed to send OTP"); }
    finally { setPhoneVerifyLoading(false); }
  }

  async function handleVerifyPhoneOtp() {
    if (phoneOtpCode.length !== 6) { setPhoneVerifyError("Enter the 6-digit OTP"); return; }
    setPhoneVerifyLoading(true);
    setPhoneVerifyError("");
    try {
      const res = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: phoneOtpCode, sessionId: phoneSessionId }),
      });
      const data = await res.json();
      if (!res.ok) { setPhoneVerifyError(data.error || "Invalid OTP"); return; }
      setPhoneVerified(true);
      setPhoneOtpSent(false);
    } catch { setPhoneVerifyError("Verification failed"); }
    finally { setPhoneVerifyLoading(false); }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2MB"); return; }
    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) setProfile((p) => ({ ...p, photo_url: data.photo_url }));
      else { setError(data.error || "Photo upload failed"); setPhotoPreview(profile.photo_url); }
    } catch { setError("Photo upload failed"); setPhotoPreview(profile.photo_url); }
    finally { setUploadingPhoto(false); }
  }

  async function handleSubmit() {
    if (!validateStep()) return;
    setError(""); setLoading(true);
    try {
      const nameWithoutTitle = `${profile.first_name.trim()} ${profile.last_name.trim()}`.toUpperCase();
      const fullName = profile.title ? `${profile.title} ${nameWithoutTitle}` : nameWithoutTitle;
      const socialLinksWithExtras = { ...profile.social_links, gender: profile.gender || "" };
      const payload = { ...profile, name: fullName, occupation: profile.occupation === "Others" ? profile.occupation_other : profile.occupation, social_links: socialLinksWithExtras };
      const res = await fetch("/api/users/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save profile"); return; }
      const meRes = await fetch("/api/users/me");
      const meData = await meRes.json();
      if (meData.user?.status === "approved") { router.push("/dashboard"); return; }
      setSubmitted(true);
    } catch { setError("Something went wrong"); }
    finally { setLoading(false); }
  }

  if (submitted) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-md border-primary/20 shadow-xl">
            <CardContent className="pt-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/20 mb-4">
                <Clock className="w-8 h-8 text-secondary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Profile Submitted</h2>
              <p className="text-muted-foreground">Your profile is awaiting admin approval. You&apos;ll be able to access the dashboard once approved.</p>
              <Button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }} variant="outline" className="mt-6">Back to Home</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const regularBlocks = getBlocks(profile.posting_details.regular_district);
  const specialBlocks = getBlocks(profile.posting_details.special_duty_district);
  const deputedBlocks = getBlocks(profile.posting_details.deputed_district);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <Flower2 className="w-10 h-10 text-primary mx-auto mb-2" />
            <h1 className="text-3xl font-bold text-primary">Complete Your Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">Tell us about yourself to join the community</p>
          </div>

          {/* Login count warning */}
          {loginCount >= 3 && (
            <div className={`rounded-xl border px-4 py-3 mb-5 flex items-start gap-3 ${loginCount >= 5 ? "bg-red-50 border-red-300" : "bg-amber-50 border-amber-300"}`}>
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${loginCount >= 5 ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <p className={`text-sm font-semibold ${loginCount >= 5 ? "text-red-800" : "text-amber-800"}`}>
                  {loginCount >= 5 ? "Final Warning — Account at Risk" : "Profile Incomplete"}
                </p>
                <p className={`text-xs mt-0.5 ${loginCount >= 5 ? "text-red-700" : "text-amber-700"}`}>
                  {loginCount >= 5
                    ? `You have logged in ${loginCount} times without completing your profile. Incomplete accounts will be removed. Please fill in your details now.`
                    : `You have logged in ${loginCount} times without completing your profile. Please complete it to continue using the portal.`}
                </p>
              </div>
            </div>
          )}

          {/* Step Progress */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${i === step ? "bg-primary text-white" : i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <s.icon size={14} />
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </div>
                {i < 2 && <div className={`w-6 h-0.5 mx-1 ${i < step ? "bg-primary/40" : "bg-muted"}`} />}
              </div>
            ))}
          </div>

          <Card className="border-primary/20 shadow-xl shadow-primary/5">
            <CardContent className="pt-6">
              {step === 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Personal Information</h3>
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
                    <div>
                      <Label htmlFor="first_name">First Name *</Label>
                      <Input id="first_name" value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value.toUpperCase() })} placeholder="e.g., SIVAKUMAR" required className="uppercase" />
                    </div>
                    <div>
                      <Label htmlFor="last_name">Last Name / Initial *</Label>
                      <Input id="last_name" value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value.toUpperCase() })} placeholder="e.g., K" required className="uppercase" />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="phone">Phone *</Label>
                      <Input id="phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") })} placeholder="9876543210" required />
                      {/* Phone OTP verification hidden — pending DLT registration */}
                    </div>
                    <div>
                      <Label htmlFor="whatsapp">WhatsApp (if different)</Label>
                      <Input id="whatsapp" value={profile.social_links.whatsapp} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, whatsapp: e.target.value.replace(/[^\d\+\-\s\(\)]/g, "") } })} placeholder="+91 9876543210" />
                    </div>
                    <div>
                      <Label htmlFor="dob">Date of Birth</Label>
                      <Input id="dob" type="date" value={profile.dob} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} min={minDate} max={maxDate} />
                    </div>
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
                    <div>
                      <Label htmlFor="occupation">Designation *</Label>
                      <Select value={profile.occupation} onValueChange={(val) => setProfile({ ...profile, occupation: val, occupation_other: val !== "Others" ? "" : profile.occupation_other })}>
                        <SelectTrigger><SelectValue placeholder="Select your designation" /></SelectTrigger>
                        <SelectContent>{occupationOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  {profile.occupation === "Others" && (
                    <div>
                      <Label htmlFor="occupation_other">Specify Designation *</Label>
                      <Input id="occupation_other" value={profile.occupation_other} onChange={(e) => setProfile({ ...profile, occupation_other: e.target.value })} placeholder="Enter your designation" required />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="address">Home Address</Label>
                    <Textarea id="address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Your home address" rows={2} />
                  </div>
                  <div>
                    <Label htmlFor="office_address">Office Address</Label>
                    <Textarea id="office_address" value={profile.office_address} onChange={(e) => setProfile({ ...profile, office_address: e.target.value })} placeholder="Your office address" rows={2} />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Posting Details</h3>
                  <p className="text-sm text-muted-foreground">Fill in your current posting information</p>
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
                        <div className="col-span-2">
                          <Label>Place (other than above)</Label>
                          <Input value={profile.posting_details.special_duty_place} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_place: e.target.value } })} placeholder="Place name" />
                        </div>
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
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Social Links & Photo</h3>
                  <p className="text-sm text-muted-foreground">Optional — add your social links and profile photo</p>
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20 rounded-full bg-muted border-2 border-dashed border-primary/30 flex items-center justify-center cursor-pointer overflow-hidden hover:border-primary/60 transition-colors" onClick={() => fileInputRef.current?.click()}>
                      {photoPreview ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-muted-foreground" />}
                      {uploadingPhoto && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
                    </div>
                    <div>
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>{photoPreview ? "Change Photo" : "Upload Photo"}</Button>
                      <p className="text-xs text-muted-foreground mt-1">JPEG, PNG or WebP. Max 2MB.</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
                  </div>
                  <div className="space-y-3">
                    <div><Label htmlFor="instagram">Instagram</Label><Input id="instagram" value={profile.social_links.instagram} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, instagram: e.target.value } })} placeholder="@username" /></div>
                    <div><Label htmlFor="twitter">Twitter / X</Label><Input id="twitter" value={profile.social_links.twitter} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, twitter: e.target.value } })} placeholder="@username" /></div>
                    <div><Label htmlFor="linkedin">LinkedIn</Label><Input id="linkedin" value={profile.social_links.linkedin} onChange={(e) => setProfile({ ...profile, social_links: { ...profile.social_links, linkedin: e.target.value } })} placeholder="linkedin.com/in/username" /></div>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive mt-4">{error}</p>}

              <div className="flex items-center justify-between mt-6">
                {step > 0 ? <Button type="button" variant="outline" onClick={() => { setError(""); setStep((s) => s - 1); }}><ArrowLeft size={16} className="mr-1" /> Back</Button> : <div />}
                {step < 2
                  ? <Button type="button" onClick={() => { if (validateStep()) setStep((s) => s + 1); }} className="bg-primary hover:bg-primary/90">Next <ArrowRight size={16} className="ml-1" /></Button>
                  : <Button type="button" onClick={handleSubmit} disabled={loading} className="bg-primary hover:bg-primary/90">{loading ? "Saving..." : "Submit Profile"}</Button>
                }
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
