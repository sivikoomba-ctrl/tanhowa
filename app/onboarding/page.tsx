"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flower2, Clock, AlertTriangle } from "lucide-react";
import Image from "next/image";

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

function parseTitleFromName(name: string): { firstName: string; lastName: string } {
  const titles = ["DR.", "PROF."];
  let upper = name.trim().toUpperCase();
  for (const t of titles) {
    if (upper.startsWith(t)) {
      upper = upper.substring(t.length).trim();
      break;
    }
  }
  const parts = upper.split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[\s\-\+\(\)]/g, "");
  return /^(91)?[6-9]\d{9}$/.test(digits);
}

export default function OnboardingPage() {
  const [title, setTitle] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("Horticultural Officer");
  const [occupationOther, setOccupationOther] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loginCount, setLoginCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/users/me").then((r) => r.json()).then((data) => {
      if (!data.user) return;
      if (data.user.status === "approved" && data.user.name) { router.push("/dashboard"); return; }
      setLoginCount(data.user.login_count || 0);
      if (data.user.name) {
        const parsed = parseTitleFromName(data.user.name);
        setFirstName(parsed.firstName);
        setLastName(parsed.lastName);
      }
      if (data.user.phone) setPhone(data.user.phone);
      if (data.user.occupation) setOccupation(data.user.occupation);
      if (data.user.name && data.user.status === "pending") setSubmitted(true);
    }).catch(() => {});
  }, [router]);

  async function handleSubmit() {
    setError("");
    if (!firstName.trim()) { setError("First name is required"); return; }
    if (!lastName.trim()) { setError("Last name / Initial is required"); return; }
    if (!phone.trim()) { setError("Phone number is required"); return; }
    if (!isValidPhone(phone)) { setError("Enter a valid Indian mobile number (10 digits starting with 6-9)"); return; }
    if (!occupation || (occupation === "Others" && !occupationOther.trim())) { setError("Designation is required"); return; }
    if (!title) { setError("Title is required"); return; }
    if (!gender) { setError("Gender is required"); return; }

    setLoading(true);
    try {
      const nameWithoutTitle = `${firstName.trim()} ${lastName.trim()}`.toUpperCase();
      const fullName = `${title} ${nameWithoutTitle}`;
      const finalOccupation = occupation === "Others" ? occupationOther.trim() : occupation;
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fullName, phone: phone.trim(), occupation: finalOccupation, social_links: { gender, title } }),
      });
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
              <p className="text-sm text-muted-foreground mt-3">You can complete the rest of your profile (posting details, photo, address, etc.) after approval from the Dashboard.</p>
              <Button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }} variant="outline" className="mt-6">Back to Home</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <Flower2 className="w-10 h-10 text-primary mx-auto mb-2" />
            <h1 className="text-3xl font-bold text-primary">Welcome to TANHOWA</h1>
            <p className="text-sm text-muted-foreground mt-1">Please fill in the mandatory details to get started</p>
          </div>

          {loginCount >= 3 && (
            <div className={`rounded-xl border px-4 py-3 mb-5 flex items-start gap-3 ${loginCount >= 5 ? "bg-red-50 border-red-300" : "bg-amber-50 border-amber-300"}`}>
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${loginCount >= 5 ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <p className={`text-sm font-semibold ${loginCount >= 5 ? "text-red-800" : "text-amber-800"}`}>
                  {loginCount >= 5 ? "Final Warning — Account at Risk" : "Profile Incomplete"}
                </p>
                <p className={`text-xs mt-0.5 ${loginCount >= 5 ? "text-red-700" : "text-amber-700"}`}>
                  {loginCount >= 5
                    ? `You have logged in ${loginCount} times without completing your profile. Incomplete accounts will be removed.`
                    : `You have logged in ${loginCount} times without completing your profile. Please complete it now.`}
                </p>
              </div>
            </div>
          )}

          <Card className="border-primary/20 shadow-xl shadow-primary/5">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Select value={title || "none"} onValueChange={(val) => setTitle(val === "none" ? "" : val)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select</SelectItem>
                      <SelectItem value="Mr.">Mr.</SelectItem>
                      <SelectItem value="Mrs.">Mrs.</SelectItem>
                      <SelectItem value="Miss.">Miss.</SelectItem>
                      <SelectItem value="Dr.">Dr.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase())} placeholder="e.g., SIVAKUMAR" required className="uppercase" />
                </div>
                <div>
                  <Label htmlFor="last_name">Last Name / Initial *</Label>
                  <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase())} placeholder="e.g., K" required className="uppercase" />
                </div>
              </div>

              <div>
                <Label htmlFor="gender">Gender *</Label>
                <Select value={gender || "none"} onValueChange={(val) => setGender(val === "none" ? "" : val)}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\+\-\s\(\)]/g, ""))} placeholder="9876543210" required />
              </div>

              <div>
                <Label htmlFor="occupation">Designation *</Label>
                <Select value={occupation} onValueChange={(val) => { setOccupation(val); if (val !== "Others") setOccupationOther(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select your designation" /></SelectTrigger>
                  <SelectContent>{occupationOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {occupation === "Others" && (
                <div>
                  <Label htmlFor="occupation_other">Specify Designation *</Label>
                  <Input id="occupation_other" value={occupationOther} onChange={(e) => setOccupationOther(e.target.value)} placeholder="Enter your designation" required />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button onClick={handleSubmit} disabled={loading} className="w-full bg-primary hover:bg-primary/90 mt-2">
                {loading ? "Saving..." : "Submit & Continue"}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                You can add posting details, photo, address, and social links later from your Profile page.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
