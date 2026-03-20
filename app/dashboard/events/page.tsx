"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";

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
      .catch(() => {});
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
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
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No events scheduled</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {events.map((ev) => {
            const eventDate = new Date(ev.date);
            const isPast = eventDate < new Date();
            return (
              <Card key={ev.id} className={isPast ? "opacity-60" : ""}>
                <CardContent className="pt-4">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-secondary/10 flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-secondary">
                        {eventDate.toLocaleDateString("en", { month: "short" })}
                      </span>
                      <span className="text-2xl font-bold text-secondary leading-none">
                        {eventDate.getDate()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold">{ev.title}</h3>
                        {isPast && <Badge variant="outline">Past</Badge>}
                      </div>
                      {ev.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{ev.description}</p>
                      )}
                      {ev.location && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <MapPin size={12} />
                          {ev.location}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {eventDate.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                      </p>
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
