"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { DateDropdowns } from "@/components/date-dropdowns";
import { DISTRICT_NAMES, getBlocks } from "@/lib/tn-districts";

interface PostingDetails {
  regular_district?: string;
  regular_block?: string;
  special_duty_district?: string;
  special_duty_block?: string;
  special_duty_place?: string;
  special_designation?: string;
  special_farm?: string;
  deputed_district?: string;
  deputed_block?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  office_address: string;
  dob: string;
  occupation: string;
  role: string;
  status: string;
  posting_details: PostingDetails;
  social_links: { instagram?: string; twitter?: string; linkedin?: string };
  photo_url: string;
  created_at: string;
  last_active_at: string | null;
  profile_nudge: { fields: string[]; message: string; requested_at: string } | null;
  official_type: "state" | "district" | "volunteer" | null;
}

interface EditUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (userId: string, formData: {
    name: string;
    phone: string;
    occupation: string;
    address: string;
    office_address: string;
    dob: string;
    gender: string;
    posting_details: PostingDetails;
    social_links: Record<string, unknown>;
  }) => Promise<void>;
}

export default function EditUserDialog({ user, open, onOpenChange, onSave }: EditUserDialogProps) {
  const [editForm, setEditForm] = useState({
    title: "", name: "", phone: "", occupation: "", address: "", office_address: "", dob: "", gender: "",
    regular_district: "", regular_block: "",
    special_duty_district: "", special_duty_block: "",
    deputed_district: "", deputed_block: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const sl = user.social_links as Record<string, unknown> | undefined;
      const storedTitle = (sl?.title as string) || "";
      // Strip title prefix from name if present
      let displayName = (user.name || "").toUpperCase();
      const titlePrefixes = ["MR.", "MRS.", "MISS.", "DR."];
      for (const t of titlePrefixes) {
        if (displayName.startsWith(t + " ") || displayName.startsWith(t)) {
          displayName = displayName.substring(t.length).trim();
          break;
        }
      }
      setEditForm({
        title: storedTitle,
        name: displayName,
        phone: user.phone || "",
        occupation: user.occupation || "",
        address: user.address || "",
        office_address: user.office_address || "",
        dob: user.dob || "",
        gender: (user as unknown as { social_links?: { gender?: string } }).social_links?.gender || "",
        regular_district: user.posting_details?.regular_district || "",
        regular_block: user.posting_details?.regular_block || "",
        special_duty_district: user.posting_details?.special_duty_district || "",
        special_duty_block: user.posting_details?.special_duty_block || "",
        deputed_district: user.posting_details?.deputed_district || "",
        deputed_block: user.posting_details?.deputed_block || "",
      });
    }
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setEditSaving(true);
    const fullName = editForm.title ? `${editForm.title} ${editForm.name}` : editForm.name;
    await onSave(user.id, {
      name: fullName,
      phone: editForm.phone,
      occupation: editForm.occupation,
      address: editForm.address,
      office_address: editForm.office_address,
      dob: editForm.dob || "",
      gender: editForm.gender,
      posting_details: {
        ...user.posting_details,
        regular_district: editForm.regular_district,
        regular_block: editForm.regular_block,
        special_duty_district: editForm.special_duty_district,
        special_duty_block: editForm.special_duty_block,
        deputed_district: editForm.deputed_district,
        deputed_block: editForm.deputed_block,
      },
      social_links: {
        ...(user as unknown as { social_links?: Record<string, unknown> }).social_links,
        title: editForm.title || "",
        gender: editForm.gender || "",
      },
    });
    setEditSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Member Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div>
              <Label className="text-sm">Title *</Label>
              <Select value={editForm.title || "none"} onValueChange={(v) => setEditForm({ ...editForm, title: v === "none" ? "" : v })}>
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
              <Label className="text-sm">Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value.toUpperCase() })} className="uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Phone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div>
              <Label className="text-sm">Designation</Label>
              <Input value={editForm.occupation} onChange={(e) => setEditForm({ ...editForm, occupation: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Date of Birth</Label>
              <DateDropdowns value={editForm.dob} onChange={(v) => setEditForm({ ...editForm, dob: v })} minYear={1940} maxYear={new Date().getFullYear() - 18} />
            </div>
            <div>
              <Label className="text-sm">Gender</Label>
              <Select value={editForm.gender || "none"} onValueChange={(v) => setEditForm({ ...editForm, gender: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Regular Posting</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">District</Label>
              <Select value={editForm.regular_district || "none"} onValueChange={(v) => setEditForm({ ...editForm, regular_district: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select</SelectItem>
                  {DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Block</Label>
              {editForm.regular_district && getBlocks(editForm.regular_district).length > 0 ? (
                <Select value={editForm.regular_block || "none"} onValueChange={(v) => setEditForm({ ...editForm, regular_block: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {getBlocks(editForm.regular_district).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={editForm.regular_block} onChange={(e) => setEditForm({ ...editForm, regular_block: e.target.value })} />
              )}
            </div>
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Special Duty</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">District</Label>
              <Select value={editForm.special_duty_district || "none"} onValueChange={(v) => setEditForm({ ...editForm, special_duty_district: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select</SelectItem>
                  {DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Block</Label>
              {editForm.special_duty_district && getBlocks(editForm.special_duty_district).length > 0 ? (
                <Select value={editForm.special_duty_block || "none"} onValueChange={(v) => setEditForm({ ...editForm, special_duty_block: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {getBlocks(editForm.special_duty_district).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={editForm.special_duty_block} onChange={(e) => setEditForm({ ...editForm, special_duty_block: e.target.value })} />
              )}
            </div>
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Deputation</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">District</Label>
              <Select value={editForm.deputed_district || "none"} onValueChange={(v) => setEditForm({ ...editForm, deputed_district: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select</SelectItem>
                  {DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Block</Label>
              {editForm.deputed_district && getBlocks(editForm.deputed_district).length > 0 ? (
                <Select value={editForm.deputed_block || "none"} onValueChange={(v) => setEditForm({ ...editForm, deputed_block: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {getBlocks(editForm.deputed_district).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={editForm.deputed_block} onChange={(e) => setEditForm({ ...editForm, deputed_block: e.target.value })} />
              )}
            </div>
          </div>
          <div>
            <Label className="text-sm">Home Address</Label>
            <Textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} />
          </div>
          <div>
            <Label className="text-sm">Office Address</Label>
            <Textarea value={editForm.office_address} onChange={(e) => setEditForm({ ...editForm, office_address: e.target.value })} rows={2} />
          </div>
          <Button onClick={handleSave} disabled={editSaving} className="w-full bg-primary hover:bg-primary/90">
            <Pencil size={14} className="mr-2" />
            {editSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
