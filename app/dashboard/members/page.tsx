"use client";

import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";

interface Member {
  id: string;
  name: string;
  email: string;
  occupation: string;
  phone: string;
  photo_url: string;
  role: string;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
  };
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterOccupation, setFilterOccupation] = useState("all");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setMembers(d.users || []))
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
      m.occupation?.toLowerCase().includes(q) ||
      m.phone?.includes(q) ||
      m.posting_details?.regular_district?.toLowerCase().includes(q) ||
      m.posting_details?.regular_block?.toLowerCase().includes(q);
    const matchesDistrict = filterDistrict === "all" || m.posting_details?.regular_district === filterDistrict;
    const matchesOccupation = filterOccupation === "all" || m.occupation === filterOccupation;
    return matchesSearch && matchesDistrict && matchesOccupation;
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold">Member Directory</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</p>
        </div>
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
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={filterDistrict} onValueChange={setFilterDistrict}>
              <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[180px]">
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
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <Card key={m.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Avatar className="w-12 h-12">
                  {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {m.name?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate uppercase">{m.name || "Unnamed"}</h3>
                    {m.role === "admin" && (
                      <Badge className="bg-accent text-accent-foreground text-xs">Official</Badge>
                    )}
                  </div>
                  {m.occupation && (
                    <p className="text-xs text-muted-foreground mt-0.5">{m.occupation}</p>
                  )}
                  {(m.posting_details?.regular_district || m.posting_details?.regular_block) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[m.posting_details.regular_district, m.posting_details.regular_block].filter(Boolean).join(" | ")}
                    </p>
                  )}
                  {m.phone && <p className="text-xs text-muted-foreground mt-0.5">{m.phone}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No members found</p>
      )}
    </div>
  );
}
