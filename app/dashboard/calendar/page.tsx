"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface CalendarItem {
  type: "event" | "training" | "subscription" | "task";
  title: string;
  date: string; // ISO date string
  id: string;
}

const TYPE_COLORS: Record<string, string> = {
  event: "bg-blue-500",
  training: "bg-green-500",
  subscription: "bg-red-500",
  task: "bg-purple-500",
};

const TYPE_LABELS: Record<string, string> = {
  event: "Event",
  training: "Training",
  subscription: "Subscription Due",
  task: "Task Deadline",
};

const TYPE_BADGE_COLORS: Record<string, string> = {
  event: "bg-blue-100 text-blue-700 border-blue-200",
  training: "bg-green-100 text-green-700 border-green-200",
  subscription: "bg-red-100 text-red-700 border-red-200",
  task: "bg-purple-100 text-purple-700 border-purple-200",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Day of week for first day (0=Sun, 1=Mon, ..., 6=Sat) -> convert to Mon-based
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6; // Sunday -> 6

  const days: (Date | null)[] = [];

  // Pad leading nulls
  for (let i = 0; i < startDow; i++) {
    days.push(null);
  }

  // Fill month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Pad trailing nulls to complete the last week
  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useT();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = useMemo(() => new Date(), []);

  const monthLabel = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const goToPrev = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNext = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  // Fetch data when month changes
  const fetchData = useCallback(async () => {
    setLoading(true);
    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const allItems: CalendarItem[] = [];

    try {
      // Fetch events, trainings, subscriptions, todos in parallel
      const [eventsRes, trainingsRes, subsRes, todosRes] = await Promise.all([
        fetch("/api/events").then((r) => r.json()).catch(() => ({ events: [] })),
        fetch("/api/trainings").then((r) => r.json()).catch(() => ({ trainings: [] })),
        fetch("/api/subscriptions?me=true").then((r) => r.json()).catch(() => ({ subscriptions: [] })),
        fetch("/api/todos?me=true").then((r) => r.json()).catch(() => ({ todos: [] })),
      ]);

      // Events
      const events = eventsRes.events || eventsRes.data || [];
      for (const e of events) {
        if (e.date) {
          const d = new Date(e.date);
          if (d >= new Date(year, month, 1) && d <= new Date(year, month + 1, 0, 23, 59, 59)) {
            allItems.push({ type: "event", title: e.title, date: e.date, id: `event-${e.id}` });
          }
        }
      }

      // Trainings
      const trainings = trainingsRes.trainings || trainingsRes.data || [];
      for (const tr of trainings) {
        const tDate = tr.start_date || tr.date;
        if (tDate) {
          const d = new Date(tDate);
          if (d >= new Date(year, month, 1) && d <= new Date(year, month + 1, 0, 23, 59, 59)) {
            allItems.push({ type: "training", title: tr.title, date: tDate, id: `training-${tr.id}` });
          }
        }
      }

      // Subscriptions (due dates)
      const subs = subsRes.subscriptions || subsRes.data || [];
      for (const s of subs) {
        if (s.due_date && (s.status === "pending" || s.status === "overdue")) {
          const d = new Date(s.due_date);
          if (d >= new Date(year, month, 1) && d <= new Date(year, month + 1, 0, 23, 59, 59)) {
            allItems.push({ type: "subscription", title: `${s.period} - Rs.${s.amount}`, date: s.due_date, id: `sub-${s.id}` });
          }
        }
      }

      // Todos (due dates)
      const todos = todosRes.todos || todosRes.data || [];
      for (const td of todos) {
        if (td.due_date && td.status !== "completed" && td.status !== "cancelled") {
          const d = new Date(td.due_date);
          if (d >= new Date(year, month, 1) && d <= new Date(year, month + 1, 0, 23, 59, 59)) {
            allItems.push({ type: "task", title: td.title, date: td.due_date, id: `task-${td.id}` });
          }
        }
      }

      setItems(allItems);
    } catch {
      toast.error("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group items by date string (YYYY-MM-DD)
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const d = new Date(item.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  // Items for selected date
  const selectedItems = useMemo(() => {
    if (!selectedDate) return [];
    const key = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
    return itemsByDate.get(key) || [];
  }, [selectedDate, itemsByDate]);

  function getDateKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("nav.calendar")}</h1>
          <p className="text-sm text-muted-foreground">Events, trainings, tasks & due dates</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle className={`w-2.5 h-2.5 fill-current ${TYPE_COLORS[type].replace("bg-", "text-")}`} />
            {label}
          </div>
        ))}
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={goToPrev} aria-label="Previous month">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7">
            Today
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={goToNext} aria-label="Next month">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Calendar Grid - Desktop */}
      <Card className="rounded-2xl hidden sm:block">
        <CardContent className="p-3">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {WEEKDAYS.map((day, i) => (
              <div
                key={day}
                className={`text-center text-xs font-medium py-2 ${
                  i >= 5 ? "text-muted-foreground/60" : "text-muted-foreground"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px">
            {days.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="min-h-[80px] bg-muted/20 rounded-lg" />;
              }

              const dateKey = getDateKey(day);
              const dayItems = itemsByDate.get(dateKey) || [];
              const isToday = isSameDay(day, today);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const typesPresent = [...new Set(dayItems.map((i) => i.type))];

              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-[80px] p-1.5 rounded-lg text-left transition-all hover:bg-muted/50 ${
                    isSelected ? "bg-primary/10" : ""
                  } ${isToday ? "ring-2 ring-primary" : ""} ${
                    isWeekend ? "bg-muted/10" : ""
                  }`}
                >
                  <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : ""}`}>
                    {day.getDate()}
                  </span>
                  {typesPresent.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {typesPresent.map((type) => (
                        <div key={type} className={`w-2 h-2 rounded-full ${TYPE_COLORS[type]}`} />
                      ))}
                    </div>
                  )}
                  {dayItems.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {dayItems.length} item{dayItems.length > 1 ? "s" : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Calendar List - Mobile */}
      <div className="sm:hidden space-y-1">
        {days
          .filter((d): d is Date => d !== null)
          .map((day) => {
            const dateKey = getDateKey(day);
            const dayItems = itemsByDate.get(dateKey) || [];
            const isToday = isSameDay(day, today);
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(day)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                } ${isToday ? "ring-2 ring-primary" : ""}`}
              >
                <div className="text-center w-10 shrink-0">
                  <p className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>{day.getDate()}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {day.toLocaleString("default", { weekday: "short" })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  {dayItems.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {dayItems.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[item.type]}`} />
                          <span className="text-xs truncate max-w-[120px]">{item.title}</span>
                        </div>
                      ))}
                      {dayItems.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No items</span>
                  )}
                </div>
              </button>
            );
          })}
      </div>

      {/* Selected Day Detail */}
      {selectedDate && (
        <Card className="rounded-2xl border-l-4 border-l-primary">
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-3">
              {selectedDate.toLocaleDateString("default", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h3>
            {selectedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No items on this day</p>
            ) : (
              <div className="space-y-2">
                {selectedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30">
                    <div className={`w-2.5 h-8 rounded-full ${TYPE_COLORS[item.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <Badge variant="outline" className={`text-[10px] mt-0.5 ${TYPE_BADGE_COLORS[item.type]}`}>
                        {TYPE_LABELS[item.type]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
}
