"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

const BOT_USERNAME = "tanhowa_task_bot";

interface MeUser {
  email: string;
  name: string;
  status: string;
  telegram_chat_id: string | null;
}

const COMMANDS: { cmd: string; descKey: string }[] = [
  { cmd: "/mytasks", descKey: "tg.cmd_mytasks" },
  { cmd: "/commit ET-022 [hours]", descKey: "tg.cmd_commit" },
  { cmd: "/done ET-022 [message]", descKey: "tg.cmd_done" },
  { cmd: "/blocked ET-022 reason", descKey: "tg.cmd_blocked" },
  { cmd: "/update ET-022 message", descKey: "tg.cmd_update" },
  { cmd: "/report ET-022 message", descKey: "tg.cmd_report" },
  { cmd: "/status", descKey: "tg.cmd_status" },
];

export default function TelegramPage() {
  const t = useT();
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setUser(d?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isLinked = !!user?.telegram_chat_id;
  const botUrl = `https://t.me/${BOT_USERNAME}${user?.email ? `?start=${encodeURIComponent(user.email)}` : ""}`;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
          <Send className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">{t("tg.page_title")}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
          {t("tg.page_subtitle")}
        </p>
      </div>

      {/* Connection status card */}
      <Card>
        <CardContent className="p-5">
          {isLinked ? (
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-green-800">{t("tg.linked_title")}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("tg.linked_body")}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer">
                    <Send className="w-4 h-4 mr-1.5" />
                    {t("tg.open_bot")}
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{t("tg.not_linked_title")}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("tg.not_linked_body")}
                </p>
                <Button asChild className="mt-3">
                  <a href={botUrl} target="_blank" rel="noopener noreferrer">
                    <Send className="w-4 h-4 mr-1.5" />
                    {t("tg_banner.connect")}
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("tg.connect_hint")}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What you can do */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <MessageCircle className="w-4 h-4 text-primary" />
            {t("tg.benefits_title")}
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{t("tg.benefit_1")}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{t("tg.benefit_2")}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{t("tg.benefit_3")}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{t("tg.benefit_4")}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Bot commands reference */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-3">{t("tg.commands_title")}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t("tg.commands_subtitle")}</p>
          <div className="space-y-2">
            {COMMANDS.map((c) => (
              <div key={c.cmd} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 border-b last:border-b-0">
                <code className="text-xs font-mono bg-muted px-2 py-1 rounded shrink-0 sm:w-56">
                  {c.cmd}
                </code>
                <span className="text-sm text-muted-foreground">
                  {t(c.descKey as Parameters<typeof t>[0])}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
