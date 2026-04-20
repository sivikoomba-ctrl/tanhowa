"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, IndianRupee, X, MapPin, Phone, Mail, Users, Briefcase, ChevronDown, ChevronUp, Calendar, Crown, Building2 } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { useT } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

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
  official_designation?: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  occupation: string;
  phone: string;
  photo_url: string;
  role: string;
  official_type?: "state" | "district" | "volunteer" | null;
  posting_details?: PostingDetails;
  social_links?: { instagram?: string; twitter?: string; linkedin?: string; title?: string; gender?: string; qualification?: string };
  address?: string;
  office_address?: string;
  dob?: string;
  last_active_at?: string | null;
  created_at?: string;
}

interface RecentPayment {
  name: string;
  period: string;
  paid_at: string;
}

function getActivityStatus(lastActive: string | null | undefined): { label: string; color: string; dot: string } {
  if (!lastActive) return { label: "—", color: "text-muted-foreground", dot: "bg-gray-300" };
  const diff = Date.now() - new Date(lastActive).getTime();
  const mins = diff / 60000;
  if (mins < 5) return { label: "Online", color: "text-green-600", dot: "bg-green-500" };
  if (mins < 60) return { label: `${Math.floor(mins)}m ago`, color: "text-green-600", dot: "bg-green-400" };
  const hours = diff / 3600000;
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, color: "text-amber-600", dot: "bg-amber-400" };
  const days = diff / 86400000;
  return { label: `${Math.floor(days)}d ago`, color: "text-muted-foreground", dot: "bg-gray-300" };
}

function getDesignationRank(occupation: string): number {
  const o = (occupation || "").toLowerCase();
  if (o.includes("additional director")) return 1;  // ADDH
  if (o.includes("joint director")) return 2;       // JDH
  if (o.includes("deputy director")) return 3;      // DDH
  if (o.includes("assistant director")) return 4;   // ADH
  if (o.includes("horticultural officer") && !o.includes("retd")) return 5; // HO
  if (o.includes("retd")) return 6;
  return 7;
}

