"use client";

import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const BOT_USERNAME = "tanhowa_task_bot";
const DISMISS_KEY = "tanhowa-tg-banner-dismissed";

export default function ConnectTelegramBanner() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    let cancelled = false;
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const u = d?.user;
        if (!u) return;
        if (u.telegram_chat_id) return;
        if (u.status !== "approved") return;
        setEmail(u.email || "");
        setShow(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setShow(false);
  }

  if (!show) return null;

  const botUrl = `https://t.me/${BOT_USERNAME}${email ? `?start=${encodeURIComponent(email)}` : ""}`;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Send size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm sm:text-base text-foreground">
            {t("tg_banner.title")}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t("tg_banner.body")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="bg-primary hover:bg-primary/90">
              <a href={botUrl} target="_blank" rel="noopener noreferrer">
                <Send size={14} className="mr-1.5" />
                {t("tg_banner.connect")}
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t("tg_banner.later")}
            </Button>
          </div>
        </div>
        <button
          aria-label={t("tg_banner.dismiss")}
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
