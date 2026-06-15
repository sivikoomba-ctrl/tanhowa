"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Shield, ShieldX, ShieldCheck, Trash2, ChevronDown, ChevronUp, Phone, Mail, MapPin, Briefcase, Calendar, Send, Clock, Crown, Building2, Pencil, Copy, Users, CreditCard, ImageOff } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

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
  social_links: { instagram?: string; twitter?: string; linkedin?: string; title?: string; gender?: string; qualification?: string };
  photo_url: string;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
  profile_nudge: { fields: string[]; message: string; requested_at: string } | null;
  official_type: "state" | "district" | "volunteer" | null;
}

interface UserCardProps {
  user: User;
  isExpanded: boolean;
  isSelected: boolean;
  tab: string;
  onExpandToggle: () => void;
  onSelectToggle: () => void;
  onAction: (action: string, extra?: string) => void;
  onEditClick: () => void;
  onNudgeClick: () => void;
  onPhotoZoom: (name: string, url: string) => void;
  callerEmail?: string;
  /** True when the viewer is super-admin or a state official — gates "Remove Photo". */
  callerCanRemovePhoto?: boolean;
}

function getActivityStatus(lastActive: string | null): { label: string; color: string; dot: string } {
  if (!lastActive) return { label: "Never", color: "text-muted-foreground", dot: "bg-gray-300" };
  const diff = Date.now() - new Date(lastActive).getTime();
  const mins = diff / 60000;
  if (mins < 5) return { label: "Online", color: "text-green-600", dot: "bg-green-500" };
  if (mins < 60) return { label: `${Math.floor(mins)}m ago`, color: "text-green-600", dot: "bg-green-400" };
  const hours = diff / 3600000;
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, color: "text-amber-600", dot: "bg-amber-400" };
  const days = diff / 86400000;
  return { label: `${Math.floor(days)}d ago`, color: "text-muted-foreground", dot: "bg-gray-300" };
}

function hasPosting(p?: PostingDetails) {
  if (!p) return false;
  return !!(p.regular_district || p.regular_block || p.special_duty_district || p.special_duty_block || p.special_duty_place || p.deputed_district || p.deputed_block);
}

function hasSocial(s?: { instagram?: string; twitter?: string; linkedin?: string }) {
  if (!s) return false;
  return !!(s.instagram || s.twitter || s.linkedin);
}

function getNudgePendingFields(u: User): string[] {
  if (!u.profile_nudge?.fields) return [];
  const fieldChecks: Record<string, boolean> = {
    "Name": !!u.name?.trim(),
    "Phone": !!u.phone?.trim(),
    "Date of Birth": !!u.dob,
    "Gender": !!(u.social_links as Record<string, string>)?.gender,
    "Designation": !!u.occupation?.trim(),
    "Qualification": !!(u.social_links as Record<string, string>)?.qualification,
    "Home Address": !!u.address?.trim(),
    "Office Address": !!u.office_address?.trim(),
    "Posting Details": hasPosting(u.posting_details),
    "Photo": !!u.photo_url,
    "Experience": !!(u.social_links as Record<string, unknown[]>)?.experience?.length,
    "Skill Sets": !!(u.social_links as Record<string, unknown>)?.skill_sets && Object.keys((u.social_links as Record<string, Record<string, unknown>>)?.skill_sets || {}).length > 0,
    "Social Links": !!(u.social_links?.instagram || u.social_links?.twitter || u.social_links?.linkedin),
  };
  return u.profile_nudge.fields.filter((f) => !fieldChecks[f]);
}

