"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, IndianRupee, X, MapPin, Phone, Mail, Users, Briefcase } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";

interface Member {
  id: string;
  name: string;
  email: string;
  occupation: string;
  phone: string;
  photo_url: string;
  role: string;
  official_type?: "state" | "district" | null;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
  };
}

interface RecentPayment {
  name: string;
  period: string;
  paid_at: string;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterOccupation, setFilterOccupation] = useState("all");
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [viewPhoto, setViewPhoto] = useState<{ url: string; name: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);

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

  const filtered = members.filter((m) => {
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

  const adminCount = members.filter((m) => m.role === "admin" || m.role === "super_admin").length;
  const officialCount = members.filter((m) => m.official_type === "state" || m.official_type === "district").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Member Directory</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Members" value={members.length} icon={Users} loading={!loaded} borderColor="border-l-primary" iconColor="text-primary/40" subtitleColor="text-primary" />
        <MetricCard label="Districts" value={districts.length} subtitle="of 38" icon={MapPin} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" subtitleColor="text-blue-600" />
        <MetricCard label="Officials" value={officialCount} icon={Briefcase} loading={!loaded} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
        <MetricCard label="Admins" value={adminCount} icon={Users} loading={!loaded} borderColor="border-l-amber-500" iconColor="text-amber-500/40" subtitleColor="text-amber-600" />
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, district, block..."
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
                <SelectItem value="all">All Districts</SelectItem>
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
                <SelectItem value="all">All Designations</SelectItem>
                {occupations.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(search || filterDistrict !== "all" || filterOccupation !== "all") && (
            <p className="text-xs text-muted-foreground mt-2">{filtered.length} of {members.length} members shown</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Payments Scrolling Ticker */}
      {recentPayments.length > 0 && (
        <div className="rounded-xl border bg-green-50/80 border-green-200 overflow-hidden w-full">
          <div className="flex items-center min-w-0">
            <div className="bg-green-600 text-white px-3 py-2 text-xs font-semibold shrink-0 flex items-center gap-1.5">
              <IndianRupee size={14} />
              Recent Payments
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

      {/* Members Grid */}
      {filtered.length === 0 && loaded ? (
        <EmptyState icon={Users} title="No members found" description={search ? "Try a different search term" : undefined} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <Card key={m.id} className="hover:shadow-md transition-all hover:border-primary/20 group">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <Avatar
                    className="w-14 h-14 cursor-pointer ring-2 ring-transparent group-hover:ring-primary/20 transition-all"
                    onClick={() => m.photo_url && setViewPhoto({ url: m.photo_url, name: m.name })}
                  >
                    {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                      {m.name?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-sm truncate uppercase">{m.name || "Unnamed"}</h3>
                      {(m.role === "admin" || m.role === "super_admin") && (
                        <Badge className="bg-accent/15 text-accent border-accent/30 text-[10px] px-1.5 py-0">Admin</Badge>
                      )}
                      {m.official_type === "state" && (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-[10px] px-1.5 py-0">State</Badge>
                      )}
                      {m.official_type === "district" && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px] px-1.5 py-0">District</Badge>
                      )}
                    </div>
                    {m.occupation && (
                      <p className="text-xs text-muted-foreground mt-1">{m.occupation}</p>
                    )}
                    {(m.posting_details?.regular_district || m.posting_details?.regular_block) && (
                      <div className="flex items-center gap-1 mt-1">
                        <MapPin size={10} className="text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">
                          {[m.posting_details.regular_district, m.posting_details.regular_block].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 mt-1.5">
                      {m.phone && (
                        <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                          <Phone size={10} /> {m.phone}
                        </a>
                      )}
                      <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate">
                        <Mail size={10} /> {m.email}
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
