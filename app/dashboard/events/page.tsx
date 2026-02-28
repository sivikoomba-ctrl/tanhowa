"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin } from "lucide-react";

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Events</h1>

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
