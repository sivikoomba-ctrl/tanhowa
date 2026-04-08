"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import {
  GraduationCap, Calendar, MapPin, Clock, Users, Video,
  Building, UserCheck, UserX, Loader2, ExternalLink, Download, Check, X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface Training {
  id: string;
  title: string;
  description: string;
  topic: string;
  trainer_name: string;
  trainer_type: string;
  date: string | null;
  duration_hours: number;
  location: string;
  mode: string;
  meeting_link: string;
  max_participants: number;
  status: string;
  materials_url: string;
  enrolled_count: number;
  user_enrolled: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  upcoming: { label: "Upcoming", color: "bg-blue-100 text-blue-700 border-blue-300" },
  ongoing: { label: "Ongoing", color: "bg-green-100 text-green-700 border-green-300" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-700 border-gray-300" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-300" },
};

const modeIcons: Record<string, typeof Video> = { online: Video, offline: Building, hybrid: ExternalLink };

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [trainerInvites, setTrainerInvites] = useState<{ id: string; training: { title: string; date: string }; inviter: { name: string } }[]>([]);
  const [respondingInvite, setRespondingInvite] = useState(false);
  const searchParams = useSearchParams();
  const checkinDone = useRef(false);

  // Auto check-in via QR code URL
  useEffect(() => {
    const checkinId = searchParams.get("checkin");
    if (checkinId && !checkinDone.current) {
      checkinDone.current = true;
      fetch("/api/trainings/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_id: checkinId }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.message) toast.success(`Checked in: ${d.training || "Training"}`);
          else toast.error(d.error || "Check-in failed");
          load();
        })
        .catch(() => toast.error("Check-in failed"));
    }
  }, [searchParams]);

  function load() {
    setLoading(true);
    fetch("/api/trainings")
      .then((r) => r.json())
      .then((d) => setTrainings(d.trainings || []))
      .catch(() => toast.error("Failed to load trainings"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Fetch pending trainer invites
  useEffect(() => {
    fetch("/api/trainings/invite")
      .then((r) => r.json())
      .then((d) => { if (d.invites?.length > 0) setTrainerInvites(d.invites); })
      .catch(() => {});
  }, []);

  async function respondToInvite(inviteId: string, action: "accept" | "decline") {
    setRespondingInvite(true);
    try {
      const res = await fetch("/api/trainings/invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: inviteId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setTrainerInvites((prev) => prev.filter((i) => i.id !== inviteId));
        load();
      } else toast.error(data.error);
    } catch { toast.error("Failed to respond"); }
    setRespondingInvite(false);
  }

  async function handleEnroll(id: string) {
    setEnrolling(id);
    const res = await fetch("/api/trainings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enroll", training_id: id }),
    });
    if (res.ok) { toast.success("Enrolled successfully"); load(); }
    else toast.error("Failed to enroll");
    setEnrolling(null);
  }

  async function handleCancel(id: string) {
    const res = await fetch("/api/trainings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_enrollment", training_id: id }),
    });
    if (res.ok) { toast.success("Enrollment cancelled"); load(); }
    else toast.error("Failed to cancel");
  }

  const upcoming = trainings.filter((tr) => tr.status === "upcoming" || tr.status === "ongoing");
  const enrolled = trainings.filter((tr) => tr.user_enrolled === "enrolled" || tr.user_enrolled === "attended");
  const completed = trainings.filter((tr) => tr.status === "completed");
  const t = useT();

  return (
    <div className="space-y-6">
      {/* Trainer Invite Banners */}
      {trainerInvites.map((inv) => (
        <div key={inv.id} className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GraduationCap size={20} className="text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold">You are invited as a Trainer for: {inv.training?.title}</p>
              <p className="text-xs text-muted-foreground">
                {inv.training?.date && new Date(inv.training.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
                {inv.inviter?.name && ` | Invited by ${inv.inviter.name}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 gap-1" disabled={respondingInvite} onClick={() => respondToInvite(inv.id, "decline")}>
              <X size={14} />Decline
            </Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90 gap-1" disabled={respondingInvite} onClick={() => respondToInvite(inv.id, "accept")}>
              <Check size={14} />Accept
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("nav.trainings")}</h1>
            <p className="text-sm text-muted-foreground">{t("training.browse_enroll")}</p>
          </div>
        </div>
        {trainings.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => window.open("/api/events/ical?type=trainings", "_blank")}>
            <Download className="h-4 w-4 mr-1" /> Export Calendar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label={t("training.upcoming")} value={upcoming.length} icon={Calendar} borderColor="border-blue-500" loading={loading} />
        <MetricCard label={t("training.my_enrollments")} value={enrolled.length} icon={UserCheck} borderColor="border-green-500" loading={loading} />
        <MetricCard label={t("training.completed")} value={completed.length} icon={GraduationCap} borderColor="border-gray-500" loading={loading} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : trainings.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t("training.no_trainings")} />
      ) : (
        <div className="space-y-3">
          {trainings.map((tr) => {
            const config = statusConfig[tr.status] || statusConfig.upcoming;
            const ModeIcon = modeIcons[tr.mode] || Building;
            const isFull = tr.max_participants > 0 && tr.enrolled_count >= tr.max_participants;
            const canEnroll = (tr.status === "upcoming" || tr.status === "ongoing") && !tr.user_enrolled && !isFull;
            const isEnrolled = tr.user_enrolled === "enrolled";

            return (
              <Card key={tr.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{tr.title}</h3>
                        <Badge variant="outline" className={config.color}>{config.label}</Badge>
                        {tr.topic && <Badge variant="outline" className="text-xs">{tr.topic}</Badge>}
                      </div>
                      {tr.description && <p className="text-sm text-muted-foreground mt-1">{tr.description}</p>}

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><UserCheck size={12} />{t("training.trainer")}: {tr.trainer_name}</span>
                        {tr.date && <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(tr.date)}</span>}
                        {tr.duration_hours > 0 && <span className="flex items-center gap-1"><Clock size={12} />{tr.duration_hours}h</span>}
                        {tr.location && <span className="flex items-center gap-1"><MapPin size={12} />{tr.location}</span>}
                        <span className="flex items-center gap-1"><ModeIcon size={12} />{tr.mode}</span>
                        <span className="flex items-center gap-1">
                          <Users size={12} />{tr.enrolled_count}{tr.max_participants > 0 ? `/${tr.max_participants}` : ""} {t("training.enrolled_label")}
                        </span>
                      </div>

                      {tr.meeting_link && tr.mode !== "offline" && (
                        <a href={tr.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
                          <Video size={12} />{t("training.join_meeting")}
                        </a>
                      )}
                      {tr.materials_url && (
                        <a href={tr.materials_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 ml-3 inline-flex items-center gap-1">
                          <ExternalLink size={12} />{t("training.materials")}
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canEnroll && (
                        <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => handleEnroll(tr.id)} disabled={enrolling === tr.id}>
                          {enrolling === tr.id ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserCheck size={14} className="mr-1" />}
                          {t("training.enroll")}
                        </Button>
                      )}
                      {isEnrolled && (
                        <>
                          <Badge className="bg-green-100 text-green-700 border-green-300">{t("training.enrolled_status")}</Badge>
                          {tr.status === "upcoming" && (
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCancel(tr.id)}>
                              <UserX size={14} className="mr-1" />{t("common.cancel")}
                            </Button>
                          )}
                        </>
                      )}
                      {tr.user_enrolled === "attended" && <Badge className="bg-blue-100 text-blue-700 border-blue-300">{t("training.attended")}</Badge>}
                      {isFull && !tr.user_enrolled && <Badge variant="outline" className="text-amber-600">{t("training.full")}</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
