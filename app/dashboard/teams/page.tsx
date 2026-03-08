"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UsersRound, X } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
  role: string;
  team_role: string;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((d) => {
        setTeams(d.teams || []);
        if (d.teams?.length > 0) {
          setActiveTeam(d.teams[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentTeam = teams.find((t) => t.id === activeTeam);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Teams</h1>
        <div className="text-center py-16 text-muted-foreground">
          <UsersRound className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No teams have been created yet.</p>
          <p className="text-sm mt-1">Teams will appear here once an admin sets them up.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Teams</h1>

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

      {/* Team Description */}
      {currentTeam?.description && (
        <p className="text-sm text-muted-foreground">{currentTeam.description}</p>
      )}

      {/* Team Members Grid */}
      {currentTeam && currentTeam.members.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentTeam.members.map((m) => (
            <Card key={m.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <Avatar
                    className="w-12 h-12 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                    onClick={() => m.photo_url && setViewPhoto({ url: m.photo_url, name: m.name })}
                  >
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
                    {m.team_role && m.team_role !== "member" && (
                      <Badge variant="outline" className="text-xs mt-0.5">{m.team_role}</Badge>
                    )}
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
      ) : (
        <p className="text-center text-muted-foreground py-8">No members in this team yet.</p>
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
