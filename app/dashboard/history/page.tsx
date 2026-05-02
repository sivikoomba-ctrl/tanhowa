"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, History as HistoryIcon, Loader2 } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";

interface HistoryEntry {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  image_url: string | null;
}

function formatDate(iso: string, lang: "en" | "ta") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === "ta" ? "ta-IN" : "en-IN";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
}

export default function HistoryPage() {
  const t = useT();
  const { lang } = useLang();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/history${lang === "ta" ? "?lang=ta" : ""}`);
        if (!res.ok) {
          if (!cancelled) setEntries([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setEntries(data.entries || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lang]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
          <HistoryIcon className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">{t("history.title")}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
          {t("history.subtitle")}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title={t("history.empty_title")}
          description={t("history.empty_desc")}
        />
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-primary/20"
            aria-hidden
          />

          <ol className="space-y-8">
            {entries.map((e, i) => {
              const onLeft = i % 2 === 0;
              return (
                <li key={e.id} className="relative">
                  {/* Dot */}
                  <span
                    className="absolute left-4 md:left-1/2 -translate-x-1/2 top-3 w-3 h-3 rounded-full bg-primary ring-4 ring-background"
                    aria-hidden
                  />
                  <div
                    className={`pl-12 md:pl-0 md:flex ${
                      onLeft ? "md:flex-row" : "md:flex-row-reverse"
                    } gap-6 items-start`}
                  >
                    <div className={`md:w-1/2 ${onLeft ? "md:pr-8 md:text-right" : "md:pl-8"}`}>
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(e.event_date, lang)}
                      </div>
                    </div>
                    <div className={`md:w-1/2 ${onLeft ? "md:pl-8" : "md:pr-8"}`}>
                      <Card className="overflow-hidden">
                        {e.image_url && (
                          <div className="relative w-full aspect-[16/9] bg-muted">
                            <Image
                              src={e.image_url}
                              alt={e.title}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 100vw, 480px"
                            />
                          </div>
                        )}
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-base mb-1">{e.title}</h3>
                          {e.description && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {e.description}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
