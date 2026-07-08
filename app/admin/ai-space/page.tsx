"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Sparkles, Satellite, Bug, Camera, MessageCircle, ListTodo, Flower2 } from "lucide-react";
import { useT } from "@/lib/i18n";

const tiles: { href: string; labelKey: string; descKey: string; icon: typeof Bot; color: string; external?: boolean }[] = [
  { href: "/admin/ai-space/tools", labelKey: "aispace.tools", descKey: "aispace.tools_desc", icon: Sparkles, color: "bg-primary/10 text-primary" },
  { href: "/admin/ai-space/satellite-ndvi", labelKey: "aispace.ndvi", descKey: "aispace.ndvi_desc", icon: Satellite, color: "bg-sky-100 text-sky-600" },
  { href: "/admin/pest-training", labelKey: "aispace.pest_training", descKey: "aispace.pest_training_desc", icon: Bug, color: "bg-red-100 text-red-600" },
  { href: "/admin/photo-review", labelKey: "aispace.photo_review", descKey: "aispace.photo_review_desc", icon: Camera, color: "bg-purple-100 text-purple-600" },
  { href: "/admin/feedback-pulse", labelKey: "aispace.feedback_pulse", descKey: "aispace.feedback_pulse_desc", icon: MessageCircle, color: "bg-teal-100 text-teal-600" },
  { href: "/admin/todos", labelKey: "aispace.task_classify", descKey: "aispace.task_classify_desc", icon: ListTodo, color: "bg-amber-100 text-amber-600" },
];

export default function AISpacePage() {
  const t = useT();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("aispace.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("aispace.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/30 h-full">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${tile.color} flex items-center justify-center shrink-0`}>
                    <tile.icon size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base">{t(tile.labelKey)}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t(tile.descKey)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
            <Flower2 size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base">{t("aispace.chatbot")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("aispace.chatbot_desc")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
