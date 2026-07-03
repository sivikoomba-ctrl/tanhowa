"use client";

import { useEffect, useState } from "react";
import { NotebookPen, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function dismissKey(): string {
  return `tanhowa-fd-nudge-dismissed-${todayIST()}`;
}

export default function FieldDiaryNudge() {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(dismissKey()) === "1") return;

    let cancelled = false;
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.fieldDiaryMissedToday) setShow(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(dismissKey(), "1");
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <NotebookPen size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm sm:text-base text-foreground flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" /> {t("fd.title")}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("fd.nudge_missed")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
              <a href="/dashboard/field-diary">{t("fd.nudge_action")}</a>
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t("tg_banner.later")}
            </Button>
          </div>
        </div>
        <button
          aria-label="Dismiss"
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
