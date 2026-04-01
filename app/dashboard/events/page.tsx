"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, MapPin, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);

  function loadEvents() {
    fetch("/api/events")
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => toast.error("Failed to load events"));
  }

  useEffect(() => {
    loadEvents();
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const r = d.user.role;
          const o = d.user.official_type;
          if (r === "admin" || r === "super_admin" || o === "state" || o === "district") {
            setCanCreate(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!newTitle.trim() || !newDate) { toast.error("Title and date are required"); return; }
    setCreating(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim(), date: newDate, location: newLocation.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Event created");
      setShowCreate(false);
      setNewTitle(""); setNewDesc(""); setNewDate(""); setNewLocation("");
      loadEvents();
    } else {
      toast.error("Failed to create event");
    }
  }

  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.date) >= now);
  const past = events.filter((e) => new Date(e.date) < now);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          {events.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {upcoming.length} upcoming{past.length > 0 ? ` · ${past.length} past` : ""}
            </p>
          )}
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus size={16} className="mr-1" />New Event
          </Button>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Event</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Title *" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <Textarea placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} />
            <Input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <Input placeholder="Location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {events.length === 0 ? (
        <EmptyState icon={Calendar} title="No events scheduled" description="Events will appear here when created" />
      ) : (
        <div className="space-y-8">
          {/* Upcoming Events */}
          {upcoming.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Badge className="bg-green-100 text-green-700 border-green-300 text-xs px-3 py-1">Upcoming</Badge>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {upcoming.map((ev) => {
                  const eventDate = new Date(ev.date);
                  const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  const isToday = daysUntil === 0;
                  const isSoon = daysUntil <= 3;
                  return (
                    <Card key={ev.id} className={`transition-all hover:shadow-md ${isToday ? "border-green-300 bg-green-50/30" : isSoon ? "border-amber-200" : ""}`}>
                      <CardContent className="pt-5 pb-5">
                        <div className="flex gap-4">
                          <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center ${isToday ? "bg-green-100" : isSoon ? "bg-amber-50" : "bg-secondary/10"}`}>
                            <span className={`text-xs font-medium ${isToday ? "text-green-700" : isSoon ? "text-amber-700" : "text-secondary"}`}>
                              {eventDate.toLocaleDateString("en", { month: "short" })}
                            </span>
                            <span className={`text-2xl font-bold leading-none ${isToday ? "text-green-700" : isSoon ? "text-amber-700" : "text-secondary"}`}>
                              {eventDate.getDate()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-semibold leading-snug">{ev.title}</h3>
                              {isToday && <Badge className="bg-green-100 text-green-700 border-0 text-[10px] shrink-0">Today</Badge>}
                              {!isToday && isSoon && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] shrink-0">In {daysUntil}d</Badge>}
                            </div>
                            {ev.description && (
                              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{ev.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock size={11} />
                                {eventDate.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                              {ev.location && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin size={11} />
                                  {ev.location}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Past Events */}
          {past.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="outline" className="text-xs px-3 py-1 text-muted-foreground">Past Events</Badge>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {past.map((ev) => {
                  const eventDate = new Date(ev.date);
                  return (
                    <Card key={ev.id} className="opacity-60 hover:opacity-80 transition-opacity">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted/50 flex flex-col items-center justify-center">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {eventDate.toLocaleDateString("en", { month: "short" })}
                            </span>
                            <span className="text-lg font-bold text-muted-foreground leading-none">
                              {eventDate.getDate()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm">{ev.title}</h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {eventDate.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {ev.location && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin size={10} /> {ev.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
