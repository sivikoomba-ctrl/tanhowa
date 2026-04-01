"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UsersRound, X, Users, MapPin, Phone, Mail } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
  role: string;
  team_role: string;
  official_type?: "state" | "district" | null;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
  };
}

interface Team {
  id: string;
  name: string;
  description: string;
  icon: string;
  members: TeamMember[];
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>("");
  const [viewPhoto, setViewPhoto] = useState<{ url: string; name: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((d) => {
        setTeams(d.teams || []);
        if (d.teams?.length > 0) setActiveTeam(d.teams[0].id);
      })
      .catch(() => toast.error("Failed to load teams"))
      .finally(() => setLoaded(true));
  }, []);

  const currentTeam = teams.find((t) => t.id === activeTeam);
  const totalMembers = teams.reduce((sum, t) => sum + t.members.length, 0);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Teams</h1>
        <EmptyState icon={UsersRound} title="No teams yet" description="Teams will appear here once an admin sets them up" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Teams</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard label="Teams" value={teams.length} icon={UsersRound} loading={!loaded} borderColor="border-l-primary" iconColor="text-primary/40" />
        <MetricCard label="Total Members" value={totalMembers} icon={Users} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" />
        <MetricCard label="Current Team" value={currentTeam?.members.length || 0} subtitle={currentTeam?.name} icon={UsersRound} loading={!loaded} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
      </div>

      {/* Team Tabs */}
      <div className="flex flex-wrap gap-2">
        {teams.map((team) => (
          <button
            key={team.id}
            onClick={() => setActiveTeam(team.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTeam === team.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card border hover:bg-accent/50 text-foreground"
            }`}
          >
            {team.name}
            <span className="ml-2 text-xs opacity-70">({team.members.length})</span>
          </button>
        ))}
      </div>

      {currentTeam?.description && (
        <p className="text-sm text-muted-foreground">{currentTeam.description}</p>
      )}

      {/* Team Members Grid */}
      {currentTeam && currentTeam.members.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentTeam.members.map((m) => (
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
                      {m.team_role && m.team_role !== "member" && (
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px] px-1.5 py-0">{m.team_role}</Badge>
                      )}
                      {m.official_type === "state" && (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-[10px] px-1.5 py-0">State</Badge>
                      )}
                      {m.official_type === "district" && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px] px-1.5 py-0">District</Badge>
                      )}
                    </div>
                    {m.occupation && <p className="text-xs text-muted-foreground mt-1">{m.occupation}</p>}
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
      ) : (
        <EmptyState icon={Users} title="No members in this team" description="Members will appear here once assigned" />
      )}

      {/* Photo Viewer */}
      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
          <button onClick={() => setViewPhoto(null)} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
          {viewPhoto && (
            <div className="flex flex-col items-center">
              <img src={viewPhoto.url} alt={viewPhoto.name} className="w-full max-h-[70vh] object-contain bg-black/5" />
              <p className="py-3 text-sm font-semibold text-center uppercase">{viewPhoto.name}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
