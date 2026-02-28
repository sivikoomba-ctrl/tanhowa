"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flower2, Clock } from "lucide-react";

interface UserProfile {
  name: string;
  phone: string;
  address: string;
  dob: string;
  occupation: string;
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
    occupation: "",
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
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      if (!res.ok) {
        setError("Failed to save profile");
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
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0] to-[#f4a261]/10" />
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
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0] to-[#f4a261]/10" />

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
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      placeholder="+91 9876543210"
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
                    <Label htmlFor="occupation">Occupation</Label>
                    <Input
                      id="occupation"
                      value={profile.occupation}
                      onChange={(e) => setProfile({ ...profile, occupation: e.target.value })}
                      placeholder="e.g. Gardener, Botanist, Landscaper"
                    />
                  </div>
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
