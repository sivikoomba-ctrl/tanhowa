"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Crown, Building2, Phone, Mail, MapPin, Briefcase } from "lucide-react";

interface Official {
  id: string;
  name: string;
  email: string;
  phone: string;
  occupation: string;
  photo_url: string;
  official_type: "state" | "district";
  posting_details: {
    regular_district?: string;
    regular_block?: string;
    official_designation?: string;
  };
}

export default function OfficialsPage() {
  const [officials, setOfficials] = useState<Official[]>([]);
  const [tab, setTab] = useState("state");
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users?status=approved")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users || []).filter(
          (u: { official_type: string | null }) => u.official_type === "state" || u.official_type === "district"
        );
        setOfficials(list);
      })
      .catch(() => toast.error("Failed to load officials"));
  }, []);

  const stateOfficials = useMemo(
    () => officials.filter((o) => o.official_type === "state"),
    [officials]
  );
  const districtOfficials = useMemo(
    () => officials.filter((o) => o.official_type === "district"),
    [officials]
  );

  // Group district officials by their posting district
  const districtGroups = useMemo(() => {
    const groups: Record<string, Official[]> = {};
    for (const o of districtOfficials) {
      const district = o.posting_details?.regular_district || "Unassigned";
      if (!groups[district]) groups[district] = [];
      groups[district].push(o);
    }
    for (const members of Object.values(groups)) {
      members.sort((a, b) => {
        const aIsSecretary = a.posting_details?.official_designation === "District Secretary" ? 0 : 1;
        const bIsSecretary = b.posting_details?.official_designation === "District Secretary" ? 0 : 1;
        return aIsSecretary - bIsSecretary;
      });
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [districtOfficials]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Officials</h1>
        <p className="text-muted-foreground text-sm mt-1">
          State and District officials of the association
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="state" className="gap-1.5">
            <Crown size={14} />
            State Officials ({stateOfficials.length})
          </TabsTrigger>
          <TabsTrigger value="district" className="gap-1.5">
            <Building2 size={14} />
            District Officials ({districtOfficials.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="state" className="mt-4">
          {stateOfficials.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No State Officials designated yet</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stateOfficials.map((o) => (
                <OfficialCard key={o.id} official={o} onPhotoClick={setZoomPhoto} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="district" className="mt-4">
          {districtOfficials.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No District Officials designated yet</p>
          ) : (
            <div className="space-y-8">
              {districtGroups.map(([district, members]) => (
                <div key={district}>
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={16} className="text-blue-600" />
                    <h2 className="text-lg font-semibold text-blue-800">{district}</h2>
                    <Badge variant="outline" className="text-xs">{members.length}</Badge>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {members.map((o) => (
                      <OfficialCard key={o.id} official={o} onPhotoClick={setZoomPhoto} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Photo Zoom */}
      {zoomPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer" onClick={() => setZoomPhoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomPhoto} alt="Official" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function OfficialCard({ official: o, onPhotoClick }: { official: Official; onPhotoClick?: (url: string) => void }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <Avatar className="w-14 h-14 border-2 border-primary/20 cursor-pointer" onClick={() => o.photo_url && onPhotoClick?.(o.photo_url)}>
            {o.photo_url && <AvatarImage src={o.photo_url} alt={o.name} />}
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
              {o.name?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold uppercase truncate">{o.name || "Unnamed"}</h3>
            <Badge
              className={`text-xs mt-1 ${
                o.official_type === "state"
                  ? "bg-purple-600 hover:bg-purple-600 text-white"
                  : o.posting_details?.official_designation?.includes("Joint")
                    ? "bg-teal-600 hover:bg-teal-600 text-white"
                    : "bg-blue-600 hover:bg-blue-600 text-white"
              }`}
            >
              {o.official_type === "state" ? (
                <><Crown size={10} className="mr-1" />State Official</>
              ) : (
                <><Building2 size={10} className="mr-1" />{o.posting_details?.official_designation || "District Official"}</>
              )}
            </Badge>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          {o.occupation && (
            <div className="flex items-center gap-2">
              <Briefcase size={13} className="shrink-0" />
              <span className="truncate">{o.occupation}</span>
            </div>
          )}
          {o.posting_details?.regular_district && (
            <div className="flex items-center gap-2">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">
                {o.posting_details.regular_district}
                {o.posting_details.regular_block && ` — ${o.posting_details.regular_block}`}
              </span>
            </div>
          )}
          {o.phone && (
            <div className="flex items-center gap-2">
              <Phone size={13} className="shrink-0" />
              <a href={`tel:${o.phone}`} className="text-primary hover:underline">{o.phone}</a>
            </div>
          )}
          {o.email && (
            <div className="flex items-center gap-2">
              <Mail size={13} className="shrink-0" />
              <a href={`mailto:${o.email}`} className="text-primary hover:underline truncate">{o.email}</a>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
