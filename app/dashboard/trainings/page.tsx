"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import {
  GraduationCap, Calendar, MapPin, Clock, Users, Video,
  Building, UserCheck, UserX, Loader2, ExternalLink,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

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

  function load() {
    setLoading(true);
    fetch("/api/trainings")
      .then((r) => r.json())
      .then((d) => setTrainings(d.trainings || []))
      .catch(() => toast.error("Failed to load trainings"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

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

  const upcoming = trainings.filter((t) => t.status === "upcoming" || t.status === "ongoing");
  const enrolled = trainings.filter((t) => t.user_enrolled === "enrolled" || t.user_enrolled === "attended");
  const completed = trainings.filter((t) => t.status === "completed");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <GraduationCap size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Trainings</h1>
          <p className="text-sm text-muted-foreground">Browse and enroll in training sessions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Upcoming" value={upcoming.length} icon={Calendar} borderColor="border-blue-500" loading={loading} />
        <MetricCard label="My Enrollments" value={enrolled.length} icon={UserCheck} borderColor="border-green-500" loading={loading} />
        <MetricCard label="Completed" value={completed.length} icon={GraduationCap} borderColor="border-gray-500" loading={loading} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : trainings.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No trainings available yet" />
      ) : (
        <div className="space-y-3">
          {trainings.map((t) => {
            const config = statusConfig[t.status] || statusConfig.upcoming;
            const ModeIcon = modeIcons[t.mode] || Building;
            const isFull = t.max_participants > 0 && t.enrolled_count >= t.max_participants;
            const canEnroll = (t.status === "upcoming" || t.status === "ongoing") && !t.user_enrolled && !isFull;
            const isEnrolled = t.user_enrolled === "enrolled";

            return (
              <Card key={t.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{t.title}</h3>
                        <Badge variant="outline" className={config.color}>{config.label}</Badge>
                        {t.topic && <Badge variant="outline" className="text-xs">{t.topic}</Badge>}
                      </div>
                      {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><UserCheck size={12} />Trainer: {t.trainer_name}</span>
                        {t.date && <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(t.date)}</span>}
                        {t.duration_hours > 0 && <span className="flex items-center gap-1"><Clock size={12} />{t.duration_hours}h</span>}
                        {t.location && <span className="flex items-center gap-1"><MapPin size={12} />{t.location}</span>}
                        <span className="flex items-center gap-1"><ModeIcon size={12} />{t.mode}</span>
                        <span className="flex items-center gap-1">
                          <Users size={12} />{t.enrolled_count}{t.max_participants > 0 ? `/${t.max_participants}` : ""} enrolled
                        </span>
                      </div>

                      {t.meeting_link && t.mode !== "offline" && (
                        <a href={t.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
                          <Video size={12} />Join Meeting
                        </a>
                      )}
                      {t.materials_url && (
                        <a href={t.materials_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 ml-3 inline-flex items-center gap-1">
                          <ExternalLink size={12} />Materials
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canEnroll && (
                        <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => handleEnroll(t.id)} disabled={enrolling === t.id}>
                          {enrolling === t.id ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserCheck size={14} className="mr-1" />}
                          Enroll
                        </Button>
                      )}
                      {isEnrolled && (
                        <>
                          <Badge className="bg-green-100 text-green-700 border-green-300">Enrolled</Badge>
                          {t.status === "upcoming" && (
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCancel(t.id)}>
                              <UserX size={14} className="mr-1" />Cancel
                            </Button>
                          )}
                        </>
                      )}
                      {t.user_enrolled === "attended" && <Badge className="bg-blue-100 text-blue-700 border-blue-300">Attended</Badge>}
                      {isFull && !t.user_enrolled && <Badge variant="outline" className="text-amber-600">Full</Badge>}
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
