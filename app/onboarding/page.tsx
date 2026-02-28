"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flower2, Clock } from "lucide-react";
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

interface PostingDetails {
  regular_district: string;
  regular_block: string;
  special_duty_district: string;
  special_duty_block: string;
  special_duty_place: string;
  deputed_district: string;
  deputed_block: string;
}

const emptyPosting: PostingDetails = {
  regular_district: "",
  regular_block: "",
  special_duty_district: "",
  special_duty_block: "",
  special_duty_place: "",
  deputed_district: "",
  deputed_block: "",
};

interface UserProfile {
  name: string;
  phone: string;
  address: string;
  dob: string;
  occupation: string;
  occupation_other: string;
  posting_details: PostingDetails;
  social_links: {
    instagram: string;
    twitter: string;
    linkedin: string;
  };
  status: string;
}

export default function OnboardingPage() {
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    phone: "",
    address: "",
    dob: "",
    occupation: "Horticultural Officer",
    occupation_other: "",
    posting_details: emptyPosting,
    social_links: { instagram: "", twitter: "", linkedin: "" },
    status: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          if (data.user.status === "approved" && data.user.name) {
            router.push("/dashboard");
            return;
          }
          setProfile((prev) => ({
            ...prev,
            name: data.user.name || "",
            phone: data.user.phone || "",
            address: data.user.address || "",
            dob: data.user.dob || "",
            occupation: data.user.occupation || "",
            social_links: data.user.social_links || prev.social_links,
            status: data.user.status || "",
          }));
          if (data.user.name && data.user.status === "pending") {
            setSubmitted(true);
          }
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.name.trim()) {
      setError("Name is required");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const payload = {
        ...profile,
        occupation: profile.occupation === "Others" ? profile.occupation_other : profile.occupation,
      };
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError("Failed to save profile");
        return;
      }

      // Check user status — if already approved, go to dashboard
      const meRes = await fetch("/api/users/me");
      const meData = await meRes.json();
      if (meData.user?.status === "approved") {
        router.push("/dashboard");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <Image src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-md border-primary/20 shadow-xl">
            <CardContent className="pt-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/20 mb-4">
                <Clock className="w-8 h-8 text-secondary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Profile Submitted</h2>
              <p className="text-muted-foreground">
                Your profile is awaiting admin approval. You&apos;ll be able to access the dashboard once approved.
              </p>
              <Button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/");
                }}
                variant="outline"
                className="mt-6"
              >
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Image src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <Flower2 className="w-10 h-10 text-primary mx-auto mb-2" />
            <h1 className="text-3xl font-bold text-primary">Complete Your Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tell us about yourself to join the community
            </p>
          </div>

          <Card className="border-primary/20 shadow-xl shadow-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      placeholder="+91 9876543210"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={profile.dob}
                      onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="occupation">Designation *</Label>
                    <Select
                      value={profile.occupation}
                      onValueChange={(val) => setProfile({ ...profile, occupation: val, occupation_other: val !== "Others" ? "" : profile.occupation_other })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your designation" />
                      </SelectTrigger>
                      <SelectContent>
                        {occupationOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {profile.occupation === "Others" && (
                    <div className="col-span-2">
                      <Label htmlFor="occupation_other">Specify Designation *</Label>
                      <Input
                        id="occupation_other"
                        value={profile.occupation_other}
                        onChange={(e) => setProfile({ ...profile, occupation_other: e.target.value })}
                        placeholder="Enter your designation"
                        required
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      placeholder="Your address"
                      rows={2}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="text-sm font-medium mb-3">Posting Details</h3>
                  <div className="space-y-4 rounded-lg border p-4 mb-4">
                    <div>
                      <p className="text-xs font-semibold text-primary mb-2">Regular Posting</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>District</Label>
                          <Input value={profile.posting_details.regular_district} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_district: e.target.value } })} placeholder="District name" />
                        </div>
                        <div>
                          <Label>Block</Label>
                          <Input value={profile.posting_details.regular_block} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_block: e.target.value } })} placeholder="Block name" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-accent mb-2">Special Duty (if applicable)</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>District</Label>
                          <Input value={profile.posting_details.special_duty_district} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_district: e.target.value } })} placeholder="District name" />
                        </div>
                        <div>
                          <Label>Block</Label>
                          <Input value={profile.posting_details.special_duty_block} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_block: e.target.value } })} placeholder="Block name" />
                        </div>
                        <div className="col-span-2">
                          <Label>Place (other than above)</Label>
                          <Input value={profile.posting_details.special_duty_place} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_place: e.target.value } })} placeholder="Place name" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-secondary mb-2">Deputed (if applicable)</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>District</Label>
                          <Input value={profile.posting_details.deputed_district} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_district: e.target.value } })} placeholder="District name" />
                        </div>
                        <div>
                          <Label>Block</Label>
                          <Input value={profile.posting_details.deputed_block} onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_block: e.target.value } })} placeholder="Block name" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-medium mb-3">Social Links (optional)</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="instagram">Instagram</Label>
                      <Input
                        id="instagram"
                        value={profile.social_links.instagram}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            social_links: { ...profile.social_links, instagram: e.target.value },
                          })
                        }
                        placeholder="@username"
                      />
                    </div>
                    <div>
                      <Label htmlFor="twitter">Twitter / X</Label>
                      <Input
                        id="twitter"
                        value={profile.social_links.twitter}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            social_links: { ...profile.social_links, twitter: e.target.value },
                          })
                        }
                        placeholder="@username"
                      />
                    </div>
                    <div>
                      <Label htmlFor="linkedin">LinkedIn</Label>
                      <Input
                        id="linkedin"
                        value={profile.social_links.linkedin}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            social_links: { ...profile.social_links, linkedin: e.target.value },
                          })
                        }
                        placeholder="linkedin.com/in/username"
                      />
                    </div>
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
                >
                  {loading ? "Saving..." : "Submit Profile"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
