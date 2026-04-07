"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UsersRound, X, Users, MapPin, Phone, Mail, Crown, Scale } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { useT } from "@/lib/i18n";

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
  const t = useT();

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

  const legalAdvisorCard = (
    <div className="space-y-3 pt-2">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Scale size={20} className="text-primary" />
        Legal Advisor
      </h2>
      <Card className="border-primary/20 hover:shadow-md transition-all">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <Avatar
              className="w-28 h-28 ring-2 ring-primary/20 cursor-pointer shrink-0"
              onClick={() => setViewPhoto({ url: "https://ztracifmvkrjfoslkzpl.supabase.co/storage/v1/object/public/avatars/legal-advisor-rajendiran.jpeg", name: "THIRU. S. RAJENDIRAN" })}
            >
              <AvatarImage src="https://ztracifmvkrjfoslkzpl.supabase.co/storage/v1/object/public/avatars/legal-advisor-rajendiran.jpeg" alt="Thiru. S. Rajendiran" />
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">SR</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="font-bold text-base uppercase">Thiru. S. Rajendiran</h3>
              <p className="text-sm text-muted-foreground mt-0.5">B.Com., B.L.</p>
              <Badge className="bg-primary/10 text-primary border-0 text-xs mt-1.5">Advocate — Legal Advisor, TANHOWA</Badge>
              <div className="flex items-start gap-1.5 mt-3 justify-center sm:justify-start">
                <MapPin size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cabin Nos. 3 &amp; 4, Alison&apos;s Complex - II Floor,<br />
                  17/8, Sunkuraman Street,<br />
                  (Opp. Street to Tamil Nadu Bar Council),<br />
                  Chennai - 600 001.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 justify-center sm:justify-start">
                <a href="tel:+918072833018" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Phone size={12} /> 80728 33018
                </a>
                <a href="tel:+919442330710" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Phone size={12} /> 94423 30710
                </a>
                <a href="mailto:seethallaw@hotmail.com" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Mail size={12} /> seethallaw@hotmail.com
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("team.title")}</h1>
        <EmptyState icon={UsersRound} title={t("team.no_teams")} description={t("team.will_appear")} />
        {legalAdvisorCard}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("team.title")}</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard label={t("team.teams")} value={teams.length} icon={UsersRound} loading={!loaded} borderColor="border-l-primary" iconColor="text-primary/40" />
        <MetricCard label={t("team.total_members")} value={totalMembers} icon={Users} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" />
        <MetricCard label={t("team.current_team")} value={currentTeam?.members.length || 0} subtitle={currentTeam?.name} icon={UsersRound} loading={!loaded} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
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
          {[...currentTeam.members].sort((a, b) => (a.team_role === "lead" ? -1 : b.team_role === "lead" ? 1 : 0)).map((m) => (
            <Card key={m.id} className={`hover:shadow-md transition-all group ${m.team_role === "lead" ? "border-amber-300 hover:border-amber-400" : "hover:border-primary/20"}`}>
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
                      {m.team_role === "lead" && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0 gap-0.5">
                          <Crown size={10} className="fill-amber-600" />Team Lead
                        </Badge>
                      )}
                      {m.team_role && m.team_role !== "member" && m.team_role !== "lead" && (
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
        <EmptyState icon={Users} title={t("team.no_members")} description={t("team.members_appear")} />
      )}

      {legalAdvisorCard}

      {/* Photo Viewer */}
      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
          <button onClick={() => setViewPhoto(null)} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
          {viewPhoto && (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={viewPhoto.url} alt={viewPhoto.name} className="w-full max-h-[70vh] object-contain bg-black/5" />
              <p className="py-3 text-sm font-semibold text-center uppercase">{viewPhoto.name}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
