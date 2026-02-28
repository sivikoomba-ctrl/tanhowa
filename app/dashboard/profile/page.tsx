"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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
  social_links: { instagram: string; twitter: string; linkedin: string };
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const occ = d.user.occupation || "";
          const isPreset = occupationOptions.includes(occ);
          setProfile({
            ...d.user,
            dob: d.user.dob || "",
            occupation: isPreset ? occ : (occ ? "Others" : ""),
            occupation_other: isPreset ? "" : occ,
            posting_details: d.user.posting_details || emptyPosting,
            social_links: d.user.social_links || { instagram: "", twitter: "", linkedin: "" },
          });
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
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
      if (res.ok) toast.success("Profile updated");
      else toast.error("Failed to update profile");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!profile) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={profile.email} disabled className="bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Full Name</Label>
                <Input
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone *</Label>
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={profile.dob}
                  onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                />
              </div>
              <div>
                <Label>Occupation *</Label>
                <Select
                  value={profile.occupation}
                  onValueChange={(val) => setProfile({ ...profile, occupation: val, occupation_other: val !== "Others" ? "" : profile.occupation_other })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select designation" />
                  </SelectTrigger>
                  <SelectContent>
                    {occupationOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {profile.occupation === "Others" && (
              <div>
                <Label>Specify Occupation *</Label>
                <Input
                  value={profile.occupation_other}
                  onChange={(e) => setProfile({ ...profile, occupation_other: e.target.value })}
                  placeholder="Enter your designation"
                  required
                />
              </div>
            )}
            <div>
              <Label>Address</Label>
              <Textarea
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                rows={2}
              />
            </div>

            <h3 className="text-sm font-medium pt-2">Posting Details</h3>
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="text-xs font-semibold text-primary mb-2">Regular Posting</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>District</Label>
                    <Input
                      value={profile.posting_details.regular_district}
                      onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_district: e.target.value } })}
                      placeholder="District name"
                    />
                  </div>
                  <div>
                    <Label>Block</Label>
                    <Input
                      value={profile.posting_details.regular_block}
                      onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, regular_block: e.target.value } })}
                      placeholder="Block name"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-accent mb-2">Special Duty (if applicable)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>District</Label>
                    <Input
                      value={profile.posting_details.special_duty_district}
                      onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_district: e.target.value } })}
                      placeholder="District name"
                    />
                  </div>
                  <div>
                    <Label>Block</Label>
                    <Input
                      value={profile.posting_details.special_duty_block}
                      onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_block: e.target.value } })}
                      placeholder="Block name"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Place (other than above)</Label>
                    <Input
                      value={profile.posting_details.special_duty_place}
                      onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, special_duty_place: e.target.value } })}
                      placeholder="Place name"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-secondary mb-2">Deputed (if applicable)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>District</Label>
                    <Input
                      value={profile.posting_details.deputed_district}
                      onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_district: e.target.value } })}
                      placeholder="District name"
                    />
                  </div>
                  <div>
                    <Label>Block</Label>
                    <Input
                      value={profile.posting_details.deputed_block}
                      onChange={(e) => setProfile({ ...profile, posting_details: { ...profile.posting_details, deputed_block: e.target.value } })}
                      placeholder="Block name"
                    />
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-medium pt-2">Social Links</h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Instagram</Label>
                <Input
                  value={profile.social_links.instagram}
                  onChange={(e) =>
                    setProfile({ ...profile, social_links: { ...profile.social_links, instagram: e.target.value } })
                  }
                />
              </div>
              <div>
                <Label>Twitter / X</Label>
                <Input
                  value={profile.social_links.twitter}
                  onChange={(e) =>
                    setProfile({ ...profile, social_links: { ...profile.social_links, twitter: e.target.value } })
                  }
                />
              </div>
              <div>
                <Label>LinkedIn</Label>
                <Input
                  value={profile.social_links.linkedin}
                  onChange={(e) =>
                    setProfile({ ...profile, social_links: { ...profile.social_links, linkedin: e.target.value } })
                  }
                />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