function getProfileCompleteness(u: User): { percent: number; missing: string[] } {
  const sl = u.social_links || {};
  const fields: { key: string; label: string; check: boolean }[] = [
    { key: "name", label: "Name", check: !!u.name?.trim() },
    { key: "phone", label: "Phone", check: !!u.phone?.trim() },
    { key: "title", label: "Title (Mr./Mrs./Dr.)", check: !!sl.title },
    { key: "gender", label: "Gender", check: !!sl.gender },
    { key: "dob", label: "Date of Birth", check: !!u.dob },
    { key: "occupation", label: "Designation", check: !!u.occupation?.trim() },
    { key: "photo", label: "Photo", check: !!u.photo_url },
    { key: "office_address", label: "Office Address", check: !!u.office_address?.trim() },
    { key: "posting", label: "Posting Details", check: hasPosting(u.posting_details) },
    { key: "address", label: "Home Address", check: !!u.address?.trim() },
  ];
  const filled = fields.filter((f) => f.check).length;
  const missing = fields.filter((f) => !f.check).map((f) => f.label);
  return { percent: Math.round((filled / fields.length) * 100), missing };
}

export default function UserCard({ user: u, isExpanded, isSelected, tab, onExpandToggle, onSelectToggle, onAction, onEditClick, onNudgeClick, onPhotoZoom, callerEmail, callerCanRemovePhoto }: UserCardProps) {
  const profile = getProfileCompleteness(u);
  return (
    <Card className={isSelected ? "border-primary/50 bg-primary/[0.02]" : ""}>
      <CardContent className="pt-4">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            className="flex-1 cursor-pointer flex items-start gap-3"
            onClick={onExpandToggle}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); onSelectToggle(); }}
              onClick={(e) => e.stopPropagation()}
              className="mt-3 shrink-0 accent-primary"
            />
            <div className="relative shrink-0">
              <div
                className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden ${u.photo_url ? "cursor-zoom-in" : ""}`}
                onClick={(e) => { if (u.photo_url) { e.stopPropagation(); onPhotoZoom(u.name, u.photo_url); } }}
              >
                {u.photo_url ? <Image src={u.photo_url} alt={u.name} width={80} height={80} unoptimized className="w-full h-full object-cover" /> : <span className="text-sm font-semibold text-primary">{u.name?.charAt(0)?.toUpperCase() || "?"}</span>}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getActivityStatus(u.last_active_at).dot}`} title={getActivityStatus(u.last_active_at).label} />
            </div>
            <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold uppercase">{u.name || "Unnamed"}</h3>
              <button
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Copy name"
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(u.name || ""); toast.success("Copied"); }}
              >
                <Copy size={12} />
              </button>
              <Badge variant={u.role === "admin" || u.role === "super_admin" ? "default" : "outline"} className={`text-xs ${u.role === "super_admin" ? "bg-amber-600 hover:bg-amber-600" : ""}`}>
                {u.role === "super_admin" ? "State-Admin" : u.role}
              </Badge>
              {u.official_type === "state" && (
                <Badge className="text-xs bg-purple-600 hover:bg-purple-600 text-white">
                  <Crown size={10} className="mr-1" />State Official
                </Badge>
              )}
              {u.official_type === "district" && (
                <Badge className="text-xs bg-blue-600 hover:bg-blue-600 text-white">
                  <Building2 size={10} className="mr-1" />District-Admin
                </Badge>
              )}
              {u.official_type === "volunteer" && (
                <Badge className="text-xs bg-green-600 hover:bg-green-600 text-white">
                  <Users size={10} className="mr-1" />Volunteer Admin
                </Badge>
              )}
              {tab === "all" && (
                <Badge className={`text-xs ${u.status === "approved" ? "bg-green-100 text-green-800 hover:bg-green-100" : u.status === "pending" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-red-100 text-red-800 hover:bg-red-100"}`}>
                  {u.status}
                </Badge>
              )}
              {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </div>
            <p className="text-sm text-muted-foreground">{u.email}</p>
            {u.occupation && <p className="text-xs text-muted-foreground">{u.occupation}</p>}
            {u.status === "pending" && (!u.name?.trim() || !u.occupation?.trim()) && (
              <p className="text-xs text-red-600 font-medium mt-0.5">
                Missing: {[!u.name?.trim() && "Name", !u.occupation?.trim() && "Designation"].filter(Boolean).join(", ")}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${profile.percent === 100 ? "bg-green-500" : profile.percent >= 75 ? "bg-blue-500" : profile.percent >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${profile.percent}%` }} />
              </div>
              <span className={`text-[10px] font-medium ${profile.percent === 100 ? "text-green-600" : profile.percent >= 75 ? "text-blue-600" : profile.percent >= 50 ? "text-amber-600" : "text-red-600"}`}>
                {profile.percent}%
              </span>
              {profile.missing.length > 0 && profile.percent < 100 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onNudgeClick(); }}
                  className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100 cursor-pointer"
                  title="Click to request these fields"
                >
                  <Send size={8} />
                  {profile.missing.join(", ")}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Joined: {formatDate(u.created_at)}
              {u.last_active_at && (
                <span className={`ml-3 ${getActivityStatus(u.last_active_at).color}`}>
                  Active: {getActivityStatus(u.last_active_at).label}
                </span>
              )}
            </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {tab === "pending" && (
              <>
                <Button
                  size="sm"
                  onClick={() => onAction("approve")}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Check size={14} className="mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onAction("reject")}
                >
                  <X size={14} className="mr-1" />
                  Reject
                </Button>
              </>
            )}
            {tab === "approved" && u.role !== "admin" && u.role !== "super_admin" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("set-role", "admin")}
              >
                <Shield size={14} className="mr-1" />
                Make Admin
              </Button>
            )}
            {tab === "approved" && u.role === "admin" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("set-role", "member")}
              >
                Remove Admin
              </Button>
            )}
            {(tab === "approved" || (tab === "all" && u.status === "approved")) && !u.official_type && (
              <>
                <Button size="sm" variant="outline" className="text-purple-700 border-purple-300 hover:bg-purple-50" onClick={() => onAction("set-official-state")}>
                  <Crown size={14} className="mr-1" />State Official
                </Button>
                <Button size="sm" variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-50" onClick={() => onAction("set-official-district")}>
                  <Building2 size={14} className="mr-1" />District-Admin
                </Button>
                <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => onAction("set-official-volunteer")}>
                  <Users size={14} className="mr-1" />Invite Volunteer
                </Button>
              </>
            )}
            {(tab === "approved" || (tab === "all" && u.status === "approved")) && u.official_type && (
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onAction("remove-official")}>
                <X size={14} className="mr-1" />Remove Official
              </Button>
            )}
            {callerCanRemovePhoto && u.photo_url && (
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onAction("remove-photo")}>
                <ImageOff size={14} className="mr-1" />Remove Photo
              </Button>
            )}
            {tab === "rejected" && (
              <Button
                size="sm"
                onClick={() => onAction("approve")}
                className="bg-primary hover:bg-primary/90"
              >
                <Check size={14} className="mr-1" />
                Approve
              </Button>
            )}
            {tab === "all" && u.status !== "approved" && (
              <Button
                size="sm"
                onClick={() => onAction("approve")}
                className="bg-primary hover:bg-primary/90"
              >
                <Check size={14} className="mr-1" />
                Approve
              </Button>
            )}
            {tab === "all" && u.status === "approved" && u.role !== "admin" && u.role !== "super_admin" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("set-role", "admin")}
              >
                <Shield size={14} className="mr-1" />
                Make Admin
              </Button>
            )}
            {callerEmail === "tanhowa19791@gmail.com" && u.status === "approved" && u.role !== "super_admin" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("suspend")}
                className="text-red-700 border-red-300 hover:bg-red-50"
              >
                <ShieldX size={14} className="mr-1" />
                Suspend
              </Button>
            )}
            {callerEmail === "tanhowa19791@gmail.com" && u.status === "suspended" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("reinstate")}
                className="text-green-700 border-green-300 hover:bg-green-50"
              >
                <ShieldCheck size={14} className="mr-1" />
                Reinstate
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAction("delete")}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <Mail size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{u.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{u.phone || "\u2014"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Date of Birth</p>
                  <p className="font-medium">{u.dob ? formatDate(u.dob) : "\u2014"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Briefcase size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Designation</p>
                  <p className="font-medium">{u.occupation || "\u2014"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Home Address</p>
                  <p className="font-medium">{u.address || "\u2014"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Office Address</p>
                  <p className="font-medium">{u.office_address || "\u2014"}</p>
                </div>
              </div>
            </div>

            {/* Posting Details */}
            {hasPosting(u.posting_details) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Posting Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm bg-muted/50 rounded-lg p-3">
                  {(u.posting_details.regular_district || u.posting_details.regular_block) && (
                    <div>
                      <p className="text-xs font-semibold text-primary">Regular Posting</p>
                      {u.posting_details.regular_district && <p>District: {u.posting_details.regular_district}</p>}
                      {u.posting_details.regular_block && <p>Posting: {u.posting_details.regular_block}</p>}
                    </div>
                  )}
                  {(u.posting_details.special_duty_district || u.posting_details.special_duty_block || u.posting_details.special_duty_place) && (
                    <div>
                      <p className="text-xs font-semibold text-accent">Special Duty</p>
                      {u.posting_details.special_duty_district && <p>District: {u.posting_details.special_duty_district}</p>}
                      {u.posting_details.special_duty_block && <p>Posting: {u.posting_details.special_duty_block}</p>}
                      {u.posting_details.special_duty_place && u.posting_details.special_duty_place.toLowerCase() !== "nil" && <p>Place: {u.posting_details.special_duty_place}</p>}
                    </div>
                  )}
                  {(u.posting_details.deputed_district || u.posting_details.deputed_block) && (
                    <div>
                      <p className="text-xs font-semibold text-secondary">Deputed</p>
                      {u.posting_details.deputed_district && <p>District: {u.posting_details.deputed_district}</p>}
                      {u.posting_details.deputed_block && <p>Posting: {u.posting_details.deputed_block}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Subscriptions */}
            {(tab === "approved" || (tab === "all" && u.status === "approved")) && (
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction("view-subscriptions")}
                  className="text-primary border-primary/30 hover:bg-primary/5"
                >
                  <CreditCard size={14} className="mr-1" />
                  Subscriptions
                </Button>
              </div>
            )}

            {/* Request Update */}
            {(tab === "approved" || (tab === "all" && u.status === "approved")) && (
              <div className="space-y-2">
                {u.profile_nudge && (() => {
                  const pending = getNudgePendingFields(u);
                  if (pending.length === 0) return (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                      <p className="text-green-700 font-medium">All requested fields have been updated.</p>
                    </div>
                  );
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 text-amber-800 font-medium mb-1">
                        <Clock size={14} />
                        Update requested on {new Date(u.profile_nudge.requested_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                      <p className="text-amber-700">Pending: {pending.join(", ")}</p>
                      {u.profile_nudge.message && <p className="text-amber-600 text-xs mt-1">{u.profile_nudge.message}</p>}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onEditClick}
                    className="text-primary border-primary/30 hover:bg-primary/5"
                  >
                    <Pencil size={14} className="mr-1" />
                    Edit Profile
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onNudgeClick}
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                  >
                    <Send size={14} className="mr-1" />
                    {u.profile_nudge ? "Send New Request" : "Request Update"}
                  </Button>
                </div>
              </div>
            )}

            {/* Social Links */}
            {hasSocial(u.social_links) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Social Links</h4>
                <div className="flex flex-wrap gap-3 text-sm">
                  {u.social_links.instagram && (
                    <Badge variant="outline">Instagram: {u.social_links.instagram}</Badge>
                  )}
                  {u.social_links.twitter && (
                    <Badge variant="outline">Twitter: {u.social_links.twitter}</Badge>
                  )}
                  {u.social_links.linkedin && (
                    <Badge variant="outline">LinkedIn: {u.social_links.linkedin}</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
