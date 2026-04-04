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
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/translations";

const occupationOptions: { value: string; key: TranslationKey }[] = [
  { value: "Horticultural Officer", key: "opt.ho" },
  { value: "Assistant Director of Horticulture", key: "opt.adh" },
  { value: "Deputy Director of Horticulture", key: "opt.ddh" },
  { value: "Joint Director of Horticulture", key: "opt.jdh" },
  { value: "Additional Director of Horticulture", key: "opt.addh" },
  { value: "System Admin", key: "opt.system_admin" },
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

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loginCount, setLoginCount] = useState(0);
  const router = useRouter();
  const t = useT();

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
    if (!firstName.trim()) { setError(t("onboard.err_first_name")); return; }
    if (!lastName.trim()) { setError(t("onboard.err_last_name")); return; }
    if (!phone.trim()) { setError(t("onboard.err_phone")); return; }
    if (!isValidPhone(phone)) { setError(t("onboard.err_phone_invalid")); return; }
    if (!occupation) { setError(t("onboard.err_designation")); return; }
    if (!title) { setError(t("onboard.err_title")); return; }
    if (!gender) { setError(t("onboard.err_gender")); return; }

    setLoading(true);
    try {
      const nameWithoutTitle = `${firstName.trim()} ${lastName.trim()}`.toUpperCase();
      const fullName = `${title} ${nameWithoutTitle}`;
      const finalOccupation = occupation;
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
    } catch { setError(t("onboard.err_generic")); }
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
              <h2 className="text-2xl font-bold text-foreground mb-2">{t("onboard.profile_submitted")}</h2>
              <p className="text-muted-foreground">{t("onboard.awaiting_approval")}</p>
              <p className="text-sm text-muted-foreground mt-3">{t("onboard.complete_later")}</p>
              <Button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }} variant="outline" className="mt-6">{t("onboard.back_home")}</Button>
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
            <h1 className="text-3xl font-bold text-primary">{t("onboard.welcome")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("onboard.fill_details")}</p>
          </div>

          {loginCount >= 3 && (
            <div className={`rounded-xl border px-4 py-3 mb-5 flex items-start gap-3 ${loginCount >= 5 ? "bg-red-50 border-red-300" : "bg-amber-50 border-amber-300"}`}>
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${loginCount >= 5 ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <p className={`text-sm font-semibold ${loginCount >= 5 ? "text-red-800" : "text-amber-800"}`}>
                  {loginCount >= 5 ? t("onboard.final_warning") : t("onboard.profile_incomplete")}
                </p>
                <p className={`text-xs mt-0.5 ${loginCount >= 5 ? "text-red-700" : "text-amber-700"}`}>
                  {loginCount >= 5
                    ? t("onboard.warn_final", { count: String(loginCount) })
                    : t("onboard.warn_login_count", { count: String(loginCount) })}
                </p>
              </div>
            </div>
          )}

          <Card className="border-primary/20 shadow-xl shadow-primary/5">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="title">{t("onboard.title")} *</Label>
                  <Select value={title || "none"} onValueChange={(val) => setTitle(val === "none" ? "" : val)}>
                    <SelectTrigger><SelectValue placeholder={t("opt.select")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("opt.select")}</SelectItem>
                      <SelectItem value="Mr.">{t("opt.mr")}</SelectItem>
                      <SelectItem value="Mrs.">{t("opt.mrs")}</SelectItem>
                      <SelectItem value="Miss.">{t("opt.miss")}</SelectItem>
                      <SelectItem value="Dr.">{t("opt.dr")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="first_name">{t("onboard.first_name")} *</Label>
                  <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase())} placeholder={t("ph.first_name")} required className="uppercase" />
                </div>
                <div>
                  <Label htmlFor="last_name">{t("onboard.last_name")} *</Label>
                  <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value.replace(/[^A-Za-z\s.]/g, "").toUpperCase())} placeholder={t("ph.last_name")} required className="uppercase" />
                </div>
              </div>

              <div>
                <Label htmlFor="gender">{t("form.gender")} *</Label>
                <Select value={gender || "none"} onValueChange={(val) => setGender(val === "none" ? "" : val)}>
                  <SelectTrigger><SelectValue placeholder={t("ph.select_gender")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("opt.select")}</SelectItem>
                    <SelectItem value="Male">{t("opt.male")}</SelectItem>
                    <SelectItem value="Female">{t("opt.female")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="phone">{t("form.phone")} *</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\+\-\s\(\)]/g, ""))} placeholder="9876543210" required />
              </div>

              <div>
                <Label htmlFor="occupation">{t("form.designation")} *</Label>
                <Select value={occupation} onValueChange={setOccupation}>
                  <SelectTrigger><SelectValue placeholder={t("ph.designation")} /></SelectTrigger>
                  <SelectContent>{occupationOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{t(opt.key)}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button onClick={handleSubmit} disabled={loading} className="w-full bg-primary hover:bg-primary/90 mt-2">
                {loading ? t("onboard.saving") : t("onboard.submit_continue")}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                {t("onboard.add_later")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