function hasPosting(p?: PostingDetails) {
  if (!p) return false;
  return !!(p.regular_district || p.regular_block || p.special_duty_district || p.special_duty_block || p.special_duty_place || p.deputed_district || p.deputed_block);
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterOccupation, setFilterOccupation] = useState("all");
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [viewPhoto, setViewPhoto] = useState<{ url: string; name: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    fetch("/api/users?limit=10000")
      .then((r) => r.json())
      .then((d) => setMembers(d.users || []))
      .catch(() => toast.error("Failed to load members"))
      .finally(() => setLoaded(true));
    fetch("/api/subscriptions/recent-payments")
      .then((r) => r.json())
      .then((d) => setRecentPayments(d.payments || []))
      .catch(() => {});
  }, []);

  const districts = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => {
      if (m.posting_details?.regular_district) set.add(m.posting_details.regular_district);
    });
    return Array.from(set).sort();
  }, [members]);

  const occupations = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => {
      if (m.occupation) set.add(m.occupation);
    });
    return Array.from(set).sort();
  }, [members]);

  const filtered = useMemo(() => {
    const list = members.filter((m) => {
      const q = search.toLowerCase();
      const matchesSearch = !search ||
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.occupation?.toLowerCase().includes(q) ||
        m.phone?.includes(q) ||
        m.posting_details?.regular_district?.toLowerCase().includes(q) ||
        m.posting_details?.regular_block?.toLowerCase().includes(q) ||
        (m.posting_details as Record<string, string> | undefined)?.special_duty_district?.toLowerCase().includes(q) ||
        (m.posting_details as Record<string, string> | undefined)?.deputed_district?.toLowerCase().includes(q);
      const matchesDistrict = filterDistrict === "all" || m.posting_details?.regular_district === filterDistrict;
      const matchesOccupation = filterOccupation === "all" || m.occupation === filterOccupation;
      return matchesSearch && matchesDistrict && matchesOccupation;
    });

    // Sort: district → designation rank → block
    list.sort((a, b) => {
      const distA = (a.posting_details?.regular_district || "zzz").toLowerCase();
      const distB = (b.posting_details?.regular_district || "zzz").toLowerCase();
      if (distA !== distB) return distA.localeCompare(distB);
      const rankA = getDesignationRank(a.occupation);
      const rankB = getDesignationRank(b.occupation);
      if (rankA !== rankB) return rankA - rankB;
      const blockA = (a.posting_details?.regular_block || "").toLowerCase();
      const blockB = (b.posting_details?.regular_block || "").toLowerCase();
      return blockA.localeCompare(blockB);
    });

    return list;
  }, [members, search, filterDistrict, filterOccupation]);

  const adminCount = members.filter((m) => m.role === "admin" || m.role === "super_admin").length;
  const officialCount = members.filter((m) => m.official_type === "state" || m.official_type === "district").length;
  const onlineCount = members.filter((m) => {
    if (!m.last_active_at) return false;
    return (Date.now() - new Date(m.last_active_at).getTime()) < 5 * 60 * 1000;
  }).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("members.title")}</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label={t("members.total")} value={members.length} subtitle={onlineCount > 0 ? `${onlineCount} online` : undefined} icon={Users} loading={!loaded} borderColor="border-l-primary" iconColor="text-primary/40" subtitleColor="text-green-600" />
        <MetricCard label={t("members.districts")} value={districts.length} subtitle="of 38" icon={MapPin} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" subtitleColor="text-blue-600" />
        <MetricCard label={t("members.officials")} value={officialCount} icon={Briefcase} loading={!loaded} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
        <MetricCard label={t("members.admins")} value={adminCount} icon={Users} loading={!loaded} borderColor="border-l-amber-500" iconColor="text-amber-500/40" subtitleColor="text-amber-600" />
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("members.search_placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterDistrict} onValueChange={setFilterDistrict}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Districts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("members.all_districts")}</SelectItem>
                {districts.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterOccupation} onValueChange={setFilterOccupation}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Designations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("members.all_designations")}</SelectItem>
                {occupations.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(search || filterDistrict !== "all" || filterOccupation !== "all") && (
            <p className="text-xs text-muted-foreground mt-2">{t("members.of_shown", { filtered: filtered.length, total: members.length })}</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Payments Scrolling Ticker */}
      {recentPayments.length > 0 && (
        <div className="rounded-xl border bg-green-50/80 border-green-200 overflow-hidden w-full">
          <div className="flex items-center min-w-0">
            <div className="bg-green-600 text-white px-3 py-2 text-xs font-semibold shrink-0 flex items-center gap-1.5">
              <IndianRupee size={14} />
              {t("members.recent_payments")}
            </div>
            <div className="flex-1 overflow-hidden relative py-2 min-w-0">
              <div
                ref={tickerRef}
                className="flex gap-8 animate-scroll whitespace-nowrap px-4"
                style={{
                  animation: `scroll ${Math.max(recentPayments.length * 5, 15)}s linear infinite`,
                }}
              >
                {[...recentPayments, ...recentPayments].map((p, i) => (
                  <span key={i} className="text-xs text-green-800 inline-flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    Thank you <span className="font-semibold uppercase">{p.name}</span> for your {p.period} subscription payment!
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members List */}
      {filtered.length === 0 && loaded ? (
        <EmptyState icon={Users} title={t("members.no_members")} description={search ? t("members.try_different") : undefined} />
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const isExpanded = expandedId === m.id;
            const activity = getActivityStatus(m.last_active_at);
            return (
              <Card key={m.id} className="hover:shadow-md transition-all hover:border-primary/20">
                <CardContent className="pt-4 pb-4">
                  {/* Header row — always visible */}
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        className="w-12 h-12 ring-2 ring-transparent hover:ring-primary/20 transition-all"
                        onClick={(e) => { if (m.photo_url) { e.stopPropagation(); setViewPhoto({ url: m.photo_url, name: m.name }); } }}
                      >
                        {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                          {m.name?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${activity.dot}`} title={activity.label} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-sm truncate uppercase">{m.name || "Unnamed"}</h3>
                        {(m.role === "admin" || m.role === "super_admin") && (
                          <Badge className={`text-[10px] px-1.5 py-0 ${m.role === "super_admin" ? "bg-amber-600 hover:bg-amber-600 text-white" : "bg-accent/15 text-accent border-accent/30"}`}>
                            {m.role === "super_admin" ? "State-Admin" : "Admin"}
                          </Badge>
                        )}
                        {m.official_type === "state" && (
                          <Badge className="bg-purple-600 hover:bg-purple-600 text-white text-[10px] px-1.5 py-0">
                            <Crown size={9} className="mr-0.5" />State
                          </Badge>
                        )}
                        {m.official_type === "district" && (
                          <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-[10px] px-1.5 py-0">
                            <Building2 size={9} className="mr-0.5" />{m.posting_details?.official_designation || "District"}
                          </Badge>
                        )}
                        {m.official_type === "volunteer" && (
                          <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px] px-1.5 py-0">
                            <Users size={9} className="mr-0.5" />Volunteer
                          </Badge>
                        )}
                      </div>
                      {m.occupation && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.occupation}{m.posting_details?.official_designation ? ` / ${m.posting_details.official_designation}` : ""}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {(m.posting_details?.regular_district || m.posting_details?.regular_block) && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin size={10} className="shrink-0" />
                            {[m.posting_details.regular_district, m.posting_details.regular_block].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {m.phone && (
                          <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                            <Phone size={10} /> {m.phone}
                          </a>
                        )}
                        <span className={`text-[11px] ${activity.color}`}>{activity.label}</span>
                      </div>
                    </div>

                    <div className="shrink-0 mt-1">
                      {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-start gap-2 min-w-0">
                          <Mail size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">{t("form.email")}</p>
                            <a href={`mailto:${m.email}`} className="font-medium text-primary hover:underline break-all">{m.email}</a>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Phone size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">{t("form.phone")}</p>
                            <p className="font-medium">{m.phone || "—"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Briefcase size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">{t("form.designation")}</p>
                            <p className="font-medium">{m.occupation || "—"}</p>
                          </div>
                        </div>
                        {m.dob && (
                          <div className="flex items-start gap-2">
                            <Calendar size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">{t("form.dob")}</p>
                              <p className="font-medium">{formatDate(m.dob)}</p>
                            </div>
                          </div>
                        )}
                        {m.office_address && (
                          <div className="flex items-start gap-2">
                            <MapPin size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">{t("form.office_address")}</p>
                              <p className="font-medium">{m.office_address}</p>
                            </div>
                          </div>
                        )}
                        {m.address && (
                          <div className="flex items-start gap-2">
                            <MapPin size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">{t("form.address")}</p>
                              <p className="font-medium">{m.address}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Posting Details */}
                      {hasPosting(m.posting_details) && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("profile.posting_details")}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm bg-muted/50 rounded-lg p-3">
                            {(m.posting_details?.regular_district || m.posting_details?.regular_block) && (
                              <div>
                                <p className="text-xs font-semibold text-primary">{t("form.district")}</p>
                                {m.posting_details.regular_district && <p>{m.posting_details.regular_district}</p>}
                                {m.posting_details.regular_block && <p>{t("form.block")}: {m.posting_details.regular_block}</p>}
                              </div>
                            )}
                            {(m.posting_details?.special_duty_district || m.posting_details?.special_duty_block || m.posting_details?.special_duty_place) && (
                              <div>
                                <p className="text-xs font-semibold text-accent">Special Duty</p>
                                {m.posting_details.special_duty_district && <p>{m.posting_details.special_duty_district}</p>}
                                {m.posting_details.special_duty_block && <p>{m.posting_details.special_duty_block}</p>}
                                {m.posting_details.special_duty_place && <p>{m.posting_details.special_duty_place}</p>}
                              </div>
                            )}
                            {(m.posting_details?.deputed_district || m.posting_details?.deputed_block) && (
                              <div>
                                <p className="text-xs font-semibold text-secondary">Deputed</p>
                                {m.posting_details.deputed_district && <p>{m.posting_details.deputed_district}</p>}
                                {m.posting_details.deputed_block && <p>{m.posting_details.deputed_block}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Social Links */}
                      {(m.social_links?.instagram || m.social_links?.twitter || m.social_links?.linkedin) && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("profile.social_links")}</h4>
                          <div className="flex flex-wrap gap-2 text-sm">
                            {m.social_links.instagram && <Badge variant="outline">Instagram: {m.social_links.instagram}</Badge>}
                            {m.social_links.twitter && <Badge variant="outline">Twitter: {m.social_links.twitter}</Badge>}
                            {m.social_links.linkedin && <Badge variant="outline">LinkedIn: {m.social_links.linkedin}</Badge>}
                          </div>
                        </div>
                      )}

                      {/* Joined date */}
                      {m.created_at && (
                        <p className="text-xs text-muted-foreground">
                          Joined: {formatDate(m.created_at)}
                          {m.last_active_at && (
                            <span className={`ml-3 ${activity.color}`}>
                              Active: {activity.label}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Photo Viewer Dialog */}
      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
          <button
            onClick={() => setViewPhoto(null)}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {viewPhoto && (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewPhoto.url}
                alt={viewPhoto.name}
                className="w-full max-h-[70vh] object-contain bg-black/5"
              />
              <p className="py-3 text-sm font-semibold text-center uppercase">{viewPhoto.name}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
